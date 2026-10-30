// Workspace actions shared by the sidebar, home and keyboard shortcuts.
import { blocksToText } from '../lib/blocks';
import { createPage, deleteForever, getPage, listPages, restorePage, trashPage, updatePage, type Page } from '../lib/db';
import { toasts } from '../lib/toast';
import { floating } from '../lib/floating';
import { go } from './common';

export const pageHref = (p: Page) => (p.kind === 'meeting' && p.meetingId ? `/m/${p.meetingId}` : `/p/${p.id}`);
export const pageTitle = (p: Page) => p.title.trim() || 'Untitled';

export async function newPage(parentId?: string) {
  const p = await createPage({ parentId });
  go(`/p/${p.id}`);
  return p;
}

/** A blank note that opens straight into the floating window. */
export async function quickNote() {
  const time = new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const p = await createPage({ title: `Quick note – ${time}` });
  go(`/p/${p.id}`);
  return floating.open({ kind: 'page', id: p.id });
}

/** Children lookup + depth-first order, for trees and "Move to" lists. */
export function tree(pages: Page[]) {
  const children = new Map<string | undefined, Page[]>();
  for (const p of pages) {
    const key = p.parentId && pages.some((q) => q.id === p.parentId) ? p.parentId : undefined;
    children.set(key, [...(children.get(key) ?? []), p]);
  }
  // Dragged pages keep their spot (small `order` numbers); the rest follow, oldest first.
  const key = (p: Page) => p.order ?? p.createdAt;
  for (const list of children.values()) list.sort((a, b) => key(a) - key(b));
  return children;
}

export type DropPos = 'before' | 'after' | 'inside';

/**
 * Moves a page next to (or inside) another page in the sidebar. Siblings in the new spot are
 * renumbered 0..n so the order sticks.
 */
export async function movePage(dragged: Page, target: Page | null, pos: DropPos, pages: Page[]) {
  const kids = tree(pages);
  const parentId = !target ? undefined : pos === 'inside' ? target.id : target.parentId && pages.some((p) => p.id === target.parentId) ? target.parentId : undefined;
  const siblings = (kids.get(parentId) ?? []).filter((p) => p.id !== dragged.id && (parentId || p.kind === dragged.kind));
  let at = siblings.length;
  if (target && pos !== 'inside') {
    const i = siblings.findIndex((p) => p.id === target.id);
    if (i >= 0) at = pos === 'before' ? i : i + 1;
  }
  siblings.splice(at, 0, dragged);
  for (const [order, p] of siblings.entries()) {
    if (p.order !== order || (p.id === dragged.id && p.parentId !== parentId)) {
      await updatePage(p.id, p.id === dragged.id ? { order, parentId } : { order });
    }
  }
}

export function ancestors(p: Page, byId: Map<string, Page>) {
  const out: Page[] = [];
  for (let cur = p.parentId ? byId.get(p.parentId) : undefined, guard = 0; cur && guard < 50; cur = cur.parentId ? byId.get(cur.parentId) : undefined, guard++) out.unshift(cur);
  return out;
}

export function descendantIds(id: string, pages: Page[]) {
  const out = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const p of pages) if (p.parentId && out.has(p.parentId) && !out.has(p.id)) { out.add(p.id); grew = true; }
  }
  return out;
}

/** Moves a page to Trash with an Undo toast. */
export async function trashWithUndo(p: Page) {
  await trashPage(p.id);
  toasts.show(`Moved “${pageTitle(p)}” to Trash`, { label: 'Undo', run: () => restorePage(p.id) });
}

const QUICK_TITLE = /^Quick note – /;

/** A note with no real title, no text and nothing inside it: an accidental page. */
function isEmptyNote(p: Page, pages: Page[]) {
  if (p.kind !== 'note' || p.pinned) return false;
  if (p.title.trim() && !QUICK_TITLE.test(p.title)) return false;
  if (blocksToText(p.content ?? []).trim()) return false;
  return !pages.some((c) => c.parentId === p.id);
}

/** Removes empty, untitled pages (accidental "New page" / "Quick note") older than a minute. */
export async function cleanupEmptyPages() {
  const pages = await listPages();
  for (const p of pages) if (!p.trashedAt && Date.now() - p.updatedAt > 60_000 && isEmptyNote(p, pages)) await deleteForever(p.id);
}

/** When you leave a page you never wrote in, it quietly goes away (like Apple Notes). */
export function discardIfEmpty(id: string) {
  setTimeout(async () => {
    if (floating.isFloating({ kind: 'page', id }) || location.hash.includes(id)) return;
    const p = await getPage(id);
    if (p && !p.trashedAt && isEmptyNote(p, await listPages())) await deleteForever(p.id);
  }, 800);
}
