import { describe, expect, test } from 'vitest';
import { createId } from '../src/ids';
import {
  addTab,
  containsNode,
  defaultTarget,
  findContainer,
  findTab,
  firstContainer,
  focusContainer,
  isEmptyLayout,
  MIN_WEIGHT,
  moveContainer,
  moveTab,
  normalize,
  reorderTab,
  removeTab,
  resizeSplit,
  resolveNewTabConfig,
  splitContainer,
} from '../src/layout/ops';
import type {
  ContainerNode,
  Layout,
  Node,
  PanelComponentDef,
  SplitNode,
  Tab,
} from '../src/index';

// --- fixtures ----------------------------------------------------------------

const tab = (id: string): Tab => ({ id, component: 'x', config: {} });

function container(
  id: string,
  tabIds: string[],
  opts: { activeTabId?: string; weight?: number } = {},
): ContainerNode {
  return {
    type: 'container',
    id,
    ...(opts.weight === undefined ? {} : { weight: opts.weight }),
    activeTabId: opts.activeTabId ?? tabIds[0] ?? '',
    tabs: tabIds.map(tab),
  };
}

function split(id: string, axis: SplitNode['axis'], children: Node[], weight?: number): SplitNode {
  return { type: 'split', id, axis, ...(weight === undefined ? {} : { weight }), children };
}

const layoutOf = (root: Node, activeContainerId?: string): Layout =>
  activeContainerId === undefined ? { version: 1, root } : { version: 1, root, activeContainerId };

const twoTabs = layoutOf(container('A', ['a1', 'a2']), 'A');
const rowAB = layoutOf(split('s1', 'row', [container('A', ['a1']), container('B', ['b1'])]), 'A');

const child = (node: Node, index: number): Node => {
  if (node.type !== 'split') throw new Error('not a split');
  const found = node.children[index];
  if (!found) throw new Error(`no child ${index}`);
  return found;
};

// --- invariants --------------------------------------------------------------

describe('invariants (§5.1 rule 4)', () => {
  test('single-child split is spliced out and keeps the split weight', () => {
    const layout = layoutOf(split('s1', 'column', [container('A', ['a1'])], 3));
    const root = normalize(layout).root;
    expect(root.type).toBe('container');
    expect(root.id).toBe('A');
    expect(root.weight).toBe(3);
  });

  test('a split always has >= 2 children after removal', () => {
    const layout = layoutOf(
      split('s1', 'row', [
        container('A', ['a1']),
        split('s2', 'column', [container('B', ['b1']), container('C', ['c1'])]),
      ]),
      'A',
    );
    const root = removeTab(layout, 'b1').root as SplitNode;
    expect(root.type).toBe('split');
    expect(root.children).toHaveLength(2);
    expect(root.children.map((c) => c.id)).toEqual(['A', 'C']);
  });

  test('last tab of a non-root container collapses it', () => {
    const root = removeTab(rowAB, 'b1').root;
    expect(root).toMatchObject({ type: 'container', id: 'A' });
  });

  test('last tab of the root leaves an empty root', () => {
    const single = layoutOf(container('A', ['a1']), 'A');
    const out = removeTab(single, 'a1');
    expect(out.root).toMatchObject({ type: 'container', id: 'A', tabs: [], activeTabId: '' });
    expect(isEmptyLayout(out)).toBe(true);
  });

  test('dangling active references are repaired, not rejected', () => {
    const layout = layoutOf(
      split('s', 'row', [
        container('A', ['a1'], { activeTabId: 'ghost' }),
        container('B', ['b1']),
      ]),
      'ghost-container',
    );
    const out = normalize(layout);
    expect(out.activeContainerId).toBe('A');
    expect((out.root as SplitNode).children[0]).toMatchObject({ activeTabId: 'a1' });
  });
});

// --- add ---------------------------------------------------------------------

describe('addTab', () => {
  test('no target appends to the active container and activates the tab', () => {
    const out = addTab(twoTabs, tab('a3'));
    const target = findContainer(out.root, 'A');
    expect(target?.tabs.map((t) => t.id)).toEqual(['a1', 'a2', 'a3']);
    expect(target?.activeTabId).toBe('a3');
  });

  test('no active container falls back to the first in tree order', () => {
    const out = addTab(layoutOf(rowAB.root), tab('a2'));
    expect(findContainer(out.root, 'A')?.tabs.map((t) => t.id)).toEqual(['a1', 'a2']);
  });

  test('empty layout creates the root container', () => {
    const empty = layoutOf(container('root', []));
    expect(defaultTarget(empty)).toEqual({ kind: 'root' });
    const out = addTab(empty, tab('t1'));
    expect(out.root).toMatchObject({ type: 'container', id: 'root', activeTabId: 't1' });
    expect(out.activeContainerId).toBe('root');
  });

  test('split target creates a 50/50 sibling that inherits the target weight', () => {
    const layout = layoutOf(
      split('s1', 'row', [container('A', ['a1'], { weight: 2 }), container('B', ['b1'])]),
      'A',
    );
    const out = addTab(layout, tab('a2'), {
      target: { kind: 'split', containerId: 'A', edge: 'right' },
      newContainerId: 'C',
      newSplitId: 's2',
    });
    const s2 = child(out.root, 0) as SplitNode;
    expect(s2.id).toBe('s2');
    expect(s2.weight).toBe(2);
    expect(s2.children.map((c) => c.id)).toEqual(['A', 'C']);
    expect(s2.children.map((c) => c.weight)).toEqual([1, 1]);
    expect(findContainer(out.root, 'C')?.tabs.map((t) => t.id)).toEqual(['a2']);
    expect(out.activeContainerId).toBe('C');
  });
});

// --- remove / reorder --------------------------------------------------------

describe('removeTab / reorderTab', () => {
  test('missing id is a no-op', () => {
    expect(removeTab(rowAB, 'nope')).toBe(rowAB);
    expect(reorderTab(rowAB, 'nope', 0)).toBe(rowAB);
  });

  test('reorder moves within the container; out-of-range is a no-op', () => {
    const out = reorderTab(twoTabs, 'a2', 0);
    expect(findContainer(out.root, 'A')?.tabs.map((t) => t.id)).toEqual(['a2', 'a1']);
    expect(reorderTab(twoTabs, 'a1', 5)).toBe(twoTabs);
  });

  test('closing the active tab activates a neighbour', () => {
    const out = removeTab(twoTabs, 'a1');
    expect(findContainer(out.root, 'A')).toMatchObject({ activeTabId: 'a2' });
  });
});

// --- move tab ----------------------------------------------------------------

describe('moveTab', () => {
  test('tabify joins the target and collapses an emptied source', () => {
    const out = moveTab(rowAB, 'a1', { kind: 'tab', containerId: 'B' });
    expect(out.root).toMatchObject({ type: 'container', id: 'B', activeTabId: 'a1' });
    expect(findContainer(out.root, 'B')?.tabs.map((t) => t.id)).toEqual(['b1', 'a1']);
  });

  test('a drop on the same container center is a reorder', () => {
    const out = moveTab(twoTabs, 'a1', { kind: 'tab', containerId: 'A', index: 1 });
    expect(findContainer(out.root, 'A')?.tabs.map((t) => t.id)).toEqual(['a2', 'a1']);
  });

  test('A4: the only tab dropped on its own edge is a no-op', () => {
    const single = layoutOf(container('A', ['a1']), 'A');
    const out = moveTab(
      single,
      'a1',
      { kind: 'split', containerId: 'A', edge: 'right' },
      { newContainerId: 'C', newSplitId: 's2' },
    );
    expect(out).toBe(single);
  });

  test('a non-only tab dropped on its own edge splits it off', () => {
    const out = moveTab(
      twoTabs,
      'a2',
      { kind: 'split', containerId: 'A', edge: 'bottom' },
      { newContainerId: 'C', newSplitId: 's2' },
    );
    const root = out.root as SplitNode;
    expect(root.axis).toBe('column');
    expect(root.children.map((c) => c.id)).toEqual(['A', 'C']);
    expect(findContainer(out.root, 'A')?.tabs.map((t) => t.id)).toEqual(['a1']);
    expect(findContainer(out.root, 'C')?.tabs.map((t) => t.id)).toEqual(['a2']);
  });
});

// --- move container ----------------------------------------------------------

describe('moveContainer', () => {
  test('A4: dropping a container onto itself is a no-op', () => {
    expect(moveContainer(rowAB, 'A', { kind: 'tab', containerId: 'A' })).toBe(rowAB);
    expect(
      moveContainer(rowAB, 'A', { kind: 'split', containerId: 'A', edge: 'left' }),
    ).toBe(rowAB);
  });

  test('tabify merges the moved container tabs into the target', () => {
    const out = moveContainer(rowAB, 'A', { kind: 'tab', containerId: 'B' });
    expect(out.root).toMatchObject({ type: 'container', id: 'B', activeTabId: 'a1' });
    expect(findContainer(out.root, 'B')?.tabs.map((t) => t.id)).toEqual(['b1', 'a1']);
  });

  test('split places the moved container as a sibling', () => {
    const out = moveContainer(
      rowAB,
      'A',
      { kind: 'split', containerId: 'B', edge: 'right' },
      { newSplitId: 's2' },
    );
    const root = out.root as SplitNode;
    expect(root.axis).toBe('row');
    expect(root.children.map((c) => c.id)).toEqual(['B', 'A']);
  });

  test('moving the only container is a no-op', () => {
    const single = layoutOf(container('A', ['a1']), 'A');
    expect(moveContainer(single, 'A', { kind: 'tab', containerId: 'A' })).toBe(single);
  });
});

// --- resize / focus ----------------------------------------------------------

describe('resizeSplit / focusContainer', () => {
  test('weight is floored at 0.05', () => {
    const out = resizeSplit(rowAB, 's1', 0, 0.001);
    expect((out.root as SplitNode).children[0]?.weight).toBe(MIN_WEIGHT);
  });

  test('unknown split or index is a no-op', () => {
    expect(resizeSplit(rowAB, 'nope', 0, 1)).toBe(rowAB);
    expect(resizeSplit(rowAB, 's1', 9, 1)).toBe(rowAB);
  });

  test('focus sets a known container, ignores an unknown one', () => {
    expect(focusContainer(rowAB, 'B').activeContainerId).toBe('B');
    expect(focusContainer(rowAB, 'ghost')).toBe(rowAB);
  });
});

// --- tree queries ------------------------------------------------------------

describe('queries', () => {
  test('list/find/first and containsNode', () => {
    expect(firstContainer(rowAB.root)?.id).toBe('A');
    expect(findTab(rowAB.root, 'b1')).toMatchObject({ index: 0 });
    expect(containsNode(rowAB.root, 's1', 'B')).toBe(true);
    expect(containsNode(rowAB.root, 'A', 'B')).toBe(false);
  });
});

// --- config resolution (§6.5 / A11) ------------------------------------------

describe('new-tab config resolution', () => {
  const stub = () => null;
  const createDef: PanelComponentDef = { component: stub, createConfig: () => ({ items: [] }) };
  const defaultDef: PanelComponentDef = { component: stub, defaultConfig: { n: 1 } };

  test('order: explicit -> createConfig -> defaultConfig -> {}', () => {
    const explicit = { e: true };
    expect(resolveNewTabConfig({ a: createDef }, 'a', explicit)).toBe(explicit);
    expect(resolveNewTabConfig({ a: createDef }, 'a')).toEqual({ items: [] });
    expect(resolveNewTabConfig({ b: defaultDef }, 'b')).toBe(defaultDef.defaultConfig);
    expect(resolveNewTabConfig({ b: defaultDef }, 'b', { over: 1 })).toEqual({ over: 1 });
    expect(resolveNewTabConfig({}, 'missing')).toEqual({});
  });

  test('createConfig gives a fresh object per tab', () => {
    expect(resolveNewTabConfig({ a: createDef }, 'a')).not.toBe(
      resolveNewTabConfig({ a: createDef }, 'a'),
    );
  });
});

// --- purity / ids ------------------------------------------------------------

describe('purity', () => {
  test('ops never mutate their input', () => {
    const before = JSON.stringify(rowAB);
    removeTab(rowAB, 'b1');
    moveTab(rowAB, 'a1', { kind: 'tab', containerId: 'B' });
    splitContainer(rowAB, {
      containerId: 'A',
      edge: 'top',
      incoming: container('C', ['c1']),
      splitId: 's2',
    });
    expect(JSON.stringify(rowAB)).toBe(before);
  });

  test('createId mints distinct ids', () => {
    expect(createId()).not.toBe(createId());
  });
});
