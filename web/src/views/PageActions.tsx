import {
  ArrowLeft, ClipboardCopy, Copy, Download, FileInput, FilePlus, Folder, FolderPlus, PictureInPicture2, Pencil, Star, StarOff, Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { blocksToMarkdown } from '../lib/blocks';
import { createPage, isTrashed, listPages, loadMeeting, put, trashPage, updatePage, type Page } from '../lib/db';
import { floating } from '../lib/floating';
import { toMarkdown } from '../lib/recap';
import { go, useData } from './common';
import { moveTargets, newFolder, newPage, pageHref, pageTitle, trashWithUndo } from './workspace';

async function markdownFor(p: Page) {
  if (p.kind === 'meeting' && p.meetingId) {
    const b = await loadMeeting(p.meetingId);
    return b ? toMarkdown(b) : '';
  }
  return `# ${pageTitle(p)}\n\n${blocksToMarkdown(p.content ?? [])}\n`;
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = `${name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'page'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Renaming a meeting page renames the meeting too. */
export async function renamePage(p: Page, title: string) {
  await updatePage(p.id, { title });
  if (p.kind === 'meeting' && p.meetingId) {
    const b = await loadMeeting(p.meetingId);
    if (b) await put('meetings', { ...b.meeting, title });
  }
}

interface Props {
  page: Page;
  anchor: DOMRect;
  onClose: () => void;
  onRename: () => void;
  onNotice: (msg: string) => void;
}

/** The ⋯ menu for a page: rename, sub-page, pin, float, duplicate, move, export, trash. */
export function PageActionsMenu({ page, anchor, onClose, onRename, onNotice }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'main' | 'move'>('main');
  const pages = useData(listPages, []) ?? [];
  const isNote = page.kind === 'note';
  const isFolder = page.kind === 'folder';

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [onClose]);

  const destinations = useMemo(() => moveTargets(page, pages), [pages, page]);

  const run = (f: () => unknown) => async () => { onClose(); await f(); };
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 380);

  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button className={`menu-item ${danger ? 'danger' : ''}`} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );

  return createPortal(
    <div className="menu" ref={ref} style={{ top, left: Math.min(anchor.left, window.innerWidth - 250) }}>
      {view === 'main' ? (
        <>
          {item(<Pencil size={15} />, 'Rename', run(onRename))}
          {isNote && item(<FilePlus size={15} />, 'Add sub-page', run(() => newPage(page.id)))}
          {isFolder && item(<FilePlus size={15} />, 'New page in folder', run(() => newPage(page.id)))}
          {isFolder && item(<FolderPlus size={15} />, 'New folder inside', run(() => newFolder(page.id)))}
          {item(page.pinned ? <StarOff size={15} /> : <Star size={15} />, page.pinned ? 'Unpin' : 'Pin to top', run(() => updatePage(page.id, { pinned: !page.pinned })))}
          {isNote && item(<PictureInPicture2 size={15} />, 'Pop out (float on top)', run(async () => {
            go(pageHref(page));
            const err = await floating.open({ kind: 'page', id: page.id });
            if (err) onNotice(err);
          }))}
          {isNote && item(<Copy size={15} />, 'Duplicate', run(async () => {
            const copy = await createPage({ parentId: page.parentId, title: `${pageTitle(page)} (copy)`, content: structuredClone(page.content ?? []) });
            go(`/p/${copy.id}`);
          }))}
          {item(<FileInput size={15} />, 'Move to…', () => setView('move'))}
          <div className="menu-sep" />
          {!isFolder && item(<ClipboardCopy size={15} />, 'Copy as Markdown', run(async () => {
            await navigator.clipboard.writeText(await markdownFor(page));
            onNotice('Copied as Markdown.');
          }))}
          {!isFolder && item(<Download size={15} />, 'Download .md', run(async () => download(pageTitle(page), await markdownFor(page))))}
          {!isFolder && <div className="menu-sep" />}
          {item(<Trash2 size={15} />, isFolder ? 'Move folder to trash' : 'Move to trash', run(async () => {
            await trashWithUndo(page);
            if (location.hash.includes(page.id) || (page.meetingId && location.hash.includes(page.meetingId))) go('/');
          }), true)}
        </>
      ) : (
        <>
          {item(<ArrowLeft size={15} />, 'Back', () => setView('main'))}
          <div className="menu-sep" />
          <div className="menu-scroll">
            {item(<span className="menu-dot" />, page.kind === 'meeting' ? 'Meetings (no folder)' : isFolder ? 'Top level' : 'Pages (no folder)', run(() => updatePage(page.id, { parentId: undefined })))}
            {destinations.map(({ p, depth }) => (
              <button key={p.id} className={`menu-item ${p.id === page.parentId ? 'current' : ''}`} style={{ paddingLeft: 10 + depth * 14 }}
                onClick={run(() => updatePage(page.id, { parentId: p.id }))}>
                {p.kind === 'folder' ? <Folder size={14} /> : <span className="menu-dot" />}<span>{pageTitle(p)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
