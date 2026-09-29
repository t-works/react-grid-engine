/**
 * The engine root (PRD §5.1). The layout is **uncontrolled**: `defaultLayout`
 * in, writes through the ref handle. Renders inline styles only — no stylesheet
 * (D9). No DOM access at module scope; ids are minted in handlers, never during
 * render (FR-19).
 */
import { forwardRef, Fragment, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  GridEngineHandle,
  TabColorChangeHandler,
  TabConfigChangeHandler,
  TabEventHandler,
} from './api';
import type { Node, Layout, Tab } from './layout/types';
import type { PanelRegistry } from './registry';
import { createId } from './ids';
import { parseLayout } from './layout/serialize';
import {
  addTab as addTabOp,
  focusTab as focusTabOp,
  moveContainer as moveContainerOp,
  moveTab as moveTabOp,
  removeTab as removeTabOp,
  resizeSplit as resizeSplitOp,
  resolveNewTabConfig,
  setTabConfig as setTabConfigOp,
  updateTab as updateTabOp,
} from './layout/ops';
import type { ChromeCtx } from './chrome/Container';
import { Container } from './chrome/Container';
import { Split } from './chrome/Split';
import { Splitter } from './chrome/Splitter';
import { chrome } from './chrome/styles';
import { useDrag } from './dnd/useDrag';

/** Props of the engine root. Callbacks are opt-in; no state is pushed back in. */
export interface GridEngineProps {
  /** Read once, on mount. Parsed and normalized. */
  defaultLayout: Layout;
  /** App-supplied catalogue, never serialized (FR-16). */
  registry: PanelRegistry;
  onTabEvent?: TabEventHandler;
  onTabConfigChange?: TabConfigChangeHandler;
  onTabColorChange?: TabColorChangeHandler;
  /** Preset swatches for the tab-color popover. Defaults to the themed set. */
  tabColorPalette?: readonly string[];
  className?: string;
  style?: CSSProperties;
}

/** The host gets this via the ref; every tab component gets the same object. */
export const GridEngine = forwardRef<GridEngineHandle, GridEngineProps>(function GridEngine(
  {
    defaultLayout,
    registry,
    onTabEvent,
    onTabConfigChange,
    onTabColorChange,
    tabColorPalette,
    className,
    style,
  },
  ref,
) {
  const [layout, setLayout] = useState<Layout>(() => parseLayout(defaultLayout, defaultLayout));
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Latest props/callbacks, read by the stable handle (created once).
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const callbacksRef = useRef({ onTabEvent, onTabConfigChange });
  callbacksRef.current = { onTabEvent, onTabConfigChange };
  /** Monotonic config revision per tab (§5.2). Runtime-only. */
  const revsRef = useRef(new Map<string, number>());

  const engineRef = useRef<GridEngineHandle | null>(null);
  const commit = (next: Layout): void => {
    layoutRef.current = next;
    setLayout(next);
  };
  if (engineRef.current === null) {
    engineRef.current = {
      addTab(p) {
        const tab: Tab = {
          id: createId(),
          component: p.component,
          config: resolveNewTabConfig(registryRef.current, p.component, p.config),
        };
        if (p.title !== undefined) tab.title = p.title;
        if (p.color !== undefined) tab.color = p.color;
        const splitting = p.target?.kind === 'split';
        commit(
          addTabOp(layoutRef.current, tab, {
            target: p.target,
            activate: p.activate,
            newContainerId: splitting ? createId() : undefined,
            newSplitId: splitting ? createId() : undefined,
          }),
        );
        return tab.id;
      },
      removeTab(id) {
        commit(removeTabOp(layoutRef.current, id));
      },
      updateTab(id, patch) {
        commit(updateTabOp(layoutRef.current, id, patch));
      },
      moveTab(id, target) {
        commit(
          moveTabOp(layoutRef.current, id, target, {
            newContainerId: target.kind === 'split' ? createId() : undefined,
            newSplitId: target.kind === 'split' ? createId() : undefined,
          }),
        );
      },
      setTabConfig(id, config, rev) {
        const current = revsRef.current.get(id) ?? 0;
        if (rev !== undefined && rev <= current) return;
        revsRef.current.set(id, rev ?? current + 1);
        commit(setTabConfigOp(layoutRef.current, id, config));
      },
      focusTab(id) {
        commit(focusTabOp(layoutRef.current, id));
      },
      getLayout() {
        return layoutRef.current;
      },
    };
  }
  const engine = engineRef.current;
  useImperativeHandle(ref, () => engine, []);

  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useDrag(rootRef, {
    onDropTab: (tabId, target) => engine.moveTab(tabId, target),
    onDropContainer: (containerId, target) => {
      commit(
        moveContainerOp(layoutRef.current, containerId, target, {
          newSplitId: target.kind === 'split' ? createId() : undefined,
        }),
      );
    },
  });

  const ctx: ChromeCtx = {
    registry,
    engine,
    onTabEvent,
    onTabConfigChange,
    onTabColorChange,
    tabColorPalette,
    getRev: (tabId) => revsRef.current.get(tabId) ?? 0,
    resize: (splitId, index, weight) => {
      commit(resizeSplitOp(layoutRef.current, splitId, index, weight));
    },
  };

  return (
    <div
      ref={rootRef}
      {...drag.handlers}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      <NodeView node={layout.root} ctx={ctx} />
      {drag.preview && (
        <div
          data-twge-drop-preview
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            boxSizing: 'border-box',
            background: chrome('drop-bg', 'rgba(59, 130, 246, 0.12)'),
            border: `${chrome('border-width', '1px')} dashed ${chrome('drop-border-color', '#3b82f6')}`,
            ...drag.preview,
          }}
        />
      )}
      {drag.sprite && (
        <div
          data-twge-drag-sprite
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            transform: `translate(${drag.sprite.x}px, ${drag.sprite.y}px)`,
            pointerEvents: 'none',
            zIndex: 1000,
            padding: '4px 10px',
            borderRadius: 4,
            background: chrome('tab-active-bg', '#fff'),
            color: chrome('titlebar-fg', '#374151'),
            border: `1px solid ${chrome('border-color', '#d4d4d4')}`,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            opacity: 0.9,
            whiteSpace: 'nowrap',
          }}
        >
          {drag.sprite.label}
        </div>
      )}
    </div>
  );
});

function NodeView({ node, ctx }: { node: Node; ctx: ChromeCtx }) {
  if (node.type === 'container') return <Container container={node} ctx={ctx} />;
  return (
    <Split axis={node.axis} weight={node.weight}>
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <Splitter split={node} index={i - 1} onResize={ctx.resize} />}
          <NodeView node={child} ctx={ctx} />
        </Fragment>
      ))}
    </Split>
  );
}
