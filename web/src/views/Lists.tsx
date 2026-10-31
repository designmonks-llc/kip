// Open actions, Trash and Search: whole-workspace lists.
import { RotateCcw, Trash2 } from 'lucide-react';
import { loadOpenActions, tickTodo } from '../lib/actions';
import { deleteForever, listMeetings, listPages, restorePage, search } from '../lib/db';
import { fmtDate, fmtTime } from '../lib/recap';
import { EmptyState } from './brand';
import { go, LineRow, RichText, toggleLine, useData } from './common';
import { PageIcon } from './Sidebar';
import { PageHeader } from './ui';
import { pageHref, pageTitle } from './workspace';

/** "3 min ago", "yesterday", "12 Oct". */
function ago(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  return fmtDate(ts);
}

export function ActionsView() {
  const data = useData(loadOpenActions, []);
  if (!data) return <main className="page narrow"><p className="muted">Loading…</p></main>;
  const { notes, meetings } = data;
  const total = notes.length + meetings.length;

  // Group by where they came from.
  const byPage = new Map<string, typeof notes>();
  for (const n of notes) byPage.set(n.page.id, [...(byPage.get(n.page.id) ?? []), n]);
  const byMeeting = new Map<string, typeof meetings>();
  for (const m of meetings) byMeeting.set(m.meeting.id, [...(byMeeting.get(m.meeting.id) ?? []), m]);

  return (
    <main className="page narrow">
      <PageHeader
        eyebrow="Across Kip"
        title="Open actions"
        lead={total ? `${total} to-do${total === 1 ? '' : 's'} from your notes and meetings. Tick them here or where they live.` : 'Every unticked to-do from your notes and meetings shows up here.'}
      />
      {total === 0 && <EmptyState icon="check" title="All clear" text="Every to-do is ticked. New ones appear here when you type “! ” in a note or a meeting." />}

      {byPage.size > 0 && <h3>From notes</h3>}
      {[...byPage.values()].map((items) => (
        <section key={items[0].page.id} className="group-card">
          <a className="group-title" onClick={() => go(pageHref(items[0].page))}><PageIcon p={items[0].page} /> {pageTitle(items[0].page)}</a>
          <ul className="lines">
            {items.map(({ page, todo }) => (
              <li key={todo.id} className="line">
                <input type="checkbox" checked={false} onChange={() => tickTodo(page, todo.id, true)} />
                <span className="text"><RichText text={todo.text} /></span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {byMeeting.size > 0 && <h3>From meetings</h3>}
      {[...byMeeting.values()].map((items) => (
        <section key={items[0].meeting.id} className="group-card">
          <a className="group-title" onClick={() => go(`/m/${items[0].meeting.id}`)}>
            {items[0].meeting.title} <span className="muted small">{fmtDate(items[0].meeting.startedAt)}</span>
          </a>
          <ul className="lines">
            {items.map(({ line }) => <LineRow key={line.id} line={line} checkable onToggle={toggleLine} />)}
          </ul>
        </section>
      ))}
    </main>
  );
}

export function TrashView() {
  const pages = useData(listPages, []);
  const trashed = (pages ?? []).filter((p) => p.trashedAt).sort((a, b) => b.trashedAt! - a.trashedAt!);
  return (
    <main className="page narrow">
      <PageHeader
        eyebrow="Trash"
        title="Recently deleted"
        lead="Pages wait here until you delete them for good. Restoring a page brings back everything inside it."
        actions={trashed.length > 0 && (
          <button className="danger" onClick={async () => {
            if (!confirm(`Delete ${trashed.length} page(s) and everything inside them forever?`)) return;
            for (const p of trashed) await deleteForever(p.id);
          }}><Trash2 size={14} /> Empty trash</button>
        )}
      />
      {trashed.length === 0 && <EmptyState icon="trash" title="Trash is empty" text="Pages you delete wait here so you can bring them back." />}
      {trashed.length > 0 && (
        <ul className="row-list">
          {trashed.map((p) => (
            <li key={p.id}>
              <span className="row-icon"><PageIcon p={p} /></span>
              <span className="row-main">
                <span className="row-title">{pageTitle(p)}</span>
                <span className="row-meta">{p.kind === 'meeting' ? 'Meeting' : p.kind === 'folder' ? 'Folder and everything in it' : 'Page'} · deleted {ago(p.trashedAt!)}</span>
              </span>
              <span className="row-actions">
                <button onClick={() => restorePage(p.id)}><RotateCcw size={14} /> Restore</button>
                <button className="ghost danger" title="Delete forever" aria-label="Delete forever"
                  onClick={async () => { if (confirm('Delete forever? This cannot be undone.')) await deleteForever(p.id); }}>
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function SearchView({ q }: { q: string }) {
  const hits = useData(() => search(q), [q]);
  const meetings = useData(listMeetings, []);
  const titleOf = (id: string) => meetings?.find((m) => m.id === id)?.title ?? 'Meeting';
  return (
    <main className="page narrow">
      <PageHeader eyebrow="Search" title={`“${q}”`} lead={hits ? `${hits.length} result${hits.length === 1 ? '' : 's'} across pages, meetings, transcripts and screens.` : 'Searching…'} />
      {hits?.length === 0 && <EmptyState icon="search" title="Nothing found" text="Try another word. Search covers page titles and text, meeting notes, transcripts and screens." />}
      {hits && hits.length > 0 && (
        <ul className="row-list">
          {hits.map((h, i) => (
            <li key={i} className="clickable" onClick={() => go(h.pageId ? `/p/${h.pageId}` : `/m/${h.meetingId}`)}>
              <span className="pill">{h.kind}</span>
              <span className="row-main">
                {h.pageId ? <span className="row-title">{h.text}</span> : (
                  <>
                    <span className="row-title">{titleOf(h.meetingId!)} <span className="muted small">{fmtTime(h.t)}</span></span>
                    <span className="row-meta">{h.text.slice(0, 200)}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
