// Page exports: a clean document as PDF, Word, Markdown, HTML, PNG or JPG. Everything is made on this device.
// PDF uses the browser's own print engine (the Mac app saves it straight to a file); Word uses BlockNote's exporter.
import { COLORS_DEFAULT, type BlockNoteEditor } from '@blocknote/core';
import coreCss from '@blocknote/core/style.css?raw';
import { docxDefaultSchemaMappings, DOCXExporter } from '@blocknote/xl-docx-exporter';
import { domToJpeg, domToPng } from 'modern-screenshot';
import { Paragraph, TextRun } from 'docx';
import { boardLines, readBoard } from '../views/Kanban';
import { blocksToMarkdown, walk, type B } from './blocks';
import { desktop, fileAsDataUrl, FILE_SCHEME, getStoredFile, saveBlob } from './files';

type Editor = BlockNoteEditor<any, any, any>;
export type Format = 'pdf' | 'docx' | 'md' | 'html' | 'png' | 'jpg';

// BlockNote's palette plus Kip's Black.
export const KIP_COLORS = { ...COLORS_DEFAULT, black: { text: '#000000', background: '#16181d' } } as typeof COLORS_DEFAULT;

export const fileName = (title: string, ext: string) => `${title.replace(/[^\p{L}\p{N} _().,-]+/gu, '').trim() || 'Untitled'}.${ext}`;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The page's blocks with Kip's own files made portable: images carried inside, other files named only. */
async function portableBlocks(editor: Editor) {
  const blocks = structuredClone(editor.document) as B[];
  const jobs: Promise<void>[] = [];
  walk(blocks, (b) => {
    const url = String(b.props?.url ?? '');
    if (!url.startsWith(FILE_SCHEME)) return;
    if (b.type === 'image') jobs.push(fileAsDataUrl(url).then((d) => { b.props!.url = d ?? ''; }));
    else b.props!.url = '';
  });
  await Promise.all(jobs);
  return boardsAsColumns(blocks);
}

/** A board on paper: side-by-side columns, each its name and its cards. */
function boardsAsColumns(blocks: B[]): B[] {
  const id = () => crypto.randomUUID();
  const style = { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' };
  return blocks.map((b) => b.type !== 'kanban' ? { ...b, children: boardsAsColumns(b.children ?? []) } : {
    id: b.id ?? id(), type: 'columnList', props: {}, children: readBoard(String(b.props?.data ?? '')).columns.map((c) => ({
      id: id(), type: 'column', props: { width: 1 }, children: [
        { id: id(), type: 'heading', props: { ...style, level: 3, isToggleable: false }, content: [{ type: 'text', text: `${c.title} (${c.cards.length})`, styles: {} }], children: [] },
        ...c.cards.map((k) => ({ id: id(), type: 'bulletListItem', props: style, content: [{ type: 'text', text: k.title, styles: {} }], children: [] })),
      ],
    })),
  });
}

const DOC_CSS = `
  @page { size: A4; margin: 18mm 17mm 20mm;
    @bottom-center { content: "Page " counter(page) " of " counter(pages) "  ·  Made with Kip"; font: 8pt -apple-system, 'Helvetica Neue', sans-serif; color: #8a97ab; } }
  html, body { margin: 0; background: #fff; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', 'Noto Sans Bengali', sans-serif; color: #1d2433; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kip-doc { max-width: 760px; margin: 0 auto; padding: 48px 40px 56px; }
  .kip-doc-title { font-size: 34px; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 22px; color: #111827; }
  .kip-doc .bn-container, .kip-doc .bn-editor { background: transparent; color: inherit; font-family: inherit; }
  .kip-doc .bn-editor { padding: 0 !important; }
  .kip-doc .bn-block-content { padding: 2px 0; }
  .kip-doc img { max-width: 100%; height: auto; border-radius: 6px; }
  .kip-doc .bn-file-name-with-icon { display: inline-flex; gap: 8px; padding: 6px 10px; border: 1px solid #e1e9f2; border-radius: 8px; background: #f2f7fd; }
  .kip-doc .bn-add-file-button { display: none; }
  .kip-doc .kanban-static { display: flex; gap: 12px; } .kip-doc .kanban-static .kb-col { flex: 1; padding: 10px 12px; border: 1px solid #e1e9f2; border-radius: 10px; background: #f6f9fd; }
  .kip-doc .kanban-static h4 { margin: 0 0 6px; font-size: 13px; } .kip-doc .kanban-static ul { margin: 0; padding-left: 16px; font-size: 13px; }
  .kip-doc-foot { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e1e9f2; font-size: 11px; color: #8a97ab; }
  @media print { .kip-doc { padding: 0; max-width: none; } .kip-doc-foot { display: none; } }
  [data-text-color="black"], [data-style-type="textColor"][data-value="black"] { color: #000; }
  [data-background-color="black"], [data-style-type="backgroundColor"][data-value="black"] { background-color: #16181d; color: #fff; }
`;

/** A clean, standalone document: title, the page, a small "Made with Kip" line. */
export async function pageHtml(editor: Editor, title: string) {
  const body = await editor.blocksToFullHTML((await portableBlocks(editor)) as never);
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${coreCss}${DOC_CSS}</style></head><body><main class="kip-doc">
<h1 class="kip-doc-title">${esc(title)}</h1>
<div class="bn-container bn-default-styles"><div class="bn-editor">${body}</div></div>
<p class="kip-doc-foot">${esc(date)} · Made with Kip</p>
</main></body></html>`;
}

/** Loads HTML into a hidden frame (same origin), for printing and pictures. */
function frame(html: string): Promise<HTMLIFrameElement> {
  return new Promise((res) => {
    const f = document.createElement('iframe');
    Object.assign(f.style, { position: 'fixed', left: '-10000px', top: '0', width: '900px', height: '1200px', border: '0' });
    f.onload = () => res(f);
    f.srcdoc = html;
    document.body.appendChild(f);
  });
}

async function picture(html: string, kind: 'png' | 'jpg') {
  const f = await frame(html);
  try {
    const doc = f.contentDocument!;
    await doc.fonts?.ready;
    await Promise.all([...doc.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    const el = doc.querySelector('.kip-doc') as HTMLElement;
    f.style.height = `${el.scrollHeight + 40}px`;
    const opts = { scale: 2, backgroundColor: '#ffffff', width: el.offsetWidth, height: el.scrollHeight };
    const url = kind === 'png' ? await domToPng(el, opts) : await domToJpeg(el, { ...opts, quality: 0.92 });
    return await (await fetch(url)).blob();
  } finally {
    f.remove();
  }
}

/** Word: BlockNote's own exporter, with Kip's files and colours. */
async function word(editor: Editor, title: string) {
  // boards go into Word as their columns and cards
  const mappings = { ...docxDefaultSchemaMappings, blockMapping: { ...docxDefaultSchemaMappings.blockMapping,
    kanban: (block: { props: { data: string } }) => boardLines(block.props.data).map((t, i, all) => new Paragraph({ children: [new TextRun({ text: t, bold: !t.startsWith('•') })], spacing: { after: i === all.length - 1 ? 200 : 40 } })) } };
  const exporter = new DOCXExporter(editor.schema as never, mappings as never, {
    colors: KIP_COLORS,
    resolveFileUrl: async (url: string) => (url.startsWith(FILE_SCHEME) ? (await getStoredFile(url))?.blob ?? '' : url),
  });
  const heading = { id: 'kip-title', type: 'heading', props: { level: 1, textColor: 'default', backgroundColor: 'default', textAlignment: 'left', isToggleable: false }, content: [{ type: 'text', text: title, styles: {} }], children: [] };
  return exporter.toBlob([heading, ...editor.document] as never);
}

/** Exports the page and saves it. Returns false if the person cancelled (Mac save dialog). */
export async function exportPage(editor: Editor, title: string, format: Format): Promise<boolean> {
  const name = fileName(title, format);
  if (format === 'md') { saveBlob(new Blob([`# ${title}\n\n${blocksToMarkdown(editor.document)}\n`], { type: 'text/markdown' }), name); return true; }
  if (format === 'docx') { saveBlob(await word(editor, title), name); return true; }
  const html = await pageHtml(editor, title);
  if (format === 'html') { saveBlob(new Blob([html], { type: 'text/html' }), name); return true; }
  if (format === 'png' || format === 'jpg') { saveBlob(await picture(html, format), name); return true; }
  // PDF: the Mac app saves it directly; a browser opens its print dialog ("Save as PDF").
  const desk = desktop();
  if (desk?.printToPdf) return desk.printToPdf(html, name);
  const f = await frame(html);
  f.contentWindow!.focus();
  f.contentWindow!.print();
  setTimeout(() => f.remove(), 60_000);
  return true;
}

/** Share: the Mac share sheet (AirDrop, Mail, Messages…) with a PDF; in a browser, the system share with a picture. */
export async function sharePage(editor: Editor, title: string): Promise<string | undefined> {
  const desk = desktop();
  const html = await pageHtml(editor, title);
  if (desk?.share) { await desk.share(fileName(title, 'pdf'), new TextEncoder().encode(html)); return; }
  const file = new File([await picture(html, 'png')], fileName(title, 'png'), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  return 'Sharing isn’t available in this browser. Use Download instead.';
}
