import { memo, useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { ContainerNode, Tab } from '../layout/types';
import type { ChromeCtx } from './Container';
import type { PanelComponentDef } from '../registry';
import { MissingComponent } from './MissingComponent';
import { chrome, panelDomId, tabDomId } from './styles';

/**
 * The content box (FR-3, FR-21): exactly one tab visible, filling it, overflow
 * scrolling inside. Inactive tabs unmount unless the registry opts into
 * `keepMountedWhenInactive` (FR-24).
 */
export function PanelHost({ container, ctx }: { container: ContainerNode; ctx: ChromeCtx }) {
  // Latest ctx, behind a stable ref: the memoized slots below must not re-render
  // just because the app tree above them did (§9.10).
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

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
            <TabContent tab={tab} def={ctx.registry[tab.component]} ctxRef={ctxRef} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * One tab's component. `memo` plus callbacks that are stable per tab id keep a
 * memoized tab component from re-rendering when a sibling moves, resizes or
 * recolors (§9.10) — `def`, `config` and `tabId` are the only reactive inputs.
 */
const TabContent = memo(function TabContent({
  tab,
  def,
  ctxRef,
}: {
  tab: Tab;
  def: PanelComponentDef | undefined;
  ctxRef: MutableRefObject<ChromeCtx>;
}) {
  const { id: tabId, config } = tab;
  const emit = useCallback<(type: string, payload?: unknown) => void>(
    (type, payload) => ctxRef.current.onTabEvent?.(tabId, type, payload),
    [ctxRef, tabId],
  );
  const requestConfigChange = useCallback(
    (patch: unknown) =>
      ctxRef.current.onTabConfigChange?.(tabId, patch, {
        rev: ctxRef.current.getRev(tabId) + 1,
        source: 'tab',
      }),
    [ctxRef, tabId],
  );

  if (!def) return <MissingComponent component={tab.component} />;
  const Component = def.component;
  return (
    <Component
      config={config}
      tabId={tabId}
      emit={emit}
      requestConfigChange={requestConfigChange}
      engine={ctxRef.current.engine}
    />
  );
});
