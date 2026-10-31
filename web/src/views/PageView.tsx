import { BlockNoteSchema, combineByGroup, defaultInlineContentSpecs, type BlockNoteEditor, createExtension, filterSuggestionItems, type Block, type PartialBlock } from '@blocknote/core';
import { en } from '@blocknote/core/locales';
import { getMultiColumnSlashMenuItems, locales as columnLocales, multiColumnDropCursor, withMultiColumn } from '@blocknote/xl-multi-column';
import { SuggestionMenu } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import { FilePlus, PictureInPicture2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { blockOps, blockText, colorFor, isShorthandColor, mergeBlocks, sameDoc, walk, type B } from '../lib/blocks';
import { getPage, isTrashed, listPages, updatePage, type Page } from '../lib/db';
import { FILE_SCHEME, openStoredFile, resolveFileUrl, storeFile } from '../lib/files';
import { toasts } from '../lib/toast';
import { KipFormattingToolbar, KipSideMenu, withoutIds } from './editorUi';
import { ShareMenu } from './ShareMenu';
import { BoardPage, emptyBoard, KanbanBlock, readBoard } from './Kanban';
import { TEMPLATE_ICON } from './Templates';
import { Mention, mentionItems } from './Mention';
import { TEMPLATES } from '../lib/templates';
import { floating } from '../lib/floating';
import { go, useData, useSyncValue } from './common';
import { Crumbs, PageMenu } from './PageMenu';
import { PageIcon } from './Sidebar';
import { useSettings } from './ui';
import { discardIfEmpty, newPage, pageHref, pageTitle } from './workspace';

// Our shorthand wins over BlockNote's own: "> " is a decision and "* " is important, not quote/bullet.
// "- " still makes a bullet, "! " makes a to-do (an action), and '" ' makes a quote (their words).
const shorthand = createExtension({
  key: 'meeting-sticky-shorthand',
  inputRules: [
    { find: /^\s?[-+]\s$/, replace: () => ({ type: 'bulletListItem', props: {} }) },
    { find: /^!\s$/, replace: () => ({ type: 'checkListItem', props: { checked: false } }) },
    { find: /^["“]\s$/, replace: () => ({ type: 'quote', props: {} }) },
  ],
});

// Pages can hold columns (drag a block beside another, or /2 columns) and Kanban boards.
const schema = withMultiColumn(BlockNoteSchema.create({ inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention } })).extend({ blockSpecs: { kanban: KanbanBlock() } });
type EditorApi = BlockNoteEditor<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>;

/** Files dropped or picked into a page are kept on this device (see lib/files.ts). */
async function uploadFile(file: File) {
  try {
    return await storeFile(file);
  } catch (e) {
    toasts.show((e as Error).message);
    throw e;
  }
}

export function PageView({ id }: { id: string }) {
  const page = useData(() => getPage(id), [id]);
  const pages = useData(listPages, []) ?? [];
  useSyncExternalStore(floating.subscribe, floating.version);
  const [hint, setHint] = useState('');
  const editorRef = useRef<EditorApi | null>(null);
  useEffect(() => { if (page?.kind === 'meeting' && page.meetingId) go(`/m/${page.meetingId}`); }, [page]);
  // Leaving a page you never wrote in tidies it away (no more piles of "Untitled").
  useEffect(() => () => discardIfEmpty(id), [id]);

  if (page === undefined) return <main className="page doc"><p className="muted">Loading…</p></main>;
  if (!page) return <main className="page doc"><p>Page not found.</p><button onClick={() => go('/')}>Home</button></main>;
  if (page.kind === 'meeting') return null;

  const byId = new Map(pages.map((p) => [p.id, p]));
  // cards on this page's boards already show on the board, so they aren't listed again above it
  const onBoard = new Set<string>();
  walk((page.content ?? []) as B[], (b) => { if (b.type === 'kanban') readBoard(String(b.props?.data ?? '')).columns.forEach((c) => c.cards.forEach((k) => k.pageId && onBoard.add(k.pageId))); });
  const children = pages.filter((p) => p.parentId === id && !isTrashed(p, byId) && !onBoard.has(p.id)).sort((a, b) => a.createdAt - b.createdAt);
  const isFloating = floating.isFloating({ kind: 'page', id });

  async function float() {
    const err = await floating.open({ kind: 'page', id });
    if (err) setHint(err);
  }

  return (
    <main className="page doc">
      <div className="doc-top">
        <Crumbs page={page} />
        <div className="row">
          {isFloating ? (
            <button onClick={() => floating.close()} title="Close the floating window"><X size={15} /> Close floating</button>
          ) : (
            <button onClick={float} title="Float this note on top of other windows"><PictureInPicture2 size={15} /> Pop out</button>
          )}
          <ShareMenu editor={() => editorRef.current} title={page.title} />
          <PageMenu page={page} />
        </div>
      </div>
      {hint && <p className="status warn">{hint}</p>}
      {page.trashedAt && <p className="status warn">This page is in the trash.</p>}
      {isFloating && <p className="status small">Also open in a floating window. Edits in either place show up in both.</p>}

      <TitleInput key={`title-${id}`} page={page} editorRef={editorRef} />

      {children.length > 0 && (
        <div className="subpages">
          {children.map((c) => (
            <a key={c.id} onClick={() => go(pageHref(c))}><PageIcon p={c} /> {pageTitle(c)}</a>
          ))}
        </div>
      )}

      <Editor key={`editor-${id}`} page={page} editorRef={editorRef} />
    </main>
  );
}

/** Opens the "/" block menu in the editor, at the end of the note. */
function openBlockMenu(editor: EditorApi) {
  const doc = editor.document;
  const last = doc[doc.length - 1];
  if (last && blockText(last as B)) {
    editor.insertBlocks([{ type: 'paragraph' }], last, 'after');
  }
  const target = editor.document[editor.document.length - 1];
  editor.setTextCursorPosition(target, 'end');
  editor.focus();
  editor.getExtension(SuggestionMenu)?.openSuggestionMenu('/');
}

function TitleInput({ page, editorRef }: { page: Page; editorRef: React.MutableRefObject<EditorApi | null> }) {
  const timer = useRef<number>(0);
  const ref = useRef<HTMLInputElement>(null);
  useSyncValue(ref, page.title);
  const toEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setTextCursorPosition(editor.document[0], 'start');
    editor.focus();
  };
  return (
    <input
      ref={ref}
      className="doc-title"
      autoFocus={!page.title}
      defaultValue={page.title}
      placeholder="Untitled"
      onChange={(e) => {
        const v = e.target.value;
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => updatePage(page.id, { title: v }), 300);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); toEditor(); }
        // "/" in an empty title means "give me a block": jump into the page and open the menu.
        // (Once a title has text, "/" is just a character, e.g. "Q3/Q4 plan".)
        if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.currentTarget.value && editorRef.current) {
          e.preventDefault();
          openBlockMenu(editorRef.current);
        }
      }}
    />
  );
}

/**
 * The full-page editor. It stays in live sync with the stored note: changes made elsewhere (the floating
 * note, Open actions) are merged in block by block, and its own saves merge with whatever is stored, so
 * neither side ever overwrites the other.
 */
function Editor({ page, editorRef }: { page: Page; editorRef: React.MutableRefObject<EditorApi | null> }) {
  const editor = useCreateBlockNote({
    schema,
    dropCursor: multiColumnDropCursor,
    dictionary: { ...en, multi_column: columnLocales.en } as typeof en,
    uploadFile,
    resolveFileUrl,
    initialContent: page.content?.length ? (page.content as PartialBlock<typeof schema.blockSchema>[]) : undefined,
    disableExtensions: ['quote-block-shortcuts', 'bullet-list-item-shortcuts'],
    placeholders: { default: 'Write something, or press / for headings, lists and more', emptyDocument: 'Start writing, or press / for blocks' },
    extensions: [shorthand],
  });
  editorRef.current = editor;
  const look = useSettings();
  const allPages = useData(listPages, []) ?? [];
  const byId = new Map(allPages.map((p) => [p.id, p]));
  const targets = allPages.filter((p) => p.kind === 'note' && p.id !== page.id && !isTrashed(p, byId)).sort((a, b) => b.updatedAt - a.updatedAt);

  // The stored content this editor last agreed with: the common ancestor for merging.
  const base = useRef<unknown[]>(page.content ?? []);
  const alive = useRef(true);
  const applying = useRef(false);
  const timer = useRef<number>(0);
  const pending = useRef(false);

  /** Turns the editor's document into `to` with block operations (keeps the cursor where it is). */
  const apply = useCallback((from: unknown[], to: unknown[]) => {
    const { removed, updated, added } = blockOps(from, to);
    if (!removed.length && !updated.length && !added.length) return;
    applying.current = true;
    try {
      const has = (id?: string) => !!id && !!editor.getBlock(id);
      const gone = removed.filter(has);
      if (gone.length) editor.removeBlocks(gone);
      for (const b of updated) if (has(b.id)) editor.updateBlock(b.id!, { type: b.type, props: b.props, content: b.content } as never);
      for (const f of added) {
        if (has(f.block.id)) continue;
        const block = f.block as PartialBlock;
        if (has(f.prevId)) editor.insertBlocks([block], f.prevId!, 'after');
        else if (has(f.nextId)) editor.insertBlocks([block], f.nextId!, 'before');
        else if (has(f.parentId)) editor.updateBlock(f.parentId!, { children: [block, ...editor.getBlock(f.parentId!)!.children] } as never);
        else { const doc = editor.document; editor.insertBlocks([block], doc[doc.length - 1], 'after'); }
      }
    } finally {
      applying.current = false;
    }
  }, [editor]);

  // Save = merge my document into whatever is stored now, in one transaction.
  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (!pending.current) return;
    pending.current = false;
    const mine = structuredClone(editor.document) as unknown[];
    let merged: unknown[] = mine;
    await updatePage(page.id, (p) => {
      merged = mergeBlocks(base.current, mine, p.content ?? []);
      return { content: merged };
    });
    base.current = merged;
    // Anything that arrived from elsewhere in the meantime goes into the editor too.
    if (alive.current && !sameDoc(mine, merged)) apply(mine, merged);
  }, [editor, page.id, apply]);

  // Changes stored by someone else (floating note, Open actions…) flow into the editor.
  useEffect(() => {
    const theirs = page.content ?? [];
    if (sameDoc(theirs, base.current)) return; // our own save echoing back, or nothing new
    const mine = structuredClone(editor.document) as unknown[];
    const merged = mergeBlocks(base.current, mine, theirs);
    base.current = theirs;
    apply(mine, merged);
    if (!sameDoc(merged, theirs)) { pending.current = true; timer.current = window.setTimeout(save, 400); }
  }, [page.content, editor, apply, save]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; save(); };
  }, [save]);

  // Titled pages (quick notes, existing pages) open ready to type; untitled ones focus the title instead.
  useEffect(() => {
    if (!page.title.trim()) return;
    const t = setTimeout(() => {
      const last = editor.document[editor.document.length - 1];
      if (last) editor.setTextCursorPosition(last, 'end');
      editor.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Moves a block to the end of another page: copied there first, then removed here, so it can't be lost. */
  const moveTo = useCallback(async (block: Block<any, any, any>, to: Page) => {
    await updatePage(to.id, (p) => ({ content: [...(p.content ?? []), withoutIds(structuredClone(block))] }));
    editor.removeBlocks([block.id]);
    toasts.show(`Moved to “${to.title.trim() || 'Untitled'}”`);
  }, [editor]);

  const onChange = useCallback(() => {
    // Colour lines that start with a shorthand symbol; clear the colour when the symbol goes.
    const fixes: [B, string][] = [];
    walk(editor.document as B[], (b) => {
      if (b.type !== 'paragraph') return;
      const want = colorFor(blockText(b));
      const cur = b.props?.backgroundColor;
      if (want && cur !== want) fixes.push([b, want]);
      else if (!want && isShorthandColor(cur)) fixes.push([b, 'default']);
    });
    for (const [b, c] of fixes) editor.updateBlock(b.id!, { props: { backgroundColor: c } } as never);
    if (applying.current) return; // changes we just merged in are already stored
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 400);
  }, [editor, save]);

  // Boards and tables may grow into the empty space to the right of the text, up to the window's edge.
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    const main = el?.closest('.main') as HTMLElement | null;
    if (!el || !main) return;
    const measure = () => {
      const text = el.querySelector('.bn-editor > .bn-block-group')?.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      if (text) el.style.setProperty('--bleed', `${Math.max(0, Math.min(560, m.left + main.clientWidth - 28 - text.right))}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrap}
      className="editor-wrap"
      // Double-clicking a file opens it full size (a PDF opens in Preview on a Mac).
      onDoubleClick={(e) => {
        const el = (e.target as HTMLElement).closest('[data-file-block]')?.closest('[data-id]') as HTMLElement | null;
        const url = el?.dataset.id ? (editor.getBlock(el.dataset.id)?.props as { url?: string } | undefined)?.url : undefined;
        if (url?.startsWith(FILE_SCHEME)) { e.preventDefault(); openStoredFile(url); }
      }}
    >
      <BoardPage.Provider value={page.id}>
      <BlockNoteView editor={editor} theme={look.theme === 'dark' ? 'dark' : 'light'} onChange={onChange} slashMenu={false} formattingToolbar={false} sideMenu={false}>
        <KipFormattingToolbar />
        <KipSideMenu pages={targets} onMove={moveTo} />
        <SuggestionMenuController triggerCharacter="@" getItems={(query) => mentionItems(editor, page.id, query)} />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                // First, so "/sub" and "/page" pick it over headings.
                {
                  title: 'Sub-page',
                  subtext: 'A new page inside this one',
                  aliases: ['page', 'subpage', 'sub-page', 'child'],
                  group: 'Pages',
                  icon: <FilePlus size={18} />,
                  onItemClick: async () => { await save(); await newPage(page.id); },
                },
                ...combineByGroup(getDefaultReactSlashMenuItems(editor), getMultiColumnSlashMenuItems(editor)),
                // Templates drop their ready-made blocks in right here (a board starts with empty columns)
                ...TEMPLATES.map((t) => ({
                  title: t.name,
                  subtext: t.about,
                  aliases: ['template', t.id, ...t.name.toLowerCase().split(' ')],
                  group: 'Templates',
                  icon: TEMPLATE_ICON[t.id] as React.JSX.Element,
                  onItemClick: () => {
                    const at = editor.getTextCursorPosition().block;
                    const blocks = t.blocks().map((b) => (b.type === 'kanban' ? { ...b, props: { data: JSON.stringify(emptyBoard()) } } : b));
                    editor.insertBlocks(blocks as never, at, 'after');
                    if (at.type === 'paragraph' && !blockText(at as B)) editor.removeBlocks([at]);
                  },
                })),
              ],
              query,
            )
          }
        />
      </BlockNoteView>
      </BoardPage.Provider>
      {/* Clicking the empty space under the text puts the cursor at the end, like a page. */}
      <div
        className="editor-tail"
        onMouseDown={(e) => {
          e.preventDefault();
          const last = editor.document[editor.document.length - 1];
          if (last) editor.setTextCursorPosition(last, 'end');
          editor.focus();
        }}
      />
    </div>
  );
}
