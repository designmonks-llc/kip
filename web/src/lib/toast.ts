// One toast at a time, e.g. "Moved to Trash · Undo".
export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }
let current: Toast | null = null;
let timer = 0;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const toasts = {
  subscribe(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  get: () => current,
  show(text: string, action?: Toast['action'], ms = 6000) {
    clearTimeout(timer);
    current = { id: ++seq, text, action };
    emit();
    timer = window.setTimeout(() => toasts.hide(), ms);
  },
  hide() { current = null; emit(); },
};
