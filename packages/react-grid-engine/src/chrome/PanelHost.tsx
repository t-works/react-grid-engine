import type { ContainerNode } from '../layout/types';
import type { ChromeCtx } from './Container';
import { MissingComponent } from './MissingComponent';
import { chrome, panelDomId, tabDomId } from './styles';

/**
 * The content box (FR-3, FR-21): exactly one tab visible, filling it, overflow
 * scrolling inside. Inactive tabs unmount unless the registry opts into
 * `keepMountedWhenInactive` (FR-24).
 */
export function PanelHost({ container, ctx }: { container: ContainerNode; ctx: ChromeCtx }) {
  const activeTab =
    container.tabs.find((tab) => tab.id === container.activeTabId) ?? container.tabs[0];

  const mounted = container.tabs.filter(
    (tab) =>
      tab.id === activeTab?.id || ctx.registry[tab.component]?.keepMountedWhenInactive === true,
  );

  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        minHeight: 0,
        overflow: 'auto',
        padding: chrome('padding', '0'),
        background: chrome('tab-active-bg', '#fff'),
      }}
    >
      {mounted.map((tab) => {
        const def = ctx.registry[tab.component];
        const isActive = tab.id === activeTab?.id;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelDomId(tab.id)}
            aria-labelledby={tabDomId(tab.id)}
            hidden={!isActive}
            style={{ width: '100%', height: '100%' }}
          >
            {def ? (
              <def.component
                config={tab.config}
                tabId={tab.id}
                emit={(type, payload) => ctx.onTabEvent?.(tab.id, type, payload)}
                requestConfigChange={(patch) =>
                  ctx.onTabConfigChange?.(tab.id, patch, {
                    rev: ctx.getRev(tab.id),
                    source: 'tab',
                  })
                }
                engine={ctx.engine}
              />
            ) : (
              <MissingComponent component={tab.component} />
            )}
          </div>
        );
      })}
    </div>
  );
}
