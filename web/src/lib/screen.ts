// Watches the shared tab/screen and reads text off it when a new slide or page settles.
import { createWorker, type Worker as OcrWorker } from 'tesseract.js';
import type { Language } from './db';

const SIG_W = 192, SIG_H = 108; // small greyscale signature used to detect change
const PIXEL_DIFF = 32; // a signature pixel counts as changed when it moves this much (0–255)
const CHANGE = 0.004; // share of changed pixels that means "the picture changed" (catches new text on the same layout)
const SETTLE_TICKS = 2; // seconds the picture must stay still before we read it

// Timers in background tabs get throttled; a worker's timer keeps ticking.
function ticker(ms: number, fn: () => void) {
  const src = `setInterval(() => postMessage(0), ${ms});`;
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  w.onmessage = fn;
  return () => w.terminate();
}

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
function similarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function cleanOcr(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    // drop lines that are mostly symbols, or mostly made-up "words" (OCR noise from icons, video, UI chrome)
    .filter((l) => l.length > 1 && (l.match(/[\p{L}\p{N}]/gu)?.length ?? 0) / l.length > 0.5 && realWordShare(l) >= 0.6)
    .join('\n')
    .trim();
}

/** A token that looks like a real word: Bangla, a number, or Latin letters with sensible vowels and case. */
function isWordlike(w: string) {
  const t = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!t) return false;
  if (/^[\u0980-\u09FF]+$/.test(t)) return true;
  if (/^[\d.,:%$€£৳/-]+$/.test(t)) return true;
  if (!/^[A-Za-z][a-z'’-]*$|^[A-Z]{2,5}$/.test(t)) return false; // "Word", "word", "USD"; not "JILEEIREEFE" or "uWLd"
  return t.length <= 3 || /[aeiouy]/i.test(t);
}
function realWordShare(line: string) {
  const words = line.split(' ').filter(Boolean);
  return words.length ? words.filter(isWordlike).length / words.length : 0;
}
const wordCount = (text: string) => text.split(/\s+/).filter(isWordlike).length;

export interface CaptureResult { text: string; t: number }

export class ScreenReader {
  captures = 0;
  busy = false;
  private latest: VideoFrame | HTMLVideoElement | null = null;
  private stopTicker: (() => void) | null = null;
  private stopFrames: (() => void) | null = null;
  private ocr: Promise<OcrWorker> | null = null;
  private lastSig: Uint8ClampedArray | null = null;
  private capturedSig: Uint8ClampedArray | null = null;
  private lastText = '';
  private stillTicks = 0;
  private pending = true;
  private sigCanvas = document.createElement('canvas');

  constructor(
    private track: MediaStreamTrack,
    private language: Language,
    private now: () => number,
    private onCapture: (c: CaptureResult) => void,
    private onChange: () => void,
    private onSelf?: () => void,
  ) {
    this.sigCanvas.width = SIG_W;
    this.sigCanvas.height = SIG_H;
  }

  start() {
    this.ocr = createWorker(this.language === 'en' ? 'eng' : ['eng', 'ben']);
    this.readFrames();
    this.stopTicker = ticker(1000, () => this.tick());
  }

  private readFrames() {
    const P = (window as unknown as { MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } }).MediaStreamTrackProcessor;
    if (P) {
      // Keeps working while the tab is hidden (e.g. the sticky is floating over the call).
      const reader = new P({ track: this.track }).readable.getReader();
      let alive = true;
      (async () => {
        while (alive) {
          const { value, done } = await reader.read();
          if (done) break;
          if (this.latest instanceof VideoFrame) this.latest.close();
          this.latest = value;
        }
      })();
      this.stopFrames = () => {
        alive = false;
        reader.cancel().catch(() => {});
        if (this.latest instanceof VideoFrame) this.latest.close();
        this.latest = null;
      };
    } else {
      const v = document.createElement('video');
      v.muted = true;
      v.srcObject = new MediaStream([this.track]);
      v.play().catch(() => {});
      this.latest = v;
      this.stopFrames = () => { v.srcObject = null; this.latest = null; };
    }
  }

  private size() {
    const f = this.latest;
    if (!f) return null;
    if (f instanceof HTMLVideoElement) return f.videoWidth ? { w: f.videoWidth, h: f.videoHeight } : null;
    return { w: f.displayWidth, h: f.displayHeight };
  }

  private signature() {
    const g = this.sigCanvas.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(this.latest as CanvasImageSource, 0, 0, SIG_W, SIG_H);
    const px = g.getImageData(0, 0, SIG_W, SIG_H).data;
    const sig = new Uint8ClampedArray(SIG_W * SIG_H);
    for (let i = 0; i < sig.length; i++) sig[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
    return sig;
  }

  private static diff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
    let changed = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > PIXEL_DIFF) changed++;
    return changed / a.length;
  }

  private tick() {
    if (!this.size()) return;
    const sig = this.signature();
    if (this.lastSig && ScreenReader.diff(sig, this.lastSig) > CHANGE) {
      this.stillTicks = 0;
      this.pending = true;
    } else {
      this.stillTicks++;
    }
    this.lastSig = sig;
    const differsFromLastCapture = !this.capturedSig || ScreenReader.diff(sig, this.capturedSig) > CHANGE;
    if (this.pending && !this.busy && this.stillTicks >= SETTLE_TICKS && differsFromLastCapture) {
      this.pending = false;
      this.capturedSig = sig;
      this.capture();
    }
  }

  private async capture() {
    const size = this.size();
    if (!size || !this.ocr) return;
    this.busy = true;
    this.onChange();
    const t = this.now();
    try {
      const scale = Math.min(1, 1600 / size.w);
      const c = document.createElement('canvas');
      c.width = Math.round(size.w * scale);
      c.height = Math.round(size.h * scale);
      c.getContext('2d')!.drawImage(this.latest as CanvasImageSource, 0, 0, c.width, c.height);
      const { data } = await (await this.ocr).recognize(c);
      const text = cleanOcr(data.text);
      // Kip's own window being shared (or the browser around it) isn't meeting content.
      if (text.includes(location.host)) {
        this.onSelf?.();
        return;
      }
      // Skip near-empty frames (faces, blank screens), junk, and repeats of the same slide.
      if (text.length >= 20 && wordCount(text) >= 4 && similarity(text, this.lastText) < 0.9) {
        this.lastText = text;
        this.captures++;
        this.onCapture({ text, t });
      }
    } catch (e) {
      console.warn('OCR failed', e);
    } finally {
      this.busy = false;
      this.onChange();
    }
  }

  stop() {
    this.stopTicker?.();
    this.stopFrames?.();
    this.ocr?.then((w) => w.terminate());
    this.ocr = null;
  }
}
