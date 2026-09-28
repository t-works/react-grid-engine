import type { ContainerNode } from '../layout/types';
import type { ChromeCtx } from './Container';
import { chrome, panelDomId, tabDomId } from './styles';

/** Title bar + tab strip (FR-3). The `+` control and menu arrive in 07. */
export function TitleBar({ container, ctx }: { container: ContainerNode; ctx: ChromeCtx }) {
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
        const label = tab.title ?? ctx.registry[tab.component]?.title?.(tab.config) ?? tab.component;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabDomId(tab.id)}
            data-twge-tab-id={tab.id}
            aria-selected={active}
            aria-controls={panelDomId(tab.id)}
            tabIndex={active ? 0 : -1}
            title={typeof label === 'string' ? label : undefined}
            onClick={() => ctx.engine.focusTab(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              border: 'none',
              borderRight: `${chrome('border-width', '1px')} solid ${chrome('border-color', '#d4d4d4')}`,
              background: active ? chrome('tab-active-bg', '#fff') : chrome('tab-bg', 'transparent'),
              color: 'inherit',
              font: 'inherit',
              cursor: 'pointer',
              touchAction: 'none',
              userSelect: 'none',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
