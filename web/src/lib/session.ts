// The live meeting: notes, marks, listening and screen reading. Lives outside React so the
// sticky keeps working when it moves into the floating window.
import { AudioTap } from './audio';
import {
  createPage, findOrCreateClient, loadMeeting, openItemsForClient, pageForMeeting, put, remove, settings, uid, updatePage,
  type Capture, type Client, type Language, type Line, type ListeningMode, type Mark, type Meeting, type OpenItem, type Segment,
} from './db';
import { parseLine } from './parse';
import { ScreenReader } from './screen';
import { transcriber } from './transcriber';

export interface StartOptions {
  title: string;
  clientName: string;
  language: Language;
  listening: ListeningMode;
  readScreen: boolean;
}

export class Session {
  meeting!: Meeting;
  client?: Client;
  lines: Line[] = [];
  marks: Mark[] = [];
  segments: Segment[] = [];
  captures: Capture[] = [];
  openItems: OpenItem[] = [];
  warnings: string[] = [];
  mic: AudioTap | null = null;
  tab: AudioTap | null = null;
  screen: ScreenReader | null = null;
  private display: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private unsubSeg: (() => void) | null = null;

  get now() { return Date.now() - this.meeting.startedAt; }
  get listening() { return (!!this.mic && !this.mic.paused) || (!!this.tab && !this.tab.paused); }
  get sharing() { return !!this.display; }

  async start(o: StartOptions, onPhase?: (phase: 'picker' | 'setup') => void) {
    // Ask for the screen/tab first, while the click still counts as a user gesture.
    const wantDisplay = o.listening === 'mic+tab' || o.readScreen;
    onPhase?.(wantDisplay ? 'picker' : 'setup');
    const display = wantDisplay ? await this.requestDisplay() : null;
    onPhase?.('setup');

    this.client = await findOrCreateClient(o.clientName);
    this.meeting = {
      id: uid(),
      clientId: this.client?.id,
      title: o.title.trim() || `Meeting – ${new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`,
      startedAt: Date.now(),
      listeningMode: o.listening,
      language: o.language,
      readScreen: o.readScreen,
    };
    await put('meetings', this.meeting);
    await createPage({ kind: 'meeting', meetingId: this.meeting.id, title: this.meeting.title, createdAt: this.meeting.startedAt });
    if (this.client) this.openItems = await openItemsForClient(this.client.id, this.meeting.id);

    this.listenForSegments();

    if (o.listening !== 'off') {
      transcriber.load(o.language, settings().quality);
      await this.startMic();
    }
    if (display) this.attachDisplay(display);
    emit();
  }

  private listenForSegments() {
    const add = (s: Segment) => { if (s.meetingId === this.meeting.id) { this.segments.push(s); emit(); } };
    const drop = (id: string) => { const n = this.segments.length; this.segments = this.segments.filter((s) => s.id !== id); if (n !== this.segments.length) emit(); };
    transcriber.segmentListeners.add(add);
    transcriber.removeListeners.add(drop);
    this.unsubSeg = () => { transcriber.segmentListeners.delete(add); transcriber.removeListeners.delete(drop); };
  }

  /** Pick an interrupted meeting back up (after a crash or reload): notes and transcript come back; audio restarts on request. */
  async resume(meetingId: string) {
    const b = await loadMeeting(meetingId);
    if (!b) throw new Error('Meeting not found');
    this.meeting = { ...b.meeting, endedAt: undefined };
    this.client = b.client;
    this.lines = b.lines;
    this.marks = b.marks;
    this.segments = b.segments;
    this.captures = b.captures;
    if (this.client) this.openItems = await openItemsForClient(this.client.id, this.meeting.id);
    this.listenForSegments();
    this.warnings.push('Meeting resumed. Press “Not listening” or “Share meeting tab” to pick the audio back up.');
  }

  private async requestDisplay() {
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: true,
        // Chrome-only hints: offer tabs first, include tab audio, hide this app's own tab.
        preferCurrentTab: false,
        selfBrowserSurface: 'exclude',
        systemAudio: 'include',
        surfaceSwitching: 'include',
      } as DisplayMediaStreamOptions);
    } catch {
      this.warnings.push('Screen/tab sharing was skipped. Use “Share meeting tab” to add it.');
      return null;
    }
  }

  private attachDisplay(display: MediaStream) {
    this.display = display;
    const [video] = display.getVideoTracks();
    const [audio] = display.getAudioTracks();
    if (this.meeting.listeningMode === 'mic+tab') {
      if (audio) {
        if (transcriber.state.status === 'idle') transcriber.load(this.meeting.language, settings().quality);
        this.tab = new AudioTap(new MediaStream([audio]), () => this.now, (a, s, e) => transcriber.push(this.meeting.id, 'them', s, e, a));
        this.tab.start();
      } else {
        this.warnings.push('No meeting audio: share a Chrome tab and turn on “Also share tab audio”.');
      }
    }
    if (this.meeting.readScreen && video) {
      this.screen = new ScreenReader(
        video, this.meeting.language, () => this.now,
        (c) => {
          const cap: Capture = { id: uid(), meetingId: this.meeting.id, ...c };
          this.captures.push(cap);
          put('captures', cap);
          emit();
        },
        emit,
        () => {
          const msg = 'You’re sharing Kip itself, so there’s nothing to read. Share your meeting tab instead.';
          if (!this.warnings.includes(msg)) { this.warnings.push(msg); emit(); }
        },
      );
      this.screen.start();
    }
    video?.addEventListener('ended', () => {
      this.stopDisplay();
      this.warnings.push('Screen sharing stopped.');
      emit();
    });
  }

  private stopDisplay() {
    this.tab?.stop();
    this.tab = null;
    this.screen?.stop();
    this.screen = null;
    this.display?.getTracks().forEach((t) => t.stop());
    this.display = null;
  }

  async shareTab() {
    const d = await this.requestDisplay();
    if (!d) return emit();
    this.stopDisplay();
    if (this.meeting.listeningMode === 'off' || this.meeting.listeningMode === 'mic') {
      this.meeting.listeningMode = 'mic+tab';
      put('meetings', this.meeting);
    }
    this.attachDisplay(d);
    emit();
  }

  private async startMic() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.mic = new AudioTap(this.micStream, () => this.now, (a, s, e) => transcriber.push(this.meeting.id, 'you', s, e, a));
      await this.mic.start();
    } catch {
      this.warnings.push('Microphone access was blocked.');
    }
  }

  async toggleListening() {
    if (!this.mic && !this.tab) {
      if (this.meeting.listeningMode === 'off') {
        this.meeting.listeningMode = 'mic';
        put('meetings', this.meeting);
      }
      transcriber.load(this.meeting.language, settings().quality);
      await this.startMic();
    } else {
      const pause = this.listening;
      if (this.mic) { this.mic.paused = pause; if (pause) this.mic.flush(); }
      if (this.tab) { this.tab.paused = pause; if (pause) this.tab.flush(); }
    }
    emit();
  }

  addLine(raw: string) {
    if (!raw.trim()) return;
    const line: Line = { id: uid(), meetingId: this.meeting.id, t: this.now, raw, ...parseLine(raw) };
    this.lines.push(line);
    put('lines', line);
    emit();
  }

  updateLine(id: string, raw: string) {
    const i = this.lines.findIndex((l) => l.id === id);
    if (i < 0) return;
    if (!raw.trim()) {
      const [gone] = this.lines.splice(i, 1);
      remove('lines', gone.id, gone.meetingId);
    } else {
      this.lines[i] = { ...this.lines[i], raw, ...parseLine(raw) };
      put('lines', this.lines[i]);
    }
    emit();
  }

  /** Tick an action done / a question answered (works for "From last time" items too). */
  toggleItem(line: Line) {
    const next: Line = line.type === 'action' ? { ...line, done: !line.done } : { ...line, answered: !line.answered };
    put('lines', next);
    const swap = (l: Line) => (l.id === line.id ? next : l);
    this.lines = this.lines.map(swap);
    this.openItems = this.openItems.map((o) => (o.line.id === line.id ? { ...o, line: next } : o));
    emit();
  }

  mark() {
    const m: Mark = { id: uid(), meetingId: this.meeting.id, t: this.now };
    this.marks.push(m);
    put('marks', m);
    emit();
  }

  async end() {
    if (!this.meeting) return '';
    this.mic?.stop();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.stopDisplay();
    this.unsubSeg?.();
    this.meeting.endedAt = Date.now();
    await put('meetings', this.meeting);
    const page = await pageForMeeting(this.meeting.id);
    if (page) await updatePage(page.id, {});
    return this.meeting.id;
  }
}

// --- the single active session + a tiny subscription for React ---
let current: Session | null = null;
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((f) => f());
}
export const sessionStore = {
  subscribe(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  version: () => version,
  get: () => current,
};

/**
 * The meeting only becomes "live" once it's fully set up. (Publishing it earlier let the screen
 * render a half-made meeting while Chrome's share picker was open, which blanked the app.)
 */
export async function startSession(o: StartOptions, onPhase?: (phase: 'picker' | 'setup') => void) {
  const s = new Session();
  try {
    await s.start(o, onPhase);
  } catch (e) {
    await s.end().catch(() => {});
    throw e;
  }
  current = s;
  emit();
  return s;
}

export async function resumeSession(meetingId: string) {
  if (current) return current;
  const s = new Session();
  await s.resume(meetingId);
  current = s;
  emit();
  return s;
}

export async function endSession() {
  if (!current) return;
  const id = await current.end();
  current = null;
  emit();
  return id;
}

// Keep the level meters moving while listening.
setInterval(() => { if (current && (current.mic || current.tab)) emit(); }, 500);
