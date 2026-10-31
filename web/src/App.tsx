import { useEffect, useState, useSyncExternalStore } from 'react';
import { interrupted } from './lib/interrupted';
import { resumeSession } from './lib/session';
import { fmtDateTime } from './lib/recap';
import { ErrorBoundary, ToastHost } from './views/Safety';
import { UpdateBanner } from './views/Updates';
import { TemplatesGallery } from './views/Templates';
import { ClientView } from './views/ClientView';
import { go, useRoute, useSession } from './views/common';
import { FloatingHost } from './views/FloatingHost';
import { Home } from './views/Home';
import { ActionsView, SearchView, TrashView } from './views/Lists';
import { Live } from './views/Live';
import { PageSticky } from './views/PageSticky';
import { PageView } from './views/PageView';
import { Recap } from './views/Recap';
import { SettingsView } from './views/SettingsView';
import { Sidebar } from './views/Sidebar';
import { StartMeeting } from './views/StartMeeting';
import { FolderView } from './views/FolderView';
import { quickNote } from './views/workspace';
import { floating } from './lib/floating';
import { applyLook, useTheme } from './lib/look';
import { useSettings } from './views/ui';

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
};

export function App() {
  const route = useRoute();
  const s = useSession();
  const [hint, setHint] = useState('');
  const look = useSettings();
  const theme = useTheme(look.theme);
  useEffect(() => applyLook(document, { ...look, theme }), [look, theme]);
  const [path, query = ''] = route.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);

  // Alt+N: new meeting · Alt+Q: quick floating note. Letters alone never trigger anything,
  // and stray typing in the main window goes to the floating window if one is open.
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.code === 'KeyN') { e.preventDefault(); go(s ? '/live' : '/new'); }
        if (e.code === 'KeyQ') { e.preventDefault(); setHint((await quickNote()) ?? ''); }
        return;
      }
      const { win } = floating.get();
      if (win && !e.metaKey && !e.ctrlKey && e.key.length === 1 && !typing(e.target)) win.focus();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [s]);

  // Sticky-only view of a note, for browsers without floating windows (open it in a small window).
  if (parts[0] === 'sticky' && parts[1]) return <div className="sticky-only"><ErrorBoundary compact><PageSticky id={parts[1]} /></ErrorBoundary></div>;

  let view: React.ReactNode;
  if (parts[0] === 'live') view = <Live />;
  else if (parts[0] === 'new') view = s ? <Live /> : <StartMeeting client={params.get('client') ?? ''} folder={params.get('folder') ?? undefined} />;
  else if (parts[0] === 'f' && parts[1]) view = <FolderView id={parts[1]} />;
  else if (parts[0] === 'p' && parts[1]) view = <PageView id={parts[1]} />;
  else if (parts[0] === 'm' && parts[1]) view = <Recap id={parts[1]} />;
  else if (parts[0] === 'c' && parts[1]) view = <ClientView id={parts[1]} />;
  else if (parts[0] === 'actions') view = <ActionsView />;
  else if (parts[0] === 'trash') view = <TrashView />;
  else if (parts[0] === 'search') view = <SearchView q={params.get('q') ?? ''} />;
  else if (parts[0] === 'settings') view = <SettingsView />;
  else view = <Home />;

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <UpdateBanner />
        {s?.meeting && parts[0] !== 'live' && (
          <div className="live-banner" onClick={() => go('/live')}>● Meeting in progress: {s.meeting.title}. Click to return.</div>
        )}
        {!s && <InterruptedBanner />}
        {hint && <p className="status warn side-pad" onClick={() => setHint('')}>{hint}</p>}
        <ErrorBoundary resetKey={route}>{view}</ErrorBoundary>
      </div>
      <FloatingHost />
      <ToastHost />
      <TemplatesGallery />
    </div>
  );
}

/** After a crash or reload mid-meeting: pick it back up, or end it. */
function InterruptedBanner() {
  useSyncExternalStore(interrupted.subscribe, interrupted.get);
  const m = interrupted.get()[0];
  if (!m) return null;
  return (
    <div className="resume-banner">
      <span><b>“{m.title}”</b> was interrupted ({fmtDateTime(m.startedAt)}). Your notes and transcript are safe.</span>
      <span className="row">
        <button className="primary" onClick={async () => { await resumeSession(m.id); interrupted.forget(m.id); go('/live'); }}>Resume meeting</button>
        <button onClick={() => interrupted.end(m)}>End it</button>
      </span>
    </div>
  );
}
