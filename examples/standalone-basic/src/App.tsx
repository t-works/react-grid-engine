import type { Layout } from '@t-works/react-grid-engine';

// Static JSON layout with colors — no drag (task 11 deliverable).
const layout: Layout = {
  version: 1,
  activeContainerId: 'c1',
  root: {
    type: 'container',
    id: 'c1',
    activeTabId: 't1',
    tabs: [
      { id: 't1', component: 'welcome', title: 'Welcome', color: '#e11', config: {} },
      { id: 't2', component: 'notes', title: 'Notes', config: {} },
    ],
  },
};

export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 16 }}>
      <h1>standalone-basic</h1>
      <pre>{JSON.stringify(layout, null, 2)}</pre>
    </main>
  );
}
