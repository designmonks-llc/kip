import { useSyncExternalStore } from 'react';
import { coverBackground } from './art';
import { coverFor } from './covers';

// Auto follows the Mac (or the browser): light by day, dark when the system is dark.
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const subscribeSystem = (fn: () => void) => { darkQuery?.addEventListener('change', fn); return () => darkQuery?.removeEventListener('change', fn); };
/** The theme to draw: Auto becomes light or dark, and changes live with the system. */
export function useTheme(theme: string) {
  const dark = useSyncExternalStore(subscribeSystem, () => !!darkQuery?.matches);
  return theme === 'auto' ? (dark ? 'dark' : 'light') : theme;
}

/** Theme, sticky look and cover go on <html> so CSS (and the floating window) can follow them. */
export function applyLook(doc: Document, st: { theme: string; stickyStyle: string; cover: string }) {
  const html = doc.documentElement;
  html.dataset.theme = st.theme;
  html.dataset.sticky = st.stickyStyle;
  html.style.setProperty('--cover', coverBackground(coverFor(st.cover)));
}
