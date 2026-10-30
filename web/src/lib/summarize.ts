// Chrome's built-in, on-device Summarizer API (Gemini Nano). Hidden when the browser lacks it.

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
interface SummarizerT {
  summarize(text: string, o?: { context?: string }): Promise<string>;
  destroy(): void;
}
interface SummarizerStatic {
  availability(o?: object): Promise<Availability>;
  create(o: object): Promise<SummarizerT>;
}
const api = () => (self as unknown as { Summarizer?: SummarizerStatic }).Summarizer;

export async function summarizerAvailability(): Promise<Availability> {
  const S = api();
  if (!S) return 'unavailable';
  try {
    return await S.availability({ type: 'key-points', format: 'markdown', length: 'long', expectedInputLanguages: ['en'] });
  } catch {
    return 'unavailable';
  }
}

const CHUNK = 6000;

export async function summarize(text: string, onProgress?: (p: number) => void) {
  const S = api()!;
  const s = await S.create({
    type: 'key-points',
    format: 'markdown',
    length: 'long',
    expectedInputLanguages: ['en'],
    outputLanguage: 'en',
    sharedContext: 'Notes and transcript from a business meeting. Focus on decisions, commitments, numbers and open questions.',
    monitor(m: EventTarget) {
      m.addEventListener('downloadprogress', (e) => onProgress?.((e as ProgressEvent).loaded));
    },
  });
  try {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
    const parts: string[] = [];
    for (const c of chunks) parts.push(await s.summarize(c));
    return parts.length === 1 ? parts[0] : await s.summarize(parts.join('\n'), { context: 'These are summaries of consecutive parts of one meeting.' });
  } finally {
    s.destroy();
  }
}
