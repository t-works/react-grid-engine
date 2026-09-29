/**
 * Tab chrome menus (FR-9, FR-11, FR-12; A13–A16): the `+` add menu, the tab
 * context menu (close / close others / close all / rename) and the force-close
 * prompt shown when a `canClose` guard rejects.
 *
 * Pointer-first; keyboard/focus management is v2 (PRD §8), so this keeps only
 * the cheap semantics: `role="menu"`/`"menuitem"`, labelled close controls and
 * no meaning carried by color alone. Tab color lives in 08 and is not here.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ContainerNode, Tab } from '../layout/types';
import type { PanelComponentDef } from '../registry';
import { listContainers } from '../layout/ops';
import type { ChromeCtx } from './Container';
import { chrome } from './styles';

/** Viewport coordinates of a menu's top-left corner. */
export interface MenuAnchor {
  x: number;
  y: number;
}

/** True when the UI may close this tab (FR-11 / A13). */
export function isUiCloseable(def: PanelComponentDef | undefined): boolean {
  return def?.closeable !== false && def?.allowMultiple !== false;
}

/** Closeable tabs of a container, optionally excluding one (the menu target). */
export function uiCloseableTabs(container: ContainerNode, ctx: ChromeCtx, exceptId?: string): Tab[] {
  return container.tabs.filter((tab) => tab.id !== exceptId && isUiCloseable(ctx.registry[tab.component]));
}

/** Unconditional removals — the "close others/all" path (FR-11, A14). */
export function closeTabs(tabs: readonly Tab[], ctx: ChromeCtx): void {
  tabs.forEach((tab) => ctx.engine.removeTab(tab.id));
}

export type CloseResult = 'closed' | 'blocked' | 'rejected';

/** The UI close path for a single tab (FR-12): never closes past a `false` guard. */
export async function requestTabClose(tab: Tab, ctx: ChromeCtx): Promise<CloseResult> {
  const def = ctx.registry[tab.component];
  if (!isUiCloseable(def)) return 'blocked';
  const guard = def?.canClose;
  if (guard) {
    let ok: boolean;
    try {
      ok = await guard(tab.config);
    } catch (err) {
      console.warn(
        `GridEngine: canClose for "${tab.component}" rejected; offering force close.`,
        err,
      );
      return 'rejected';
    }
    if (!ok) return 'blocked';
  }
  ctx.engine.removeTab(tab.id);
  return 'closed';
}

/** Registry entries the `+` menu may offer for this layout (FR-9, A13, A15). */
export function addableEntries(ctx: ChromeCtx): [string, PanelComponentDef][] {
  const containers = listContainers(ctx.engine.getLayout().root);
  return Object.entries(ctx.registry).filter(([key, def]) => {
    if (def.addable === false) return false;
    return !(
      def.allowMultiple === false &&
      containers.some((container) => container.tabs.some((tab) => tab.component === key))
    );
  });
}

/** A floating menu shell. Outside pointerdown or `Esc` closes it. */
export function Popover({
  anchor,
  onClose,
  children,
}: {
  anchor: MenuAnchor;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      // Keep the title-bar drag handler from claiming menu presses (FR-8).
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: anchor.x,
        top: anchor.y,
        zIndex: 2000,
        minWidth: 160,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        background: chrome('tab-active-bg', '#fff'),
        color: chrome('titlebar-fg', '#374151'),
        border: `${chrome('border-width', '1px')} solid ${chrome('border-color', '#d4d4d4')}`,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      }}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  onSelect,
  disabled,
  children,
}: {
  onSelect: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '5px 10px',
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** The `+` menu: registry keys filtered by `addable` and `allowMultiple` (FR-9). */
export function AddMenu({
  container,
  ctx,
  anchor,
  onClose,
}: {
  container: ContainerNode;
  ctx: ChromeCtx;
  anchor: MenuAnchor;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      {addableEntries(ctx).map(([key]) => (
        <MenuItem
          key={key}
          onSelect={() => {
            ctx.engine.addTab({ component: key, target: { kind: 'tab', containerId: container.id } });
            onClose();
          }}
        >
          {key}
        </MenuItem>
      ))}
    </Popover>
  );
}

/** Tab context menu: close / close others / close all / rename (FR-11, A16). */
export function TabContextMenu({
  container,
  tab,
  ctx,
  anchor,
  onClose,
  onCloseTab,
}: {
  container: ContainerNode;
  tab: Tab;
  ctx: ChromeCtx;
  anchor: MenuAnchor;
  onClose: () => void;
  onCloseTab: (tab: Tab, anchor: MenuAnchor) => void;
}) {
  const def = ctx.registry[tab.component];
  const others = uiCloseableTabs(container, ctx, tab.id);
  const all = uiCloseableTabs(container, ctx);
  const [draft, setDraft] = useState(typeof tab.title === 'string' ? tab.title : '');
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    const commit = (): void => {
      ctx.engine.updateTab(tab.id, { title: draft });
      onClose();
    };
    return (
      <Popover anchor={anchor} onClose={onClose}>
        <input
          autoFocus
          aria-label="Tab title"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          style={{
            margin: 4,
            padding: '4px 6px',
            border: `${chrome('border-width', '1px')} solid ${chrome('border-color', '#d4d4d4')}`,
            background: chrome('tab-bg', 'transparent'),
            color: 'inherit',
            font: 'inherit',
          }}
        />
      </Popover>
    );
  }

  return (
    <Popover anchor={anchor} onClose={onClose}>
      {isUiCloseable(def) && (
        <MenuItem
          onSelect={() => {
            onClose();
            onCloseTab(tab, anchor);
          }}
        >
          Close
        </MenuItem>
      )}
      <MenuItem
        disabled={others.length === 0}
        onSelect={() => {
          closeTabs(others, ctx);
          onClose();
        }}
      >
        Close others
      </MenuItem>
      <MenuItem
        disabled={all.length === 0}
        onSelect={() => {
          closeTabs(all, ctx);
          onClose();
        }}
      >
        Close all
      </MenuItem>
      {def?.titleEditable !== false && <MenuItem onSelect={() => setRenaming(true)}>Rename</MenuItem>}
    </Popover>
  );
}
