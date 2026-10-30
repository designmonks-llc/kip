import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { mosaicTiles, type Art } from '../lib/art';
import { addCustomCover, allCovers, customCovers, removeCustomCover } from '../lib/covers';
import { toasts } from '../lib/toast';

/** The Kip logotype: lowercase, with a square "pixel" for the dot of the i. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }} aria-label="Kip">
      k<span className="logo-i">ı<i /></span>p
    </span>
  );
}

/** Film grain over art, so photos feel printed rather than stock. */
export const Grain = () => <span className="grain" aria-hidden />;

/**
 * A photo breaking into pixels. The base photo is drawn "cover"; tiles either show a displaced
 * square of the same photo or a flat colour square.
 */
export function Mosaic({ art, cell = 44, seed = 11, clusters = 14, area, className = '', tiles: showTiles = true, children }: {
  art: Art | null; cell?: number; seed?: number; clusters?: number; tiles?: boolean;
  area?: { x0: number; x1: number; y0: number; y1: number };
  className?: string; children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "cover" placement of the photo inside the box (no photo = the calm gradient cover)
  const aw = art?.w ?? 1, ah = art?.h ?? 1;
  const scale = Math.max(box.w / aw, box.h / ah) || 0;
  const bw = aw * scale, bh = ah * scale;
  const ox = (box.w - bw) / 2, oy = (box.h - bh) / 2;
  const cols = Math.ceil(box.w / cell), rows = Math.ceil(box.h / cell);
  const tiles = useMemo(
    () => (showTiles && cols && rows ? mosaicTiles(cols, rows, seed, clusters, area) : []).filter((t) => art || t.kind !== 'shift'),
    [showTiles, cols, rows, seed, clusters, area, art],
  );
  const bg = art ? { backgroundImage: `url("${art.src}")`, backgroundSize: `${bw}px ${bh}px` } : {};

  return (
    <div ref={ref} className={`mosaic ${art ? '' : 'mosaic-calm'} ${className}`} style={art ? { ...bg, backgroundPosition: `${ox}px ${oy}px` } : undefined}>
      {box.w > 0 && tiles.map((t, i) => {
        const x = t.col * cell, y = t.row * cell;
        const style: React.CSSProperties = { left: x, top: y, width: cell, height: cell };
        if (t.kind === 'shift') Object.assign(style, bg, { backgroundPosition: `${ox - x - t.dc * cell}px ${oy - y - t.dr * cell}px` });
        return <span key={i} className={`tile tile-${t.kind}`} style={style} />;
      })}
      <Grain />
      {children}
    </div>
  );
}

/** Empty states get a small piece of art so they feel intentional, not broken. */
export function EmptyState({ art, title, text, children, seed = 5 }: { art: Art; title: string; text?: string; children?: React.ReactNode; seed?: number }) {
  return (
    <div className="empty-state">
      <Mosaic art={art} cell={22} seed={seed} clusters={6} className="empty-art" area={{ x0: 0.1, x1: 0.95, y0: 0.05, y1: 0.6 }} />
      <h3 className="empty-title">{title}</h3>
      {text && <p className="empty-text">{text}</p>}
      {children && <div className="row center">{children}</div>}
    </div>
  );
}

/** Grid of cover presets; used on Home (popover) and in Settings. */
export function CoverPicker({ value, onPick }: { value: string; onPick: (id: string) => void }) {
  useSyncExternalStore(customCovers.subscribe, customCovers.version);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      await addCustomCover(f);
    } catch (e) {
      toasts.show((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  return (
    <div className="cover-grid">
      {allCovers().map((c) => (
        <div key={c.id} className={`cover-opt ${c.id === value ? 'on' : ''} ${c.custom ? 'custom' : ''}`}>
          <button className="cover-pick" onClick={() => onPick(c.id)} title={c.name}>
            <span className={`cover-thumb ${c.art ? '' : 'mosaic-calm'}`} style={c.art ? { backgroundImage: `url("${c.thumb}")` } : undefined}>
              {c.id === value && <span className="cover-check"><Check size={13} /></span>}
            </span>
            <span className="cover-name">{c.name}</span>
          </button>
          {c.custom && (
            <button className="cover-del" title="Remove this image" aria-label={`Remove ${c.name}`}
              onClick={() => removeCustomCover(c.id).then(() => toasts.show('Image removed'))}>
              <X size={13} />
            </button>
          )}
        </div>
      ))}
      <button className={`cover-opt cover-add ${busy ? 'busy' : ''}`} onClick={() => file.current?.click()} disabled={busy} title="Use your own image">
        <span className="cover-thumb"><ImagePlus size={18} /></span>
        <span className="cover-name">{busy ? 'Adding…' : 'Your image'}</span>
      </button>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}
