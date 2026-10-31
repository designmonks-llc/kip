// Kip's light colour shades, for board columns, cards and folders. Same names as the editor's colours, so a
// coloured column keeps its colour in exports. Every shade is pale enough for text to stay easy to read, and
// has its own dark-mode version (see "Colour shades" in styles.css).
import { Check, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const SHADES = ['default', 'gray', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const;
export type Shade = (typeof SHADES)[number];
const label = (c: string) => (c === 'default' ? 'No colour' : c[0].toUpperCase() + c.slice(1));

/** The class that paints a shade (nothing for the default). */
export const shade = (c?: string) => (c && c !== 'default' ? `shade-${c}` : '');

/** A small palette button that opens a row of swatches. */
export function ColorPicker({ value, onPick, title = 'Colour', size = 14, icon }: { value?: string; onPick: (c: Shade) => void; title?: string; size?: number; icon?: React.ReactNode }) {
  // the swatches float above everything (boards scroll and clip), placed under the button
  const [open, setOpen] = useState<{ top: number; left: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !pop.current?.contains(t)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    const win = box.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('mousedown', close);
    win.addEventListener('keydown', key);
    const gone = () => setOpen(null);
    win.addEventListener('scroll', gone, true);
    return () => { win.removeEventListener('mousedown', close); win.removeEventListener('keydown', key); win.removeEventListener('scroll', gone, true); };
  }, [open]);
  const current = value || 'default';
  return (
    <span ref={box} className="color-picker" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <button className={`icon-btn color-btn ${open ? 'on' : ''}`} title={title} aria-label={title} aria-expanded={!!open} onClick={(e) => {
          if (open) return setOpen(null);
          const r = e.currentTarget.getBoundingClientRect();
          const w = e.currentTarget.ownerDocument.defaultView?.innerWidth ?? innerWidth;
          setOpen({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left - 8, w - 236)) });
        }}>
        {icon ?? <Palette size={size} />}
      </button>
      {open && box.current && createPortal(
        <span ref={pop} className="swatches" role="menu" aria-label={title} style={open} onMouseDown={(e) => e.stopPropagation()}>
          {SHADES.map((c) => (
            <button key={c} role="menuitemradio" aria-checked={current === c} title={label(c)} aria-label={label(c)}
              className={`swatch dot-${c} ${current === c ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); onPick(c); setOpen(null); }}>
              {current === c && <Check size={11} strokeWidth={3} />}
            </button>
          ))}
        </span>,
        box.current.ownerDocument.body,
      )}
    </span>
  );
}
