// "@" links: type @ in a page and pick any other page, meeting or folder. The link shows that page's current
// name (it follows renames) and clicking it jumps there.
import { createReactInlineContentSpec } from '@blocknote/react';
import { FileText, Folder, Mic } from 'lucide-react';
import { useEffect } from 'react';
import { isTrashed, listPages, type Page } from '../lib/db';
import { go, useData } from './common';
import { pageHref, pageTitle } from './workspace';

const KindIcon = ({ kind, size = 14 }: { kind: string; size?: number }) =>
  kind === 'folder' ? <Folder size={size} /> : kind === 'meeting' ? <Mic size={size} /> : <FileText size={size} />;

function MentionView({ pageId, title, rename }: { pageId: string; title: string; rename?: (title: string) => void }) {
  const pages = useData(listPages, []) ?? [];
  const byId = new Map(pages.map((p) => [p.id, p]));
  const p = byId.get(pageId);
  const gone = pages.length > 0 && (!p || isTrashed(p, byId));
  // keep the stored name current, so exports and search show the page's name today
  useEffect(() => { if (p && rename && pageTitle(p) !== title) rename(pageTitle(p)); }, [p?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={`mention ${gone ? 'gone' : ''}`} data-mention={pageId}
      title={gone ? 'This page is in the trash' : 'Open'}
      onMouseDown={(e) => { if (p && !gone) { e.preventDefault(); go(pageHref(p)); } }}>
      <KindIcon kind={p?.kind ?? 'note'} size={13} />{p ? pageTitle(p) : title}
    </span>
  );
}

export const Mention = createReactInlineContentSpec(
  { type: 'mention', propSchema: { pageId: { default: '' }, title: { default: '' } }, content: 'none' },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <MentionView pageId={inlineContent.props.pageId} title={inlineContent.props.title}
        rename={editor.isEditable ? (title) => updateInlineContent({ type: 'mention', props: { ...inlineContent.props, title } }) : undefined} />
    ),
    toExternalHTML: ({ inlineContent }) => <span className="mention">@{inlineContent.props.title}</span>,
  },
);

/** Where a page lives, for the @ menu: "Work / Clients". */
function where(p: Page, byId: Map<string, Page>) {
  const path: string[] = [];
  for (let at = p.parentId ? byId.get(p.parentId) : undefined; at && path.length < 4; at = at.parentId ? byId.get(at.parentId) : undefined) path.unshift(pageTitle(at));
  return path.length ? `in ${path.join(' / ')}` : p.kind === 'folder' ? 'Folder' : p.kind === 'meeting' ? 'Meeting' : 'Pages';
}

/** The @ menu's items: every page, meeting and folder except the one you're in, best matches first. */
export async function mentionItems(editor: { insertInlineContent: (c: never) => void }, here: string, query: string) {
  const pages = await listPages();
  const byId = new Map(pages.map((p) => [p.id, p]));
  const q = query.trim().toLowerCase();
  return pages
    .filter((p) => p.id !== here && !isTrashed(p, byId) && (p.title.trim() || p.kind === 'folder'))
    .map((p) => ({ p, at: pageTitle(p).toLowerCase().indexOf(q) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || b.p.updatedAt - a.p.updatedAt)
    .slice(0, 12)
    .map(({ p }) => ({
      title: pageTitle(p),
      subtext: where(p, byId),
      icon: <KindIcon kind={p.kind} size={18} />,
      onItemClick: () => editor.insertInlineContent([{ type: 'mention', props: { pageId: p.id, title: pageTitle(p) } }, ' '] as never),
    }));
}
