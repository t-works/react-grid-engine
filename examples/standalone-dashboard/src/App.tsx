import type { GridEngineHandle, Layout } from '@t-works/react-grid-engine';

// Full drag/drop + persistence target (task 11 deliverable). Static for now:
// the engine handle is the seam the example wires to localStorage later.
const storageKey = 'react-grid-engine:standalone-dashboard';

export function loadLayout(fallback: Layout): Layout {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as Layout;
  } catch {
    return fallback;
  }
}

export function persist(engine: GridEngineHandle): void {
  localStorage.setItem(storageKey, JSON.stringify(engine.getLayout()));
}

const layout: Layout = {
  version: 1,
  activeContainerId: 'left',
  root: {
    type: 'split',
    id: 'root-split',
    axis: 'row',
    children: [
      {
        type: 'container',
        id: 'left',
        weight: 1,
        activeTabId: 'chart',
        tabs: [{ id: 'chart', component: 'chart', title: 'Revenue', config: { range: '30d' } }],
      },
      {
        type: 'container',
        id: 'right',
        weight: 1,
        activeTabId: 'table',
        tabs: [{ id: 'table', component: 'table', title: 'Rows', config: {} }],
      },
    ],
  },
};

export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>standalone-dashboard</h1>
      <pre>{JSON.stringify(layout, null, 2)}</pre>
    </main>
  );
}
