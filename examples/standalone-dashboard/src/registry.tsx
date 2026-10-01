import type { PanelComponentProps, PanelRegistry } from '@t-works/react-grid-engine';

const text = { font: '13px system-ui, sans-serif' } as const;
const bars = [0.4, 0.7, 0.55, 0.9, 0.65, 0.8, 0.5];

interface ChartConfig {
  metric: string;
  range: string;
}

function Chart({ config }: PanelComponentProps<ChartConfig>) {
  return (
    <div style={{ ...text, padding: 12 }}>
      <div style={{ fontWeight: 600 }}>
        {config.metric} · {config.range}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 90, marginTop: 8 }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{ flex: 1, height: `${h * 100}%`, background: '#0ea5e9', borderRadius: 2 }}
          />
        ))}
      </div>
    </div>
  );
}

interface TableConfig {
  page: number;
}

function Table({ config }: PanelComponentProps<TableConfig>) {
  return (
    <div style={{ ...text, padding: 12 }}>
      <div style={{ fontWeight: 600 }}>Rows · page {config.page}</div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
        {['alpha', 'bravo', 'charlie'].map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The `onTabEvent` demo the browser test drives (`e2e/events.spec.ts`): a panel
 * that pushes an event up through `emit`; the host echoes it (FR-18).
 */
function Emitter({ emit }: PanelComponentProps) {
  return (
    <div style={{ padding: 12 }}>
      <button data-twge-emit type="button" onClick={() => emit('ping', { n: 1 })}>
        Emit ping
      </button>
    </div>
  );
}

/** A string-keyed catalogue; `forecast` is deliberately absent (§9.8). */
export const registry: PanelRegistry = {
  chart: {
    component: Chart,
    defaultColor: '#0ea5e9',
    createConfig: () => ({ metric: 'revenue', range: '30d' }),
    title: (config) => `${config.metric} · ${config.range}`,
  },
  table: {
    component: Table,
    defaultColor: '#22c55e',
    createConfig: () => ({ page: 1 }),
  },
  emitter: {
    component: Emitter,
    title: () => 'Emitter',
  },
};
