import { Star, StarOff, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { isTrashed, listPages, restorePage, trashPage, updatePage, type Page } from '../lib/db';
import { go, useData } from './common';
import { ancestors, moveTargets, pageHref, pageTitle, trashWithUndo } from './workspace';

/** Breadcrumbs for a page: Pages / Parent / Child. */
export function Crumbs({ page }: { page: Page }) {
  const pages = useData(listPages, []) ?? [];
  const byId = new Map(pages.map((p) => [p.id, p]));
  const trail = ancestors(page, byId);
  return (
    <div className="crumbs">
      <a onClick={() => go('/')}>Home</a>
      {trail.map((p) => (
        <span key={p.id}> / <a onClick={() => go(pageHref(p))}>{pageTitle(p)}</a></span>
      ))}
      <span className="muted"> / {pageTitle(page)}</span>
    </div>
  );
}

/** Pin, move under another page, and trash: shared by notes and meeting pages. */
export function PageMenu({ page }: { page: Page }) {
  const pages = useData(listPages, []) ?? [];
  const options = useMemo(() => moveTargets(page, pages), [pages, page]);

  if (page.trashedAt) {
    return (
      <div className="row">
        <span className="pill">In trash</span>
        <button onClick={() => restorePage(page.id)}>Restore</button>
      </div>
    );
  }
  return (
    <div className="row">
      <button onClick={() => updatePage(page.id, { pinned: !page.pinned })}>{page.pinned ? <StarOff size={15} /> : <Star size={15} />} {page.pinned ? 'Unpin' : 'Pin'}</button>
      <select
        className="move"
        value={page.parentId ?? ''}
        onChange={(e) => updatePage(page.id, { parentId: e.target.value || undefined })}
        title={page.kind === 'folder' ? 'Put this folder inside another folder' : 'Move this into a folder or another page'}
      >
        <option value="">{page.kind === 'meeting' ? 'In: Meetings' : page.kind === 'folder' ? 'In: top level' : 'In: Pages'}</option>
        {options.map(({ p, depth }) => (
          <option key={p.id} value={p.id}>{'  '.repeat(depth)}In: {p.kind === 'folder' ? '📁 ' : ''}{pageTitle(p)}</option>
        ))}
      </select>
      <button className="danger" onClick={async () => { await trashWithUndo(page); go('/'); }}><Trash2 size={15} /> Move to trash</button>
    </div>
  );
}
