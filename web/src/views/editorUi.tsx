// Kip's own pieces of the page editor: colours with Black, and the drag-handle (⠿) menu
// (Turn into, Colour, Duplicate, Move to another page, Delete).
import { blockHasType, type Block } from '@blocknote/core';
import { SideMenuExtension } from '@blocknote/core/extensions';
import {
  blockTypeSelectItems, DragHandleMenu, FormattingToolbar, FormattingToolbarController, getFormattingToolbarItems, RemoveBlockItem,
  SideMenu, SideMenuController, useBlockNoteEditor, useComponentsContext, useDictionary, useEditorState, useExtensionState, usePortalElement,
} from '@blocknote/react';
import { Download, ExternalLink } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { Page } from '../lib/db';
import { FILE_SCHEME, getStoredFile, openStoredFile, saveBlob } from '../lib/files';

// "default" follows the theme (Kip's navy ink); "black" is true black in light mode and on paper.
export const COLORS = ['default', 'black', 'gray', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const;
const label = (c: string, dict: ReturnType<typeof useDictionary>) =>
  c === 'black' ? 'Black' : (dict.color_picker.colors as Record<string, string>)[c] ?? c;

const Swatch = ({ text, bg, size = 16 }: { text?: string; bg?: string; size?: number }) => (
  <div className="bn-color-icon" data-text-color={text || 'default'} data-background-color={bg || 'default'}
    style={{ width: size, height: size, lineHeight: `${size}px`, fontSize: size * 0.75, textAlign: 'center', pointerEvents: 'none' }}>A</div>
);

type Pick = { color: string; setColor: (c: string) => void };
function ColorItems({ text, background, iconSize }: { text?: Pick; background?: Pick; iconSize?: number }) {
  const C = useComponentsContext()!;
  const dict = useDictionary();
  return (
    <>
      {text && <C.Generic.Menu.Label>{dict.color_picker.text_title}</C.Generic.Menu.Label>}
      {text && COLORS.map((c) => (
        <C.Generic.Menu.Item key={'t' + c} onClick={() => text.setColor(c)} icon={<Swatch text={c} size={iconSize} />} checked={text.color === c}>{label(c, dict)}</C.Generic.Menu.Item>
      ))}
      {background && <C.Generic.Menu.Label>{dict.color_picker.background_title}</C.Generic.Menu.Label>}
      {background && COLORS.map((c) => (
        <C.Generic.Menu.Item key={'b' + c} onClick={() => background.setColor(c)} icon={<Swatch bg={c} size={iconSize} />} checked={background.color === c}>{label(c, dict)}</C.Generic.Menu.Item>
      ))}
    </>
  );
}

/** The toolbar's colour button, with Black in the list. */
function ColorButton() {
  const C = useComponentsContext()!;
  const dict = useDictionary();
  const portal = usePortalElement();
  const editor = useBlockNoteEditor<any, any, any>();
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e.isEditable) return undefined;
      const blocks = e.getSelection()?.blocks || [e.getTextCursorPosition().block];
      if (!blocks.find((b: Block<any, any, any>) => b.content !== undefined)) return undefined;
      const s = e.getActiveStyles() as { textColor?: string; backgroundColor?: string };
      return { text: s.textColor || 'default', bg: s.backgroundColor || 'default' };
    },
  });
  if (!state) return null;
  const set = (key: 'textColor' | 'backgroundColor') => (c: string) => {
    if (c === 'default') editor.removeStyles({ [key]: c });
    else editor.addStyles({ [key]: c });
    editor.focus();
  };
  return (
    <C.Generic.Menu.Root portalElement={portal}>
      <C.Generic.Menu.Trigger>
        <C.FormattingToolbar.Button className="bn-button" label={dict.formatting_toolbar.colors.tooltip} mainTooltip={dict.formatting_toolbar.colors.tooltip}
          icon={<Swatch text={state.text} bg={state.bg} size={20} />} />
      </C.Generic.Menu.Trigger>
      <C.Generic.Menu.Dropdown className="bn-menu-dropdown bn-color-picker-dropdown">
        <ColorItems text={{ color: state.text, setColor: set('textColor') }} background={{ color: state.bg, setColor: set('backgroundColor') }} />
      </C.Generic.Menu.Dropdown>
    </C.Generic.Menu.Root>
  );
}

/** Open (full size) and Download for a file kept in Kip; BlockNote's own button only opens a tab. */
function FileButtons() {
  const C = useComponentsContext()!;
  const editor = useBlockNoteEditor<any, any, any>();
  const url = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const blocks = e.getSelection()?.blocks || [e.getTextCursorPosition().block];
      const u = blocks.length === 1 ? (blocks[0].props as { url?: string })?.url : undefined;
      return u && u.startsWith(FILE_SCHEME) ? u : undefined;
    },
  });
  if (!url) return null;
  return (
    <>
      <C.FormattingToolbar.Button className="bn-button" label="Open" mainTooltip="Open full size" icon={<ExternalLink size={16} />} onClick={() => openStoredFile(url)} />
      <C.FormattingToolbar.Button className="bn-button" label="Download" mainTooltip="Download" icon={<Download size={16} />}
        onClick={async () => { const f = await getStoredFile(url); if (f) saveBlob(f.blob, f.name); }} />
    </>
  );
}

export const KipFormattingToolbar = () => (
  <FormattingToolbarController
    formattingToolbar={() => (
      <FormattingToolbar>
        {getFormattingToolbarItems().map((el) =>
          el.key === 'colorStyleButton' ? <ColorButton key="colorStyleButton" /> : el.key === 'fileDownloadButton' ? <FileButtons key="fileDownloadButton" /> : el)}
      </FormattingToolbar>
    )}
  />
);

// ---------------- the drag-handle menu ----------------
const useMenuBlock = () => {
  const editor = useBlockNoteEditor<any, any, any>();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
  return { editor, block: block as Block<any, any, any> | undefined };
};

function Sub({ title, children }: { title: string; children: ReactNode }) {
  const C = useComponentsContext()!;
  const portal = usePortalElement();
  return (
    <C.Generic.Menu.Root position="right" sub portalElement={portal}>
      <C.Generic.Menu.Trigger sub>
        <C.Generic.Menu.Item className="bn-menu-item" subTrigger>{title}</C.Generic.Menu.Item>
      </C.Generic.Menu.Trigger>
      <C.Generic.Menu.Dropdown sub className="bn-menu-dropdown kip-sub-menu">{children}</C.Generic.Menu.Dropdown>
    </C.Generic.Menu.Root>
  );
}

function TurnInto() {
  const C = useComponentsContext()!;
  const { editor, block } = useMenuBlock();
  const items = useMemo(() => blockTypeSelectItems(editor), [editor]);
  if (!block || block.content === undefined) return null; // files, tables, columns keep their type
  return (
    <Sub title="Turn into">
      {items.map((it) => {
        const on = it.type === block.type && Object.entries(it.props ?? {}).every(([k, v]) => (block.props as Record<string, unknown>)[k] === v);
        const Icon = it.icon;
        return (
          <C.Generic.Menu.Item key={it.name} icon={<Icon size={16} />} checked={on}
            onClick={() => editor.updateBlock(block, { type: it.type, props: it.props } as never)}>{it.name}</C.Generic.Menu.Item>
        );
      })}
    </Sub>
  );
}

function Colour() {
  const { editor, block } = useMenuBlock();
  if (!block) return null;
  const hasText = blockHasType(block, editor, block.type, { textColor: 'string' });
  const hasBg = blockHasType(block, editor, block.type, { backgroundColor: 'string' });
  if (!hasText && !hasBg) return null;
  const props = block.props as { textColor?: string; backgroundColor?: string };
  return (
    <Sub title="Colour">
      <ColorItems iconSize={18}
        text={hasText ? { color: props.textColor ?? 'default', setColor: (c) => editor.updateBlock(block, { props: { textColor: c } } as never) } : undefined}
        background={hasBg ? { color: props.backgroundColor ?? 'default', setColor: (c) => editor.updateBlock(block, { props: { backgroundColor: c } } as never) } : undefined} />
    </Sub>
  );
}

/** A copy without block ids, so the editor gives it new ones. */
export function withoutIds<T>(b: T): T {
  const { id: _id, children, ...rest } = b as unknown as { id?: string; children?: unknown[] };
  return { ...rest, children: (children ?? []).map(withoutIds) } as unknown as T;
}

function Duplicate() {
  const C = useComponentsContext()!;
  const { editor, block } = useMenuBlock();
  if (!block) return null;
  return <C.Generic.Menu.Item onClick={() => editor.insertBlocks([withoutIds(block)] as never, block, 'after')}>Duplicate</C.Generic.Menu.Item>;
}

function MoveTo({ pages, onMove }: { pages: Page[]; onMove: (block: Block<any, any, any>, to: Page) => void }) {
  const C = useComponentsContext()!;
  const { block } = useMenuBlock();
  if (!block || !pages.length) return null;
  return (
    <Sub title="Move to page">
      {pages.slice(0, 40).map((p) => (
        <C.Generic.Menu.Item key={p.id} onClick={() => onMove(block, p)}>{p.title.trim() || 'Untitled'}</C.Generic.Menu.Item>
      ))}
    </Sub>
  );
}

export function KipSideMenu({ pages, onMove }: { pages: Page[]; onMove: (block: Block<any, any, any>, to: Page) => void }) {
  const Menu = () => (
    <DragHandleMenu>
      <TurnInto />
      <Colour />
      <Duplicate />
      <MoveTo pages={pages} onMove={onMove} />
      <RemoveBlockItem>Delete</RemoveBlockItem>
    </DragHandleMenu>
  );
  return <SideMenuController sideMenu={(props) => <SideMenu {...props} dragHandleMenu={Menu} />} />;
}
