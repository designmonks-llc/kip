import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ART } from './lib/art';
import { AudioTap } from './lib/audio';
import { dbEvents, loadSettings } from './lib/db';
import { logError, watchErrors } from './lib/errlog';
import { floating } from './lib/floating';
import { interrupted } from './lib/interrupted';
import { ScreenReader } from './lib/screen';
import { sessionStore } from './lib/session';
import { transcriber } from './lib/transcriber';
import { cleanupEmptyPages } from './views/workspace';
import { loadCustomCovers } from './lib/covers';
import './styles.css';

watchErrors();

// The soft-cloud backdrop for the floating/sticky windows.
document.documentElement.style.setProperty('--clouds', `url("${ART.clouds.src}")`);

// Ask Chrome to keep Kip's notes even when the disk runs low (they're only stored here).
navigator.storage?.persist?.().catch(() => {});

// Start-up never leaves a blank window: a task that fails is logged and skipped, and if the
// database is held by an older Kip tab, the page says so (and opens by itself once it's closed).
const rootEl = document.getElementById('root')!;
const bootNote = (title: string, text: string) => {
  rootEl.innerHTML = `<div class="boot"><svg class="boot-logo" role="img" aria-label="Kip" viewBox="0 0 9 4" shape-rendering="crispEdges"><path fill="currentColor" d="M0 0h1v1h-1zM2 0h1v1h-1zM4 0h1v1h-1zM6 0h3v1h-3zM0 1h2v1h-2zM6 1h1v1h-1zM8 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h3v1h-3zM0 3h1v1h-1zM2 3h1v1h-1zM4 3h3v1h-3z"/></svg><h1>${title}</h1><p>${text}</p></div>`;
};
const waitingNote = () => bootNote('Kip was just updated', 'Close any other Kip tabs and floating notes, and Kip will open here by itself. Your notes are safe.');
dbEvents.onBlocked = waitingNote;
// Chrome doesn't always report the block (e.g. when the other tab is in the background), so explain after a few seconds anyway.
const slow = setTimeout(waitingNote, 3000);
const startupTask = (name: string, p: Promise<unknown>) => p.catch((e) => logError(`startup:${name}`, e));
loadSettings()
  .then(() => Promise.all([
    startupTask('meetings', interrupted.load()),
    startupTask('cleanup', cleanupEmptyPages()),
    startupTask('covers', loadCustomCovers()),
  ]))
  .then(
    () => { clearTimeout(slow); createRoot(rootEl).render(<App />); },
    (e) => {
      clearTimeout(slow);
      logError('startup', e);
      bootNote('Kip couldn’t open its storage', `Reload the page to try again. If it keeps happening, check that Chrome allows site data for localhost. <small>${String((e as Error)?.message ?? e)}</small>`);
    },
  );

// Handles for testing the engines from the console without a real meeting.
Object.assign(window, { __sticky: { transcriber, ScreenReader, floating, AudioTap } });

// Closing or reloading while a meeting runs would cut it short; ask first, from any screen.
addEventListener('beforeunload', (e) => {
  if (sessionStore.get()) e.preventDefault();
});
