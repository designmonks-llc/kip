// Files on pages: stored in Kip's own database on this device, never uploaded.
// A file block keeps a "kipfile:<id>" address; the editor turns it into a local object URL when it shows the file.
import { db, uid, type StoredFile } from './db';

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
export const FILE_SCHEME = 'kipfile:';
const urls = new Map<string, string>();

export const fileIdOf = (url: string) => (url.startsWith(FILE_SCHEME) ? url.slice(FILE_SCHEME.length) : undefined);

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Saves a file and returns its address for a block. Throws a friendly message if it can't be kept. */
export async function storeFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`“${file.name}” is ${fmtSize(file.size)}. Files can be up to 200 MB.`);
  const rec: StoredFile = { id: uid(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: Date.now() };
  await (await db()).put('files', rec);
  return FILE_SCHEME + rec.id;
}

export async function getStoredFile(url: string): Promise<StoredFile | undefined> {
  const id = fileIdOf(url);
  return id ? (await db()).get('files', id) : undefined;
}

/** What the editor shows: a local object URL for our files, anything else unchanged. */
export async function resolveFileUrl(url: string): Promise<string> {
  const id = fileIdOf(url);
  if (!id) return url;
  const cached = urls.get(id);
  if (cached) return cached;
  const rec = await (await db()).get('files', id);
  if (!rec) return '';
  const u = URL.createObjectURL(rec.blob);
  urls.set(id, u);
  return u;
}

/** A data: URL (for exports that must carry the image inside them). */
export async function fileAsDataUrl(url: string): Promise<string | undefined> {
  const rec = await getStoredFile(url);
  if (!rec) return undefined;
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => res(undefined);
    r.readAsDataURL(rec.blob);
  });
}

/** Saves a file to the person's computer (the Mac app asks where; the browser uses Downloads). */
export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Opens a stored file full size: in the Mac app with its own app (Preview for PDFs), in a browser in a new tab. */
export async function openStoredFile(url: string) {
  const rec = await getStoredFile(url);
  if (!rec) return;
  const desk = (window as unknown as { kipDesktop?: KipDesktop }).kipDesktop;
  if (desk?.openFile) return desk.openFile(rec.name, new Uint8Array(await rec.blob.arrayBuffer()));
  window.open(await resolveFileUrl(url), '_blank', 'noopener');
}

/** What the Mac app adds (see desktop/preload.js). Absent in a browser. */
export interface KipDesktop {
  platform: string;
  openFile?: (name: string, bytes: Uint8Array) => Promise<void>;
  saveFile?: (name: string, bytes: Uint8Array) => Promise<boolean>;
  printToPdf?: (html: string, name: string) => Promise<boolean>;
  share?: (name: string, bytes: Uint8Array) => Promise<void>;
  writeBackup?: (name: string, bytes: Uint8Array) => Promise<string>;
  setMenuBarIcon?: (on: boolean) => Promise<void>;
  getMenuBarIcon?: () => Promise<boolean>;
  onMenuBar?: (fn: (action: 'quick' | 'show' | 'hidden') => void) => void;
}
export const desktop = () => (window as unknown as { kipDesktop?: KipDesktop }).kipDesktop;
