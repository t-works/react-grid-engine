/**
 * The serialized layout wire format (PRD §5.1).
 *
 * This is the public, versioned contract: it round-trips through JSON, ids are
 * data and authoritative on load, and `weight` is the only number on the wire
 * (all chrome comes from `--twge-*` CSS custom properties).
 */

/** The whole layout. A lone container is a valid root. */
export interface Layout {
  version: 1;
  root: Node;
  /** Focused container. Defaults to the first container in tree order. */
  activeContainerId?: string;
}

/** The only two node kinds. */
export type Node = SplitNode | ContainerNode;

/** Internal node — the only node that owns space. */
export interface SplitNode {
  type: 'split';
  /** Engine-generated. Handlers only (FR-19). */
  id: string;
  /** `row`: children side by side. `column`: children stacked. */
  axis: 'row' | 'column';
  /** Share along the *parent's* axis. Defaults to 1. Normalized at render. */
  weight?: number;
  /** Always >= 2; a split left with one child is spliced out. */
  children: Node[];
}

/** Leaf node — owns a rect and a set of tabs; shows exactly one. */
export interface ContainerNode {
  type: 'container';
  id: string;
  /** Child-scoped, same meaning as on {@link SplitNode}. */
  weight?: number;
  activeTabId: string;
  /** Always >= 1, except an emptied root. */
  tabs: Tab[];
}

/** An entry in a container's title bar, bound to a registry key. */
export interface Tab {
  id: string;
  /** Registry string key — never a component reference. */
  component: string;
  /** Serialized string. The registry `title(config)` is the fallback. */
  title?: string;
  /** Hex accent (`#rgb`, `#rrggbb`, `#rrggbbaa`). Invalid values are ignored. */
  color?: string;
  /** App-owned, opaque to the engine. Always a serializable value. */
  config: unknown;
}
