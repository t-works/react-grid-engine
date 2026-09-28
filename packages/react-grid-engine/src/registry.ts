/**
 * The app-supplied component registry (PRD §6.5). Never serialized.
 *
 * Naming note: `Panel*` is the deliberate legacy prefix for *tab components*
 * (the historical spelling). Everything user-facing is container/tab. Do not
 * rename half of it — see `docs/api.md`.
 */

import type { ComponentType, ReactNode } from 'react';
import type { GridEngineHandle } from './api';

/** Props the engine hands to every tab component. */
export interface PanelComponentProps<C = unknown> {
  /** Read-only input — always the newest committed value. */
  config: C;
  tabId: string;
  /** Push a component-level event up to the app. */
  emit: (type: string, payload?: unknown) => void;
  /** Request a config change; the app decides. */
  requestConfigChange: (patch: Partial<C>) => void;
  /** The same stable handle the host gets from the ref. */
  engine: GridEngineHandle;
}

/**
 * App-supplied catalogue: registry key -> tab component definition. Never
 * serialized; may be larger or smaller than the layout (FR-16).
 */
export type PanelRegistry = Record<string, PanelComponentDef>;

/**
 * A *tab component* definition.
 *
 * The default `C = any` is deliberate: a registry mixes entries with different
 * config shapes, and a contravariant `ComponentType` would reject them all.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PanelComponentDef<C = any> {
  component: ComponentType<PanelComponentProps<C>>;
  /** Shared reference by contract. Prefer `createConfig` for new tabs. */
  defaultConfig?: C;
  /** Fresh object per tab — avoids shared-mutable-default bleed-through. */
  createConfig?: () => C;
  /** Identity color for this component type. */
  defaultColor?: string;
  /** Rendered when `Tab.title` is absent. */
  title?: (config: C) => ReactNode;
  /** Enables context-menu rename, which writes `Tab.title`. Default true. */
  titleEditable?: boolean;
  /** Appears in the `+` menu. Default true. */
  addable?: boolean;
  /**
   * May exist in several tabs. Default true. When false and an instance
   * exists: hidden from the `+` menu and not closeable.
   */
  allowMultiple?: boolean;
  /** Close control + menu entry. Default true. */
  closeable?: boolean;
  /** Unsaved-state guard for the UI close path. */
  canClose?: (config: C) => boolean | Promise<boolean>;
  /** Keep content mounted while the tab is inactive. Default false. */
  keepMountedWhenInactive?: boolean;
}
