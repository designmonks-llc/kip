// A folder: its folders first, then its pages and meetings, with New page / New folder inside it.
import { FilePlus, Folder, FolderPlus, LayoutTemplate, Mic } from 'lucide-react';
import { openTemplates } from './Templates';
import { useEffect, useRef, useState } from 'react';
import { getPage, isTrashed, listPages, updatePage, type Page } from '../lib/db';
import { ColorPicker } from './ColorPicker';
import { EmptyState } from './brand';
import { ItemCard } from './cards';
import { go, useData, useRoute } from './common';
import { PageActionsMenu, renamePage } from './PageActions';
import { Crumbs, PageMenu } from './PageMenu';
import { newFolder, newPage, tree } from './workspace';

export function FolderView({ id }: { id: string }) {
  const folder = useData(() => getPage(id), [id]);
  const pages = useData(listPages, []) ?? [];
  const route = useRoute();
  const [menu, setMenu] = useState<{ page: Page; rect: DOMRect } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const title = useRef<HTMLInputElement>(null);

  // A brand-new folder opens with its name selected, ready to type.
  useEffect(() => {
    // wait for this folder (not the one we came from) before focusing its name
    if (folder?.id === id && route.includes('rename=1')) {
      title.current?.focus();
      title.current?.select();
      go(`/f/${id}`);
    }
  }, [folder, route, id]);

  if (folder === undefined) return <main className="page"><p className="muted">Loading…</p></main>;
  if (!folder || folder.kind !== 'folder') return <main className="page"><p>Folder not found.</p><button onClick={() => go('/')}>Home</button></main>;

  const byId = new Map(pages.map((p) => [p.id, p]));
  const inside = (tree(pages.filter((p) => !isTrashed(p, byId))).get(id) ?? []);
  const folders = inside.filter((p) => p.kind === 'folder');
  const items = inside.filter((p) => p.kind !== 'folder').sort((a, b) => b.updatedAt - a.updatedAt);
  const card = (p: Page) => (
    <ItemCard key={p.id} p={p} pages={pages} menuOpen={menu?.page.id === p.id} renaming={renaming === p.id}
      onRenamed={() => setRenaming(null)} onMenu={(rect) => setMenu(menu?.page.id === p.id ? null : { page: p, rect })} />
  );

  return (
    <main className="home folder-view">
      <div className="doc-top">
        <Crumbs page={folder} />
        <div className="row"><PageMenu page={folder} /></div>
      </div>
      <div className="folder-head">
        <span className={`folder-swatch ${folder.color ? `tile-${folder.color}` : ''}`}>
          <ColorPicker value={folder.color} title="Folder colour" icon={<Folder size={20} />}
            onPick={(c) => updatePage(folder.id, { color: c === 'default' ? undefined : c })} />
        </span>
        <input
          ref={title}
          className="doc-title"
          key={folder.id}
          defaultValue={folder.title}
          placeholder="Folder name"
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== folder.title) renamePage(folder, v); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <div className="row">
          <button className="primary" onClick={() => newPage(folder.id)}><FilePlus size={15} /> New page</button>
          <button onClick={() => go(`/new?folder=${folder.id}`)}><Mic size={15} /> New meeting</button>
          <button onClick={() => openTemplates(folder.id)}><LayoutTemplate size={15} /> From template</button>
          <button onClick={() => newFolder(folder.id)}><FolderPlus size={15} /> New folder</button>
        </div>
      </div>
      {hint && <p className="status warn">{hint}</p>}

      {folders.length > 0 && (
        <section className="folder-sec">
          <div className="sec-head"><p className="eyebrow-d">Folders</p></div>
          <div className="recent-grid">{folders.map(card)}</div>
        </section>
      )}
      <section className="folder-sec">
        {folders.length > 0 && <div className="sec-head"><p className="eyebrow-d">Pages and meetings</p></div>}
        {items.length === 0 ? (
          <div className="recent-empty small-empty">
            <EmptyState title={folders.length ? 'No pages here yet' : 'An empty folder'} text="Make a page or a meeting in this folder, or drag pages onto it in the sidebar." />
          </div>
        ) : (
          <div className="recent-grid">{items.map(card)}</div>
        )}
      </section>

      {menu && (
        <PageActionsMenu page={menu.page} anchor={menu.rect} onClose={() => setMenu(null)} onRename={() => setRenaming(menu.page.id)} onNotice={setHint} />
      )}
    </main>
  );
}
