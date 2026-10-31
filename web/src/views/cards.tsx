// Cards for Home and folders: a page or meeting, or a folder with what's inside it.
import { FileText, Folder, Mic, MoreHorizontal, Star } from 'lucide-react';
import { blocksToText } from '../lib/blocks';
import type { Page } from '../lib/db';
import { fmtDateTime } from '../lib/recap';
import { go } from './common';
import { renamePage } from './PageActions';
import { folderStats, pageHref, pageTitle } from './workspace';

interface CardProps {
  p: Page;
  pages: Page[];
  menuOpen: boolean;
  renaming: boolean;
  onRenamed: () => void;
  onMenu: (rect: DOMRect) => void;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function ItemCard({ p, pages, menuOpen, renaming, onRenamed, onMenu }: CardProps) {
  const folder = p.kind === 'folder';
  const stats = folder ? folderStats(p, pages) : null;
  const snippet = stats
    ? [stats.folders && plural(stats.folders, 'folder'), plural(stats.pages, 'page'), stats.meetings && plural(stats.meetings, 'meeting')].filter(Boolean).join(' · ')
    : p.kind === 'note'
      ? blocksToText(p.content ?? []).split('\n').filter(Boolean).slice(0, 2).join(' · ') || 'Empty page'
      : 'Meeting notes, recap and follow-up';
  return (
    <article className={`note-card ${folder ? 'folder-card' : ''} ${menuOpen ? 'menu-open' : ''}`} onClick={() => !renaming && go(pageHref(p))}>
      <div className="nc-head">
        <span className={`nc-icon ${p.kind} ${folder && p.color ? `tile-${p.color}` : ''}`}>{folder ? <Folder size={14} /> : p.kind === 'meeting' ? <Mic size={14} /> : <FileText size={14} />}</span>
        {p.pinned && <Star size={13} className="pin-mark" />}
      </div>
      {renaming ? (
        <input
          className="rename"
          autoFocus
          defaultValue={p.title}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => { renamePage(p, e.target.value.trim()); onRenamed(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { e.currentTarget.value = p.title; e.currentTarget.blur(); }
          }}
        />
      ) : (
        <div className="nc-title">{pageTitle(p)}</div>
      )}
      <div className="nc-snippet">{snippet}</div>
      <div className="nc-meta">{folder ? 'Folder' : p.kind === 'meeting' ? 'Meeting' : 'Page'} · {fmtDateTime(stats ? stats.updatedAt : p.updatedAt)}</div>
      <button
        className="icon-btn card-menu-btn"
        title="More actions"
        aria-label="More actions"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onMenu(e.currentTarget.getBoundingClientRect()); }}
      >
        <MoreHorizontal size={16} />
      </button>
    </article>
  );
}
