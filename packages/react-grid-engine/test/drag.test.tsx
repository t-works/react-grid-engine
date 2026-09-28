import { cleanup, fireEvent, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GridEngine } from '../src/index';
import type {
  ContainerNode,
  GridEngineHandle,
  Layout,
  PanelComponentDef,
  PanelRegistry,
  SplitNode,
  Tab,
} from '../src/index';
import { findContainer } from '../src/layout/ops';

// --- fixtures ----------------------------------------------------------------

const registry: PanelRegistry = {
  text: {
    component: ({ tabId }) => <div data-testid={`panel-${tabId}`} />,
    title: () => 'fallback',
  } satisfies PanelComponentDef,
};

const tab = (id: string): Tab => ({ id, component: 'text', title: id.toUpperCase(), config: {} });

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

const twoTabs = layoutOf([tab('a1'), tab('a2')]);
const oneTab = layoutOf([tab('a1')]);

const rect = (left: number, top: number, right: number, bottom: number): DOMRect =>
  ({
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

/** jsdom lays nothing out — hand every element a viewport rect. */
function paintGeometry(container: HTMLElement): void {
  const set = (selector: string, r: DOMRect): void => {
    const el = container.querySelector(selector);
    if (el) el.getBoundingClientRect = () => r;
  };
  const root = container.firstElementChild;
  if (root) root.getBoundingClientRect = () => rect(0, 0, 1000, 600);
  set('[data-twge-container="A"]', rect(0, 0, 500, 600));
  set('[data-twge-container="B"]', rect(500, 0, 1000, 600));
  set('[data-twge-titlebar="A"]', rect(0, 0, 500, 28));
  set('[data-twge-titlebar="B"]', rect(500, 0, 1000, 28));
  set('[data-twge-tab-id="a1"]', rect(0, 0, 60, 28));
  set('[data-twge-tab-id="a2"]', rect(60, 0, 120, 28));
  set('[data-twge-tab-id="b1"]', rect(500, 0, 560, 28));
}

const mount = (layout: Layout) => {
  const ref = { current: null as GridEngineHandle | null };
  const utils = render(
    <StrictMode>
      <GridEngine ref={ref} defaultLayout={layout} registry={registry} />
    </StrictMode>,
  );
  return { ref, ...utils };
};

const tabIds = (handle: GridEngineHandle, containerId: string): string[] =>
  findContainer(handle.getLayout().root, containerId)?.tabs.map((t) => t.id) ?? [];

const press = (el: Element): void => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 30, clientY: 14 });
};
const move = (el: Element, x: number, y: number): void => {
  fireEvent.pointerMove(el, { pointerId: 1, clientX: x, clientY: y });
};
const drop = (el: Element, x: number, y: number): void => {
  fireEvent.pointerUp(el, { pointerId: 1, clientX: x, clientY: y });
};

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanup();
});

// --- test gate ---------------------------------------------------------------

describe('drag layer (task 06)', () => {
  test('FR-4: a tab dragged along its own title bar reorders', () => {
    const { container, ref } = mount(twoTabs);
    paintGeometry(container);
    const a1 = container.querySelector('[data-twge-tab-id="a1"]')!;

    press(a1);
    move(a1, 95, 14); // right of a2's midpoint
    drop(a1, 95, 14);

    expect(tabIds(ref.current!, 'A')).toEqual(['a2', 'a1']);
  });

  test('FR-5: a center drop tabifies and the emptied source collapses', () => {
    const { container, ref } = mount(oneTab);
    paintGeometry(container);
    const a1 = container.querySelector('[data-twge-tab-id="a1"]')!;

    press(a1);
    move(a1, 750, 300); // center of B
    drop(a1, 750, 300);

    const root = ref.current!.getLayout().root as ContainerNode;
    expect(root.type).toBe('container');
    expect(root.id).toBe('B');
    expect(tabIds(ref.current!, 'B')).toEqual(['b1', 'a1']);
  });

  test('FR-6: an edge drop splits 50/50 into a new sibling', () => {
    const { container, ref } = mount(oneTab);
    paintGeometry(container);
    const a1 = container.querySelector('[data-twge-tab-id="a1"]')!;

    press(a1);
    move(a1, 990, 300); // right edge of B
    drop(a1, 990, 300);

    const root = ref.current!.getLayout().root as SplitNode;
    expect(root.axis).toBe('row');
    expect(root.children.map((c) => c.id)[0]).toBe('B');
    const incoming = root.children[1]!;
    expect(incoming.type).toBe('container');
    expect(incoming.weight).toBe(1);
    expect(root.children[0]!.weight).toBe(1);
    expect(tabIds(ref.current!, incoming.id)).toEqual(['a1']);
  });

  test('A5: a drop on the outer border resolves to the edge underneath', () => {
    const { container, ref } = mount(oneTab);
    paintGeometry(container);
    const a1 = container.querySelector('[data-twge-tab-id="a1"]')!;

    press(a1);
    move(a1, 1020, 300); // beyond B's right edge, inside no container
    drop(a1, 1020, 300);

    const root = ref.current!.getLayout().root as SplitNode;
    expect(root.children[0]!.id).toBe('B');
    expect(root.children[1]!.type).toBe('container');
  });

  test('a preview is shown, pointermove never commits, Esc cancels', () => {
    const { container, ref } = mount(oneTab);
    paintGeometry(container);
    const a1 = container.querySelector('[data-twge-tab-id="a1"]')!;
    const before = JSON.stringify(ref.current!.getLayout());

    press(a1);
    move(a1, 750, 300);
    expect(container.querySelector('[data-twge-drop-preview]')).not.toBeNull();
    expect(JSON.stringify(ref.current!.getLayout())).toBe(before);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('[data-twge-drop-preview]')).toBeNull();

    drop(a1, 750, 300);
    expect(JSON.stringify(ref.current!.getLayout())).toBe(before);
  });

  test('the preview outlines the target for center and the new region for an edge', () => {
    const { container } = mount(oneTab);
    paintGeometry(container);
    const a1 = container.querySelector('[data-twge-tab-id="a1"]')!;

    press(a1);
    move(a1, 750, 300);
    const center = container.querySelector<HTMLElement>('[data-twge-drop-preview]')!;
    expect(center.style.left).toBe('500px');
    expect(center.style.width).toBe('500px');

    move(a1, 990, 300);
    const edge = container.querySelector<HTMLElement>('[data-twge-drop-preview]')!;
    expect(edge.style.left).toBe('750px');
    expect(edge.style.width).toBe('250px');
  });

  test('FR-8: a title-bar background drag moves the whole container', () => {
    const { container, ref } = mount(twoTabs);
    paintGeometry(container);
    const aBar = container.querySelector('[data-twge-titlebar="A"]')!;

    fireEvent.pointerDown(aBar, { pointerId: 1, clientX: 300, clientY: 14 });
    move(aBar, 750, 300); // center of B
    drop(aBar, 750, 300);

    const root = ref.current!.getLayout().root as ContainerNode;
    expect(root.type).toBe('container');
    expect(root.id).toBe('B');
    expect(tabIds(ref.current!, 'B')).toEqual(['b1', 'a1', 'a2']);
  });

  test('legacy mouse input is inert — Pointer Events only', () => {
    const { container, ref } = mount(oneTab);
    paintGeometry(container);
    const a1 = container.querySelector('[data-twge-tab-id="a1"]')!;
    const before = JSON.stringify(ref.current!.getLayout());

    fireEvent.mouseDown(a1, { clientX: 30, clientY: 14 });
    fireEvent.mouseMove(a1, { clientX: 750, clientY: 300 });
    fireEvent.mouseUp(a1, { clientX: 750, clientY: 300 });

    expect(container.querySelector('[data-twge-drop-preview]')).toBeNull();
    expect(JSON.stringify(ref.current!.getLayout())).toBe(before);
  });

  test('a click without movement still focuses the tab', () => {
    const { container } = mount(twoTabs);
    paintGeometry(container);
    const a2 = container.querySelector('[data-twge-tab-id="a2"]')!;

    press(a2);
    drop(a2, 30, 14);
    fireEvent.click(a2);

    // No capture before the threshold, so the browser still delivers the click.
    expect(Element.prototype.setPointerCapture).not.toHaveBeenCalled();
    expect(a2.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-twge-drop-preview]')).toBeNull();
  });
});
