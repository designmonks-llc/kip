import {
  Building2, ChevronDown, ChevronRight, CircleCheckBig, FileText, Folder, FolderOpen, FolderPlus, House, LayoutTemplate, Mic, MoreHorizontal, NotebookPen, Plus, Search, Settings, Star, Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadOpenActions } from '../lib/actions';
import { isTrashed, listClients, listPages, restorePage, trashPage, updatePage, type Page } from '../lib/db';
import { toasts } from '../lib/toast';
import { go, useData, useRoute, useSession } from './common';
import { PageActionsMenu, renamePage } from './PageActions';
import { Logo } from './brand';
import { openTemplates } from './Templates';
import { ancestors, descendantIds, movePage, moveTargets, trashWithUndo, newFolder, newPage, pageHref, pageTitle, quickNote, tree, type DropPos } from './workspace';

const ICON = 15;
export const PageIcon = ({ p, open }: { p: Page; open?: boolean }) =>
  p.kind === 'meeting' ? <Mic size={ICON} /> : p.kind === 'folder' ? (open ? <FolderOpen size={ICON} className={p.color ? `ink-${p.color}` : undefined} /> : <Folder size={ICON} className={p.color ? `ink-${p.color}` : undefined} />) : <FileText size={ICON} />;

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
  const rootFolders = (kids.get(undefined) ?? []).filter((p) => p.kind === 'folder');
  const roots = (kids.get(undefined) ?? []).filter((p) => p.kind === 'note');
  const looseMeetings = (kids.get(undefined) ?? []).filter((p) => p.kind === 'meeting').sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const pinned = live.filter((p) => p.pinned);
  const trashCount = pages.filter((p) => p.trashedAt).length;
  const openCount = actions ? actions.notes.length + actions.meetings.length : 0;

  // Which page is open (meeting pages are routed by meeting id).
  const [path] = route.split('?');
  const parts = path.split('/').filter(Boolean);
  const currentId = parts[0] === 'p' || parts[0] === 'f' ? parts[1] : parts[0] === 'm' ? pages.find((p) => p.meetingId === parts[1])?.id : undefined;

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

  // --- selecting several: ⌘-click adds or removes one, Shift-click takes everything in between ---
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const order: string[] = []; // rows in the order they're drawn (filled by row() below)
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSel(new Set()); setMoving(false); } };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  function pick(e: React.MouseEvent, p: Page) {
    if (e.shiftKey && anchor.current && order.includes(anchor.current)) {
      const a = order.indexOf(anchor.current), b = order.indexOf(p.id);
      setSel(new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1)));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSel((cur) => { const n = new Set(cur); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; });
      anchor.current = p.id;
      return;
    }
    setSel(new Set());
    anchor.current = p.id;
    go(pageHref(p));
  }
  /** The selected items without the ones already inside another selected item (they move with it). */
  const tops = (ids: Set<string>) => [...ids].map((id) => byId.get(id)).filter((p): p is Page => !!p && !ancestors(p, byId).some((a) => ids.has(a.id)));
  async function trashSelected() {
    const items = tops(sel);
    for (const p of items) await trashPage(p.id);
    setSel(new Set());
    toasts.show(`Moved ${items.length} item${items.length === 1 ? '' : 's'} to Trash`, { label: 'Undo', run: () => { for (const p of items) restorePage(p.id); } });
    if (currentId && items.some((p) => p.id === currentId || descendantIds(p.id, pages).has(currentId))) go('/');
  }
  async function pinSelected() {
    const items = [...sel].map((id) => byId.get(id)).filter((p): p is Page => !!p);
    const pin = !items.every((p) => p.pinned);
    for (const p of items) await updatePage(p.id, { pinned: pin });
    setSel(new Set());
  }
  async function moveSelected(to: Page | null) {
    const items = tops(sel);
    for (const p of items) await updatePage(p.id, { parentId: to?.id, order: undefined });
    if (to) setOpen((o) => new Set([...o, to.id]));
    setSel(new Set()); setMoving(false);
    toasts.show(`Moved ${items.length} item${items.length === 1 ? '' : 's'}${to ? ` to “${pageTitle(to)}”` : ''}`);
  }
  // where a selection can go: allowed for every selected item
  const selTargets = useMemo(() => {
    if (sel.size < 2) return [];
    const items = [...sel].map((id) => byId.get(id)).filter((p): p is Page => !!p);
    const lists = items.map((it) => new Set(moveTargets(it, pages).map((t) => t.p.id)));
    return moveTargets(items[0], pages).filter((t) => lists.every((l) => l.has(t.p.id)));
  }, [sel, pages, byId]);

  // --- drag a page: onto another page (before / inside / after), onto "Pages" (top level), or onto Trash ---
  const [drag, setDrag] = useState<Page | null>(null);
  const [over, setOver] = useState<{ id: string; pos: DropPos } | 'trash' | 'root' | null>(null);
  const endDrag = () => { setDrag(null); setOver(null); };
  const dragGroup = useMemo(() => (drag && sel.has(drag.id) && sel.size > 1 ? tops(sel) : drag ? [drag] : []), [drag, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = useMemo(() => {
    const out = new Set<string>();
    for (const d of dragGroup) for (const id of descendantIds(d.id, pages)) out.add(id);
    return out;
  }, [dragGroup, pages]);

  function dropPos(e: React.DragEvent, p: Page): DropPos | null {
    if (!drag || blocked.has(p.id)) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    // Folders hold anything; notes hold pages and meetings (not folders); meetings take neighbours only.
    if ((p.kind === 'folder' || (p.kind === 'note' && !dragGroup.some((d) => d.kind === 'folder'))) && y > 0.28 && y < 0.72) return 'inside';
    if (dragGroup.some((d) => d.kind === 'folder') && p.kind !== 'folder') return null; // folders sit among folders
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
      const group = sel.has(dragged.id) && sel.size > 1 ? tops(sel) : [dragged];
      // several: each lands after the one before it, in the order they're listed
      let target: Page = p, where: DropPos = pos;
      for (const g of group) {
        await movePage(g, target, where, (await listPages()).filter((x) => !isTrashed(x, byId)));
        if (where !== 'inside') { target = g; where = 'after'; }
      }
      if (group.length > 1) setSel(new Set());
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
    // inside a folder: its folders first, then pages and meetings
    const children = opts.pinnedRow ? [] : [...(kids.get(p.id) ?? [])].sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder'));
    const isOpen = open.has(p.id);
    const key = (opts.pinnedRow ? 'pin-' : '') + p.id;
    const menuOpen = menu?.page.id === p.id;
    if (!opts.pinnedRow) order.push(p.id);
    return (
      <div key={key}>
        <div
          className={`tree-row ${currentId === p.id ? 'active' : ''} ${!opts.pinnedRow && sel.has(p.id) ? 'selected' : ''} ${menuOpen ? 'menu-open' : ''} ${drag?.id === p.id ? 'dragging' : ''} ${opts.pinnedRow ? '' : dropClass(p.id)}`}
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
            <span className="tree-title" onClick={(e) => (opts.pinnedRow ? go(pageHref(p)) : pick(e, p))} onDoubleClick={() => setRenaming(key)} title={`${pageTitle(p)}\n⌘-click or Shift-click to select several`}>
              <span className="kind">{opts.pinnedRow ? <Star size={ICON} /> : <PageIcon p={p} open={isOpen && children.length > 0} />}</span>
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
          {(p.kind === 'note' || p.kind === 'folder') && !opts.pinnedRow && (
            <button className="icon-btn row-btn" title={p.kind === 'folder' ? 'New page in this folder' : 'Add a page inside'} aria-label="Add a page inside"
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
        <button onClick={() => openTemplates()} title="Kanban board, project tracker, meeting notes and more"><LayoutTemplate size={ICON} /> Templates</button>
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

      <h4 className="side-h side-h-row">Folders
        <button className="icon-btn" title="New folder" aria-label="New folder" onClick={() => newFolder()}><FolderPlus size={14} /></button>
      </h4>
      {rootFolders.length === 0 && <p className="muted small side-pad">Group pages and meetings by project.</p>}
      {rootFolders.map((p) => row(p, 0))}

      <h4 className={`side-h ${over === 'root' ? 'drop-zone' : ''}`} {...zone('root')} title="Drop here to move a page out of its folder">Pages</h4>
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

      {sel.size > 1 && (
        <div className="sel-bar" role="toolbar" aria-label="Selected items">
          <span className="sel-count">{sel.size} selected</span>
          <button onClick={() => setMoving(!moving)}>Move to…</button>
          <button onClick={pinSelected}>{[...sel].every((id) => byId.get(id)?.pinned) ? 'Unpin' : 'Pin'}</button>
          <button className="danger" onClick={trashSelected}>Trash</button>
          <button className="icon-btn sel-clear" aria-label="Clear selection" title="Clear (Esc)" onClick={() => { setSel(new Set()); setMoving(false); }}>×</button>
          {moving && (
            <div className="menu sel-move">
              <button className="menu-item" onClick={() => moveSelected(null)}><span className="menu-dot" /><span>Out of any folder</span></button>
              <div className="menu-scroll">
                {selTargets.map(({ p, depth }) => (
                  <button key={p.id} className="menu-item" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => moveSelected(p)}>
                    {p.kind === 'folder' ? <Folder size={14} className={p.color ? `ink-${p.color}` : undefined} /> : <span className="menu-dot" />}<span>{pageTitle(p)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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
