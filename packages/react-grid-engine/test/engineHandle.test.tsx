import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { memo, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GridEngine } from '../src/index';
import type { GridEngineHandle, Layout, PanelComponentProps, PanelRegistry } from '../src/index';

// --- fixtures ----------------------------------------------------------------

/** Render counters and the last `engine` each tab saw, keyed by tab id. */
const renders = new Map<string, number>();
const engines = new Map<string, GridEngineHandle>();

/** Memoized on purpose — the gate is "no re-render unless its own props change". */
const Probe = memo(function Probe({ config, tabId, engine }: PanelComponentProps<{ n: number }>) {
  renders.set(tabId, (renders.get(tabId) ?? 0) + 1);
  engines.set(tabId, engine);
  return (
    <div data-testid={`probe-${tabId}`} data-n={config.n}>
      {tabId}
    </div>
  );
});

const registry: PanelRegistry = {
  probe: { component: Probe, createConfig: () => ({ n: 0 }) },
};

const layout: Layout = {
  version: 1,
  activeContainerId: 'left',
  root: {
    type: 'split',
    id: 's0',
    axis: 'row',
    children: [
      {
        type: 'container',
        id: 'left',
        weight: 1,
        activeTabId: 'a',
        tabs: [
          { id: 'a', component: 'probe', title: 'A', config: { n: 1 } },
          { id: 'b', component: 'probe', title: 'B', config: { n: 2 } },
        ],
      },
      {
        type: 'container',
        id: 'right',
        weight: 1,
        activeTabId: 'c',
        tabs: [
          { id: 'c', component: 'probe', title: 'C', config: { n: 3 } },
          { id: 'd', component: 'probe', title: 'D', config: { n: 4 } },
        ],
      },
    ],
  },
};

const mount = () => {
  const ref = { current: null as GridEngineHandle | null };
  render(
    <StrictMode>
      <GridEngine ref={ref} defaultLayout={layout} registry={registry} />
    </StrictMode>,
  );
  return ref as { current: GridEngineHandle };
};

/** jsdom has no PointerEvent; MouseEvent supplies clientX. */
const rect = { width: 1000, height: 500 } as DOMRect;

beforeEach(() => {
  renders.clear();
  engines.clear();
  vi.stubGlobal('PointerEvent', MouseEvent);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// --- test gate ---------------------------------------------------------------

describe('props.engine guarantee (task 10, §9.10)', () => {
  test('memoized tab does not re-render on a sibling tab move, resize or recolor', () => {
    const ref = mount();
    const before = renders.get('c');

    // A sibling tab moves (reorder inside its own container).
    act(() => ref.current.moveTab('a', { kind: 'tab', containerId: 'left', index: 1 }));
    // The split resizes.
    const separator = screen.getAllByRole('separator')[0]!;
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 400 });
    // A sibling tab recolors.
    act(() => ref.current.updateTab('b', { color: '#ff0000' }));
    // A sibling tab moves out into a new split.
    act(() => ref.current.moveTab('a', { kind: 'split', containerId: 'left', edge: 'right' }));

    expect(renders.get('c')).toBe(before);
  });

  test('handle identity is identical across those changes, for ref and every tab', () => {
    const ref = mount();
    const seen = engines.get('c');
    const before = renders.get('c');

    act(() => ref.current.moveTab('a', { kind: 'tab', containerId: 'left', index: 1 }));
    act(() => ref.current.updateTab('b', { color: '#00ff00' }));

    expect(engines.get('c')).toBe(seen);
    expect(ref.current).toBe(seen);
    expect(engines.get('a')).toBe(seen);
    expect(renders.get('c')).toBe(before);
  });
});

test('no React context is used to hand the engine down', async () => {
  // Typed inline: this package has no `@types/node`, and the scan is test-only.
  const fs = (await import('node:fs' as string)) as {
    readdirSync(dir: string, o: { recursive: true; encoding: 'utf8' }): string[];
    readFileSync(path: string, encoding: 'utf8'): string;
  };
  const sources: string[] = [];
  for (const file of fs.readdirSync('src', { recursive: true, encoding: 'utf8' })) {
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      sources.push(fs.readFileSync(`src/${file}`, 'utf8'));
    }
  }

  expect(sources.join('\n')).not.toMatch(/createContext|useContext|\.Provider\b/);
});
