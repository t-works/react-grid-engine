/**
 * Pure layout tree operations — no React, no DOM, no randomness.
 *
 * Every function returns a new {@link Layout} and never mutates its input.
 * This module is the single place the §5.1 invariants live. Node ids are minted
 * by handlers (FR-19), so the create paths take the ids they need as plain
 * arguments — that is what keeps these functions deterministic and testable.
 */

import type { ContainerNode, Layout, Node, SplitNode, Tab } from './types';
import type { DropTarget, SplitEdge, UpdateTabPatch } from '../api';
import type { PanelComponentDef } from '../registry';

/** Relative weight floor per side (FR-7 / A3). */
export const MIN_WEIGHT = 0.05;

export interface TabLocation {
  tab: Tab;
  container: ContainerNode;
  index: number;
}

export interface AddTabOptions {
  /** Defaults to {@link defaultTarget}. */
  target?: DropTarget;
  /** Default true — the new tab becomes its container's active tab. */
  activate?: boolean;
  /** Required for a `split` target: id of the new container. */
  newContainerId?: string;
  /** Required for a `split` target: id of the new split node. */
  newSplitId?: string;
}

export interface SplitParams {
  containerId: string;
  edge: SplitEdge;
  incoming: ContainerNode;
  splitId: string;
}

/** Ids the engine mints for move/split paths. */
export interface MoveIds {
  newContainerId?: string;
  newSplitId?: string;
}

// --- queries -----------------------------------------------------------------

export function isContainer(node: Node): node is ContainerNode {
  return node.type === 'container';
}

export function isSplit(node: Node): node is SplitNode {
  return node.type === 'split';
}

/** Containers in tree order. */
export function listContainers(root: Node): ContainerNode[] {
  const out: ContainerNode[] = [];
  const visit = (node: Node): void => {
    if (isContainer(node)) out.push(node);
    else node.children.forEach(visit);
  };
  visit(root);
  return out;
}

export function firstContainer(root: Node): ContainerNode | undefined {
  if (isContainer(root)) return root;
  for (const child of root.children) {
    const found = firstContainer(child);
    if (found) return found;
  }
  return undefined;
}

export function findContainer(root: Node, id: string): ContainerNode | undefined {
  if (isContainer(root)) return root.id === id ? root : undefined;
  for (const child of root.children) {
    const found = findContainer(child, id);
    if (found) return found;
  }
  return undefined;
}

export function findSplit(root: Node, id: string): SplitNode | undefined {
  if (!isSplit(root)) return undefined;
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findSplit(child, id);
    if (found) return found;
  }
  return undefined;
}

export function findTab(root: Node, tabId: string): TabLocation | undefined {
  if (isContainer(root)) {
    const index = root.tabs.findIndex((t) => t.id === tabId);
    const tab = index >= 0 ? root.tabs[index] : undefined;
    return tab ? { tab, container: root, index } : undefined;
  }
  for (const child of root.children) {
    const found = findTab(child, tabId);
    if (found) return found;
  }
  return undefined;
}

/** The empty-root state: a lone container with no tabs. */
export function isEmptyLayout(layout: Layout): boolean {
  return isContainer(layout.root) && layout.root.tabs.length === 0;
}

/** True when `nodeId` is `ancestorId` or lives inside its subtree. */
export function containsNode(root: Node, ancestorId: string, nodeId: string): boolean {
  if (root.id === ancestorId) return subtreeHas(root, nodeId);
  if (isSplit(root)) return root.children.some((c) => containsNode(c, ancestorId, nodeId));
  return false;
}

function subtreeHas(node: Node, id: string): boolean {
  if (node.id === id) return true;
  return isSplit(node) ? node.children.some((c) => subtreeHas(c, id)) : false;
}

/** FR-10: active container, else first in tree order, else `root` when empty. */
export function defaultTarget(layout: Layout): DropTarget {
  if (isEmptyLayout(layout)) return { kind: 'root' };
  const active = layout.activeContainerId
    ? findContainer(layout.root, layout.activeContainerId)
    : undefined;
  const container = active ?? firstContainer(layout.root);
  return container ? { kind: 'tab', containerId: container.id } : { kind: 'root' };
}

// --- invariant enforcement ---------------------------------------------------

/**
 * A split left with one child is spliced out; its `weight` (along the parent's
 * axis) transfers to the surviving child.
 */
function prune(node: Node): Node {
  if (isContainer(node)) return node;
  const children = node.children.map(prune);
  const only = children[0];
  if (children.length === 1 && only) return { ...only, weight: node.weight };
  return { ...node, children };
}

/** Dangling `activeTabId` -> first tab (or `''` for an empty root). */
function repairActiveTabs(node: Node): Node {
  if (isContainer(node)) {
    if (node.tabs.some((t) => t.id === node.activeTabId)) return node;
    return { ...node, activeTabId: node.tabs[0]?.id ?? '' };
  }
  return { ...node, children: node.children.map(repairActiveTabs) };
}

/**
 * Re-check §5.1 rule 4. Structural damage is repaired locally (never rejected
 * here — hostile input handling is the loader's job), and dangling
 * `activeContainerId` falls back to the first container in tree order.
 */
export function normalize(layout: Layout): Layout {
  const root = repairActiveTabs(prune(layout.root));
  const first = firstContainer(root);
  const active =
    layout.activeContainerId && findContainer(root, layout.activeContainerId)
      ? layout.activeContainerId
      : first?.id;
  return active === undefined ? { ...layout, root } : { ...layout, root, activeContainerId: active };
}

// --- mutations ---------------------------------------------------------------

export function addTab(layout: Layout, tab: Tab, options: AddTabOptions = {}): Layout {
  const target = options.target ?? defaultTarget(layout);
  const activate = options.activate ?? true;

  if (target.kind === 'root') {
    if (!isContainer(layout.root) || layout.root.tabs.length > 0) return layout;
    const root: ContainerNode = { ...layout.root, activeTabId: tab.id, tabs: [tab] };
    return normalize({ ...layout, root, activeContainerId: root.id });
  }

  if (target.kind === 'split') {
    if (!options.newContainerId || !options.newSplitId) {
      throw new Error('addTab: a split target requires newContainerId and newSplitId');
    }
    return splitContainer(layout, {
      containerId: target.containerId,
      edge: target.edge,
      incoming: { type: 'container', id: options.newContainerId, activeTabId: tab.id, tabs: [tab] },
      splitId: options.newSplitId,
    });
  }

  if (!findContainer(layout.root, target.containerId)) return layout;
  const root = updateNode(layout.root, target.containerId, (node) => {
    const container = node as ContainerNode;
    const tabs = insertAt(container.tabs, tab, target.index ?? container.tabs.length);
    return { ...container, tabs, activeTabId: activate ? tab.id : container.activeTabId };
  });
  return normalize({ ...layout, root, activeContainerId: target.containerId });
}

export function removeTab(layout: Layout, tabId: string): Layout {
  const location = findTab(layout.root, tabId);
  if (!location) return layout;
  const { container, index } = location;

  if (container.tabs.length === 1) {
    if (isContainer(layout.root) && layout.root.id === container.id) {
      const root: ContainerNode = { ...container, tabs: [], activeTabId: '' };
      return normalize({ ...layout, root });
    }
    return normalize({ ...layout, root: removeNode(layout.root, container.id) });
  }

  const root = updateNode(layout.root, container.id, (node) => {
    const current = node as ContainerNode;
    const tabs = current.tabs.filter((t) => t.id !== tabId);
    const activeTabId =
      current.activeTabId === tabId ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? '') : current.activeTabId;
    return { ...current, tabs, activeTabId };
  });
  return normalize({ ...layout, root });
}

export function reorderTab(layout: Layout, tabId: string, toIndex: number): Layout {
  const location = findTab(layout.root, tabId);
  if (!location) return layout;
  const { container, index } = location;
  if (toIndex === index || toIndex < 0 || toIndex >= container.tabs.length) return layout;

  const root = updateNode(layout.root, container.id, (node) => {
    const current = node as ContainerNode;
    const tabs = [...current.tabs];
    const [moved] = tabs.splice(index, 1);
    if (!moved) return current;
    tabs.splice(toIndex, 0, moved);
    return { ...current, tabs };
  });
  return { ...layout, root };
}

/** Patch a tab's node-level fields. `color: null` clears, `undefined` leaves. */
export function updateTab(layout: Layout, tabId: string, patch: UpdateTabPatch): Layout {
  const location = findTab(layout.root, tabId);
  if (!location) return layout;
  return withContainer(layout, location.container.id, (container) => ({
    ...container,
    tabs: container.tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const next: Tab = { ...tab };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.color === null) delete next.color;
      else if (patch.color !== undefined) next.color = patch.color;
      return next;
    }),
  }));
}

/** Replace a tab's opaque config. Unknown tab id is a no-op. */
export function setTabConfig(layout: Layout, tabId: string, config: unknown): Layout {
  const location = findTab(layout.root, tabId);
  if (!location) return layout;
  return withContainer(layout, location.container.id, (container) => ({
    ...container,
    tabs: container.tabs.map((tab) => (tab.id === tabId ? { ...tab, config } : tab)),
  }));
}

/** Make `tabId` its container's active tab and focus that container. */
export function focusTab(layout: Layout, tabId: string): Layout {
  const location = findTab(layout.root, tabId);
  if (!location) return layout;
  const { container } = location;
  const root = updateNode(layout.root, container.id, (node) => ({
    ...(node as ContainerNode),
    activeTabId: tabId,
  }));
  return { ...layout, root, activeContainerId: container.id };
}

export function moveTab(layout: Layout, tabId: string, target: DropTarget, ids: MoveIds = {}): Layout {
  const location = findTab(layout.root, tabId);
  if (!location) return layout;
  const { tab, container } = location;

  if (target.kind === 'root') {
    return isEmptyLayout(layout) ? addTab(layout, tab, { target }) : layout;
  }

  if (target.kind === 'tab') {
    if (target.containerId === container.id) {
      return target.index === undefined ? layout : reorderTab(layout, tabId, target.index);
    }
    return addTab(removeTab(layout, tabId), tab, { target });
  }

  // A4: a container's only tab dropped on its own edge is a no-op.
  if (target.containerId === container.id && container.tabs.length === 1) return layout;
  if (!ids.newContainerId || !ids.newSplitId) {
    throw new Error('moveTab: a split target requires newContainerId and newSplitId');
  }
  return addTab(removeTab(layout, tabId), tab, {
    target,
    newContainerId: ids.newContainerId,
    newSplitId: ids.newSplitId,
  });
}

export function moveContainer(
  layout: Layout,
  containerId: string,
  target: DropTarget,
  ids: MoveIds = {},
): Layout {
  const moving = findContainer(layout.root, containerId);
  if (!moving || target.kind === 'root' || target.containerId === containerId) return layout;
  if (listContainers(layout.root).length < 2) return layout;

  const without = normalize({ ...layout, root: removeNode(layout.root, containerId) });
  const destination = findContainer(without.root, target.containerId);
  if (!destination) return layout;

  if (target.kind === 'tab') {
    const root = updateNode(without.root, destination.id, (node) => {
      const current = node as ContainerNode;
      return {
        ...current,
        tabs: [...current.tabs, ...moving.tabs],
        activeTabId: moving.activeTabId,
      };
    });
    return normalize({ ...without, root, activeContainerId: destination.id });
  }

  if (!ids.newSplitId) throw new Error('moveContainer: a split target requires newSplitId');
  return splitContainer(without, {
    containerId: destination.id,
    edge: target.edge,
    incoming: { ...moving, weight: 1 },
    splitId: ids.newSplitId,
  });
}

/** Split `containerId` on `edge`; the pair is 50/50 and inherits the target's share. */
export function splitContainer(layout: Layout, params: SplitParams): Layout {
  const target = findContainer(layout.root, params.containerId);
  if (!target) return layout;

  const axis: SplitNode['axis'] = params.edge === 'left' || params.edge === 'right' ? 'row' : 'column';
  const incomingFirst = params.edge === 'left' || params.edge === 'top';
  const targetChild: ContainerNode = { ...target, weight: 1 };
  const incomingChild: ContainerNode = { ...params.incoming, weight: 1 };
  const pair: SplitNode = {
    type: 'split',
    id: params.splitId,
    axis,
    weight: target.weight,
    children: incomingFirst ? [incomingChild, targetChild] : [targetChild, incomingChild],
  };

  const root = updateNode(layout.root, params.containerId, () => pair);
  return normalize({ ...layout, root, activeContainerId: params.incoming.id });
}

export function resizeSplit(layout: Layout, splitId: string, childIndex: number, weight: number): Layout {
  const split = findSplit(layout.root, splitId);
  if (!split || childIndex < 0 || childIndex >= split.children.length) return layout;

  const root = updateNode(layout.root, splitId, (node) => {
    const current = node as SplitNode;
    return {
      ...current,
      children: current.children.map((child, i) =>
        i === childIndex ? { ...child, weight: Math.max(MIN_WEIGHT, weight) } : child,
      ),
    };
  });
  return { ...layout, root };
}

export function focusContainer(layout: Layout, containerId: string): Layout {
  return findContainer(layout.root, containerId) ? { ...layout, activeContainerId: containerId } : layout;
}

// --- config resolution (§6.5 / A11) ------------------------------------------

export function resolveTabConfig<C>(def: PanelComponentDef<C> | undefined, explicit?: unknown): unknown {
  if (explicit !== undefined) return explicit;
  if (def?.createConfig) return def.createConfig();
  if (def?.defaultConfig !== undefined) return def.defaultConfig;
  return {};
}

/** `config` -> `createConfig()` -> `defaultConfig` -> `{}`, keyed by registry entry. */
export function resolveNewTabConfig(
  registry: Record<string, PanelComponentDef | undefined>,
  component: string,
  explicit?: unknown,
): unknown {
  return resolveTabConfig(registry[component], explicit);
}

// --- tree plumbing -----------------------------------------------------------

function withContainer(layout: Layout, id: string, fn: (container: ContainerNode) => ContainerNode): Layout {
  return { ...layout, root: updateNode(layout.root, id, (node) => fn(node as ContainerNode)) };
}

function updateNode(node: Node, id: string, fn: (node: Node) => Node): Node {
  if (node.id === id) return fn(node);
  if (isContainer(node)) return node;
  return { ...node, children: node.children.map((child) => updateNode(child, id, fn)) };
}

function removeNode(node: Node, id: string): Node {
  if (isContainer(node)) return node;
  return {
    ...node,
    children: node.children.filter((child) => child.id !== id).map((child) => removeNode(child, id)),
  };
}

function insertAt<T>(items: readonly T[], item: T, index: number): T[] {
  const at = Math.max(0, Math.min(index, items.length));
  return [...items.slice(0, at), item, ...items.slice(at)];
}
