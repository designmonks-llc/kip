// The Templates gallery: pick a starting point on the left, see the real page it makes on the right, and get a
// ready page (in the current folder). Arrow keys move through the list, Enter uses the one you're on.
import { BookOpen, Bug, CalendarDays, CalendarRange, ClipboardList, KanbanSquare, ListChecks, NotebookText, Sun, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createFromTemplate, TEMPLATES, type Template } from '../lib/templates';
import { go } from './common';

export const TEMPLATE_ICON: Record<string, React.ReactNode> = {
  kanban: <KanbanSquare size={18} />, project: <ClipboardList size={18} />, meeting: <Users size={18} />, weekly: <CalendarRange size={18} />,
  content: <CalendarDays size={18} />, brief: <NotebookText size={18} />, bugs: <Bug size={18} />, journal: <Sun size={18} />,
  reading: <BookOpen size={18} />, todo: <ListChecks size={18} />,
};

const GROUPS: { name: string; ids: string[] }[] = [
  { name: 'Plan and track', ids: ['kanban', 'project', 'bugs', 'content'] },
  { name: 'Meetings and clients', ids: ['meeting', 'brief'] },
  { name: 'Every day', ids: ['weekly', 'todo', 'journal', 'reading'] },
];
const ORDER = GROUPS.flatMap((g) => g.ids.map((id) => TEMPLATES.find((t) => t.id === id)!)).filter(Boolean);

// one gallery for the whole app: any button can open it, for a folder or the top level
let openFn: ((parentId?: string) => void) | null = null;
export const openTemplates = (parentId?: string) => openFn?.(parentId);

type Mini = { type?: string; props?: Record<string, unknown>; content?: unknown };
const words = (c: unknown) => (Array.isArray(c) ? c.map((x: { text?: string }) => x.text ?? '').join('') : '');

/** A small, true-to-life drawing of the page a template makes. */
function Sheet({ t }: { t: Template }) {
  let n = 0;
  const line = (text: string, w = 46) => (text.trim() ? text : <i className="ts-bar" style={{ width: `${w}%` }} />);
  const block = (b: Mini, i: number) => {
    const text = words(b.content);
    const bg = b.props?.backgroundColor as string | undefined;
    switch (b.type) {
      case 'heading': n = 0; return <p key={i} className={`ts-h${b.props?.level ?? 2}`}>{text}</p>;
      case 'checkListItem': return <p key={i} className="ts-li"><span className={`ts-box ${b.props?.checked ? 'on' : ''}`} />{line(text, 38)}</p>;
      case 'bulletListItem': return <p key={i} className="ts-li"><span className="ts-dot" />{line(text, 42)}</p>;
      case 'numberedListItem': return <p key={i} className="ts-li"><span className="ts-num">{++n}.</span>{line(text)}</p>;
      case 'quote': return <p key={i} className="ts-quote">{line(text, 70)}</p>;
      case 'divider': return <hr key={i} className="ts-hr" />;
      case 'table': {
        const rows = ((b.content as { rows?: { cells: string[] }[] })?.rows ?? []).map((r) => r.cells);
        return (
          <table key={i} className="ts-table"><tbody>
            {rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => ri === 0 ? <th key={ci}>{c}</th> : <td key={ci}>{c || <i className="ts-bar" style={{ width: '60%' }} />}</td>)}</tr>)}
          </tbody></table>
        );
      }
      case 'kanban': return (
        <div key={i} className="ts-board">
          {['To do', 'Doing', 'Done'].map((col, ci) => {
            const cards = (t.cards ?? []).filter((c) => c.column === ci);
            return <div key={col} className="ts-col"><b>{col} <span>{cards.length}</span></b>{cards.map((c) => <span key={c.title} className="ts-card">{c.title}</span>)}</div>;
          })}
        </div>
      );
      default: return text.trim() || bg ? <p key={i} className={`ts-p ${bg ? `ts-tint ts-${bg}` : ''}`}>{line(text, 30)}</p> : null;
    }
  };
  return (
    <div className="ts-sheet" aria-hidden>
      <p className="ts-title">{t.title()}</p>
      {(t.blocks() as Mini[]).map(block)}
    </div>
  );
}

export function TemplatesGallery() {
  const [open, setOpen] = useState<{ parentId?: string } | null>(null);
  const [pick, setPick] = useState<Template>(ORDER[0]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { openFn = (parentId) => { setPick(ORDER[0]); setOpen({ parentId }); }; return () => { openFn = null; }; }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPick((cur) => ORDER[(ORDER.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : ORDER.length - 1)) % ORDER.length]);
      }
      if (e.key === 'Enter' && !busy) { e.preventDefault(); use(pick); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  useEffect(() => { document.querySelector('.tpl-row.on')?.scrollIntoView({ block: 'nearest' }); }, [pick]);
  if (!open) return null;

  async function use(t: Template) {
    setBusy(true);
    try {
      const page = await createFromTemplate(t, open!.parentId);
      setOpen(null);
      go(`/p/${page.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={() => setOpen(null)}>
      <div className="tpl-modal" role="dialog" aria-label="Templates" onMouseDown={(e) => e.stopPropagation()}>
        <aside className="tpl-side">
          <p className="eyebrow-d">Templates</p>
          <h2>Start from a template</h2>
          <nav className="tpl-list">
            {GROUPS.map((g) => (
              <div key={g.name}>
                <p className="tpl-group">{g.name}</p>
                {g.ids.map((id) => {
                  const t = TEMPLATES.find((x) => x.id === id)!;
                  return (
                    <button key={id} className={`tpl-row ${pick.id === id ? 'on' : ''}`} onClick={() => setPick(t)} onDoubleClick={() => use(t)}>
                      <span className="tpl-icon">{TEMPLATE_ICON[id]}</span>
                      <span className="tpl-name">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <section className="tpl-main">
          <button className="icon-btn tpl-close" aria-label="Close" onClick={() => setOpen(null)}><X size={16} /></button>
          <div className="tpl-stage"><Sheet key={pick.id} t={pick} /></div>
          <div className="tpl-info">
            <div>
              <h3>{pick.name}</h3>
              <p>{pick.about}</p>
            </div>
            <button className="primary" disabled={busy} onClick={() => use(pick)}>Use this template</button>
          </div>
          <ul className="tpl-inside">{pick.outline.map((o) => <li key={o}>{o}</li>)}</ul>
          <p className="tpl-where">{open.parentId ? 'It goes in this folder.' : 'It goes in Pages. Move it into a folder any time.'} <kbd>↑</kbd> <kbd>↓</kbd> to browse, <kbd>Enter</kbd> to use.</p>
        </section>
      </div>
    </div>
  );
}
