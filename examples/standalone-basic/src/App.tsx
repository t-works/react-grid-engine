import { GridEngine, type Layout, type PanelRegistry } from '@t-works/react-grid-engine';

// Static JSON layout with colors — no drag (task 11 deliverable).
const layout: Layout = {
  version: 1,
  activeContainerId: 'c1',
  root: {
    type: 'split', id: 's0', axis: 'row',
    children: [
      {
        type: 'split', id: 's1', axis: 'column', weight: 1,
        children: [
          { type: 'container', id: 'c1', weight: 1, activeTabId: 't1',
            tabs: [{ id: 't1', component: 'welcome', title: 'Welcome', config: {} }] },
          { type: 'container', id: 'c2', weight: 1, activeTabId: 't2',
            tabs: [{ id: 't2', component: 'notes', title: 'Notes', config: {} }] },
          { type: 'container', id: 'c2a', weight: 1, activeTabId: 't2',
            tabs: [{ id: 't2a', component: 'notes', title: 'Notes2', config: {} }] },
          { type: 'container', id: 'c2b', weight: 1, activeTabId: 't2',
            tabs: [{ id: 't2b', component: 'notes', title: 'Notes2', config: {} }] },                                             ],
      },
      { type: 'container', id: 'c3', weight: 1, activeTabId: 't3',
        tabs: [{ id: 't3', component: 'notes', title: 'Notes', config: {} }] },
    ],
  },
};

// Temporary manual-test harness for task 04 (replaced properly in task 11).
const registry: PanelRegistry = {
  welcome: {
    component: ({ config }) => (
      <div style={{ padding: 12 }}>Welcome — config: {JSON.stringify(config)}</div>
    ),
  },
  notes: {
    component: () => <div style={{ padding: 12 }}>Notes — click the other tab to switch.</div>,
    // keepMountedWhenInactive: true,
  },
};

export default function App() {
  return (
    <div style={{ height: '100vh', fontFamily: 'system-ui' }}>
      <GridEngine defaultLayout={layout} registry={registry} />
    </div>
  );
}
