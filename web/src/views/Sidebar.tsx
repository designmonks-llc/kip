import {
  Building2, ChevronDown, ChevronRight, CircleCheckBig, FileText, House, Mic, MoreHorizontal, NotebookPen, Plus, Search, Settings, Star, Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadOpenActions } from '../lib/actions';
import { isTrashed, listClients, listPages, type Page } from '../lib/db';
import { go, useData, useRoute, useSession } from './common';
import { PageActionsMenu, renamePage } from './PageActions';
import { Logo } from './brand';
import { ancestors, descendantIds, movePage, trashWithUndo, newPage, pageHref, pageTitle, quickNote, tree, type DropPos } from './workspace';

const ICON = 15;
export const PageIcon = ({ p }: { p: Page }) => (p.kind === 'meeting' ? <Mic size={ICON} /> : <FileText size={ICON} />);

export function Sidebar() {
  const route = useRoute();
  const s = useSession();
  const pages = useData(listPages, []) ?? [];
  const clients = useData(listClients, []) ?? [];
  const actions = useData(loadOpenActions, []);
  const [q, setQ] = useState(new URLSearchParams(route.split('?')[1] ?? '').get('q') ?? '');
  const searchRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState('');
  const [menu, setMenu] = useState<{ page: Page; rect: DOMRect; key: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const byId = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const live = useMemo(() => pages.filter((p) => !isTrashed(p, byId)), [pages, byId]);
  const kids = useMemo(() => tree(live), [live]);
  const roots = (kids.get(undefined) ?? []).filter((p) => p.kind === 'note');
  const looseMeetings = (kids.get(undefined) ?? []).filter((p) => p.kind === 'meeting').sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const pinned = live.filter((p) => p.pinned);
  const trashCount = pages.filter((p) => p.trashedAt).length;
  const openCount = actions ? actions.notes.length + actions.meetings.length : 0;

  // Which page is open (meeting pages are routed by meeting id).
  const [path] = route.split('?');
  const parts = path.split('/').filter(Boolean);
  const currentId = parts[0] === 'p' ? parts[1] : parts[0] === 'm' ? pages.find((p) => p.meetingId === parts[1])?.id : undefined;

  useEffect(() => { if (parts[0] !== 'search') setQ(''); }, [parts[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    const cur = currentId ? byId.get(currentId) : undefined;
    if (cur) setOpen((o) => new Set([...o, ...ancestors(cur, byId).map((a) => a.id)]));
  }, [currentId, byId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // --- drag a page: onto another page (before / inside / after), onto "Pages" (top level), or onto Trash ---
  const [drag, setDrag] = useState<Page | null>(null);
  const [over, setOver] = useState<{ id: string; pos: DropPos } | 'trash' | 'root' | null>(null);
  const endDrag = () => { setDrag(null); setOver(null); };
  const blocked = useMemo(() => (drag ? descendantIds(drag.id, pages) : new Set<string>()), [drag, pages]);

  function dropPos(e: React.DragEvent, p: Page): DropPos | null {
    if (!drag || blocked.has(p.id)) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    // Only notes can hold other pages; meetings take neighbours only.
    if (p.kind === 'note' && y > 0.28 && y < 0.72) return 'inside';
    return y < 0.5 ? 'before' : 'after';
  }
  const dragProps = (p: Page) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); setDrag(p); },
    onDragEnd: endDrag,
    onDragOver: (e: React.DragEvent) => {
      const pos = dropPos(e, p);
      if (!pos) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!(over && over !== 'trash' && over !== 'root' && over.id === p.id && over.pos === pos)) setOver({ id: p.id, pos });
    },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault();
      const pos = dropPos(e, p);
      const dragged = drag;
      endDrag();
      if (!dragged || !pos) return;
      if (pos === 'inside') setOpen((o) => new Set([...o, p.id]));
      await movePage(dragged, p, pos, live);
    },
  });
  const dropClass = (id: string) => (over && over !== 'trash' && over !== 'root' && over.id === id ? `drop-${over.pos}` : '');
  const zone = (kind: 'trash' | 'root') => ({
    onDragOver: (e: React.DragEvent) => { if (!drag) return; e.preventDefault(); if (over !== kind) setOver(kind); },
    onDragLeave: () => setOver((o) => (o === kind ? null : o)),
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault();
      const dragged = drag;
      endDrag();
      if (!dragged) return;
      if (kind === 'trash') {
        await trashWithUndo(dragged);
        if (currentId === dragged.id || currentId && descendantIds(dragged.id, pages).has(currentId)) go('/');
      } else {
        await movePage(dragged, null, 'after', live);
      }
    },
  });

  function row(p: Page, depth: number, opts: { pinnedRow?: boolean } = {}) {
    const children = opts.pinnedRow ? [] : kids.get(p.id) ?? [];
    const isOpen = open.has(p.id);
    const key = (opts.pinnedRow ? 'pin-' : '') + p.id;
    const menuOpen = menu?.page.id === p.id;
    return (
      <div key={key}>
        <div
          className={`tree-row ${currentId === p.id ? 'active' : ''} ${menuOpen ? 'menu-open' : ''} ${drag?.id === p.id ? 'dragging' : ''} ${opts.pinnedRow ? '' : dropClass(p.id)}`}
          style={{ paddingLeft: 4 + depth * 14 }}
          {...(opts.pinnedRow || renaming === key ? {} : dragProps(p))}
        >
          <button className="icon-btn twisty" style={{ visibility: children.length ? 'visible' : 'hidden' }} onClick={() => toggle(p.id)} aria-label="Expand">
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          {renaming === key ? (
            <input
              className="rename"
              autoFocus
              defaultValue={p.title}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => { renamePage(p, e.target.value.trim()); setRenaming(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { e.currentTarget.value = p.title; e.currentTarget.blur(); }
              }}
            />
          ) : (
            <span className="tree-title" onClick={() => go(pageHref(p))} onDoubleClick={() => setRenaming(key)} title={pageTitle(p)}>
              <span className="kind">{opts.pinnedRow ? <Star size={ICON} /> : <PageIcon p={p} />}</span>
              <span className="tree-label">{pageTitle(p)}</span>
            </span>
          )}
          <button
            className="icon-btn row-btn"
            title="More actions"
            aria-label="More actions"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => setMenu(menuOpen ? null : { page: p, rect: e.currentTarget.getBoundingClientRect(), key })}
          >
            <MoreHorizontal size={ICON} />
          </button>
          {p.kind === 'note' && !opts.pinnedRow && (
            <button className="icon-btn row-btn" title="Add a page inside" aria-label="Add a page inside"
              onClick={async () => { setOpen((o) => new Set([...o, p.id])); await newPage(p.id); }}>
              <Plus size={ICON} />
            </button>
          )}
        </div>
        {isOpen && children.map((c) => row(c, depth + 1))}
      </div>
    );
  }

  return (
    <nav className="sidebar">
      <div className="brand" onClick={() => go('/')}><Logo size={26} /></div>
      <label className="side-search">
        <Search size={14} />
        <input
          ref={searchRef}
          type="search"
          placeholder="Search  ⌘K"
          value={q}
          onChange={(e) => { setQ(e.target.value); go(e.target.value ? `/search?q=${encodeURIComponent(e.target.value)}` : '/'); }}
        />
      </label>
      <div className="side-actions">
        <button onClick={() => newPage()}><Plus size={ICON} /> New page</button>
        <button onClick={() => go(s ? '/live' : '/new')} title="Alt+N" aria-label={s ? 'Live meeting' : 'New meeting (Alt+N)'}><Mic size={ICON} /> {s ? 'Live meeting' : 'New meeting'}</button>
        <button onClick={async () => setHint((await quickNote()) ?? '')} title="Alt+Q" aria-label="Quick note (Alt+Q)"><NotebookPen size={ICON} /> Quick note</button>
      </div>
      {hint && <p className="status warn small side-pad" onClick={() => setHint('')}>{hint}</p>}

      <div className="side-links">
        <a className={path === '/' ? 'active' : ''} onClick={() => go('/')}><House size={ICON} /> Home</a>
        <a className={parts[0] === 'actions' ? 'active' : ''} onClick={() => go('/actions')}>
          <CircleCheckBig size={ICON} /> Open actions {openCount > 0 && <span className="pill">{openCount}</span>}
        </a>
      </div>

      {pinned.length > 0 && (
        <>
          <h4 className="side-h">Pinned</h4>
          {pinned.map((p) => row(p, 0, { pinnedRow: true }))}
        </>
      )}

      <h4 className={`side-h ${over === 'root' ? 'drop-zone' : ''}`} {...zone('root')} title="Drop here to move a page to the top level">Pages</h4>
      {roots.length === 0 && <p className="muted small side-pad">No pages yet.</p>}
      {roots.map((p) => row(p, 0))}

      <h4 className="side-h">Meetings</h4>
      {looseMeetings.length === 0 && <p className="muted small side-pad">No meetings yet.</p>}
      {looseMeetings.map((p) => row(p, 0))}

      {clients.length > 0 && (
        <>
          <h4 className="side-h">Clients</h4>
          {clients.map((c) => (
            <div key={c.id} className={`tree-row ${parts[0] === 'c' && parts[1] === c.id ? 'active' : ''}`} style={{ paddingLeft: 4 }}>
              <span className="icon-btn twisty" />
              <span className="tree-title" onClick={() => go(`/c/${c.id}`)}>
                <span className="kind"><Building2 size={ICON} /></span><span className="tree-label">{c.name}</span>
              </span>
            </div>
          ))}
        </>
      )}

      <div className="side-foot">
        <a className={`${parts[0] === 'trash' ? 'active' : ''} ${over === 'trash' ? 'drop-trash' : ''}`} onClick={() => go('/trash')} {...zone('trash')}>
          <Trash2 size={ICON} /> Trash {trashCount > 0 && <span className="pill">{trashCount}</span>}
        </a>
        <a className={parts[0] === 'settings' ? 'active' : ''} onClick={() => go('/settings')}><Settings size={ICON} /> Settings</a>
      </div>

      {menu && (
        <PageActionsMenu
          page={menu.page}
          anchor={menu.rect}
          onClose={() => setMenu(null)}
          onRename={() => setRenaming(menu.key)}
          onNotice={setHint}
        />
      )}
    </nav>
  );
}
