// Updates in the Mac app: a quiet banner when a new Kip is ready, "What's new", and Restart to update.
import { ArrowDownToLine, Loader2, RotateCw, Sparkles, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { desktop, type UpdateState } from '../lib/files';
import { toasts } from '../lib/toast';
import { useSession } from './common';

// one shared copy of the main process's update state
let state: UpdateState = { status: 'idle' };
const subs = new Set<() => void>();
const store = {
  subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); },
  get: () => state,
};
let wired = false;
function wire() {
  const d = desktop();
  if (wired || !d?.onUpdate) return;
  wired = true;
  const take = (s: UpdateState) => {
    const prev = state;
    state = s;
    subs.forEach((f) => f());
    if (s.manual && s.status === 'current' && prev.status === 'checking') toasts.show(`You’re on the latest Kip (${s.version}).`);
  };
  d.onUpdate(take);
  d.updateState?.().then(take);
}
export const useUpdate = () => { wire(); return useSyncExternalStore(store.subscribe, store.get); };
export const checkForUpdate = () => desktop()?.checkForUpdate?.();

async function install() {
  const r = await desktop()?.installUpdate?.();
  if (r && !r.ok) toasts.show(r.error ?? 'Couldn’t update.');
}

/** Release notes, lightly formatted (the install steps are for people downloading by hand, so they're left out). */
function Notes({ md }: { md: string }) {
  const out: React.ReactNode[] = [];
  let skip = false;
  md.replace(/\r/g, '').split('\n').forEach((line, i) => {
    const h = line.match(/^#{2,4}\s+(.+)/);
    if (h) { skip = /^install/i.test(h[1]); if (!skip) out.push(<h4 key={i}>{h[1]}</h4>); return; }
    if (skip || !line.trim()) return;
    const li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
    const body = (li ? li[1] : line).split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, k) =>
      part.startsWith('**') ? <b key={k}>{part.slice(2, -2)}</b> : part.startsWith('`') ? <code key={k}>{part.slice(1, -1)}</code> : part);
    out.push(li ? <li key={i}>{body}</li> : <p key={i}>{body}</p>);
  });
  return <div className="update-notes">{out}</div>;
}

export function UpdateBanner() {
  const u = useUpdate();
  const s = useSession();
  const [hidden, setHidden] = useState<string | null>(null);
  const [notes, setNotes] = useState(false);
  useEffect(() => { if (u.status === 'ready') setHidden(null); }, [u.status]);
  if (!['available', 'downloading', 'ready'].includes(u.status) && !(u.status === 'error' && u.manual)) return null;
  if (hidden && hidden === u.version && u.status === 'available') return null;

  return (
    <>
      <div className="update-banner" role="status">
        <Sparkles size={15} />
        {u.status === 'available' && <span><b>Kip {u.version}</b> is ready.</span>}
        {u.status === 'downloading' && <span>Downloading Kip {u.version}… {u.progress ?? 0}%</span>}
        {u.status === 'ready' && <span><b>Kip {u.version}</b> is downloaded.{s ? ' It installs after your meeting.' : ' Restarting takes a few seconds; your notes stay as they are.'}</span>}
        {u.status === 'error' && <span>Couldn’t update: {u.error}</span>}
        <span className="update-actions">
          {u.notes && u.status !== 'error' && <button className="ghost" onClick={() => setNotes(true)}>What’s new</button>}
          {u.status === 'available' && <button className="primary" onClick={() => desktop()?.downloadUpdate?.()}><ArrowDownToLine size={14} /> Update</button>}
          {u.status === 'downloading' && <Loader2 size={15} className="spin" />}
          {u.status === 'ready' && <button className="primary" disabled={!!s} onClick={install}><RotateCw size={14} /> Restart to update</button>}
          {u.status === 'error' && <button onClick={() => checkForUpdate()}>Try again</button>}
          {u.status === 'available' && <button className="icon-btn" aria-label="Later" title="Later" onClick={() => setHidden(u.version ?? '')}><X size={15} /></button>}
        </span>
      </div>
      {notes && (
        <div className="modal-backdrop" onMouseDown={() => setNotes(false)}>
          <div className="modal update-modal" onMouseDown={(e) => e.stopPropagation()}>
            <p className="eyebrow-d">What’s new</p>
            <h2>Kip {u.version}</h2>
            <Notes md={u.notes ?? ''} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setNotes(false)}>Close</button>
              {u.status === 'available' && <button className="primary" onClick={() => { setNotes(false); desktop()?.downloadUpdate?.(); }}><ArrowDownToLine size={14} /> Update</button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
