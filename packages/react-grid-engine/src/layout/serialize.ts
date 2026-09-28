/**
 * Layout parse / serialize (FR-15, §5.1 rules 4/5/7).
 *
 * Reading never throws and never mints ids. Unknown fields are dropped, the
 * tree is validated structurally, and dangling `activeTabId` /
 * `activeContainerId` references are repaired. Structural damage — a bad node
 * shape, a split with fewer than two children — takes the deliberate reset
 * path: warn + `defaultLayout`.
 */

import { normalize } from './ops';
import { CURRENT_LAYOUT_VERSION, isRecord, migrate } from './migrate';
import type { ContainerNode, Layout, Node, SplitNode, Tab } from './types';

/** Where parse warnings go. Inject in tests/apps to capture or silence them. */
export type WarnFn = (message: string) => void;

/**
 * Guards against pathological nesting (hostile input) blowing the call stack.
 * A real layout never approaches this.
 */
const MAX_DEPTH = 500;

const defaultWarn: WarnFn = (message) => {
  console.warn(`[react-grid-engine] ${message}`);
};

/**
 * Parse a serialized layout (JSON string or already-parsed value). Never
 * throws: any failure warns and returns a copy of `defaultLayout`.
 */
export function parseLayout(
  input: unknown,
  defaultLayout: Layout,
  warn: WarnFn = defaultWarn,
): Layout {
  const fail = (reason: string): Layout => {
    warn(`ignoring invalid layout: ${reason}; falling back to defaultLayout`);
    return normalize(cloneLayout(defaultLayout));
  };

  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return fail('not valid JSON');
    }
  }

  const migration = migrate(raw);
  if (migration.kind === 'unsupported') {
    return fail(`unsupported layout version ${JSON.stringify(migration.version)}`);
  }
  if (migration.kind === 'invalid') {
    return fail('missing or invalid layout version');
  }

  const read = readNode(migration.payload.root, 0, true);
  if (!read.ok) return fail(read.reason);

  const layout: Layout = { version: CURRENT_LAYOUT_VERSION, root: read.node };
  const hadActiveContainer = typeof migration.payload.activeContainerId === 'string';
  if (hadActiveContainer) layout.activeContainerId = migration.payload.activeContainerId as string;

  const repaired = normalize(layout);
  // An absent optional `activeContainerId` stays absent — repair the dangling,
  // do not materialize what the wire format left out.
  if (!hadActiveContainer) delete repaired.activeContainerId;
  return repaired;
}

/** Serialize a layout to JSON. Only wire fields are emitted — never chrome. */
export function serializeLayout(layout: Layout): string {
  return JSON.stringify(toWireLayout(layout));
}

// --- projection (drop unknown fields / chrome) -------------------------------

function toWireLayout(layout: Layout): Layout {
  const wire: Layout = { version: CURRENT_LAYOUT_VERSION, root: toWireNode(layout.root) };
  if (typeof layout.activeContainerId === 'string') wire.activeContainerId = layout.activeContainerId;
  return wire;
}

function toWireNode(node: Node): Node {
  if (node.type === 'split') {
    const wire: SplitNode = {
      type: 'split',
      id: node.id,
      axis: node.axis,
      children: node.children.map(toWireNode),
    };
    const weight = readWeight(node.weight);
    if (weight !== undefined) wire.weight = weight;
    return wire;
  }
  const wire: ContainerNode = {
    type: 'container',
    id: node.id,
    activeTabId: node.activeTabId,
    tabs: node.tabs.map(toWireTab),
  };
  const weight = readWeight(node.weight);
  if (weight !== undefined) wire.weight = weight;
  return wire;
}

function toWireTab(tab: Tab): Tab {
  const wire: Tab = { id: tab.id, component: tab.component, config: tab.config };
  if (typeof tab.title === 'string') wire.title = tab.title;
  if (typeof tab.color === 'string') wire.color = tab.color;
  return wire;
}

// --- validation --------------------------------------------------------------

type NodeRead = { ok: true; node: Node } | { ok: false; reason: string };
type TabRead = { ok: true; tab: Tab } | { ok: false; reason: string };

function readNode(raw: unknown, depth: number, isRoot: boolean): NodeRead {
  if (depth > MAX_DEPTH) return { ok: false, reason: 'layout is nested too deeply' };
  if (!isRecord(raw)) return { ok: false, reason: 'node is not an object' };
  if (raw.type === 'container') return readContainer(raw, isRoot);
  if (raw.type === 'split') return readSplit(raw, depth);
  return { ok: false, reason: `unknown node type ${JSON.stringify(raw.type)}` };
}

function readContainer(raw: Record<string, unknown>, isRoot: boolean): NodeRead {
  const id = readId(raw.id);
  if (id === undefined) return { ok: false, reason: 'container id must be a non-empty string' };
  if (!Array.isArray(raw.tabs)) return { ok: false, reason: 'container.tabs must be an array' };
  if (raw.tabs.length === 0 && !isRoot) {
    return { ok: false, reason: 'a non-root container must have at least one tab' };
  }

  const tabs: Tab[] = [];
  for (const rawTab of raw.tabs) {
    const tab = readTab(rawTab);
    if (!tab.ok) return { ok: false, reason: tab.reason };
    tabs.push(tab.tab);
  }

  const node: ContainerNode = {
    type: 'container',
    id,
    activeTabId: typeof raw.activeTabId === 'string' ? raw.activeTabId : '',
    tabs,
  };
  const weight = readWeight(raw.weight);
  if (weight !== undefined) node.weight = weight;
  return { ok: true, node };
}

function readSplit(raw: Record<string, unknown>, depth: number): NodeRead {
  const id = readId(raw.id);
  if (id === undefined) return { ok: false, reason: 'split id must be a non-empty string' };
  if (raw.axis !== 'row' && raw.axis !== 'column') {
    return { ok: false, reason: 'split axis must be "row" or "column"' };
  }
  if (!Array.isArray(raw.children)) return { ok: false, reason: 'split.children must be an array' };
  if (raw.children.length < 2) {
    return { ok: false, reason: 'a split must have at least two children' };
  }

  const children: Node[] = [];
  for (const rawChild of raw.children) {
    const child = readNode(rawChild, depth + 1, false);
    if (!child.ok) return { ok: false, reason: child.reason };
    children.push(child.node);
  }

  const node: SplitNode = { type: 'split', id, axis: raw.axis, children };
  const weight = readWeight(raw.weight);
  if (weight !== undefined) node.weight = weight;
  return { ok: true, node };
}

function readTab(raw: unknown): TabRead {
  if (!isRecord(raw)) return { ok: false, reason: 'tab is not an object' };
  const id = readId(raw.id);
  if (id === undefined) return { ok: false, reason: 'tab id must be a non-empty string' };
  if (typeof raw.component !== 'string') {
    return { ok: false, reason: 'tab component must be a string' };
  }

  const tab: Tab = {
    id,
    component: raw.component,
    config: raw.config === undefined ? {} : raw.config,
  };
  if (typeof raw.title === 'string') tab.title = raw.title;
  if (typeof raw.color === 'string') tab.color = raw.color;
  return { ok: true, tab };
}

function readId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readWeight(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function cloneLayout(layout: Layout): Layout {
  try {
    return JSON.parse(JSON.stringify(layout)) as Layout;
  } catch {
    return layout;
  }
}
