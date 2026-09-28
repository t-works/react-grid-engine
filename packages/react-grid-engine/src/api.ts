/**
 * Imperative API surface (PRD §5.2, §6.5).
 *
 * The layout is uncontrolled: `defaultLayout` in, `onLayoutChange` out, writes
 * through the ref. There is no controlled `layout` prop.
 */

import type { Layout } from './layout/types';

/** Where a tab or container can be dropped. */
export type DropTarget =
  /** Tabify: join this container's tabs. `index` omitted = append. */
  | { kind: 'tab'; containerId: string; index?: number }
  /** Split this container on `edge`, creating a new 50/50 sibling. */
  | { kind: 'split'; containerId: string; edge: 'left' | 'right' | 'top' | 'bottom' }
  /** Empty layout only. */
  | { kind: 'root' };

/** The committed change that produced a layout. */
export type LayoutAction =
  | 'add-tab'
  | 'remove-tab'
  | 'reorder-tab'
  | 'move-tab'
  | 'split'
  | 'resize'
  | 'focus'
  | 'set-color'
  | 'set-title'
  | 'set-config';

/** Metadata for {@link LayoutChangeHandler}. */
export interface LayoutChangeMeta {
  action: LayoutAction;
  tabId?: string;
  containerId?: string;
  /** `true` when the change came from the ref API, not a user gesture. */
  programmatic: boolean;
}

/** Fires after a change is committed — once per change, not per `pointermove`. */
export type LayoutChangeHandler = (layout: Layout, meta: LayoutChangeMeta) => void;

/** A component-level event pushed up through `emit`. */
export type TabEventHandler = (tabId: string, type: string, payload?: unknown) => void;

/** Metadata for {@link TabConfigChangeHandler}. */
export interface TabConfigChangeMeta {
  rev: number;
  source: 'tab' | 'app';
}

/** Reports a config value received upward. Revs are runtime-only. */
export type TabConfigChangeHandler = (
  tabId: string,
  config: unknown,
  meta: TabConfigChangeMeta,
) => void;

/** Metadata for {@link TabColorChangeHandler}. */
export interface TabColorChangeMeta {
  source: 'ui' | 'app';
}

/** Reports a color change. `null` clears `tab.color`. */
export type TabColorChangeHandler = (
  tabId: string,
  color: string | null,
  meta: TabColorChangeMeta,
) => void;

/** Parameters for {@link GridEngineHandle.addTab}. */
export interface AddTabParams {
  component: string;
  config?: unknown;
  title?: string;
  color?: string;
  /** Defaults to the active container, or `root` when the layout is empty. */
  target?: DropTarget;
  activate?: boolean;
}

/** Patch for {@link GridEngineHandle.updateTab}. `color: null` clears. */
export interface UpdateTabPatch {
  title?: string;
  color?: string | null;
}

/**
 * The stable, action-only bundle handed to the host through the ref and to
 * every tab component as `props.engine`. No state, no subscription — holding
 * it never causes a re-render.
 */
export interface GridEngineHandle {
  /** Returns the new tab's id. Missing `target` -> active container. */
  addTab(p: AddTabParams): string;
  /** Unconditional — bypasses `canClose`. */
  removeTab(id: string): void;
  updateTab(id: string, patch: UpdateTabPatch): void;
  moveTab(id: string, target: DropTarget): void;
  /** `rev` guards against stale writes (PRD §5.2). */
  setTabConfig(id: string, config: unknown, rev?: number): void;
  focusTab(id: string): void;
  /** Snapshot, not reactive. */
  getLayout(): Layout;
}
