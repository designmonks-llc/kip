import { RotateCcw } from 'lucide-react';
import { Component, useSyncExternalStore, type ReactNode } from 'react';
import { logError } from '../lib/errlog';
import { toasts } from '../lib/toast';

/**
 * Keeps one broken screen from taking down the whole app: the sidebar stays, a live meeting keeps
 * recording, and the screen can be retried.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string; compact?: boolean }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { logError('screen', error); }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`crash ${this.props.compact ? 'compact' : ''}`}>
        <p className="eyebrow-d">Something went wrong</p>
        <h2>This screen hit a problem.</h2>
        <p className="muted">Your notes are saved, and a running meeting keeps recording. Try again, or go Home.</p>
        <div className="row">
          <button className="primary" onClick={() => this.setState({ error: null })}><RotateCcw size={14} /> Try again</button>
          <button onClick={() => { location.hash = '/'; this.setState({ error: null }); }}>Go Home</button>
        </div>
        <p className="small muted">Details are in Settings → Diagnostics.</p>
      </div>
    );
  }
}

export function ToastHost() {
  useSyncExternalStore(toasts.subscribe, toasts.get);
  const t = toasts.get();
  if (!t) return null;
  return (
    <div className="toast" role="status" key={t.id}>
      <span>{t.text}</span>
      {t.action && <button className="link" onClick={() => { t.action!.run(); toasts.hide(); }}>{t.action.label}</button>}
    </div>
  );
}
