import type { ContainerNode } from '../layout/types';
import type {
  GridEngineHandle,
  TabConfigChangeHandler,
  TabEventHandler,
} from '../api';
import type { PanelRegistry } from '../registry';
import { chrome, grow } from './styles';
import { TitleBar } from './TitleBar';
import { PanelHost } from './PanelHost';

/**
 * What the chrome components need from the engine root. Passed as props on
 * purpose — no context provider (PRD §10).
 */
export interface ChromeCtx {
  registry: PanelRegistry;
  engine: GridEngineHandle;
  onTabEvent: TabEventHandler | undefined;
  onTabConfigChange: TabConfigChangeHandler | undefined;
  /** Current config revision for a tab (§5.2). */
  getRev: (tabId: string) => number;
}

/** Leaf node — title bar + content box; owns a rect and a set of tabs. */
export function Container({ container, ctx }: { container: ContainerNode; ctx: ChromeCtx }) {
  return (
    <div
      style={{
        ...grow(container.weight),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: `${chrome('border-width', '1px')} solid ${chrome('border-color', '#d4d4d4')}`,
        background: chrome('tab-active-bg', '#fff'),
      }}
    >
      <TitleBar container={container} ctx={ctx} />
      <PanelHost container={container} ctx={ctx} />
    </div>
  );
}
