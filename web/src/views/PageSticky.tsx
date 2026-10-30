import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { appendBlocks, blockText, insertAfter, lineToBlock, mapBlock, rows, type B } from '../lib/blocks';
import { getPage, uid, updatePage } from '../lib/db';
import { floating } from '../lib/floating';
import { tickTodo } from '../lib/actions';
import { parseLine } from '../lib/parse';
import { go, RichText, TypeBadge, useData, useKeepFocus, useSyncValue } from './common';
import { discardIfEmpty } from './workspace';
import { StickyLookButton } from './ui';

const COLOR_LABEL: Record<string, string> = { blue: 'Decision', yellow: 'Question', green: 'Money', red: 'Important' };
const LIST_TYPES = new Set(['checkListItem', 'bulletListItem', 'numberedListItem']);

/** New text for an existing block. A plain line re-reads its shorthand ("! " makes it a to-do, etc.). */
function withText(b: B, text: string): B {
  if (b.type === 'paragraph') return { ...lineToBlock(text), id: b.id, children: b.children ?? [] };
  return { ...b, content: [{ type: 'text', text, styles: {} }] };
}

/** A textarea that grows with its text, so long lines wrap instead of scrolling sideways. */
function Grow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: React.MutableRefObject<HTMLTextAreaElement | null> }) {
  const { inputRef, ...rest } = props;
  const local = useRef<HTMLTextAreaElement | null>(null);
  const fit = () => { const el = local.current; if (el) { el.style.height = '0px'; el.style.height = `${el.scrollHeight}px`; } };
  useLayoutEffect(fit);
  return (
    <textarea
      rows={1}
      {...rest}
      ref={(el) => { local.current = el; if (inputRef) inputRef.current = el; }}
      onInput={(e) => { fit(); rest.onInput?.(e); }}
    />
  );
}

/**
 * The floating note. Reads and writes the same stored blocks as the full page (which stays live).
 * Click anywhere to type, click a line to edit it. Nothing typed is lost: unsent text is saved
 * when the window closes.
 */
export function PageSticky({ id }: { id: string }) {
  const page = useData(() => getPage(id), [id]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useSyncValue(titleRef, page?.title ?? '');

  // What would be lost if the window closed right now.
  const unsent = useRef({ draft: '', edit: null as null | { id: string; text: string; original: string }, title: null as null | string });
  unsent.current.draft = draft;

  const content = (page?.content ?? []) as B[];
  const shown = rows(content).filter(({ block: b }) => b.id && (blockText(b) || b.type === 'checkListItem' || b.id === editing));

  // Keep the typing line in view without scrolling earlier lines away for no reason.
  useEffect(() => { if (!editing) inputRef.current?.scrollIntoView({ block: 'nearest' }); }, [content.length, editing]);
  useKeepFocus(inputRef, !!page && !editing);

  // --- writes: each is one atomic read-modify-write, so nothing is overwritten ---
  function addLines(raw: string) {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    updatePage(id, (p) => ({ content: appendBlocks(p.content ?? [], lines.map(lineToBlock)) }));
  }
  function saveLine(blockId: string, text: string) {
    const clean = text.replace(/\s*\n\s*/g, ' ');
    updatePage(id, (p) => ({
      content: mapBlock(p.content ?? [], blockId, (b) => (clean.trim() ? (blockText(b) === clean ? b : withText(b, clean)) : null)),
    }));
  }
  function saveTitle(title: string) {
    unsent.current.title = null;
    if (title !== page?.title) updatePage(id, { title });
  }

  // Save anything half-typed when the floating window closes (or switches to another note);
  // a quick note that never got anything written in it is then tidied away.
  useEffect(() => () => {
    const u = unsent.current;
    if (u.draft.trim()) addLines(u.draft);
    if (u.edit && u.edit.text !== u.edit.original) saveLine(u.edit.id, u.edit.text);
    if (u.title !== null) saveTitle(u.title);
    discardIfEmpty(id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusNew = () => { setEditing(null); requestAnimationFrame(() => inputRef.current?.focus()); };
  const startEdit = (b: B) => { unsent.current.edit = { id: b.id!, text: blockText(b), original: blockText(b) }; setEditing(b.id!); };
  const stopEdit = () => { unsent.current.edit = null; };

  /** Enter inside a line: keep it and start a new line right below (a to-do continues as a to-do). */
  function splitAfter(b: B, text: string) {
    saveLine(b.id!, text);
    stopEdit();
    if (!text.trim()) return focusNew();
    const next: B = LIST_TYPES.has(b.type)
      ? { id: uid(), type: b.type, props: b.type === 'checkListItem' ? { checked: false } : {}, content: [], children: [] }
      : { id: uid(), type: 'paragraph', props: {}, content: [], children: [] };
    updatePage(id, (p) => ({ content: insertAfter(p.content ?? [], b.id!, next) }));
    unsent.current.edit = { id: next.id!, text: '', original: '' };
    setEditing(next.id!);
  }

  /** Arrow keys and Backspace walk between lines like in a document. */
  function move(fromId: string | null, dir: -1 | 1) {
    const i = fromId ? shown.findIndex((r) => r.block.id === fromId) : shown.length;
    const next = shown[i + dir]?.block;
    if (next) startEdit(next);
    else if (dir === 1) focusNew();
  }

  const preview = draft.trim() ? parseLine(draft).type : 'note';
  if (page === undefined) return <div className="sticky floating"><p className="empty">Loading…</p></div>;
  if (page === null) {
    return (
      <div className="sticky floating">
        <div className="sticky-gone">
          <p><b>This note was deleted.</b></p>
          <button onClick={() => floating.close()}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky floating">
      {page.trashedAt && <p className="status warn sticky-note">This note is in the Trash.</p>}
      <header className="sticky-head">
        <input
          ref={titleRef}
          className="title-input-small"
          defaultValue={page.title}
          placeholder="Untitled"
          onChange={(e) => { unsent.current.title = e.target.value; }}
          onBlur={(e) => saveTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { saveTitle(e.currentTarget.value); focusNew(); } }}
        />
        <div className="controls">
          <button onClick={() => { go(`/p/${id}`); floating.close(); }}>Open full page</button>
          <button onClick={() => floating.close()}>Close</button>
          <StickyLookButton />
        </div>
      </header>

      {/* Clicking any empty space puts the cursor on the next line. */}
      <div className="sheet" ref={listRef} onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); focusNew(); } }}>
        {shown.map(({ block: b, depth }) => {
          const text = blockText(b);
          const label = b.type === 'quote' ? 'Quote' : COLOR_LABEL[b.props?.backgroundColor];
          return (
            <div
              key={b.id}
              className={`line ${b.props?.checked ? 'closed' : ''} ${b.type === 'heading' ? 'heading' : ''}`}
              style={{ paddingLeft: 2 + depth * 18 }}
              // Anywhere on the row (except the checkbox or the open editor) edits that line.
              onMouseDown={(e) => {
                const tag = (e.target as HTMLElement).tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                e.preventDefault();
                startEdit(b);
              }}
            >
              {b.type === 'checkListItem' && (
                <input type="checkbox" checked={!!b.props?.checked} onChange={(e) => tickTodo(page, b.id!, e.target.checked)} />
              )}
              {(b.type === 'bulletListItem' || b.type === 'toggleListItem') && <span className="muted">•</span>}
              {b.type === 'numberedListItem' && <span className="muted">–</span>}
              {label && <span className={`badge t-${label.toLowerCase()}`}>{label}</span>}
              {editing === b.id ? (
                <Grow
                  className="edit"
                  autoFocus
                  defaultValue={text}
                  onFocus={(e) => { const el = e.currentTarget; el.setSelectionRange(el.value.length, el.value.length); }}
                  onChange={(e) => { if (unsent.current.edit) unsent.current.edit.text = e.target.value; }}
                  onBlur={(e) => {
                    saveLine(b.id!, e.target.value);
                    stopEdit();
                    setEditing((cur) => (cur === b.id ? null : cur));
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    const el = e.currentTarget;
                    if (e.key === 'Enter') { e.preventDefault(); splitAfter(b, el.value); }
                    else if (e.key === 'Escape') { saveLine(b.id!, el.value); stopEdit(); focusNew(); }
                    else if (e.key === 'ArrowUp' && el.selectionStart === 0) { e.preventDefault(); saveLine(b.id!, el.value); move(b.id!, -1); }
                    else if (e.key === 'ArrowDown' && el.selectionEnd === el.value.length) { e.preventDefault(); saveLine(b.id!, el.value); move(b.id!, 1); }
                    else if (e.key === 'Backspace' && !el.value) { e.preventDefault(); saveLine(b.id!, ''); stopEdit(); move(b.id!, -1); }
                  }}
                />
              ) : (
                <span className="text"><RichText text={text} /></span>
              )}
            </div>
          );
        })}

        <div className="line new-line" onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'TEXTAREA') { e.preventDefault(); focusNew(); } }}>
          <TypeBadge type={preview} />
          <Grow
            inputRef={inputRef}
            value={draft}
            placeholder={shown.length ? 'Type here…' : 'Type an idea and press Enter.  ! to-do  > decision  ? question  $ money'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') { e.preventDefault(); addLines(draft); setDraft(''); }
              else if (e.key === 'ArrowUp' && !draft) { e.preventDefault(); move(null, -1); }
              else if (e.key === 'Backspace' && !draft && shown.length) { e.preventDefault(); move(null, -1); }
            }}
          />
        </div>
      </div>
    </div>
  );
}
