import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { onChange, put, type Line } from '../lib/db';
import { parseLine, TYPE_LABEL, type LineType } from '../lib/parse';
import { fmtTime, splitHighlights } from '../lib/recap';
import { sessionStore } from '../lib/session';

// --- routing (hash based) ---
export const go = (path: string) => { location.hash = path; };
export function useRoute() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return h.replace(/^#/, '') || '/';
}

/** Keeps the cursor in this input: on mount and whenever its (possibly floating) window gets focus. */
export function useKeepFocus(ref: React.RefObject<HTMLElement | null>, ready = true) {
  useEffect(() => {
    const el = ref.current;
    const win = el?.ownerDocument.defaultView;
    if (!ready || !el || !win) return; // e.g. while another line is being edited
    const grab = () => {
      const active = el.ownerDocument.activeElement;
      if (!active || active === el.ownerDocument.body) el.focus();
    };
    el.focus();
    win.addEventListener('focus', grab);
    return () => win.removeEventListener('focus', grab);
  }, [ref, ready]);
}

/** For uncontrolled inputs: show changes made elsewhere (e.g. a rename) unless the user is typing in it. */
export function useSyncValue(ref: React.RefObject<HTMLInputElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (el && el.ownerDocument.activeElement !== el && el.value !== value) el.value = value;
  }, [ref, value]);
}

export function useSession() {
  useSyncExternalStore(sessionStore.subscribe, sessionStore.version);
  return sessionStore.get();
}

/** Loads data and reloads it whenever the local database changes. */
export function useData<T>(load: () => Promise<T>, deps: unknown[]): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let alive = true;
    setData(undefined); // never show the previous item's data while the next one loads
    const run = () => load().then((d) => alive && setData(d));
    run();
    const off = onChange(run);
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

// --- lines ---
export function TypeBadge({ type }: { type: LineType }) {
  if (type === 'note') return null;
  return <span className={`badge t-${type}`}>{TYPE_LABEL[type]}</span>;
}

/** Line text with @people and #tags highlighted. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/((?:^|\s)[@#][\p{L}\p{N}_-]+)/u);
  return (
    <>
      {parts.map((p, i) =>
        /^\s?@/.test(p) ? <span key={i} className="at">{p}</span> : /^\s?#/.test(p) ? <span key={i} className="tag">{p}</span> : p,
      )}
    </>
  );
}

export function Highlighted({ text }: { text: string }) {
  return <>{splitHighlights(text).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : p.text))}</>;
}

export function toggleLine(line: Line) {
  return put('lines', line.type === 'action' ? { ...line, done: !line.done } : { ...line, answered: !line.answered });
}

export function editLine(line: Line, raw: string) {
  return put('lines', { ...line, raw, ...parseLine(raw) });
}

export function isClosed(l: Line) {
  return (l.type === 'action' && l.done) || (l.type === 'question' && l.answered);
}

/** One note line: time, type, text, optional checkbox, click to edit. */
export function LineRow(props: {
  line: Line;
  showTime?: boolean;
  checkable?: boolean;
  onToggle?: (l: Line) => void;
  onEdit?: (l: Line, raw: string) => void;
  editing?: boolean;
  setEditing?: (id: string | null) => void;
  suffix?: React.ReactNode;
}) {
  const { line, showTime = true, checkable, onToggle, onEdit, editing, setEditing, suffix } = props;
  const [local, setLocal] = useState(false);
  const isEditing = editing ?? local;
  const setIsEditing = (v: boolean) => (setEditing ? setEditing(v ? line.id : null) : setLocal(v));
  const canCheck = checkable && (line.type === 'action' || line.type === 'question');

  return (
    <li className={`line ${isClosed(line) ? 'closed' : ''}`}>
      {canCheck && (
        <input type="checkbox" checked={isClosed(line)} onChange={() => onToggle?.(line)} title={line.type === 'action' ? 'Done' : 'Answered'} />
      )}
      {showTime && <span className="time">{fmtTime(line.t)}</span>}
      {isEditing && onEdit ? (
        <input
          className="edit"
          autoFocus
          defaultValue={line.raw}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onEdit(line, e.currentTarget.value); setIsEditing(false); }
            if (e.key === 'Escape') setIsEditing(false);
          }}
          onBlur={(e) => { if (e.currentTarget.value !== line.raw) onEdit(line, e.currentTarget.value); setIsEditing(false); }}
        />
      ) : (
        <span className="text" onClick={() => onEdit && setIsEditing(true)}>
          <TypeBadge type={line.type} /> <RichText text={line.text} />
          {suffix}
        </span>
      )}
    </li>
  );
}

export function Thumb({ blob, alt }: { blob?: Blob; alt: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url ? <img className="thumb" src={url} alt={alt} /> : null;
}

export const SHORTHAND: [string, string][] = [
  ['!', 'action'],
  ['>', 'decision'],
  ['?', 'question'],
  ['$', 'money'],
  ['"', 'their words'],
  ['*', 'important'],
  ['@name', 'owner'],
  ['#tag', 'topic'],
];

export function Cheatsheet() {
  return (
    <p className="cheats">
      {SHORTHAND.map(([k, v]) => (
        <span key={k}><code>{k}</code> {v}</span>
      ))}
    </p>
  );
}
