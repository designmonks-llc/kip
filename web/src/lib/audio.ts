// Pulls raw samples out of a MediaStream and cuts them into speech chunks for Whisper.
// Chunks end at a pause (after ≥4 s) or at 12 s; chunks with no speech are dropped.

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(4096); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(4096); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('tap', Tap);`;

let ctx: AudioContext | null = null;
let workletReady: Promise<void> | null = null;

async function context() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  workletReady ??= ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
  await workletReady;
  return ctx;
}

const rms = (a: Float32Array, from = 0, to = a.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

function resample(input: Float32Array, from: number, to = 16000) {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio, i0 = Math.floor(x), f = x - i0;
    out[i] = input[i0] * (1 - f) + (input[i0 + 1] ?? input[i0]) * f;
  }
  return out;
}

const MIN_S = 4, MAX_S = 12, SPEECH_RMS = 0.012, PAUSE_RMS = 0.006, PAUSE_S = 0.4;

export class AudioTap {
  paused = false;
  level = 0; // recent loudness 0..1, for the UI
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private parts: Float32Array[] = [];
  private length = 0;
  private chunkStart = 0;

  constructor(
    private stream: MediaStream,
    private now: () => number, // ms since meeting start
    private onChunk: (audio: Float32Array, start: number, end: number) => void,
  ) {}

  async start() {
    const c = await context();
    this.source = c.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(c, 'tap');
    const mute = c.createGain();
    mute.gain.value = 0;
    this.source.connect(this.node).connect(mute).connect(c.destination);
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onSamples(e.data, c.sampleRate);
  }

  private onSamples(buf: Float32Array, rate: number) {
    this.level = Math.min(1, rms(buf) * 8);
    if (this.paused) return;
    if (!this.length) this.chunkStart = this.now() - (buf.length / rate) * 1000;
    this.parts.push(buf);
    this.length += buf.length;
    const secs = this.length / rate;
    if (secs >= MAX_S || (secs >= MIN_S && this.tailIsQuiet(rate))) this.flush(rate);
  }

  private tailIsQuiet(rate: number) {
    let need = Math.floor(PAUSE_S * rate), sum = 0, n = 0;
    for (let p = this.parts.length - 1; p >= 0 && need > 0; p--) {
      const a = this.parts[p];
      for (let i = a.length - 1; i >= 0 && need > 0; i--, need--) { sum += a[i] * a[i]; n++; }
    }
    return Math.sqrt(sum / Math.max(1, n)) < PAUSE_RMS;
  }

  flush(rate = ctx?.sampleRate ?? 48000) {
    if (!this.length) return;
    const all = new Float32Array(this.length);
    let o = 0;
    for (const p of this.parts) { all.set(p, o); o += p.length; }
    this.parts = [];
    this.length = 0;
    // Keep the chunk only if some 100 ms window sounds like speech.
    const win = Math.floor(rate / 10);
    let speech = false;
    for (let i = 0; i + win <= all.length && !speech; i += win) speech = rms(all, i, i + win) > SPEECH_RMS;
    if (!speech) return;
    this.onChunk(resample(all, rate), this.chunkStart, this.now());
  }

  stop() {
    this.flush();
    this.node?.disconnect();
    this.source?.disconnect();
    this.node = null;
    this.source = null;
  }
}
