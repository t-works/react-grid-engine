import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GridEngine, parseLayout, serializeLayout } from '../src/index';
import { MIN_WEIGHT } from '../src/layout/ops';
import type {
  GridEngineHandle,
  Layout,
  PanelComponentDef,
  PanelComponentProps,
  PanelRegistry,
  SplitNode,
} from '../src/index';

// --- fixtures ----------------------------------------------------------------

function TextPanel({ config, tabId }: PanelComponentProps<{ n?: number }>) {
  return (
    <div data-testid={`panel-${tabId}`} data-twge-text>
      n={String(config.n ?? 0)}
    </div>
  );
}

const textDef: PanelComponentDef = { component: TextPanel, title: () => 'fallback' };
const registry: PanelRegistry = { text: textDef };

const layout: Layout = {
  version: 1,
  activeContainerId: 'left',
  root: {
    type: 'split',
    id: 's0',
    axis: 'row',
    children: [
      {
        type: 'container',
        id: 'left',
        weight: 1,
        activeTabId: 'a',
        tabs: [
          { id: 'a', component: 'text', title: 'A', config: { n: 1 } },
          { id: 'b', component: 'text', title: 'B', config: { n: 2 } },
        ],
      },
      {
        type: 'container',
        id: 'right',
        weight: 1,
        activeTabId: 'c',
        tabs: [{ id: 'c', component: 'ghost', config: {} }],
      },
    ],
  },
};

const mount = (overrides: { registry?: PanelRegistry; layout?: Layout } = {}) =>
  render(
    <StrictMode>
      <GridEngine
        defaultLayout={overrides.layout ?? layout}
        registry={overrides.registry ?? registry}
      />
    </StrictMode>,
  );

afterEach(cleanup);

// --- test gate ---------------------------------------------------------------

describe('static render (task 04)', () => {
  test('StrictMode render smoke: no warnings, no NaN weights', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = mount();

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(container.innerHTML).not.toContain('NaN');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    error.mockRestore();
    warn.mockRestore();
  });

  test('fills the host and scrolls content inside the content box', () => {
    const { container } = mount();
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe('100%');
    expect(root.style.height).toBe('100%');
    expect(root.style.overflow).toBe('hidden');

    const panel = screen.getByRole('tabpanel', { name: 'A' });
    expect(panel.parentElement?.style.overflow).toBe('auto');
    expect(panel.style.width).toBe('100%');
    expect(panel.style.height).toBe('100%');
  });

  test('tablist / tab / tabpanel carry the aria wiring', () => {
    mount();
    expect(screen.getAllByRole('tablist')).toHaveLength(2);

    const tabA = screen.getByRole('tab', { name: 'A' });
    expect(tabA.getAttribute('aria-selected')).toBe('true');
    expect(tabA.getAttribute('aria-controls')).toBe('twge-panel-a');
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('false');

    const panel = screen.getByRole('tabpanel', { name: 'A' });
    expect(panel.id).toBe('twge-panel-a');
    expect(panel.getAttribute('aria-labelledby')).toBe('twge-tab-a');
  });

  test('unknown registry key renders the placeholder and the node survives', () => {
    const ref = { current: null as GridEngineHandle | null };
    render(
      <StrictMode>
        <GridEngine ref={ref} defaultLayout={layout} registry={registry} />
      </StrictMode>,
    );

    const placeholder = screen.getByText(/Missing component/);
    expect(placeholder.textContent).toContain('ghost');

    const saved = serializeLayout(ref.current!.getLayout());
    expect(saved).toContain('"ghost"');
    expect(serializeLayout(parseLayout(saved, layout))).toBe(saved);
  });

  test('keepMountedWhenInactive keeps inactive panels mounted; default unmounts', () => {
    const keeping: PanelRegistry = { text: { ...textDef, keepMountedWhenInactive: true } };
    const { container } = mount({ registry: keeping });
    expect(container.querySelector('#twge-panel-b')).not.toBeNull();
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(3);

    cleanup();
    const { container: unmounting } = mount();
    expect(unmounting.querySelector('#twge-panel-b')).toBeNull();
  });

  test('clicking an inactive tab makes it the visible one', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByRole('tabpanel', { name: 'B' }).id).toBe('twge-panel-b');
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('true');
  });
});

// --- splitters (task 05) -----------------------------------------------------

const childWeights = (handle: GridEngineHandle): (number | undefined)[] =>
  (handle.getLayout().root as SplitNode).children.map((child) => child.weight);

describe('splitters (task 05)', () => {
  // jsdom has no PointerEvent; MouseEvent supplies clientX and lets the test
  // carry `pointerId`.
  beforeEach(() => vi.stubGlobal('PointerEvent', MouseEvent));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const rect = (width: number, height: number): DOMRect =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  test('one separator per sibling gap; pointer-only and scroll-free', () => {
    mount();
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(1);
    expect(separators[0]?.getAttribute('aria-orientation')).toBe('vertical');
    expect(separators[0]?.style.touchAction).toBe('none');
    expect(separators[0]?.style.cursor).toBe('col-resize');
  });

  test('pointer drag resizes the pair, clamps to the 0.05 floor, keeps 100% fill', () => {
    const capture = vi.fn();
    const release = vi.fn();
    Element.prototype.setPointerCapture = capture;
    Element.prototype.releasePointerCapture = release;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(1000, 500));

    const ref = { current: null as GridEngineHandle | null };
    render(
      <StrictMode>
        <GridEngine ref={ref} defaultLayout={layout} registry={registry} />
      </StrictMode>,
    );
    const separator = screen.getByRole('separator');

    // Legacy mouse input must not resize anything (Pointer Events only).
    fireEvent.mouseDown(separator, { clientX: 500 });
    fireEvent.mouseMove(separator, { clientX: 900 });
    expect(childWeights(ref.current!)).toEqual([1, 1]);

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    expect(capture).toHaveBeenCalled();
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 700 });
    const moved = childWeights(ref.current!).map((w) => w ?? 1);
    expect(moved[0]).toBeCloseTo(1.4);
    expect(moved[1]).toBeCloseTo(0.6);

    // Past the floor: the dragged side stops at 0.05, the sibling keeps the rest.
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 9999 });
    const weights = childWeights(ref.current!).map((w) => w ?? 1);
    expect(weights[0]).toBeCloseTo(2 - MIN_WEIGHT);
    expect(weights[1]).toBeCloseTo(MIN_WEIGHT);

    // The pair still sums to its starting total, so the parent fills exactly.
    const shares = weights.map((w) => w / weights.reduce((a, b) => a + b, 0));
    expect(shares.reduce((a, b) => a + b, 0)).toBe(1);

    fireEvent.pointerUp(separator, { pointerId: 1 });
    expect(release).toHaveBeenCalled();
  });
});
