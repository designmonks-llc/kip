// Small shared UI pieces: editorial page headers, settings rows, segmented controls, switches.
import { useSyncExternalStore } from 'react';
import { onChange, saveSettings, settings } from '../lib/db';

/** Current settings; re-renders when they change. */
export function useSettings() {
  return useSyncExternalStore((cb) => onChange(() => cb()), settings);
}

/** Editorial page header: a small label, a large light title, an optional lead line and actions. */
export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow: string; title: React.ReactNode; lead?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <p className="eyebrow-d">{eyebrow}</p>
        <h1 className="display page-title">{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="row page-actions">{actions}</div>}
    </header>
  );
}

export function SetCard({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <section className={`set-card ${tone ?? ''}`}>
      <h2 className="set-h">{title}</h2>
      {children}
    </section>
  );
}

export function SetRow({ label, desc, children, stacked }: { label: string; desc?: React.ReactNode; children?: React.ReactNode; stacked?: boolean }) {
  return (
    <div className={`set-row ${stacked ? 'stacked' : ''}`}>
      <div className="set-text">
        <div className="set-label">{label}</div>
        {desc && <div className="set-desc">{desc}</div>}
      </div>
      {children && <div className="set-control">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange: change }: { value: T; options: [T, React.ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => change(v)}>{label}</button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange: change, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? 'on' : ''}`} onClick={() => change(!checked)}>
      <span />
    </button>
  );
}

const STICKY_LOOKS = { clean: 'Clean', sky: 'Soft sky', clouds: 'Clouds' } as const;
const NEXT_LOOK = { clean: 'sky', sky: 'clouds', clouds: 'clean' } as const;

/** Cycles the sticky's look: clean white → soft sky → clouds. */
export function StickyLookButton() {
  const s = useSettings();
  return (
    <button
      className="look-btn"
      title={`Look: ${STICKY_LOOKS[s.stickyStyle]}. Click for ${STICKY_LOOKS[NEXT_LOOK[s.stickyStyle]]}.`}
      aria-label="Change sticky look"
      onClick={() => saveSettings({ stickyStyle: NEXT_LOOK[s.stickyStyle] })}
    >
      <span className={`look-swatch ${s.stickyStyle}`} /> {STICKY_LOOKS[s.stickyStyle]}
    </button>
  );
}
