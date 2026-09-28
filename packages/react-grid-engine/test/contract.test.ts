/**
 * Compile-only contract test: every §9 acceptance criterion must be expressible
 * against the frozen public types. If a criterion cannot be written here, the
 * type is wrong (task 01 gate).
 *
 * Type aliases are intentionally unused — `tsc --noEmit` is the assertion.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, test } from 'vitest';
import type {
  AddTabParams,
  ContainerNode,
  DropTarget,
  GridEngineHandle,
  Layout,
  LayoutAction,
  LayoutChangeHandler,
  LayoutChangeMeta,
  Node,
  PanelComponentDef,
  PanelComponentProps,
  SplitNode,
  Tab,
  TabColorChangeHandler,
  TabConfigChangeHandler,
  TabConfigChangeMeta,
  TabEventHandler,
  UpdateTabPatch,
} from '../src/index';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type Expect<T extends true> = T;

// --- §9.1 reference tree row[column[c1,c2],c3] + identical JSON reload -------
const c1: ContainerNode = {
  type: 'container',
  id: 'c1',
  activeTabId: 't1',
  tabs: [{ id: 't1', component: 'a', config: {} }],
};
const c2: ContainerNode = {
  type: 'container',
  id: 'c2',
  activeTabId: 't2',
  tabs: [{ id: 't2', component: 'b', config: {} }],
};
const c3: ContainerNode = {
  type: 'container',
  id: 'c3',
  activeTabId: 't3',
  tabs: [{ id: 't3', component: 'c', config: {} }],
};
const column: SplitNode = { type: 'split', id: 's1', axis: 'column', children: [c1, c2] };
const row: SplitNode = { type: 'split', id: 's0', axis: 'row', children: [column, c3] };
const referenceLayout: Layout = { version: 1, root: row, activeContainerId: 'c1' };

type _1a = Expect<Equal<Layout['root'], Node>>;
type _1b = Expect<Equal<SplitNode['axis'], 'row' | 'column'>>;
type _1c = Expect<Equal<SplitNode['children'], Node[]>>;
type _1d = Expect<Equal<Layout['version'], 1>>;

// --- §9.2 split creates a 50/50 sibling; weights are the only wire number ---
const fiftyFifty: SplitNode = {
  type: 'split',
  id: 's2',
  axis: 'column',
  children: [
    { type: 'container', id: 'x', weight: 1, activeTabId: 'tx', tabs: [] },
    { type: 'container', id: 'y', weight: 1, activeTabId: 'ty', tabs: [] },
  ],
};
type _2 = Expect<Equal<Node['weight'], number | undefined>>;

// --- §9.3 closing the only tab removes the container -------------------------
type _3 = Expect<Equal<GridEngineHandle['removeTab'], (id: string) => void>>;

// --- §9.4 addTab target/return; root on empty layout -------------------------
type _4a = Expect<Equal<ReturnType<GridEngineHandle['addTab']>, string>>;
type _4b = Expect<Equal<Parameters<GridEngineHandle['addTab']>[0], AddTabParams>>;
const rootAdd: AddTabParams = { component: 'a', target: { kind: 'root' } };
type _4c = Expect<Equal<AddTabParams['target'], DropTarget | undefined>>;

// --- §9.5 tab.color round-trips; invalid falls back (runtime, not type) ------
type _5a = Expect<Equal<Tab['color'], string | undefined>>;
type _5b = Expect<Equal<UpdateTabPatch['color'], string | null | undefined>>;
const clearColor: UpdateTabPatch = { color: null };

// --- §9.6 choosing a swatch emits onTabColorChange ---------------------------
type _6a = Expect<Equal<Parameters<TabColorChangeHandler>[1], string | null>>;
type _6b = Expect<Equal<Parameters<TabColorChangeHandler>[2], { source: 'ui' | 'app' }>>;

// --- §9.7 canClose returning a promise that resolves false -------------------
type _7 = Expect<
  Equal<
    PanelComponentDef<{ n: number }>['canClose'],
    ((config: { n: number }) => boolean | Promise<boolean>) | undefined
  >
>;

// --- §9.8 missing ids / missing registry key are no-ops ----------------------
type _8a = Expect<Equal<GridEngineHandle['removeTab'], (id: string) => void>>;
type _8b = Expect<Equal<PanelComponentDef['addable'], boolean | undefined>>;

// --- §9.9 StrictMode 20/80 — layout is a plain, finite tree ------------------
type _9 = Expect<Equal<Tab['id'], string>>;

// --- §9.10 props.engine is the stable handle; memoized component safe --------
type _10a = Expect<Equal<PanelComponentProps<unknown>['engine'], GridEngineHandle>>;
type _10b = Expect<Equal<PanelComponentProps<{ x: number }>['config'], { x: number }>>;
type _10c = Expect<Equal<GridEngineHandle['getLayout'], () => Layout>>;

// --- §5.2 four event payloads -----------------------------------------------
type _ev1 = Expect<Equal<Parameters<LayoutChangeHandler>[1], LayoutChangeMeta>>;
type _ev2 = Expect<Equal<Parameters<TabEventHandler>[0], string>>;
type _ev3 = Expect<Equal<Parameters<TabConfigChangeHandler>[2], TabConfigChangeMeta>>;
type _ev4 = Expect<Equal<Parameters<TabColorChangeHandler>[2], { source: 'ui' | 'app' }>>;

const allActions: LayoutAction[] = [
  'add-tab',
  'remove-tab',
  'reorder-tab',
  'move-tab',
  'split',
  'resize',
  'focus',
  'set-color',
  'set-title',
  'set-config',
];
type _ev5 = Expect<Equal<LayoutAction, (typeof allActions)[number]>>;

const allTargets: DropTarget[] = [
  { kind: 'tab', containerId: 'c', index: 0 },
  { kind: 'tab', containerId: 'c' },
  { kind: 'split', containerId: 'c', edge: 'left' },
  { kind: 'root' },
];

describe('frozen public contract', () => {
  test('§9.1 reference layout reloads from JSON identically', () => {
    expect(JSON.parse(JSON.stringify(referenceLayout))).toEqual(referenceLayout);
  });
});
