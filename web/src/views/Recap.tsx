import { useEffect, useState } from 'react';
import { loadMeeting, pageForMeeting, put, settings, type MeetingBundle, type Page } from '../lib/db';
import { Crumbs, PageMenu } from './PageMenu';
import { actionsByOwner, byType, fmtDateTime, fmtTime, followUp, markContext, ownerName, toMarkdown } from '../lib/recap';
import { summarize, summarizerAvailability } from '../lib/summarize';
import { editLine, go, Highlighted, LineRow, RichText, toggleLine, useData, useSession } from './common';
import type { LineType } from '../lib/parse';

const SIMPLE: [LineType, string][] = [
  ['question', 'Open questions'],
  ['money', 'Money'],
  ['quote', 'Their words'],
  ['important', 'Important'],
];

export function Recap({ id }: { id: string }) {
  const b = useData(() => loadMeeting(id), [id]);
  const page = useData(() => pageForMeeting(id), [id]);
  const live = useSession();
  if (b === undefined) return <main className="page">Loading…</main>;
  if (!b) return <main className="page">Meeting not found. <button onClick={() => go('/')}>Home</button></main>;
  const isLive = live?.meeting.id === id;
  return <RecapBody b={b} isLive={isLive} page={page} />;
}

function RecapBody({ b, isLive, page }: { b: MeetingBundle; isLive: boolean; page?: Page }) {
  const { meeting, client, lines, segments, marks, captures } = b;
  const row = (l: (typeof lines)[number]) => (
    <LineRow key={l.id} line={l} checkable onToggle={toggleLine} onEdit={editLine} />
  );
  const decisions = byType(lines, 'decision');
  const actions = actionsByOwner(lines);
  const notes = byType(lines, 'note');

  return (
    <main className="page recap">
      <header className="top">
        <div>
          {page ? <Crumbs page={page} /> : <button className="link" onClick={() => go('/')}>← Home</button>}
          <h1>{meeting.title}</h1>
          <p className="muted">
            {fmtDateTime(meeting.startedAt)}
            {meeting.endedAt && ` · ${fmtTime(meeting.endedAt - meeting.startedAt)}`}
            {client && <> · <button className="link" onClick={() => go(`/c/${client.id}`)}>{client.name}</button></>}
            {meeting.language === 'bn' && ' · Bangla'}
            {meeting.language === 'auto' && ' · English + Bangla'}
          </p>
        </div>
        <div className="row">
          {isLive && <button className="primary" onClick={() => go('/live')}>Back to live meeting</button>}
          <ExportButtons b={b} />
          {page && !isLive && <PageMenu page={page} />}
        </div>
      </header>

      <div className="cols">
        <div>
          {lines.length === 0 && marks.length === 0 && captures.length === 0 && <p className="muted">No notes were taken.</p>}
          {decisions.length > 0 && <Section title="Decisions"><ul className="lines">{decisions.map(row)}</ul></Section>}
          {actions.length > 0 && (
            <Section title="Actions">
              {actions.map(([owner, ls]) => (
                <div key={owner}>
                  <h4>{ownerName(owner)}</h4>
                  <ul className="lines">{ls.map(row)}</ul>
                </div>
              ))}
            </Section>
          )}
          {SIMPLE.map(([type, title]) => {
            const ls = byType(lines, type);
            return ls.length ? <Section key={type} title={title}><ul className="lines">{ls.map(row)}</ul></Section> : null;
          })}
          {marks.length > 0 && (
            <Section title="Marked moments">
              {marks.map((m) => {
                const ctx = markContext(m, segments, lines);
                return (
                  <div key={m.id} className="mark">
                    <b>★ {fmtTime(m.t)}</b>
                    {ctx.segments.length ? (
                      ctx.segments.map((g) => <p key={g.id} className="small"><b>{g.speaker === 'you' ? 'You' : 'Them'}:</b> {g.text}</p>)
                    ) : (
                      <p className="muted small">No transcript at this moment.</p>
                    )}
                    {ctx.lines.length > 0 && <p className="small muted">Notes nearby: {ctx.lines.map((l, i) => <span key={l.id}>{i ? ' · ' : ''}<RichText text={l.text} /></span>)}</p>}
                  </div>
                );
              })}
            </Section>
          )}
          {captures.length > 0 && (
            <details className="section screen-text">
              <summary><h3 className="inline">From the shared screen ({captures.length})</h3></summary>
              <ul className="screen-list">
                {captures.map((c) => (
                  <li key={c.id}>
                    <span className="time">{fmtTime(c.t)}</span>
                    <details>
                      <summary>{c.text.split('\n')[0].slice(0, 100)}</summary>
                      <p className="small pre"><Highlighted text={c.text} /></p>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {notes.length > 0 && <Section title="Other notes"><ul className="lines">{notes.map(row)}</ul></Section>}
          <AiSummary b={b} />
          {segments.length > 0 && (
            <details className="section">
              <summary><h3 className="inline">Transcript ({segments.length})</h3></summary>
              {segments.map((g) => (
                <p key={g.id} className={`seg ${g.speaker}`}>
                  <span className="time">{fmtTime(g.start)}</span> <b>{g.speaker === 'you' ? 'You' : 'Them'}</b> {g.text}
                </p>
              ))}
            </details>
          )}
        </div>
        <FollowUp b={b} />
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="section"><h3>{title}</h3>{children}</section>;
}

function FollowUp({ b }: { b: MeetingBundle }) {
  const draft = followUp(b, settings().yourName);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [dirty, setDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  // Keep following the notes until the user edits the draft by hand.
  useEffect(() => { if (!dirty) { setSubject(draft.subject); setBody(draft.body); } }, [draft.subject, draft.body, dirty]);

  return (
    <aside className="followup">
      <h3>Follow-up</h3>
      <input value={subject} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} />
      <textarea rows={18} value={body} onChange={(e) => { setBody(e.target.value); setDirty(true); }} />
      <div className="row">
        <button className="primary" onClick={() => { navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a className="button" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open in Mail</a>
        {dirty && <button onClick={() => setDirty(false)}>Reset</button>}
      </div>
      {!settings().yourName && <p className="muted small">Add your name in Settings to sign the email.</p>}
    </aside>
  );
}

function AiSummary({ b }: { b: MeetingBundle }) {
  const avail = useData(summarizerAvailability, []);
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [err, setErr] = useState('');
  const { meeting, lines, segments, captures } = b;
  const hasText = segments.length > 0 || lines.length > 0;

  async function run() {
    setState('working');
    try {
      const text = [
        lines.length ? 'NOTES:\n' + lines.map((l) => `- [${l.type}] ${l.text}`).join('\n') : '',
        captures.length ? 'ON SCREEN:\n' + captures.map((c) => c.text).join('\n---\n') : '',
        segments.length ? 'TRANSCRIPT:\n' + segments.map((g) => `${g.speaker === 'you' ? 'Me' : 'Them'}: ${g.text}`).join('\n') : '',
      ].filter(Boolean).join('\n\n');
      const aiSummary = await summarize(text);
      await put('meetings', { ...meeting, aiSummary });
      setState('idle');
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setState('error');
    }
  }

  if (meeting.aiSummary)
    return (
      <Section title="AI summary">
        <p className="pre small">{meeting.aiSummary}</p>
        <button onClick={run} disabled={state === 'working'}>{state === 'working' ? 'Summarising…' : 'Redo'}</button>
      </Section>
    );
  if (!hasText || avail === undefined) return null;
  if (meeting.language === 'bn' || avail === 'unavailable')
    return (
      <p className="muted small">
        AI summary: {meeting.language === 'bn' ? 'not available for Bangla yet.' : 'this browser has no on-device summariser (needs Chrome 138+ with built-in AI). Everything else works without it.'}
      </p>
    );
  return (
    <Section title="AI summary">
      <button onClick={run} disabled={state === 'working'}>
        {state === 'working' ? 'Summarising on this device…' : avail === 'available' ? 'Summarise on this device' : 'Download on-device model & summarise'}
      </button>
      {state === 'error' && <p className="status warn">{err}</p>}
    </Section>
  );
}

function ExportButtons({ b }: { b: MeetingBundle }) {
  const [copied, setCopied] = useState(false);
  const md = () => toMarkdown(b);
  return (
    <>
      <button onClick={() => { navigator.clipboard.writeText(md()); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? 'Copied' : 'Copy Markdown'}
      </button>
      <button
        onClick={() => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(new Blob([md()], { type: 'text/markdown' }));
          a.download = `${b.meeting.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'meeting'}.md`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }}
      >
        Download .md
      </button>
    </>
  );
}
