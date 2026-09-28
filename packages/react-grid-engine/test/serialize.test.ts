import { describe, expect, test } from 'vitest';
import { parseLayout, serializeLayout, type Layout, type SplitNode } from '../src/index';
import { findContainer, findTab } from '../src/layout/ops';

// --- fixtures ----------------------------------------------------------------

const defaultLayout: Layout = {
  version: 1,
  activeContainerId: 'D',
  root: {
    type: 'container',
    id: 'D',
    activeTabId: 'd1',
    tabs: [{ id: 'd1', component: 'default', config: {} }],
  },
};

const valid: Layout = {
  version: 1,
  activeContainerId: 'B',
  root: {
    type: 'split',
    id: 's1',
    axis: 'row',
    children: [
      {
        type: 'split',
        id: 's2',
        axis: 'column',
        weight: 2,
        children: [
          {
            type: 'container',
            id: 'A',
            activeTabId: 'a2',
            tabs: [
              { id: 'a1', component: 'x', config: { n: 1 } },
              { id: 'a2', component: 'y', title: 'Y', color: '#e11', config: {} },
            ],
          },
          {
            type: 'container',
            id: 'B',
            activeTabId: 'b1',
            tabs: [{ id: 'b1', component: 'z', config: [] }],
          },
        ],
      },
      {
        type: 'container',
        id: 'C',
        activeTabId: 'c1',
        weight: 3,
        tabs: [{ id: 'c1', component: 'w', config: null }],
      },
    ],
  },
};

const noWarn = (): void => {};
const collector = (): { warn: (m: string) => void; messages: string[] } => {
  const messages: string[] = [];
  return { warn: (m) => messages.push(m), messages };
};

const rootOf = (layout: Layout): SplitNode => {
  if (layout.root.type !== 'split') throw new Error('expected a split root');
  return layout.root;
};

// --- round-trip --------------------------------------------------------------

describe('round-trip', () => {
  test('a valid tree survives serialize -> parse identically', () => {
    const json = serializeLayout(valid);
    expect(parseLayout(json, defaultLayout, noWarn)).toEqual(valid);
  });

  test('an empty root round-trips without materializing activeContainerId', () => {
    const empty: Layout = {
      version: 1,
      root: { type: 'container', id: 'root', activeTabId: '', tabs: [] },
    };
    const out = parseLayout(serializeLayout(empty), defaultLayout, noWarn);
    expect(out).toEqual(empty);
    expect('activeContainerId' in out).toBe(false);
  });

  test('ids from JSON win on load', () => {
    const input = {
      version: 1,
      root: {
        type: 'container',
        id: 'given-id',
        activeTabId: 'given-tab',
        tabs: [{ id: 'given-tab', component: 'x', config: {} }],
      },
    };
    const out = parseLayout(input, defaultLayout, noWarn);
    expect(findContainer(out.root, 'given-id')).toBeTruthy();
    expect(findTab(out.root, 'given-tab')).toBeTruthy();
  });
});

// --- dropping unknown fields -------------------------------------------------

describe('unknown fields', () => {
  test('parse drops them and serialize never emits them', () => {
    const withExtra = {
      version: 1,
      chrome: { gap: 4 },
      titlebarHeight: 40,
      root: {
        type: 'container',
        id: 'A',
        activeTabId: 'a1',
        width: 100,
        gap: 8,
        tabs: [{ id: 'a1', component: 'x', config: {}, pie: true }],
      },
    } as unknown as Layout;

    const parsed = parseLayout(withExtra, defaultLayout, noWarn);
    expect(parsed.root).toEqual({
      type: 'container',
      id: 'A',
      activeTabId: 'a1',
      tabs: [{ id: 'a1', component: 'x', config: {} }],
    });
    expect('chrome' in parsed).toBe(false);

    const json = JSON.parse(serializeLayout(withExtra));
    expect(json.titlebarHeight).toBeUndefined();
    expect(json.root.width).toBeUndefined();
    expect(json.root.gap).toBeUndefined();
    expect(json.root.tabs[0].pie).toBeUndefined();
  });
});

// --- version / structural reset ----------------------------------------------

describe('resets to defaultLayout', () => {
  test('a future version warns and falls back', () => {
    const { warn, messages } = collector();
    const out = parseLayout({ version: 2, root: valid.root }, defaultLayout, warn);
    expect(out).toEqual(defaultLayout);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('version');
  });

  test('bad structural shapes warn and fall back', () => {
    const bad = [
      { version: 1, root: { type: 'weird', id: 'x' } },
      { version: 1, root: { type: 'split', id: 's', axis: 'row', children: [] } },
      {
        version: 1,
        root: {
          type: 'split',
          id: 's',
          axis: 'row',
          children: [
            { type: 'container', id: 'A', activeTabId: 'a1', tabs: [{ id: 'a1', component: 'x', config: {} }] },
          ],
        },
      },
      {
        version: 1,
        root: {
          type: 'split',
          id: 's',
          axis: 'row',
          children: [
            { type: 'container', id: 'A', activeTabId: '', tabs: [] },
            { type: 'container', id: 'B', activeTabId: 'b1', tabs: [{ id: 'b1', component: 'x', config: {} }] },
          ],
        },
      },
    ];
    for (const input of bad) {
      const { warn, messages } = collector();
      expect(parseLayout(input, defaultLayout, warn)).toEqual(defaultLayout);
      expect(messages).toHaveLength(1);
    }
  });
});

// --- dangling references (the deliberate asymmetry) --------------------------

describe('dangling references are repaired, not rejected', () => {
  test('activeTabId -> first tab; activeContainerId -> first container; rest survives', () => {
    const input = {
      version: 1,
      activeContainerId: 'ghost',
      root: {
        type: 'split',
        id: 's1',
        axis: 'row',
        children: [
          {
            type: 'container',
            id: 'A',
            activeTabId: 'ghost-tab',
            tabs: [
              { id: 'a1', component: 'x', config: {} },
              { id: 'a2', component: 'y', config: {} },
            ],
          },
          { type: 'container', id: 'B', activeTabId: 'b1', tabs: [{ id: 'b1', component: 'z', config: {} }] },
        ],
      },
    };
    const { warn, messages } = collector();
    const out = parseLayout(input, defaultLayout, warn);

    expect(out.activeContainerId).toBe('A');
    expect(rootOf(out).children[0]).toMatchObject({ activeTabId: 'a1' });
    expect(findContainer(out.root, 'B')?.tabs.map((t) => t.id)).toEqual(['b1']);
    expect(messages).toHaveLength(0);
  });
});

// --- hostile input never throws ----------------------------------------------

describe('hostile input', () => {
  test('a table of malformed values never throws', () => {
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      true,
      [],
      {},
      '',
      'not json',
      '{',
      '{"version":1}',
      '[]',
      { version: 1 },
      { version: 1, root: null },
      { version: 1, root: {} },
      { version: '1', root: valid.root },
      { version: -1, root: valid.root },
      { version: 1, root: { type: 'split', id: 's', axis: 'x', children: [] } },
    ];
    for (const input of hostile) {
      expect(() => parseLayout(input, defaultLayout, noWarn)).not.toThrow();
    }
  });

  test('deep nesting hits the depth guard instead of the call stack', () => {
    let node: Record<string, unknown> = {
      type: 'container',
      id: 'leaf',
      activeTabId: 't',
      tabs: [{ id: 't', component: 'x', config: {} }],
    };
    for (let i = 0; i < 1200; i += 1) {
      node = {
        type: 'split',
        id: `s${i}`,
        axis: 'row',
        children: [
          node,
          {
            type: 'container',
            id: `c${i}`,
            activeTabId: 't',
            tabs: [{ id: 't', component: 'x', config: {} }],
          },
        ],
      };
    }
    const { warn, messages } = collector();
    expect(() => parseLayout({ version: 1, root: node }, defaultLayout, warn)).not.toThrow();
    expect(messages[0]).toContain('deeply');
  });
});
