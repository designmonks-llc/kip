import { db, isTrashed, listPages, meetingsForClient, openItemsForClient } from '../lib/db';
import { fmtDate, fmtDateTime, fmtTime } from '../lib/recap';
import { go, LineRow, toggleLine, useData, useSession } from './common';
import { ART } from '../lib/art';
import { EmptyState } from './brand';
import { PageHeader } from './ui';

export function ClientView({ id }: { id: string }) {
  const s = useSession();
  const data = useData(async () => {
    const client = await (await db()).get('clients', id);
    const pages = await listPages();
    const byId = new Map(pages.map((p) => [p.id, p]));
    const gone = new Set(pages.filter((p) => p.meetingId && isTrashed(p, byId)).map((p) => p.meetingId));
    return {
      client,
      meetings: (await meetingsForClient(id)).filter((m) => !gone.has(m.id)),
      open: (await openItemsForClient(id)).filter((o) => !gone.has(o.meeting.id)),
    };
  }, [id]);
  if (!data) return <main className="page">Loading…</main>;
  const { client, meetings, open } = data;
  if (!client) return <main className="page">Client not found.</main>;

  return (
    <main className="page">
      <PageHeader
        eyebrow="Client"
        title={client.name}
        lead={`${meetings.length} meeting${meetings.length === 1 ? '' : 's'} · ${open.length} open item${open.length === 1 ? '' : 's'}`}
        actions={!s && <button className="primary" onClick={() => go(`/new?client=${encodeURIComponent(client.name)}`)}>New meeting with {client.name}</button>}
      />
      <div className="cols">
        <section>
          <h3>Open items ({open.length})</h3>
          {open.length === 0 && <EmptyState art={ART.hill} title="Nothing open" text="Every action is done and every question answered." seed={21} />}
          <ul className="lines">
            {open.map(({ line, meeting }) => (
              <LineRow key={line.id} line={line} showTime={false} checkable onToggle={toggleLine}
                suffix={<span className="muted"> · {fmtDate(meeting.startedAt)}</span>} />
            ))}
          </ul>
        </section>
        <section>
          <h3>Meetings</h3>
          <ul className="list">
            {meetings.map((m) => (
              <li key={m.id} className="clickable" onClick={() => go(`/m/${m.id}`)}>
                <b>{m.title}</b>
                <div className="muted small">{fmtDateTime(m.startedAt)}{m.endedAt ? ` · ${fmtTime(m.endedAt - m.startedAt)}` : ''}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
