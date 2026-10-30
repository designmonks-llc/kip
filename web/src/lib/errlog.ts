// A small local error log (never uploaded), so real-world problems can be diagnosed afterwards.
const KEY = 'kip-errors';
export interface LoggedError { at: number; where: string; message: string }

export function readErrors(): LoggedError[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function logError(where: string, err: unknown) {
  const message = err instanceof Error ? `${err.message}\n${err.stack?.split('\n').slice(1, 4).join('\n') ?? ''}` : String(err);
  try { localStorage.setItem(KEY, JSON.stringify([...readErrors(), { at: Date.now(), where, message }].slice(-30))); } catch { /* storage full or blocked */ }
}
export function clearErrors() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function watchErrors(win: Window = window) {
  win.addEventListener('error', (e) => logError('window', e.error ?? e.message));
  win.addEventListener('unhandledrejection', (e) => logError('promise', e.reason));
}
