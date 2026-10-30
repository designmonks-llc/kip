import { useCallback, useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { floating } from '../lib/floating';
import { fmtTime } from '../lib/recap';
import { endSession, type Session } from '../lib/session';
import { go, Highlighted, useSession } from './common';
import { Sticky } from './Sticky';

export function Live() {
  const s = useSession();
  const [hint, setHint] = useState('');
  useSyncExternalStore(floating.subscribe, floating.version);
  const floatingHere = floating.isFloating({ kind: 'meeting' });

  const popOut = useCallback(async () => {
    const err = await floating.open({ kind: 'meeting' });
    if (err) setHint(err);
  }, []);

  // Alt+M mark, Alt+L listen, Alt+P pop out, Alt+E end (the floating window registers its own copy).
  useMeetingKeys(document, popOut);

  if (!s) {
    return (
      <main className="page">
        <p>No meeting is running.</p>
        <button onClick={() => go('/new')}>New meeting</button>
      </main>
    );
  }

  return (
    <main className="live">
      <section className="live-main">
        {floatingHere ? (
          <div className="floating-note">
            <p><strong>The sticky is floating on top of your other windows.</strong></p>
            <p className="muted">Switch to your call; the sticky stays visible. Close the floating window to bring it back here.</p>
            <button onClick={() => floating.close()}>Bring it back</button>
          </div>
        ) : (
          <Sticky session={s} floating={false} onPopOut={popOut} onEnd={endMeeting} />
        )}
        {hint && <p className="status warn">{hint}</p>}
        <p className="muted small">Shortcuts: Enter save line · ↑ edit last · Alt+M mark · Alt+L listening · Alt+P pop out · Alt+E end</p>
      </section>
      <SidePanels s={s} />
    </main>
  );
}

export async function endMeeting() {
  if (floating.isFloating({ kind: 'meeting' })) floating.close();
  const id = await endSession();
  if (id) go(`/m/${id}`);
}

/** Meeting shortcuts on a document (the main window or the floating one). */
export function useMeetingKeys(doc: Document | null, popOut?: () => void) {
  const s = useSession();
  useEffect(() => {
    if (!s || !doc) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const act: Record<string, (() => void) | undefined> = {
        KeyM: () => s.mark(),
        KeyL: () => s.toggleListening(),
        KeyP: popOut,
        KeyE: () => endMeeting(),
      };
      const f = act[e.code];
      if (f) { e.preventDefault(); f(); }
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [s, doc, popOut]);
}

function SidePanels({ s }: { s: Session }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [s.segments.length]);
  return (
    <aside className="live-side">
      <h3>Live transcript</h3>
      <div className="transcript" ref={ref}>
        {s.segments.length === 0 && (
          <p className="muted small">
            {s.mic || s.tab ? 'Waiting for speech… text appears a few seconds after someone talks.' : 'Listening is off. Press Alt+L to start.'}
          </p>
        )}
        {s.segments.map((g) => (
          <p key={g.id} className={`seg ${g.speaker}`}>
            <span className="time">{fmtTime(g.start)}</span> <b>{g.speaker === 'you' ? 'You' : 'Them'}</b> {g.text}
          </p>
        ))}
      </div>
      {s.meeting.readScreen && (
        <>
          <h3>From the shared screen {s.screen?.busy && <span className="muted small">reading…</span>}</h3>
          {!s.sharing && <p className="muted small">Share the meeting tab to read slides and screens.</p>}
          {s.sharing && s.captures.length === 0 && <p className="muted small">Watching the shared screen. New slides are read when they settle.</p>}
          <ul className="screen-list">
            {[...s.captures].reverse().slice(0, 8).map((c) => (
              <li key={c.id}>
                <span className="time">{fmtTime(c.t)}</span>
                <details>
                  <summary>{c.text.split('\n')[0].slice(0, 100)}</summary>
                  <p className="small pre"><Highlighted text={c.text.slice(0, 600)} /></p>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
