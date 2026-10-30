import { coverBackground } from './art';
import { coverFor } from './covers';

/** Theme, sticky look and cover go on <html> so CSS (and the floating window) can follow them. */
export function applyLook(doc: Document, st: { theme: string; stickyStyle: string; cover: string }) {
  const html = doc.documentElement;
  html.dataset.theme = st.theme;
  html.dataset.sticky = st.stickyStyle;
  html.style.setProperty('--cover', coverBackground(coverFor(st.cover)));
}
