import { Star, StarOff, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { isTrashed, listPages, restorePage, trashPage, updatePage, type Page } from '../lib/db';
import { go, useData } from './common';
import { ancestors, descendantIds, pageHref, pageTitle, trashWithUndo, tree } from './workspace';

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
  const options = useMemo(() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const blocked = descendantIds(page.id, pages);
    const kids = tree(pages.filter((p) => p.kind === 'note' && !isTrashed(p, byId)));
    const out: { p: Page; depth: number }[] = [];
    const visit = (parent: string | undefined, depth: number) => {
      for (const p of kids.get(parent) ?? []) {
        if (blocked.has(p.id)) continue;
        out.push({ p, depth });
        visit(p.id, depth + 1);
      }
    };
    visit(undefined, 0);
    return out;
  }, [pages, page.id]);

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
        title="Move this page inside another page"
      >
        <option value="">{page.kind === 'meeting' ? 'In: Meetings' : 'In: top level'}</option>
        {options.map(({ p, depth }) => (
          <option key={p.id} value={p.id}>{'  '.repeat(depth)}In: {pageTitle(p)}</option>
        ))}
      </select>
      <button className="danger" onClick={async () => { await trashWithUndo(page); go('/'); }}><Trash2 size={15} /> Move to trash</button>
    </div>
  );
}
