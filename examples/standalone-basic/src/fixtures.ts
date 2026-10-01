import type { ContainerNode, Layout } from '@t-works/react-grid-engine';

function oneTab(id: string, tabId: string, component: string, title: string): ContainerNode {
  return {
    type: 'container',
    id,
    weight: 1,
    activeTabId: tabId,
    tabs: [{ id: tabId, component, title, config: {} }],
  };
}

/** §9.1 reference fixture: three sibling containers to be nested by dragging. */
export const flatLayout: Layout = {
  version: 1,
  activeContainerId: 'c1',
  root: {
    type: 'split',
    id: 's0',
    axis: 'row',
    children: [
      oneTab('c1', 't1', 'welcome', 'Welcome'),
      oneTab('c2', 't2', 'notes', 'Notes'),
      oneTab('c3', 't3', 'notes', 'Activity'),
    ],
  },
};

/** Task 13 reference fixture: 20 containers / 80 tabs (4 columns x 5 rows). */
export function perfLayout(): Layout {
  return {
    version: 1,
    activeContainerId: 'p-0-0',
    root: {
      type: 'split',
      id: 'ps0',
      axis: 'row',
      children: Array.from({ length: 4 }, (_, c) => {
        const column = `p-${c}`;
        return {
          type: 'split' as const,
          id: `ps-${c}`,
          axis: 'column' as const,
          weight: 1,
          children: Array.from({ length: 5 }, (_, r) => ({
            type: 'container' as const,
            id: `${column}-${r}`,
            weight: 1,
            activeTabId: `${column}-${r}-t0`,
            tabs: Array.from({ length: 4 }, (_, i) => ({
              id: `${column}-${r}-t${i}`,
              component: 'notes',
              title: `${column}-${r} #${i}`,
              config: {},
            })),
          })),
        };
      }),
    },
  };
}
