import type { CSSProperties } from 'react';
import type { ContainerNode } from '../layout/types';
import type {
  GridEngineHandle,
  TabColorChangeHandler,
  TabConfigChangeHandler,
  TabEventHandler,
} from '../api';
import type { PanelRegistry } from '../registry';
import { chrome, grow } from './styles';
import { TitleBar } from './TitleBar';
import { PanelHost } from './PanelHost';

/** Which area an expanded container fills (see `docs/feat/expand.md`). */
export type ExpandMode = 'maximize' | 'fullscreen';

/** At most one container is expanded, in exactly one mode. */
export interface ExpandState {
  containerId: string;
  mode: ExpandMode;
}

/**
 * What the chrome components need from the engine root. Passed as props on
 * purpose — no context provider (PRD §10).
 */
export interface ChromeCtx {
  registry: PanelRegistry;
  engine: GridEngineHandle;
  onTabEvent: TabEventHandler | undefined;
  onTabConfigChange: TabConfigChangeHandler | undefined;
  onTabColorChange: TabColorChangeHandler | undefined;
  /** Swatches the tab-color popover offers; built-in presets when absent. */
  tabColorPalette: readonly string[] | undefined;
  /** Run a chrome mutation as a user gesture, so it reports `programmatic: false`. */
  gesture: <T>(fn: () => T) => T;
  /** Current config revision for a tab (§5.2). */
  getRev: (tabId: string) => number;
  /**
   * Splitter drag: give `children[index]` of the split the requested absolute
   * weight; its next sibling absorbs the difference (FR-7). Committed live.
   */
  resize: (splitId: string, index: number, weight: number) => void;
  /** The single transient overlay, if any. Runtime only — never serialized. */
  expanded: ExpandState | null;
  /** Same container + same mode -> collapse; otherwise expand that container. */
  toggleExpand: (containerId: string, mode: ExpandMode) => void;
  /** Which expand buttons the title bar may render (§ expand). */
  showMaximizeButton: boolean;
  showFullscreenButton: boolean;
}

/** Leaf node — title bar + content box; owns a rect and a set of tabs. */
export function Container({ container, ctx }: { container: ContainerNode; ctx: ChromeCtx }) {
  const expandMode = ctx.expanded?.containerId === container.id ? ctx.expanded.mode : null;
  // CSS promotion, not a new tree: the container stays where it is (same parent,
  // same key), so the tab component is not remounted and keeps its state.
  const overlay: CSSProperties = expandMode
    ? {
        position: expandMode === 'maximize' ? 'absolute' : 'fixed',
        inset: 0,
        // Above the drag sprite (1000), below popovers (2000) when bounded by
        // the engine; the viewport overlay is a host-page escape hatch.
        zIndex: expandMode === 'maximize' ? 1500 : chrome('overlay-z-index', '9999'),
        overscrollBehavior: expandMode === 'fullscreen' ? 'contain' : undefined,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      }
    : {};
  return (
    <div
      data-twge-container={container.id}
      data-twge-expanded={expandMode ? container.id : undefined}
      data-twge-expand-mode={expandMode ?? undefined}
      // An overlay must not start a drag: its fullscreen rect would be measured
      // as a drop candidate and a tab could land on a container behind it.
      onPointerDown={expandMode ? (e) => e.stopPropagation() : undefined}
      style={{
        ...grow(container.weight),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: `${chrome('border-width', '1px')} solid ${chrome('border-color', '#d4d4d4')}`,
        background: chrome('tab-active-bg', '#fff'),
        ...overlay,
      }}
    >
      <TitleBar container={container} ctx={ctx} />
      <PanelHost container={container} ctx={ctx} />
    </div>
  );
}
