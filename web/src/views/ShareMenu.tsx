// The Share button on a page: download it as PDF, Word, Markdown, HTML, PNG or JPG, or share it (AirDrop, Mail…).
import type { BlockNoteEditor } from '@blocknote/core';
import { FileCode2, FileImage, FileText, FileType2, Loader2, Share, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Format } from '../lib/exporter';
import { desktop } from '../lib/files';
import { toasts } from '../lib/toast';

const FORMATS: { f: Format; label: string; sub: string; icon: React.ReactNode }[] = [
  { f: 'pdf', label: 'PDF', sub: 'A clean document', icon: <FileText size={15} /> },
  { f: 'docx', label: 'Word', sub: '.docx, for Word, Pages or Google Docs', icon: <FileType2 size={15} /> },
  { f: 'md', label: 'Markdown', sub: 'Plain text with formatting', icon: <FileCode2 size={15} /> },
  { f: 'html', label: 'HTML', sub: 'A web page file', icon: <FileCode2 size={15} /> },
  { f: 'png', label: 'PNG image', sub: 'The whole page as a picture', icon: <FileImage size={15} /> },
  { f: 'jpg', label: 'JPG image', sub: 'Smaller picture file', icon: <FileImage size={15} /> },
];

export function ShareMenu({ editor, title }: { editor: () => BlockNoteEditor<any, any, any> | null; title: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const run = (what: string, f: () => Promise<unknown>) => async () => {
    const ed = editor();
    if (!ed) return;
    setBusy(what);
    try {
      const msg = await f();
      if (typeof msg === 'string') toasts.show(msg);
    } catch (e) {
      toasts.show(`Couldn’t make the ${what}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };
  const name = title.trim() || 'Untitled';
  const shareLabel = desktop()?.share ? 'Share as PDF…' : 'Share…';

  return (
    <div className="share-wrap" ref={ref}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} title="Download or share this page">
        {busy ? <Loader2 size={15} className="spin" /> : <Share size={15} />} Share
      </button>
      {open && (
        <div className="menu share-menu" role="menu">
          <p className="menu-label">Download as</p>
          {FORMATS.map(({ f, label, sub, icon }) => (
            <button key={f} role="menuitem" disabled={!!busy} onClick={run(label, async () => (await import('../lib/exporter')).exportPage(editor()!, name, f))}>
              {icon}<span><b>{label}</b><small>{sub}</small></span>
            </button>
          ))}
          <div className="menu-sep" />
          <button role="menuitem" disabled={!!busy} onClick={run('share', async () => (await import('../lib/exporter')).sharePage(editor()!, name))}>
            <Upload size={15} /><span><b>{shareLabel}</b><small>AirDrop, Mail, Messages and more</small></span>
          </button>
        </div>
      )}
    </div>
  );
}
