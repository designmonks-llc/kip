// Helpers for BlockNote documents stored as JSON, plus the shorthand rules for notes.
import { uid } from './db';

export interface B {
  id?: string;
  type: string;
  props?: Record<string, any>;
  content?: any;
  children?: B[];
}

/** Background colour a paragraph gets when it starts with a shorthand symbol. */
export const SHORTHAND_COLOR: Record<string, string> = { '>': 'blue', '?': 'yellow', $: 'green', '*': 'red' };
const OUR_COLORS = new Set(Object.values(SHORTHAND_COLOR));

export function colorFor(text: string): string | undefined {
  return SHORTHAND_COLOR[text.trimStart()[0]];
}
export const isShorthandColor = (c?: string) => !!c && OUR_COLORS.has(c);

function inlineText(content: any): string {
  if (!Array.isArray(content)) return '';
  return content.map((c) => (c.type === 'text' ? c.text : c.type === 'link' ? inlineText(c.content) : '')).join('');
}
export const blockText = (b: B) => inlineText(b.content);

export function walk(blocks: B[], fn: (b: B) => void) {
  for (const b of blocks) {
    fn(b);
    if (b.children?.length) walk(b.children, fn);
  }
}

export function blocksToText(blocks: unknown[]) {
  const out: string[] = [];
  walk(blocks as B[], (b) => { const t = blockText(b); if (t) out.push(t); });
  return out.join('\n');
}

/** One typed line (from the floating sticky) → a block, using the same shorthand as the editor. */
export function lineToBlock(raw: string): B {
  const text = raw.trim();
  const para = (t: string, color?: string): B => ({
    id: uid(), type: 'paragraph', props: color ? { backgroundColor: color } : {}, content: [{ type: 'text', text: t, styles: {} }], children: [],
  });
  if (/^!\s*/.test(text)) return { ...para(text.replace(/^!\s*/, '')), type: 'checkListItem', props: { checked: false } };
  if (/^["“]\s*/.test(text)) return { ...para(text.replace(/^["“]\s*/, '').replace(/["”]\s*$/, '')), type: 'quote' };
  if (/^[-+]\s+/.test(text)) return { ...para(text.replace(/^[-+]\s+/, '')), type: 'bulletListItem' };
  return para(text, colorFor(text));
}

export interface Todo { id: string; text: string; checked: boolean }
export function todos(blocks: unknown[]): Todo[] {
  const out: Todo[] = [];
  walk(blocks as B[], (b) => {
    if (b.type === 'checkListItem' && b.id) out.push({ id: b.id, text: blockText(b), checked: !!b.props?.checked });
  });
  return out;
}

/** Ticks a to-do inside stored JSON; returns a new array. */
export function setChecked(blocks: unknown[], id: string, checked: boolean): unknown[] {
  const copy = structuredClone(blocks) as B[];
  walk(copy, (b) => { if (b.id === id) b.props = { ...b.props, checked }; });
  return copy;
}

// --- Markdown export for note pages ---
function inlineMd(content: any): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => {
      if (c.type === 'link') return `[${inlineMd(c.content)}](${c.href})`;
      if (c.type !== 'text') return '';
      let t = c.text as string;
      const st = c.styles ?? {};
      if (st.code) t = `\`${t}\``;
      if (st.bold) t = `**${t}**`;
      if (st.italic) t = `*${t}*`;
      if (st.strike) t = `~~${t}~~`;
      return t;
    })
    .join('');
}

export function blocksToMarkdown(blocks: unknown[], depth = 0): string {
  const pad = '  '.repeat(depth);
  const out: string[] = [];
  for (const b of blocks as B[]) {
    const text = inlineMd(b.content);
    switch (b.type) {
      case 'heading': out.push(`${'#'.repeat(b.props?.level ?? 1)} ${text}`); break;
      case 'bulletListItem': case 'toggleListItem': out.push(`${pad}- ${text}`); break;
      case 'numberedListItem': out.push(`${pad}1. ${text}`); break;
      case 'checkListItem': out.push(`${pad}- [${b.props?.checked ? 'x' : ' '}] ${text}`); break;
      case 'quote': out.push(`${pad}> ${text}`); break;
      case 'codeBlock': out.push('```' + (b.props?.language ?? ''), blockText(b), '```'); break;
      case 'divider': out.push('---'); break;
      // files kept in Kip ("kipfile:") have no address outside it, so exports name them instead
      case 'image': out.push(String(b.props?.url ?? '').startsWith('kipfile:') ? `${pad}🖼 ${b.props?.name || b.props?.caption || 'Image'}` : `![${b.props?.caption ?? ''}](${b.props?.url ?? ''})`); break;
      case 'file': case 'video': case 'audio': out.push(`${pad}📎 ${b.props?.name || 'Attachment'}`); break;
      case 'kanban': {
        let cols: { title: string; cards: { title: string }[] }[] = [];
        try { cols = JSON.parse(b.props?.data || '{}').columns ?? []; } catch { /* empty board */ }
        for (const c of cols) out.push(`**${c.title}**`, ...c.cards.map((k) => `- ${k.title}`), '');
        break;
      }
      case 'table': out.push('(table)'); break;
      default: out.push(text ? pad + text : '');
    }
    if (b.children?.length) out.push(blocksToMarkdown(b.children, depth + 1));
  }
  return out.join('\n');
}

// --- Live sync between the full-page editor and the floating note ---
// Both edit the same stored blocks. Changes are compared block by block (by id), so an edit made in one
// view is merged into the other instead of overwriting it.

const DEFAULT_PROP = (k: string, v: unknown) => v === undefined || v === false || v === 'default' || (k === 'textAlignment' && v === 'left');

/** A block's own data (no children), with default-valued props dropped so stored and editor forms compare equal. */
function selfKey(b: B) {
  const props = Object.fromEntries(Object.entries(b.props ?? {}).filter(([k, v]) => !DEFAULT_PROP(k, v)).sort());
  const content = Array.isArray(b.content)
    ? b.content.map((c: any) => ({ ...c, styles: c.styles && Object.fromEntries(Object.entries(c.styles).filter(([, v]) => v).sort()) }))
    : b.content ?? null;
  return JSON.stringify([b.type, props, content]);
}

interface Flat { block: B; parentId?: string; prevId?: string; nextId?: string }

function flatten(blocks: B[], parentId?: string, out = new Map<string, Flat>()) {
  blocks.forEach((b, i) => {
    if (!b.id) return;
    out.set(b.id, { block: b, parentId, prevId: blocks[i - 1]?.id, nextId: blocks[i + 1]?.id });
    if (b.children?.length) flatten(b.children, b.id, out);
  });
  return out;
}

/** Same text, types and structure? */
export function sameDoc(a: unknown[], b: unknown[]) {
  const key = (x: unknown[]) => [...flatten(x as B[])].map(([id, f]) => `${id}|${f.parentId ?? ''}|${f.prevId ?? ''}|${selfKey(f.block)}`).join('\n');
  return key(a) === key(b);
}

function locate(blocks: B[], id: string): { arr: B[]; index: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { arr: blocks, index: i };
    const inner = blocks[i].children?.length ? locate(blocks[i].children!, id) : null;
    if (inner) return inner;
  }
  return null;
}

function insertLike(doc: B[], f: Flat, block: B) {
  const prev = f.prevId ? locate(doc, f.prevId) : null;
  if (prev) return prev.arr.splice(prev.index + 1, 0, block);
  const next = f.nextId ? locate(doc, f.nextId) : null;
  if (next) return next.arr.splice(next.index, 0, block);
  const parent = f.parentId ? locate(doc, f.parentId) : null;
  if (parent) { const p = parent.arr[parent.index]; p.children = [block, ...(p.children ?? [])]; return; }
  if (f.prevId) doc.push(block); else doc.unshift(block);
}

/**
 * Three-way merge: `mine` plus whatever changed between `base` and `theirs`.
 * Theirs' additions, deletions and edits are applied; if both sides edited the same block, mine wins.
 */
export function mergeBlocks(base: unknown[], mine: unknown[], theirs: unknown[]): B[] {
  const fb = flatten(base as B[]), fm = flatten(mine as B[]), ft = flatten(theirs as B[]);
  const out = structuredClone(mine) as B[];
  for (const id of fb.keys()) {
    if (ft.has(id)) continue;
    const at = locate(out, id);
    if (at) at.arr.splice(at.index, 1);
  }
  for (const [id, t] of ft) {
    const b = fb.get(id);
    if (!b || selfKey(b.block) === selfKey(t.block)) continue;
    const m = fm.get(id);
    if (m && selfKey(m.block) !== selfKey(b.block)) continue; // edited on both sides: keep mine
    const at = locate(out, id);
    if (at) Object.assign(at.arr[at.index], { type: t.block.type, props: t.block.props, content: t.block.content });
  }
  for (const [id, t] of ft) {
    if (fb.has(id) || locate(out, id)) continue; // existing, or already added along with its parent
    insertLike(out, t, structuredClone(t.block));
  }
  return out;
}

/** The changes needed to turn `from` into `to`, as block operations an editor can apply. */
export function blockOps(from: unknown[], to: unknown[]) {
  const ff = flatten(from as B[]), ft = flatten(to as B[]);
  return {
    removed: [...ff.keys()].filter((id) => !ft.has(id)),
    updated: [...ft].filter(([id, t]) => ff.has(id) && selfKey(ff.get(id)!.block) !== selfKey(t.block)).map(([, t]) => t.block),
    added: [...ft].filter(([id]) => !ff.has(id)).map(([, t]) => t),
  };
}

const isEmptyParagraph = (b: B) => b.type === 'paragraph' && !blockText(b) && !b.children?.length;

/** Adds blocks at the end of a note, before the empty line(s) the editor keeps at the bottom. */
export function appendBlocks(content: unknown[], blocks: B[]) {
  const doc = content as B[];
  let i = doc.length;
  while (i > 0 && isEmptyParagraph(doc[i - 1])) i--;
  return [...doc.slice(0, i), ...blocks, ...doc.slice(i)];
}

/** Applies `fn` to the block with this id anywhere in the tree; returning null removes it. */
export function mapBlock(content: unknown[], id: string, fn: (b: B) => B | null): B[] {
  const out = structuredClone(content) as B[];
  const at = locate(out, id);
  if (!at) return out;
  const next = fn(at.arr[at.index]);
  if (next) at.arr[at.index] = next;
  else at.arr.splice(at.index, 1);
  return out;
}

/** Inserts a block right after the block with this id (same level). */
export function insertAfter(content: unknown[], id: string, block: B): B[] {
  const out = structuredClone(content) as B[];
  const at = locate(out, id);
  if (at) at.arr.splice(at.index + 1, 0, block);
  else out.push(block);
  return out;
}

/** Rows to show in the floating note: every block in document order with its nesting depth. */
export function rows(content: unknown[]) {
  const out: { block: B; depth: number }[] = [];
  const visit = (bs: B[], depth: number) => bs.forEach((b) => { out.push({ block: b, depth }); if (b.children?.length) visit(b.children, depth + 1); });
  visit(content as B[], 0);
  return out;
}
