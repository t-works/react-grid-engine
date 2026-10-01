/**
 * Task 09 gate — events out, imperative writes in, no echo (PRD §5.2, §6.5;
 * FR-17/FR-18; §9.4, §9.8).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GridEngine, parseLayout, serializeLayout } from '../src/index';
import type {
  GridEngineHandle,
  Layout,
  LayoutChangeHandler,
  PanelComponentDef,
  PanelComponentProps,
  PanelRegistry,
  Tab,
  TabConfigChangeHandler,
} from '../src/index';
import { findContainer, findTab } from '../src/layout/ops';

// --- fixtures ----------------------------------------------------------------

function Panel({ config, tabId, requestConfigChange }: PanelComponentProps<{ n?: number }>) {
  return (
    <div data-testid={`panel-${tabId}`}>
      <span data-testid={`n-${tabId}`}>{String(config.n ?? 0)}</span>
      <button
        type="button"
        data-testid={`bump-${tabId}`}
        onClick={() => requestConfigChange({ n: (config.n ?? 0) + 1 })}
      >
        bump
      </button>
    </div>
  );
}

const def: PanelComponentDef = { component: Panel, title: () => 'fallback' };
const registry: PanelRegistry = { text: def };

const tab = (id: string, extra: Partial<Tab> = {}): Tab => ({
  id,
  component: 'text',
  title: id.toUpperCase(),
  config: {},
  ...extra,
});

const layoutOf = (aTabs: Tab[]): Layout => ({
  version: 1,
  activeContainerId: 'A',
  root: {
    type: 'split',
    id: 's0',
    axis: 'row',
    children: [
      { type: 'container', id: 'A', weight: 1, activeTabId: aTabs[0]?.id ?? '', tabs: aTabs },
      { type: 'container', id: 'B', weight: 1, activeTabId: 'b1', tabs: [tab('b1')] },
    ],
  },
});

const emptyRoot: Layout = {
  version: 1,
  root: { type: 'container', id: 'A', activeTabId: '', tabs: [] },
};

const twoTabs = layoutOf([tab('a1'), tab('a2')]);

interface Mounted {
  ref: { current: GridEngineHandle | null };
  onLayout: ReturnType<typeof vi.fn>;
  onConfig: ReturnType<typeof vi.fn>;
  calls: ReturnType<typeof vi.fn>[];
}

const mount = (
  layout: Layout = twoTabs,
  handlers: { onLayout?: LayoutChangeHandler; onConfig?: TabConfigChangeHandler; palette?: string[] } = {},
): Mounted => {
  const ref = { current: null as GridEngineHandle | null };
  const onLayout = vi.fn(handlers.onLayout);
  const onConfig = vi.fn(handlers.onConfig);
  render(
    <StrictMode>
      <GridEngine
        ref={ref}
        defaultLayout={layout}
        registry={registry}
        onLayoutChange={onLayout}
        onTabConfigChange={onConfig}
        tabColorPalette={handlers.palette}
      />
    </StrictMode>,
  );
  return { ref, onLayout, onConfig, calls: [onLayout] };
};

const configOf = (handle: GridEngineHandle, tabId: string): unknown =>
  findTab(handle.getLayout().root, tabId)?.tab.config;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

beforeEach(() => vi.stubGlobal('PointerEvent', MouseEvent));

// --- §9.8 + stale calls ------------------------------------------------------

describe('§9.8 — missing ids and stale calls are silent', () => {
  test('every handle method no-ops on an unknown id, without throwing or emitting', () => {
    const { ref, onLayout } = mount();

    expect(() => {
      ref.current!.removeTab('ghost');
      ref.current!.updateTab('ghost', { title: 'x' });
      ref.current!.moveTab('ghost', { kind: 'tab', containerId: 'A' });
      ref.current!.setTabConfig('ghost', { n: 1 }, 99);
      ref.current!.focusTab('ghost');
    }).not.toThrow();

    expect(onLayout).not.toHaveBeenCalled();
  });

  test('a call with nothing to change is a no-op', () => {
    const { ref, onLayout } = mount();
    ref.current!.focusTab('a1'); // already the active tab
    expect(onLayout).not.toHaveBeenCalled();
  });

  test('the returned id survives save/load', () => {
    const { ref } = mount(emptyRoot);
    const id = ref.current!.addTab({ component: 'text', config: { n: 7 } });

    const reloaded = parseLayout(serializeLayout(ref.current!.getLayout()), emptyRoot);
    expect(findTab(reloaded.root, id)?.tab.config).toEqual({ n: 7 });
  });
});

// --- §9.4 --------------------------------------------------------------------

describe('§9.4 — addTab targeting', () => {
  test('no target appends to the active container and activates the new tab', () => {
    const { ref, onLayout } = mount();
    const id = ref.current!.addTab({ component: 'text' });

    const container = findContainer(ref.current!.getLayout().root, 'A');
    expect(container?.tabs.map((t) => t.id)).toEqual(['a1', 'a2', id]);
    expect(container?.activeTabId).toBe(id);
    expect(onLayout).toHaveBeenCalledTimes(1);
    expect(onLayout.mock.calls[0]?.[1]).toMatchObject({
      action: 'add-tab',
      tabId: id,
      containerId: 'A',
      programmatic: true,
    });
  });

  test('an empty layout grows its root', () => {
    const { ref } = mount(emptyRoot);
    const id = ref.current!.addTab({ component: 'text' });
    const root = ref.current!.getLayout().root;
    expect(root.type).toBe('container');
    expect(findTab(root, id)).toBeTruthy();
  });
});

// --- onLayoutChange ----------------------------------------------------------

describe('onLayoutChange', () => {
  test('fires once per committed change with the right action', () => {
    const { ref, onLayout } = mount();
    const id = ref.current!.addTab({ component: 'text' });
    expect(onLayout).toHaveBeenCalledTimes(1);

    ref.current!.removeTab(id);
    expect(onLayout).toHaveBeenCalledTimes(2);
    expect(onLayout.mock.calls[1]?.[1]).toMatchObject({
      action: 'remove-tab',
      tabId: id,
      programmatic: true,
    });
  });

  test('carries the flow actions: set-color, set-title, set-config, reorder, focus', () => {
    const { ref, onLayout } = mount();
    ref.current!.updateTab('a2', { color: '#e11' });
    ref.current!.updateTab('a2', { title: 'renamed' });
    ref.current!.setTabConfig('a2', { n: 3 });
    ref.current!.moveTab('a2', { kind: 'tab', containerId: 'A', index: 0 });
    ref.current!.focusTab('a2');

    expect(onLayout.mock.calls.map(([, meta]) => meta.action)).toEqual([
      'set-color',
      'set-title',
      'set-config',
      'reorder-tab',
      'focus',
    ]);
    expect(onLayout.mock.calls.every(([, meta]) => meta.programmatic === true)).toBe(true);
  });

  test('a chrome gesture reports programmatic: false', () => {
    const { ref, onLayout } = mount(twoTabs, { palette: ['#e11'] });

    // Focus an inactive tab through the title bar.
    fireEvent.click(screen.getByRole('tab', { name: 'A2' }));
    expect(onLayout.mock.calls.at(-1)?.[1]).toMatchObject({
      action: 'focus',
      tabId: 'a2',
      programmatic: false,
    });

    // Pick a swatch.
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'A2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tab color' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: '#e11' }));
    expect(onLayout.mock.calls.at(-1)?.[1]).toMatchObject({
      action: 'set-color',
      tabId: 'a2',
      programmatic: false,
    });
    expect(findTab(ref.current!.getLayout().root, 'a2')?.tab.color).toBe('#e11');
  });

  test('a splitter drag commits a resize', () => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 500,
      width: 1000,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    const { onLayout } = mount();
    const separator = screen.getByRole('separator');
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 700 });
    fireEvent.pointerUp(separator, { pointerId: 1 });

    expect(onLayout).toHaveBeenCalled();
    expect(onLayout.mock.calls.at(-1)?.[1]).toMatchObject({ action: 'resize', programmatic: false });
  });
});

// --- rev + config echo -------------------------------------------------------

describe('rev-stamped config', () => {
  test('a tab request reports upward and is never applied by the engine', () => {
    const { ref, onConfig } = mount();
    fireEvent.click(screen.getByTestId('bump-a1'));

    expect(onConfig).toHaveBeenCalledWith('a1', { n: 1 }, { rev: 1, source: 'tab' });
    expect(configOf(ref.current!, 'a1')).toEqual({});
    expect(screen.getByTestId('n-a1').textContent).toBe('0');
  });

  test('a stale rev is ignored; a newer one is accepted and reported as "app"', () => {
    const { ref, onConfig } = mount();

    ref.current!.setTabConfig('a1', { n: 2 }, 5);
    expect(configOf(ref.current!, 'a1')).toEqual({ n: 2 });
    expect(onConfig).toHaveBeenLastCalledWith('a1', { n: 2 }, { rev: 5, source: 'app' });

    ref.current!.setTabConfig('a1', { n: 3 }, 5);
    expect(configOf(ref.current!, 'a1')).toEqual({ n: 2 });

    ref.current!.setTabConfig('a1', { n: 4 }, 6);
    expect(configOf(ref.current!, 'a1')).toEqual({ n: 4 });
    expect(onConfig).toHaveBeenLastCalledWith('a1', { n: 4 }, { rev: 6, source: 'app' });

    // No rev: the engine stamps the next one.
    ref.current!.setTabConfig('a1', { n: 5 });
    expect(onConfig).toHaveBeenLastCalledWith('a1', { n: 5 }, { rev: 7, source: 'app' });
  });

  test('revs are runtime-only — never serialized', () => {
    const { ref } = mount();
    ref.current!.setTabConfig('a1', { n: 2 }, 9);
    expect(JSON.stringify(serializeLayout(ref.current!.getLayout()))).not.toContain('rev');
  });
});
