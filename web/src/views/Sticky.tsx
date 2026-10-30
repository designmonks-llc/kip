import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseLine } from '../lib/parse';
import { fmtTime } from '../lib/recap';
import type { Session } from '../lib/session';
import { transcriber } from '../lib/transcriber';
import { fmtDate } from '../lib/recap';
import { LineRow, RichText, TypeBadge, useKeepFocus } from './common';
import { StickyLookButton } from './ui';

export function Timer({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, []);
  return <span className="timer">{fmtTime(Date.now() - since)}</span>;
}

export function AsrStatus() {
  useSyncExternalStore(transcriber.subscribe, () => transcriber.state);
  const s = transcriber.state;
  if (s.status === 'idle') return null;
  if (s.status === 'loading')
    return <div className="status">Loading private transcription model… {Math.round(s.progress * 100)}% (first time only)</div>;
  if (s.status === 'error') return <div className="status warn">Transcription error: {s.message}</div>;
  if (s.note) return <div className="status">{s.note}</div>;
  return s.backlog > 1 ? <div className="status">Transcribing… {s.backlog} chunks waiting</div> : null;
}

interface Props {
  session: Session;
  floating: boolean;
  onPopOut?: () => void;
  onEnd: () => void;
}

export function Sticky({ session: s, floating, onPopOut, onEnd }: Props) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = s.openItems.filter((o) => !(o.line.type === 'action' ? o.line.done : o.line.answered));
  const level = Math.max(s.mic?.level ?? 0, s.tab?.level ?? 0);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [s.lines.length]);

  useKeepFocus(inputRef);
  const draftRef = useRef('');
  draftRef.current = draft;
  useEffect(() => () => { if (draftRef.current.trim()) s.addLine(draftRef.current); }, [s]);
  const preview = draft.trim() ? parseLine(draft).type : 'note';

  return (
    <div className={`sticky ${floating ? 'floating' : ''}`}>
      <header className="sticky-head">
        <div className="title-row">
          <strong className="title" title={s.meeting.title}>{s.meeting.title}</strong>
          <Timer since={s.meeting.startedAt} />
        </div>
        <div className="controls">
          <button className={`listen ${s.listening ? 'on' : ''}`} onClick={() => s.toggleListening()} title="Alt+L">
            <span className="dot" style={{ opacity: s.listening ? 0.4 + level * 0.6 : 1 }} />
            {s.listening ? 'Listening' : 'Not listening'}
          </button>
          {!s.sharing && <button onClick={() => s.shareTab()} title="Share the meeting tab for its audio and screen">Share meeting tab</button>}
          {s.screen && (
            <span className="pill" title="Screens read so far">📄 {s.captures.length}{s.screen.busy ? ' · reading…' : ''}</span>
          )}
          <button onClick={() => s.mark()} title="Alt+M">★ Mark</button>
          {!floating && onPopOut && <button onClick={onPopOut} title="Alt+P">Pop out</button>}
          <button className="end" onClick={onEnd} title="Alt+E">End</button>
          <StickyLookButton />
        </div>
        <AsrStatus />
        {s.warnings.slice(-2).map((w, i) => <div key={i} className="status warn">{w}</div>)}
      </header>

      {s.client && (
        <details className="last-time" open={open.length > 0}>
          <summary>
            From last time · {s.client.name}: {open.length ? `${open.length} open` : 'nothing open'}
          </summary>
          <ul>
            {open.map(({ line, meeting }) => (
              <LineRow key={line.id} line={line} showTime={false} checkable onToggle={(l) => s.toggleItem(l)}
                suffix={<span className="muted"> · {fmtDate(meeting.startedAt)}</span>} />
            ))}
          </ul>
        </details>
      )}

      <ul className="lines" ref={listRef} onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus(); } }}>
        {s.lines.length === 0 && <li className="empty">Start typing. Try “! send the quote by Friday”.</li>}
        {s.lines.map((l) => (
          <LineRow key={l.id} line={l} checkable onToggle={(x) => s.toggleItem(x)}
            onEdit={(x, raw) => s.updateLine(x.id, raw)} editing={editing === l.id} setEditing={setEditing} />
        ))}
        {s.marks.length > 0 && <li className="muted small">★ {s.marks.length} marked moment{s.marks.length > 1 ? 's' : ''}</li>}
      </ul>

      {floating && s.segments.length > 0 && (
        <div className="mini-transcript">
          <button className="link" onClick={() => setShowTranscript(!showTranscript)}>
            {showTranscript ? 'Hide' : 'Show'} transcript ({s.segments.length})
          </button>
          {showTranscript && s.segments.slice(-5).map((g) => (
            <p key={g.id}><b>{g.speaker === 'you' ? 'You' : 'Them'}:</b> {g.text}</p>
          ))}
        </div>
      )}

      <div className="composer">
        <TypeBadge type={preview} />
        <input
          ref={inputRef}
          value={draft}
          placeholder={'Type… ! action  > decision  ? question  $ money  " quote  * important'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              s.addLine(draft);
              setDraft('');
            } else if (e.key === 'ArrowUp' && !draft && s.lines.length) {
              e.preventDefault();
              setEditing(s.lines[s.lines.length - 1].id);
            }
          }}
        />
      </div>
      {draft.includes('@') || draft.includes('#') ? (
        <div className="preview muted small"><RichText text={parseLine(draft).text} /></div>
      ) : null}
    </div>
  );
}
