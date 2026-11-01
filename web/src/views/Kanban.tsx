// A Kanban board as a block in a page. Each card is its own page (a sub-page of the board's page), so a card
// can hold notes, to-dos and files. The board keeps its columns and cards in the block's `data` prop (JSON).
import { createReactBlockSpec } from '@blocknote/react';
import { DRAG_EXCLUSION_CLASSNAME } from '@blocknote/core/extensions';
import { FileText, Plus, X } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ColorPicker, shade } from './ColorPicker';
import { createPage, isTrashed, listPages, uid } from '../lib/db';
import { go, useData } from './common';
import { pageTitle } from './workspace';

export interface Card { id: string; title: string; pageId?: string; color?: string }
export interface Column { id: string; title: string; cards: Card[]; color?: string }
export interface Board { columns: Column[] }

export const emptyBoard = (names = ['To do', 'Doing', 'Done']): Board => ({ columns: names.map((title) => ({ id: uid(), title, cards: [] })) });
export const readBoard = (data: string): Board => {
  try { const b = JSON.parse(data) as Board; if (Array.isArray(b?.columns)) return b; } catch { /* a fresh board */ }
  return emptyBoard();
};

/** The page the board lives in, so new cards become its sub-pages. */
export const BoardPage = createContext<string | undefined>(undefined);

// a column just added: its name box takes focus and the board scrolls to it (kept outside React, as the board
// re-renders from the block whenever it changes)
let freshColumn: string | null = null;

function BoardView({ data, editable, save }: { data: string; editable: boolean; save: (b: Board) => void }) {
  const pageId = useContext(BoardPage);
  const board = readBoard(data);
  const pages = useData(listPages, []) ?? [];
  const byId = new Map(pages.map((p) => [p.id, p]));
  const [adding, setAdding] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ card: string; from: string } | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const draft = useRef<HTMLInputElement>(null);
  // more columns than fit: the board scrolls sideways, and a soft edge shows there's more to the right
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const check = () => { const el = scroller.current; if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4); };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [board.columns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // card titles follow their pages (so exports and the board agree after a rename)
  useEffect(() => {
    if (!editable || !pages.length) return;
    let changed = false;
    const next: Board = { columns: board.columns.map((c) => ({ ...c, cards: c.cards.map((k) => {
      const p = k.pageId ? byId.get(k.pageId) : undefined;
      if (p && !isTrashed(p, byId) && p.title.trim() && p.title !== k.title) { changed = true; return { ...k, title: p.title }; }
      return k;
    }) })) };
    if (changed) save(next);
  }, [pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (fn: (b: Board) => void) => { const b: Board = structuredClone(board); fn(b); save(b); };
  async function addCard(colId: string, title: string) {
    if (!title.trim()) return;
    const p = pageId ? await createPage({ parentId: pageId, title: title.trim() }) : undefined;
    update((b) => b.columns.find((c) => c.id === colId)?.cards.push({ id: uid(), title: title.trim(), pageId: p?.id }));
  }
  function drop(colId: string, index: number) {
    if (!drag) return;
    update((b) => {
      const from = b.columns.find((c) => c.id === drag.from);
      const to = b.columns.find((c) => c.id === colId);
      const at = from?.cards.findIndex((k) => k.id === drag.card) ?? -1;
      if (!from || !to || at < 0) return;
      const [card] = from.cards.splice(at, 1);
      to.cards.splice(from === to && at < index ? index - 1 : index, 0, card);
    });
    setDrag(null); setOver(null);
  }

  return (
    // clicks inside the board stay in the board (the editor would otherwise select the whole block)
    <div className="kb-wrap" contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
    {more && <span className="kb-fade" aria-hidden />}
    <div ref={scroller} className={`kanban ${DRAG_EXCLUSION_CLASSNAME}`} onScroll={check} onKeyDown={(e) => e.stopPropagation()}>
      {board.columns.map((col) => (
        <section key={col.id} className={`kb-col ${shade(col.color)} ${over?.col === col.id ? 'kb-over' : ''}`}
          onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (over?.col !== col.id) setOver({ col: col.id, index: col.cards.length }); }}
          onDrop={(e) => { e.preventDefault(); drop(col.id, over?.col === col.id ? over.index : col.cards.length); }}>
          <header className="kb-head">
            <input className="kb-title" defaultValue={col.title}
              ref={(el) => { if (el && col.id === freshColumn) { freshColumn = null; el.closest('.kb-col')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); el.focus({ preventScroll: true }); el.select(); } }} readOnly={!editable} aria-label="Column name"
              onBlur={(e) => { const v = e.target.value.trim(); if (!v) e.target.value = col.title; else if (v !== col.title) update((b) => { b.columns.find((c) => c.id === col.id)!.title = v; }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            <span className="kb-count">{col.cards.length}</span>
            {editable && <ColorPicker value={col.color} title="Column colour" size={13}
              onPick={(c) => update((b) => { b.columns.find((x) => x.id === col.id)!.color = c === 'default' ? undefined : c; })} />}
            {editable && col.cards.length === 0 && board.columns.length > 1 && (
              <button className="icon-btn" title="Remove this column" aria-label="Remove column" onClick={() => update((b) => { b.columns = b.columns.filter((c) => c.id !== col.id); })}><X size={13} /></button>
            )}
          </header>
          <div className="kb-cards">
            {col.cards.map((k, i) => {
              const p = k.pageId ? byId.get(k.pageId) : undefined;
              const gone = !!k.pageId && (!p || isTrashed(p, byId));
              return (
                <div key={k.id}
                  className={`kb-card ${shade(k.color)} ${gone ? 'gone' : ''} ${drag?.card === k.id ? 'dragging' : ''} ${over?.col === col.id && over.index === i ? 'kb-drop-before' : ''}`}
                  draggable={editable}
                  onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/kip-card', k.id); setDrag({ card: k.id, from: col.id }); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={(e) => {
                    if (!drag) return;
                    e.preventDefault(); e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    const index = e.clientY < r.top + r.height / 2 ? i : i + 1;
                    if (over?.col !== col.id || over.index !== index) setOver({ col: col.id, index });
                  }}
                  onClick={() => p && !gone && go(`/p/${p.id}`)}
                  title={gone ? 'This card’s page is in the trash' : 'Open'}>
                  <span>{p && !gone ? pageTitle(p) : k.title}</span>
                  {p && !gone && <FileText size={13} className="kb-page" />}
                  {editable && (
                    <span className="kb-tools">
                      <ColorPicker value={k.color} title="Card colour" size={12}
                        onPick={(c) => update((b) => { const card = b.columns.find((x) => x.id === col.id)!.cards.find((x) => x.id === k.id)!; card.color = c === 'default' ? undefined : c; })} />
                      <button className="icon-btn kb-remove" title="Remove card (its page stays)" aria-label="Remove card"
                        onClick={(e) => { e.stopPropagation(); update((b) => { const c = b.columns.find((x) => x.id === col.id)!; c.cards = c.cards.filter((x) => x.id !== k.id); }); }}>
                        <X size={12} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            {over?.col === col.id && over.index === col.cards.length && drag && <div className="kb-drop-end" />}
          </div>
          {editable && (adding === col.id ? (
            <input ref={draft} className="kb-new" autoFocus placeholder="Card name, then Enter"
              onKeyDown={async (e) => {
                if (e.key === 'Enter') { const v = e.currentTarget.value; e.currentTarget.value = ''; await addCard(col.id, v); }
                if (e.key === 'Escape') setAdding(null);
              }}
              onBlur={async (e) => { const v = e.currentTarget.value; setAdding(null); if (v.trim()) await addCard(col.id, v); }} />
          ) : (
            <button className="kb-add" onClick={() => setAdding(col.id)}><Plus size={14} /> Add card</button>
          ))}
        </section>
      ))}
      {editable && (
        <button className="kb-add-col" onClick={() => update((b) => { const id = uid(); freshColumn = id; b.columns.push({ id, title: 'New column', cards: [] }); })} title="Add a column">
          <Plus size={15} />
        </button>
      )}
    </div>
    </div>
  );
}

export const KanbanBlock = createReactBlockSpec(
  { type: 'kanban', propSchema: { data: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <BoardView data={block.props.data} editable={editor.isEditable}
        save={(b) => {
          // saving the board shouldn't scroll the page (the editor would bring its cursor into view)
          const main = document.querySelector('.main');
          const top = main?.scrollTop;
          editor.updateBlock(block, { props: { data: JSON.stringify(b) } } as never);
          if (main && top !== undefined) requestAnimationFrame(() => { main.scrollTop = top; });
        }} />
    ),
    // exports (HTML, PDF, pictures): a simple read-only board
    toExternalHTML: ({ block }) => (
      <div className="kanban kanban-static">
        {readBoard(block.props.data).columns.map((c) => (
          <section key={c.id} className="kb-col"><h4>{c.title}</h4><ul>{c.cards.map((k) => <li key={k.id}>{k.title}</li>)}</ul></section>
        ))}
      </div>
    ),
  },
);

/** The board as plain text lines (Markdown, Word). */
export const boardLines = (data: string) => readBoard(data).columns.flatMap((c) => [`${c.title} (${c.cards.length})`, ...c.cards.map((k) => `• ${k.title}`)]);
