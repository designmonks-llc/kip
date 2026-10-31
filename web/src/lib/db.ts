import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LineType } from './parse';

export type Language = 'en' | 'bn' | 'auto';
export type ListeningMode = 'off' | 'mic' | 'mic+tab';
export type Speaker = 'you' | 'them';

export interface Client { id: string; name: string; createdAt: number }
export interface Meeting {
  id: string;
  clientId?: string;
  title: string;
  startedAt: number;
  endedAt?: number;
  listeningMode: ListeningMode;
  language: Language;
  readScreen: boolean;
  aiSummary?: string;
}
export interface Line {
  id: string;
  meetingId: string;
  t: number; // ms since meeting start
  raw: string;
  text: string;
  type: LineType;
  owners: string[];
  tags: string[];
  done?: boolean;
  answered?: boolean;
}
export interface Segment { id: string; meetingId: string; start: number; end: number; speaker: Speaker; text: string; lang?: 'en' | 'bn' }
export interface Mark { id: string; meetingId: string; t: number }
export interface Capture { id: string; meetingId: string; t: number; text: string; thumb?: Blob }
/** Everything in the workspace is a page; a meeting page points at its Meeting. */
export interface Page {
  id: string;
  parentId?: string;
  title: string;
  /** A folder only holds other items (pages, meetings, folders); it has no text of its own. */
  kind: 'note' | 'meeting' | 'folder';
  meetingId?: string;
  content?: unknown[]; // BlockNote blocks (notes only)
  pinned?: boolean;
  /** Position among its siblings in the sidebar (set by dragging); unset pages follow, oldest first. */
  order?: number;
  trashedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  yourName: string;
  defaultLanguage: Language;
  quality: 'fast' | 'accurate';
  defaultListening: ListeningMode;
  defaultReadScreen: boolean;
  keepThumbnails: boolean;
  consentShown: boolean;
  theme: 'light' | 'dark' | 'immersive';
  cover: string; // id from COVERS
  mosaic: boolean;
  stickyStyle: 'clean' | 'sky' | 'clouds';
  /** Detect Bangla automatically in meetings (on by default). */
  autoBangla: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  yourName: '',
  defaultLanguage: 'en',
  quality: 'accurate',
  defaultListening: 'mic+tab',
  defaultReadScreen: true,
  keepThumbnails: true,
  consentShown: false,
  theme: 'light',
  cover: 'sky',
  mosaic: true,
  stickyStyle: 'clean',
  autoBangla: true,
};

interface Schema extends DBSchema {
  clients: { key: string; value: Client };
  meetings: { key: string; value: Meeting; indexes: { clientId: string } };
  lines: { key: string; value: Line; indexes: { meetingId: string } };
  segments: { key: string; value: Segment; indexes: { meetingId: string } };
  marks: { key: string; value: Mark; indexes: { meetingId: string } };
  captures: { key: string; value: Capture; indexes: { meetingId: string } };
  settings: { key: string; value: Settings };
  pages: { key: string; value: Page; indexes: { meetingId: string } };
  covers: { key: string; value: CustomCover };
  files: { key: string; value: StoredFile };
  backups: { key: string; value: AutoBackup };
}

/** A cover image the user added (resized, stored only in this browser). */
export interface CustomCover { id: string; name: string; blob: Blob; w: number; h: number; createdAt: number }
/** A file attached to a page (PDF, image, anything up to 200 MB), stored only on this device. */
export interface StoredFile { id: string; name: string; type: string; size: number; blob: Blob; createdAt: number }
/** A copy of everything except file contents, taken automatically before a new version first opens the notes. */
export interface AutoBackup { id: string; version: string; createdAt: number; data: unknown }

type PerMeeting = 'lines' | 'segments' | 'marks' | 'captures';
const PER_MEETING: PerMeeting[] = ['lines', 'segments', 'marks', 'captures'];

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

/** Called when an older Kip tab (or its floating note) keeps the database from upgrading. */
export const dbEvents = { onBlocked: () => {} };

export function db() {
  dbp ??= openDB<Schema>('meeting-sticky', 4, {
    async upgrade(d, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        d.createObjectStore('clients', { keyPath: 'id' });
        d.createObjectStore('meetings', { keyPath: 'id' }).createIndex('clientId', 'clientId');
        for (const s of PER_MEETING) d.createObjectStore(s, { keyPath: 'id' }).createIndex('meetingId', 'meetingId');
        d.createObjectStore('settings');
      }
      if (oldVersion < 2) {
        // v2: the workspace. Give every existing meeting its page.
        d.createObjectStore('pages', { keyPath: 'id' }).createIndex('meetingId', 'meetingId');
        for (const m of await tx.objectStore('meetings').getAll()) {
          await tx.objectStore('pages').put({
            id: uid(), title: m.title, kind: 'meeting', meetingId: m.id,
            createdAt: m.startedAt, updatedAt: m.endedAt ?? m.startedAt,
          });
        }
      }
      if (oldVersion < 3) d.createObjectStore('covers', { keyPath: 'id' }); // v3: your own cover images
      // v4: files on pages, and automatic backups. Only new stores: nothing that exists is touched.
      if (oldVersion < 4) {
        d.createObjectStore('files', { keyPath: 'id' });
        d.createObjectStore('backups', { keyPath: 'id' });
      }
    },
    // Another Kip tab still has the old version open: say so instead of waiting silently.
    blocked: () => dbEvents.onBlocked(),
    // A newer Kip opened elsewhere: step aside so it can upgrade, then reload into the new version.
    blocking: () => { dbp?.then((d) => d.close()); location.reload(); },
    terminated: () => { dbp = null; },
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

export const uid = () => crypto.randomUUID();

// --- change notifications, so views reload when background work (transcripts, OCR) lands ---
const bus = new EventTarget();
export function notify(meetingId?: string) {
  bus.dispatchEvent(new CustomEvent('change', { detail: meetingId }));
}
export function onChange(fn: (meetingId?: string) => void) {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  bus.addEventListener('change', h);
  return () => bus.removeEventListener('change', h);
}

// --- settings ---
let cachedSettings: Settings = DEFAULT_SETTINGS;
export const settings = () => cachedSettings;
export async function loadSettings() {
  cachedSettings = { ...DEFAULT_SETTINGS, ...((await (await db()).get('settings', 'settings')) ?? {}) };
  return cachedSettings;
}
export async function saveSettings(patch: Partial<Settings>) {
  cachedSettings = { ...cachedSettings, ...patch };
  await (await db()).put('settings', cachedSettings, 'settings');
  notify();
}

// --- writes ---
export async function put<S extends 'clients' | 'meetings' | 'pages' | PerMeeting>(store: S, value: Schema[S]['value']) {
  await (await db()).put(store, value as never);
  notify((value as { meetingId?: string; id: string }).meetingId ?? (store === 'meetings' ? value.id : undefined));
}
export async function remove(store: PerMeeting, id: string, meetingId: string) {
  await (await db()).delete(store, id);
  notify(meetingId);
}

export async function findOrCreateClient(name: string): Promise<Client | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;
  const all = await (await db()).getAll('clients');
  const hit = all.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (hit) return hit;
  const c: Client = { id: uid(), name: clean, createdAt: Date.now() };
  await put('clients', c);
  return c;
}

// --- reads ---
export interface MeetingBundle {
  meeting: Meeting;
  client?: Client;
  lines: Line[];
  segments: Segment[];
  marks: Mark[];
  captures: Capture[];
}

export async function loadMeeting(id: string): Promise<MeetingBundle | undefined> {
  const d = await db();
  const meeting = await d.get('meetings', id);
  if (!meeting) return undefined;
  const [lines, segments, marks, captures, client] = await Promise.all([
    d.getAllFromIndex('lines', 'meetingId', id),
    d.getAllFromIndex('segments', 'meetingId', id),
    d.getAllFromIndex('marks', 'meetingId', id),
    d.getAllFromIndex('captures', 'meetingId', id),
    meeting.clientId ? d.get('clients', meeting.clientId) : undefined,
  ]);
  const byT = <T extends { t: number }>(a: T, b: T) => a.t - b.t;
  return {
    meeting,
    client,
    lines: lines.sort(byT),
    segments: segments.sort((a, b) => a.start - b.start),
    marks: marks.sort(byT),
    captures: captures.sort(byT),
  };
}

export interface OpenItem { line: Line; meeting: Meeting }

/** Open actions and unanswered questions from a client's earlier meetings ("From last time"). */
export async function openItemsForClient(clientId: string, excludeMeetingId?: string): Promise<OpenItem[]> {
  const d = await db();
  const pages = await d.getAll('pages');
  const byId = new Map(pages.map((p) => [p.id, p]));
  const trashed = new Set(pages.filter((p) => p.meetingId && isTrashed(p, byId)).map((p) => p.meetingId));
  const meetings = (await d.getAllFromIndex('meetings', 'clientId', clientId)).filter((m) => m.id !== excludeMeetingId && !trashed.has(m.id));
  const out: OpenItem[] = [];
  for (const meeting of meetings) {
    for (const line of await d.getAllFromIndex('lines', 'meetingId', meeting.id)) {
      if ((line.type === 'action' && !line.done) || (line.type === 'question' && !line.answered)) out.push({ line, meeting });
    }
  }
  return out.sort((a, b) => a.meeting.startedAt - b.meeting.startedAt || a.line.t - b.line.t);
}

export async function listMeetings() {
  return (await (await db()).getAll('meetings')).sort((a, b) => b.startedAt - a.startedAt);
}
export async function listClients() {
  return (await (await db()).getAll('clients')).sort((a, b) => a.name.localeCompare(b.name));
}
export async function meetingsForClient(clientId: string) {
  return (await (await db()).getAllFromIndex('meetings', 'clientId', clientId)).sort((a, b) => b.startedAt - a.startedAt);
}

export async function deleteMeeting(id: string) {
  const d = await db();
  for (const s of PER_MEETING) {
    for (const key of await d.getAllKeysFromIndex(s, 'meetingId', id)) await d.delete(s, key);
  }
  await d.delete('meetings', id);
  notify(id);
}

export async function deleteEverything() {
  const d = await db();
  for (const s of ['clients', 'meetings', 'pages', ...PER_MEETING] as const) await d.clear(s);
  notify();
}

export interface SearchHit { meetingId?: string; pageId?: string; kind: 'page' | 'note' | 'transcript' | 'screen'; t: number; text: string }

export async function search(q: string): Promise<SearchHit[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const d = await db();
  const [lines, segments, captures, pages] = await Promise.all([d.getAll('lines'), d.getAll('segments'), d.getAll('captures'), d.getAll('pages')]);
  const { blocksToText } = await import('./blocks');
  const byId = new Map(pages.map((p) => [p.id, p]));
  const hits: SearchHit[] = [
    ...pages
      .filter((p) => p.kind === 'note' && !isTrashed(p, byId))
      .map((p) => ({ p, body: blocksToText(p.content ?? []) }))
      .filter(({ p, body }) => p.title.toLowerCase().includes(needle) || body.toLowerCase().includes(needle))
      .map(({ p, body }) => ({ pageId: p.id, kind: 'page' as const, t: 0, text: snippet(p.title, body, needle) })),
    ...lines.filter((l) => l.text.toLowerCase().includes(needle)).map((l) => ({ meetingId: l.meetingId, kind: 'note' as const, t: l.t, text: l.text })),
    ...segments.filter((s) => s.text.toLowerCase().includes(needle)).map((s) => ({ meetingId: s.meetingId, kind: 'transcript' as const, t: s.start, text: s.text })),
    ...captures.filter((c) => c.text.toLowerCase().includes(needle)).map((c) => ({ meetingId: c.meetingId, kind: 'screen' as const, t: c.t, text: c.text })),
  ];
  return hits.slice(0, 60);
}

function snippet(title: string, body: string, needle: string) {
  const i = body.toLowerCase().indexOf(needle);
  if (i < 0) return title || 'Untitled';
  return `${title || 'Untitled'} — …${body.slice(Math.max(0, i - 60), i + 140).replace(/\s+/g, ' ')}…`;
}

// --- pages ---
export async function listPages() {
  return (await db()).getAll('pages');
}
/** The page, or null when it doesn't exist (so callers can tell "missing" from "still loading"). */
export async function getPage(id: string) {
  return (await (await db()).get('pages', id)) ?? null;
}
export async function pageForMeeting(meetingId: string) {
  return (await (await db()).getAllFromIndex('pages', 'meetingId', meetingId))[0];
}

/** A page counts as trashed when it or any ancestor is in the trash. */
export function isTrashed(p: Page, byId: Map<string, Page>) {
  for (let cur: Page | undefined = p, guard = 0; cur && guard < 50; cur = cur.parentId ? byId.get(cur.parentId) : undefined, guard++) {
    if (cur.trashedAt) return true;
  }
  return false;
}

export async function createPage(o: Partial<Page> = {}) {
  const now = Date.now();
  const page: Page = { id: uid(), title: '', kind: 'note', createdAt: now, updatedAt: now, ...o };
  await put('pages', page);
  return page;
}

/** Read-modify-write in one transaction, so quick successive edits can't overwrite each other. */
export async function updatePage(id: string, patch: Partial<Page> | ((p: Page) => Partial<Page>)) {
  const tx = (await db()).transaction('pages', 'readwrite');
  const p = await tx.store.get(id);
  if (!p) return;
  const next = { ...p, ...(typeof patch === 'function' ? patch(p) : patch), updatedAt: Date.now() };
  await tx.store.put(next);
  await tx.done;
  notify(next.meetingId);
  return next;
}

export const trashPage = (id: string) => updatePage(id, { trashedAt: Date.now(), pinned: false });

export async function restorePage(id: string) {
  const pages = await listPages();
  const byId = new Map(pages.map((p) => [p.id, p]));
  const p = byId.get(id);
  if (!p) return;
  // If its parent is gone or still in the trash, bring it back at the top level.
  const parent = p.parentId ? byId.get(p.parentId) : undefined;
  const parentId = parent && !isTrashed(parent, byId) ? p.parentId : undefined;
  await put('pages', { ...p, trashedAt: undefined, parentId, updatedAt: Date.now() });
}

export async function deleteForever(id: string) {
  const pages = await listPages();
  const doomed = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of pages) if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) { doomed.add(p.id); grew = true; }
  }
  const d = await db();
  for (const p of pages) {
    if (!doomed.has(p.id)) continue;
    if (p.meetingId) await deleteMeeting(p.meetingId);
    await d.delete('pages', p.id);
  }
  notify();
}

/** Ends a meeting that was left running, at its last activity. */
export async function closeMeeting(m: Meeting) {
  const d = await db();
  const [lines, segments] = await Promise.all([d.getAllFromIndex('lines', 'meetingId', m.id), d.getAllFromIndex('segments', 'meetingId', m.id)]);
  const last = Math.max(0, ...lines.map((l) => l.t), ...segments.map((s) => s.end));
  await d.put('meetings', { ...m, endedAt: m.startedAt + last });
  notify(m.id);
}

/**
 * Meetings left running when the tab closed or crashed. Recent ones (under 6 h) are returned so
 * Kip can offer to resume them; older ones are simply ended.
 */
export async function findInterruptedMeetings(): Promise<Meeting[]> {
  const d = await db();
  const out: Meeting[] = [];
  for (const m of await d.getAll('meetings')) {
    if (m.endedAt) continue;
    if (Date.now() - m.startedAt < 6 * 3600_000) out.push(m);
    else await closeMeeting(m);
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}
