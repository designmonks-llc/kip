import { put, remove, uid, type Language, type Segment, type Speaker } from './db';

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
/** Share of words two lines have in common (0..1). */
function overlap(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
}

export type AsrState =
  | { status: 'idle' }
  | { status: 'loading'; progress: number; model: string }
  | { status: 'ready'; device: string; backlog: number; note?: string }
  | { status: 'error'; message: string };

/**
 * English: Whisper (English-only models are smaller and more accurate).
 * Bangla: a Bangla-trained wav2vec2 model (arijitx/wav2vec2-xls-r-300m-bengali, Apache-2.0) in an
 * 8-bit ONNX export. Whisper can't write Bangla reliably; this model can. It runs on the CPU with
 * several threads (the GPU path stalls on 8-bit models); its tokenizer.json ships in /public/models.
 * Auto: a tiny multilingual Whisper decides, chunk by chunk, which of the two to use.
 */
export const BANGLA_MODEL = 'MDTLabs/wav2vec2-xls-r-300m-bengali-onnx';
const BANGLA = { model: BANGLA_MODEL, options: { local: true, device: 'wasm', dtype: 'fp32', subfolder: '', model_file_name: 'model.int8' } };
const DETECTOR = { model: 'onnx-community/whisper-tiny' };
const englishModel = (quality: 'fast' | 'accurate') => (quality === 'fast' ? 'onnx-community/whisper-tiny.en' : 'onnx-community/whisper-base.en');

class Transcriber {
  state: AsrState = { status: 'idle' };
  private worker: Worker | null = null;
  private files = new Map<string, { loaded: number; total: number }>();
  private listeners = new Set<() => void>();
  segmentListeners = new Set<(s: Segment) => void>();
  removeListeners = new Set<(id: string) => void>();
  private recent: Segment[] = [];

  /**
   * Echo guard: on speakers, the mic re-hears the meeting audio, so the same sentence would show
   * as both "You" and "Them". The meeting-tab copy ("Them") is the reliable one; drop the mic copy.
   */
  private isEcho(seg: Segment): string | null | 'drop' {
    const near = this.recent.filter((r) => r.meetingId === seg.meetingId && r.speaker !== seg.speaker && Math.abs(r.start - seg.start) < 8000 && overlap(r.text, seg.text) >= 0.6);
    if (!near.length) return null;
    if (seg.speaker === 'you') return 'drop';
    return near.find((r) => r.speaker === 'you')?.id ?? null;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(s: AsrState) {
    this.state = s;
    this.listeners.forEach((f) => f());
  }

  load(language: Language, quality: 'fast' | 'accurate') {
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/whisper.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onMessage(e.data);
    }
    this.files.clear();
    this.worker.postMessage({ type: 'load', mode: language, en: { model: englishModel(quality) }, bn: BANGLA, lid: DETECTOR });
  }

  push(meetingId: string, speaker: Speaker, start: number, end: number, audio: Float32Array) {
    this.worker?.postMessage({ type: 'audio', id: uid(), meetingId, speaker, start, end, audio }, [audio.buffer]);
  }

  private onMessage(m: Record<string, any>) {
    switch (m.type) {
      case 'loading':
        this.set({ status: 'loading', progress: 0, model: m.model });
        break;
      case 'progress': {
        if (m.file && m.total) this.files.set(m.file, { loaded: m.loaded, total: m.total });
        let loaded = 0, total = 0;
        for (const f of this.files.values()) { loaded += f.loaded; total += f.total; }
        if (this.state.status === 'loading') this.set({ ...this.state, progress: total ? loaded / total : 0 });
        break;
      }
      case 'ready':
        this.set({ status: 'ready', device: m.device, backlog: 0 });
        break;
      case 'backlog':
        if (this.state.status === 'ready') this.set({ ...this.state, backlog: m.size });
        break;
      case 'error':
        this.set({ status: 'error', message: m.message });
        break;
      case 'segment': {
        const seg: Segment = { id: m.id, meetingId: m.meetingId, speaker: m.speaker, start: m.start, end: m.end, text: m.text, lang: m.lang };
        const echo = this.isEcho(seg);
        if (echo === 'drop') break;
        if (echo) {
          // An earlier "You" line was really the meeting audio: replace it with this one.
          this.recent = this.recent.filter((r) => r.id !== echo);
          remove('segments', echo, seg.meetingId);
          this.removeListeners.forEach((f) => f(echo));
        }
        this.recent = [...this.recent.slice(-30), seg];
        put('segments', seg);
        this.segmentListeners.forEach((f) => f(seg));
        break;
      }
      case 'note':
        // e.g. the Bangla model loading the first time Bangla is heard
        if (this.state.status === 'ready') this.set({ ...this.state, note: m.text });
        break;
    }
  }
}

export const transcriber = new Transcriber();
