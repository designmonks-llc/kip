// The Templates gallery: pick a starting point, see what's inside, and get a ready page (in the current folder).
import { BookOpen, Bug, CalendarDays, CalendarRange, ClipboardList, KanbanSquare, ListChecks, NotebookText, Sun, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createFromTemplate, TEMPLATES, type Template } from '../lib/templates';
import { go } from './common';

export const TEMPLATE_ICON: Record<string, React.ReactNode> = {
  kanban: <KanbanSquare size={18} />, project: <ClipboardList size={18} />, meeting: <Users size={18} />, weekly: <CalendarRange size={18} />,
  content: <CalendarDays size={18} />, brief: <NotebookText size={18} />, bugs: <Bug size={18} />, journal: <Sun size={18} />,
  reading: <BookOpen size={18} />, todo: <ListChecks size={18} />,
};

// one gallery for the whole app: any button can open it, for a folder or the top level
let openFn: ((parentId?: string) => void) | null = null;
export const openTemplates = (parentId?: string) => openFn?.(parentId);

export function TemplatesGallery() {
  const [open, setOpen] = useState<{ parentId?: string } | null>(null);
  const [pick, setPick] = useState<Template>(TEMPLATES[0]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { openFn = (parentId) => { setPick(TEMPLATES[0]); setOpen({ parentId }); }; return () => { openFn = null; }; }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [open]);
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
      <div className="modal templates-modal" role="dialog" aria-label="Templates" onMouseDown={(e) => e.stopPropagation()}>
        <button className="icon-btn templates-close" aria-label="Close" onClick={() => setOpen(null)}><X size={16} /></button>
        <p className="eyebrow-d">Templates</p>
        <h2>Start from a template</h2>
        <div className="templates-body">
          <ul className="templates-list">
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <button className={pick.id === t.id ? 'on' : ''} onClick={() => setPick(t)} onDoubleClick={() => use(t)}>
                  <span className="tpl-icon">{TEMPLATE_ICON[t.id]}</span>
                  <span><b>{t.name}</b><small>{t.about}</small></span>
                </button>
              </li>
            ))}
          </ul>
          <div className="templates-preview">
            <span className="tpl-icon big">{TEMPLATE_ICON[pick.id]}</span>
            <h3>{pick.name}</h3>
            <p className="muted">{pick.about}</p>
            <ul>{pick.outline.map((o) => <li key={o}>{o}</li>)}</ul>
            <button className="primary" disabled={busy} onClick={() => use(pick)}>Use this template</button>
            <p className="small muted">{open.parentId ? 'It goes in this folder.' : 'It goes in Pages; move it into a folder any time.'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
