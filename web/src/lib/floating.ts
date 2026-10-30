// The one always-on-top window (Document Picture-in-Picture). It can hold the live meeting
// sticky or any note page, and survives navigation in the main window.

import { ART } from './art';

export type FloatTarget = { kind: 'meeting' } | { kind: 'page'; id: string };
interface DocPip { requestWindow(o: { width: number; height: number }): Promise<Window> }

let win: Window | null = null;
let target: FloatTarget | null = null;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((f) => f()); };

export const floating = {
  subscribe(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  version: () => version,
  get: () => ({ win, target }),
  isFloating: (t: FloatTarget) => !!win && !!target && target.kind === t.kind && (t.kind === 'meeting' || (target.kind === 'page' && target.id === t.id)),

  /** Opens (or retargets) the floating window. Returns an error message if the browser can't. */
  async open(t: FloatTarget): Promise<string | null> {
    if (win) {
      target = t;
      emit();
      win.focus();
      return null;
    }
    const api = (window as unknown as { documentPictureInPicture?: DocPip }).documentPictureInPicture;
    if (!api) return fallback(t);
    try {
      floating.attach(await api.requestWindow({ width: 380, height: 560 }), t);
      return null;
    } catch {
      return fallback(t);
    }
  },

  /** Takes over a window (the PiP window, or a test frame) and renders the target into it. */
  attach(w: Window, t: FloatTarget) {
    copyStyles(w.document);
    w.document.title = 'Kip';
    w.document.body.style.setProperty('--clouds', `url("${ART.clouds.src}")`);
    w.document.body.classList.add('pip');
    w.addEventListener('pagehide', () => { win = null; target = null; emit(); });
    win = w;
    target = t;
    emit();
    w.focus();
  },

  close() {
    win?.close();
    win = null;
    target = null;
    emit();
  },
};

/** Without Document PiP, open the sticky in a small normal window instead (not always on top). */
function fallback(t: FloatTarget) {
  // A live meeting only exists in this tab, so it can't move to another window.
  if (t.kind === 'meeting') return 'Floating needs Chrome or Edge 116+, opened directly (not inside another app).';
  const w = window.open(`#/sticky/${t.id}`, 'meeting-sticky', 'width=380,height=560');
  return w
    ? 'This browser can’t keep a window on top, so the sticky opened in a small window instead. Chrome or Edge can float it.'
    : 'Couldn’t open a floating window here. Open this page directly in Chrome or Edge.';
}

function copyStyles(to: Document) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = to.createElement('style');
      style.textContent = [...sheet.cssRules].map((r) => r.cssText).join('\n');
      to.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = to.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        to.head.appendChild(link);
      }
    }
  }
}
