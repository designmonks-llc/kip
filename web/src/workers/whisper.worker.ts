/// <reference lib="webworker" />
// Runs speech recognition fully in the browser. Audio arrives as 16 kHz mono chunks; only text goes back.
//  - English: Whisper (English-only models).
//  - Bangla: a Bangla-trained wav2vec2 (CTC) model; Whisper can't write Bangla reliably.
//  - Auto: a tiny multilingual Whisper listens to each chunk first, decides English or Bangla,
//    and hands it to the right engine. Mixed-language meetings just work.
import {
  AutoProcessor, env, pipeline, Tensor, WhisperForConditionalGeneration,
  type AutomaticSpeechRecognitionPipeline, type Processor,
} from '@huggingface/transformers';

env.allowLocalModels = false;

type Mode = 'en' | 'bn' | 'auto';
interface Spec { model: string; options?: Record<string, unknown> }
type Load = { type: 'load'; mode: Mode; en: Spec; bn: Spec; lid: Spec };
type Audio = { type: 'audio'; id: string; meetingId: string; speaker: string; start: number; end: number; audio: Float32Array };

const post = (m: unknown) => (self as DedicatedWorkerGlobalScope).postMessage(m);

let webgpu: Promise<boolean> | null = null;
const hasWebGPU = () => (webgpu ??= (async () => {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
})());

const progress = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
  if (p.status === 'progress') post({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
};

/** GPU when there is one; a spec can override (the Bangla model needs the CPU). */
async function optionsFor(spec: Spec) {
  const gpu = await hasWebGPU();
  const { local, ...rest } = spec.options ?? {};
  // Some models need a file we ship ourselves (the Bangla tokenizer.json in /models/);
  // anything not found there still comes from Hugging Face.
  env.allowLocalModels = !!local;
  env.localModelPath = '/models/';
  return {
    device: gpu ? 'webgpu' : 'wasm',
    dtype: gpu ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : { encoder_model: 'q8', decoder_model_merged: 'q8' },
    progress_callback: progress,
    ...rest,
  };
}

// --- engines: created once, reused across meetings ---
const pipes = new Map<string, Promise<AutomaticSpeechRecognitionPipeline>>();
function asr(spec: Spec) {
  const key = spec.model + JSON.stringify(spec.options ?? {});
  if (!pipes.has(key)) {
    // Cast keeps TypeScript from expanding pipeline()'s huge overload union.
    const make = pipeline as unknown as (task: string, model: string, o: object) => Promise<AutomaticSpeechRecognitionPipeline>;
    const p = optionsFor(spec).then((o) => make('automatic-speech-recognition', spec.model, o));
    p.catch(() => pipes.delete(key));
    pipes.set(key, p);
  }
  return pipes.get(key)!;
}

interface Lid { processor: Processor; model: WhisperForConditionalGeneration; start: number; en: number; bn: number[] }
let lidP: Promise<Lid> | null = null;
function lid(spec: Spec) {
  lidP ??= (async () => {
    const o = await optionsFor(spec);
    const processor = await AutoProcessor.from_pretrained(spec.model, { progress_callback: progress });
    const model = (await WhisperForConditionalGeneration.from_pretrained(spec.model, o as object)) as WhisperForConditionalGeneration;
    const gc = model.generation_config as unknown as { lang_to_id: Record<string, number>; decoder_start_token_id: number };
    const id = (code: string) => gc.lang_to_id[`<|${code}|>`];
    // Bangla is often confused with its neighbour Assamese; count both as Bangla.
    return { processor, model, start: gc.decoder_start_token_id, en: id('en'), bn: [id('bn'), id('as')] };
  })();
  lidP.catch(() => { lidP = null; });
  return lidP;
}

/** English or Bangla? One encoder pass + one decoder step, comparing Whisper's language tokens. */
async function detect(audio: Float32Array): Promise<'en' | 'bn'> {
  const { processor, model, start, en, bn } = await lid(cfg.lid);
  const inputs = await processor(audio);
  const out = (await model({ ...inputs, decoder_input_ids: new Tensor('int64', BigInt64Array.from([BigInt(start)]), [1, 1]) })) as { logits: Tensor };
  const logits = out.logits.data as Float32Array;
  return Math.max(...bn.map((i) => logits[i])) > logits[en] ? 'bn' : 'en';
}

// --- state ---
let cfg: Load;
const queue: Audio[] = [];
let busy = false;
let ready = false;

async function load(m: Load) {
  cfg = m;
  ready = false;
  post({ type: 'loading', model: m.mode });
  try {
    // In auto mode the big Bangla model (355 MB) waits until Bangla is actually heard.
    const need: Promise<unknown>[] = [];
    if (m.mode !== 'bn') need.push(asr(m.en));
    if (m.mode === 'bn') need.push(asr(m.bn));
    if (m.mode === 'auto') need.push(lid(m.lid));
    await Promise.all(need);
    ready = true;
    post({ type: 'ready', device: (await hasWebGPU()) ? 'webgpu' : 'wasm' });
    pump();
  } catch (e) {
    post({ type: 'error', message: String((e as Error)?.message ?? e) });
  }
}

// Whisper invents these on silence or music; drop them.
const HALLUCINATIONS = /^(thank you\.?|thanks for watching!?|you|bye\.?|\.+|subtitles by.*|♪+)$/i;

/** Junk guard: Bangla output must actually be Bangla (or Latin), not stray script. */
function plausible(text: string, lang: 'en' | 'bn') {
  if (lang !== 'bn') return true;
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const ok = text.match(/[ঀ-৿A-Za-z]/g)?.length ?? 0;
  return letters > 0 && ok / letters > 0.8;
}

async function pump() {
  if (busy || !ready) return;
  busy = true;
  while (queue.length && ready) {
    const job = queue.shift()!;
    post({ type: 'backlog', size: queue.length });
    try {
      const lang: 'en' | 'bn' = cfg.mode === 'auto' ? await detect(job.audio) : cfg.mode;
      const spec = lang === 'bn' ? cfg.bn : cfg.en;
      const firstTime = !pipes.has(spec.model + JSON.stringify(spec.options ?? {}));
      if (firstTime && lang === 'bn') post({ type: 'note', text: 'Bangla heard: getting the Bangla model ready (one-time download)…' });
      const engine = await asr(spec);
      if (firstTime && lang === 'bn') post({ type: 'note', text: '' });
      // CTC models read the whole chunk at once; Whisper gets a guard against looping.
      const out = (await (lang === 'bn' ? engine(job.audio) : engine(job.audio, { no_repeat_ngram_size: 5, max_new_tokens: 220 }))) as { text: string };
      const text = out.text.replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
      if (text && !HALLUCINATIONS.test(text) && plausible(text, lang)) {
        post({ type: 'segment', id: job.id, meetingId: job.meetingId, speaker: job.speaker, start: job.start, end: job.end, text, lang });
      }
    } catch (e) {
      post({ type: 'error', message: String((e as Error)?.message ?? e) });
    }
  }
  busy = false;
  post({ type: 'backlog', size: 0 });
}

self.onmessage = (e: MessageEvent<Load | Audio>) => {
  const m = e.data;
  if (m.type === 'load') load(m);
  else {
    queue.push(m);
    // If the machine falls far behind, drop the oldest chunks rather than lag minutes behind.
    while (queue.length > 12) queue.shift();
    pump();
  }
};
