import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ContainerNode, Tab } from '../layout/types';
import type { ChromeCtx } from './Container';
import { chrome, panelDomId, tabDomId } from './styles';
import { resolveTabColor } from '../color';
import {
  AddMenu,
  addableEntries,
  isUiCloseable,
  MenuItem,
  Popover,
  requestTabClose,
  TabContextMenu,
} from './TabMenu';
import type { MenuAnchor } from './TabMenu';

type MenuState =
  | { kind: 'add'; anchor: MenuAnchor }
  | { kind: 'tab'; tabId: string; anchor: MenuAnchor }
  | { kind: 'force'; tabId: string; label: string; anchor: MenuAnchor }
  | null;

const labelOf = (tab: Tab, ctx: ChromeCtx): ReactNode =>
  tab.title ?? ctx.registry[tab.component]?.title?.(tab.config) ?? tab.component;

const textLabel = (tab: Tab, ctx: ChromeCtx): string => {
  const label = tab.title ?? ctx.registry[tab.component]?.title?.(tab.config);
  return typeof label === 'string' ? label : tab.component;
};

const anchorOf = (el: Element): MenuAnchor => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.bottom };
};

/** Title bar + tab strip (FR-3): tabs, close controls, the `+` menu (FR-9) and the tab menu. */
export function TitleBar({ container, ctx }: { container: ContainerNode; ctx: ChromeCtx }) {
  const [menu, setMenu] = useState<MenuState>(null);
  const closeMenu = (): void => setMenu(null);
  const addable = addableEntries(ctx);

  const onCloseTab = async (tab: Tab, anchor: MenuAnchor): Promise<void> => {
    if ((await requestTabClose(tab, ctx)) === 'rejected') {
      setMenu({ kind: 'force', tabId: tab.id, label: textLabel(tab, ctx), anchor });
    }
  };

  const menuTab = menu?.kind === 'tab' ? container.tabs.find((t) => t.id === menu.tabId) : undefined;

  return (
    <div
      role="tablist"
      data-twge-titlebar={container.id}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        flex: '0 0 auto',
        height: chrome('titlebar-height', '28px'),
        background: chrome('titlebar-bg', '#f3f4f6'),
        color: chrome('titlebar-fg', '#374151'),
        borderBottom: `${chrome('border-width', '1px')} solid ${chrome('border-color', '#d4d4d4')}`,
        overflow: 'hidden',
        // The title bar is the container's drag handle (FR-8): touch scroll and
        // text selection would otherwise fight the drag.
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {container.tabs.map((tab) => {
        const active = tab.id === container.activeTabId;
        const label = labelOf(tab, ctx);
        // Accent, not fill (FR-13 / PRD §6.3): a pip + active-tab tint +
        // underline when the tab has an accent; no color = the plain active
        // background. Text stays theme-controlled.
        const accent = resolveTabColor(tab.color, ctx.registry[tab.component]?.defaultColor);
        return (
          <div
            key={tab.id}
            data-twge-tab-wrap={tab.id}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              background: active
                ? accent
                  ? `color-mix(in oklab, ${accent} 12%, ${chrome('tab-bg', chrome('tab-active-bg', '#fff'))})`
                  : chrome('tab-active-bg', '#fff')
                : 'transparent',
              boxShadow: active
                ? `inset 0 -2px 0 0 ${accent ?? chrome('tab-accent', 'transparent')}`
                : undefined,
              borderRight: `${chrome('border-width', '1px')} solid ${chrome('border-color', '#d4d4d4')}`,
            }}
          >
            <button
              type="button"
              role="tab"
              id={tabDomId(tab.id)}
              data-twge-tab-id={tab.id}
              aria-selected={active}
              aria-controls={panelDomId(tab.id)}
              tabIndex={active ? 0 : -1}
              title={typeof label === 'string' ? label : undefined}
              onClick={() => ctx.engine.focusTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ kind: 'tab', tabId: tab.id, anchor: { x: e.clientX, y: e.clientY } });
              }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 10px',
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none',
              }}
            >
              {accent !== undefined && (
                <span
                  data-twge-tab-pip
                  aria-hidden="true"
                  style={{ flex: '0 0 auto', width: 6, height: 6, borderRadius: '50%', background: accent }}
                />
              )}
              {label}
            </button>
            {isUiCloseable(ctx.registry[tab.component]) && (
              <button
                type="button"
                data-twge-tab-close={tab.id}
                aria-label={`Close ${textLabel(tab, ctx)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  void onCloseTab(tab, anchorOf(e.currentTarget));
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'inherit',
                  font: 'inherit',
                  cursor: 'pointer',
                  padding: '0 8px',
                  touchAction: 'none',
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        data-twge-add
        aria-label="Add tab"
        aria-haspopup="menu"
        disabled={addable.length === 0}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => setMenu({ kind: 'add', anchor: anchorOf(e.currentTarget) })}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: addable.length === 0 ? 'default' : 'pointer',
          opacity: addable.length === 0 ? 0.5 : 1,
          padding: '0 10px',
          touchAction: 'none',
        }}
      >
        +
      </button>

      {menu?.kind === 'add' && (
        <AddMenu container={container} ctx={ctx} anchor={menu.anchor} onClose={closeMenu} />
      )}
      {menuTab && menu && (
        <TabContextMenu
          container={container}
          tab={menuTab}
          ctx={ctx}
          anchor={menu.anchor}
          onClose={closeMenu}
          onCloseTab={(tab, anchor) => void onCloseTab(tab, anchor)}
        />
      )}
      {menu?.kind === 'force' && (
        <Popover anchor={menu.anchor} onClose={closeMenu}>
          <div style={{ padding: '6px 10px', maxWidth: 220 }}>
            “{menu.label}” could not confirm it is safe to close.
          </div>
          <MenuItem
            onSelect={() => {
              ctx.engine.removeTab(menu.tabId);
              closeMenu();
            }}
          >
            Force close
          </MenuItem>
          <MenuItem onSelect={closeMenu}>Cancel</MenuItem>
        </Popover>
      )}
    </div>
  );
}
