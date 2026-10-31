// Backups: everything in one file (.kip, a zip), and a snapshot taken automatically before a new version of Kip
// first opens the notes. Restoring never deletes anything; it brings back what's missing and keeps the newer copy
// of anything that exists in both.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { db, loadSettings, notify, uid } from './db';
import { desktop } from './files';

const STORES = ['clients', 'meetings', 'lines', 'segments', 'marks', 'captures', 'pages', 'covers', 'files'] as const;
type Store = (typeof STORES)[number];
const BLOB_FIELD: Partial<Record<Store, string>> = { covers: 'blob', files: 'blob', captures: 'thumb' };
const FORMAT = 'kip-backup';

interface Manifest {
  format: typeof FORMAT;
  version: 1;
  app: string;
  createdAt: number;
  settings: [string, unknown][];
  stores: Record<string, Record<string, unknown>[]>;
}

/** Everything as plain records, with blobs pulled out (or left out when `withBlobs` is false). */
async function snapshot(withBlobs: boolean) {
  const d = await db();
  const blobs: [string, Blob][] = [];
  const stores: Manifest['stores'] = {};
  for (const s of STORES) {
    const rows = (await d.getAll(s)) as unknown as Record<string, unknown>[];
    const field = BLOB_FIELD[s];
    stores[s] = rows.map((r) => {
      if (!field || !(r[field] instanceof Blob)) return r;
      const { [field]: blob, ...rest } = r;
      if (withBlobs) blobs.push([`blobs/${s}/${String(r.id)}`, blob as Blob]);
      return { ...rest, [`${field}$`]: withBlobs ? `blobs/${s}/${String(r.id)}` : null };
    });
  }
  const keys = await d.getAllKeys('settings');
  const settings: [string, unknown][] = [];
  for (const k of keys) settings.push([String(k), await d.get('settings', k)]);
  const manifest: Manifest = { format: FORMAT, version: 1, app: __APP_VERSION__, createdAt: Date.now(), settings, stores };
  return { manifest, blobs };
}

/** The whole workspace as a .kip file. */
export async function makeBackup(): Promise<Blob> {
  const { manifest, blobs } = await snapshot(true);
  const files: Zippable = { 'kip-backup.json': strToU8(JSON.stringify(manifest)) };
  for (const [path, blob] of blobs) files[path] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}

export const backupName = () => `Kip backup ${new Date().toISOString().slice(0, 10)}.kip`;

export interface RestoreSummary { pages: number; meetings: number; files: number; added: number; kept: number }

/** Reads a .kip file and merges it in. Nothing is deleted; for the same item, the newer copy wins. */
export async function restoreBackup(file: File, dryRun = false): Promise<RestoreSummary> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('That file isn’t a Kip backup.');
  }
  const raw = entries['kip-backup.json'];
  if (!raw) throw new Error('That file isn’t a Kip backup.');
  const m = JSON.parse(strFromU8(raw)) as Manifest;
  if (m.format !== FORMAT) throw new Error('That file isn’t a Kip backup.');

  const d = await db();
  const sum: RestoreSummary = { pages: m.stores.pages?.length ?? 0, meetings: m.stores.meetings?.length ?? 0, files: m.stores.files?.length ?? 0, added: 0, kept: 0 };
  for (const s of STORES) {
    const field = BLOB_FIELD[s];
    for (const row of m.stores[s] ?? []) {
      const r: Record<string, unknown> = { ...row };
      if (field) {
        const path = r[`${field}$`] as string | null | undefined;
        delete r[`${field}$`];
        if (path && entries[path]) r[field] = new Blob([entries[path].slice()], { type: (r.type as string) || '' });
      }
      const existing = (await d.get(s, r.id as string)) as Record<string, unknown> | undefined;
      const newer = existing && typeof existing.updatedAt === 'number' && typeof r.updatedAt === 'number' && existing.updatedAt >= r.updatedAt;
      if (existing && (newer || !('updatedAt' in r))) { sum.kept++; continue; }
      sum.added++;
      if (!dryRun) await d.put(s, r as never);
    }
  }
  if (!dryRun) {
    // Settings only fill in what this device doesn't have yet.
    for (const [k, v] of m.settings) if (!(await d.get('settings', k))) await d.put('settings', v as never, k);
    await loadSettings();
    notify();
  }
  return sum;
}

const LAST_VERSION = 'kip-last-version';

/**
 * The first time a new version opens the notes, keep a snapshot first: pages, meetings, settings
 * (file contents are never changed by an update, so they're not copied twice). The Mac app also writes
 * a full .kip file to ~/Library/Application Support/Kip/Backups.
 */
export async function backupBeforeUpdate() {
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_VERSION); } catch { /* private mode */ }
  if (last === __APP_VERSION__) return;
  const d = await db();
  const hasNotes = (await d.count('pages')) + (await d.count('meetings')) > 0;
  if (hasNotes) {
    const { manifest } = await snapshot(false);
    await d.put('backups', { id: uid(), version: last ?? 'before ' + __APP_VERSION__, createdAt: Date.now(), data: manifest });
    // keep the three most recent
    const all = (await d.getAll('backups')).sort((a, b) => b.createdAt - a.createdAt);
    for (const old of all.slice(3)) await d.delete('backups', old.id);
    const desk = desktop();
    if (desk?.writeBackup) {
      try { await desk.writeBackup(`Kip ${last ?? 'old'} → ${__APP_VERSION__} ${new Date().toISOString().slice(0, 10)}.kip`, new Uint8Array(await (await makeBackup()).arrayBuffer())); } catch { /* the in-app snapshot still exists */ }
    }
  }
  try { localStorage.setItem(LAST_VERSION, __APP_VERSION__); } catch { /* private mode */ }
}

export async function listAutoBackups() {
  return (await (await db()).getAll('backups')).sort((a, b) => b.createdAt - a.createdAt);
}

/** Puts an automatic snapshot back the same careful way as a .kip file (merge, newer wins, nothing deleted). */
export async function restoreAutoBackup(id: string) {
  const b = await (await db()).get('backups', id);
  if (!b) throw new Error('That backup is gone.');
  const zip = zipSync({ 'kip-backup.json': strToU8(JSON.stringify(b.data)) });
  return restoreBackup(new File([zip], 'auto.kip'));
}
