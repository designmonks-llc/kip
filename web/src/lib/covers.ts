// Covers you add yourself: resized in the browser and stored locally (never uploaded).
import { COVERS, type Cover } from './art';
import { db, settings, saveSettings, uid } from './db';

let custom: Cover[] = [];
const urls: string[] = [];
const listeners = new Set<() => void>();
let version = 0;
const emit = () => { version++; listeners.forEach((f) => f()); };

export const customCovers = {
  subscribe(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  version: () => version,
};

export async function loadCustomCovers() {
  const all = (await (await db()).getAll('covers')).sort((a, b) => a.createdAt - b.createdAt);
  urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  custom = all.map((c) => {
    const src = URL.createObjectURL(c.blob);
    urls.push(src);
    return { id: c.id, name: c.name, art: { src, w: c.w, h: c.h }, thumb: src, custom: true };
  });
  emit();
}

export const allCovers = () => [...COVERS, ...custom];
export const coverFor = (id: string) => allCovers().find((c) => c.id === id) ?? COVERS[0];

const MAX_W = 2400, MAX_H = 1600, MAX_BYTES = 40 * 1024 * 1024;

/** Adds an image file as a cover and selects it. Throws a friendly message if it can't be used. */
export async function addCustomCover(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('That file isn’t an image. Try a JPG, PNG or WebP.');
  if (file.size > MAX_BYTES) throw new Error('That image is over 40 MB. Try a smaller one.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('Kip couldn’t read that image. Try a JPG, PNG or WebP.');
  }
  const scale = Math.min(1, MAX_W / bmp.width, MAX_H / bmp.height);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
  const id = `custom-${uid()}`;
  const name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'My image';
  await (await db()).put('covers', { id, name, blob, w, h, createdAt: Date.now() });
  await loadCustomCovers();
  await saveSettings({ cover: id });
  return id;
}

export async function removeCustomCover(id: string) {
  await (await db()).delete('covers', id);
  if (settings().cover === id) await saveSettings({ cover: COVERS[0].id });
  await loadCustomCovers();
}
