import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { memo, StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GridEngine, serializeLayout } from '../src/index';
import type {
  GridEngineHandle,
  Layout,
  PanelComponentProps,
  PanelRegistry,
} from '../src/index';

/**
 * Performance smoke (task 13, §9.9). Deliberately a sanity bound, not a
 * contract: the reference fixture is 20 containers / 80 tabs, and the numbers
 * from the browser run live in `docs/v1/perf.md`.
 *
 * The fixture mirrors `examples/standalone-basic/src/fixtures.ts` (4 columns x
 * 5 rows); the example is the browser-side copy.
 */

const renders = new Map<string, number>();

/** Memoized on purpose — a sibling change must not re-render it. */
const Probe = memo(function Probe({ tabId }: PanelComponentProps) {
  renders.set(tabId, (renders.get(tabId) ?? 0) + 1);
  return <div data-testid={`probe-${tabId}`} />;
});

const registry: PanelRegistry = { probe: { component: Probe } };

function perfLayout(): Layout {
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
              component: 'probe',
              title: `${column}-${r} #${i}`,
              config: {},
            })),
          })),
        };
      }),
    },
  };
}

const engine = (ref?: { current: GridEngineHandle | null }) => (
  <StrictMode>
    <GridEngine ref={ref} defaultLayout={perfLayout()} registry={registry} />
  </StrictMode>
);

beforeEach(() => {
  renders.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('performance smoke (task 13, §9.9)', () => {
  test('20 containers / 80 tabs under StrictMode: no legacy warnings, no NaN, no hydration mismatch', () => {
    const messages: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) =>
      messages.push(args.map(String).join(' ')),
    );
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) =>
      messages.push(args.map(String).join(' ')),
    );

    // Hydration: the server HTML and the client render must agree.
    const html = renderToString(engine());
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);
    render(engine(), { container, hydrate: true });
    cleanup();
    container.remove();

    const text = messages.join('\n');
    expect(messages.filter((m) => /hydrat/i.test(m))).toEqual([]);
    expect(messages.filter((m) => /findDOMNode|ReactDOM\.render|legacy/i.test(m))).toEqual([]);
    expect(text).not.toMatch(/NaN/);

    // A fresh mount to inspect the rendered DOM.
    const { container: host } = render(engine());
    expect(host.querySelectorAll('[data-twge-container]')).toHaveLength(20);
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(80);

    for (const el of host.querySelectorAll('[style]')) {
      expect(el.getAttribute('style')).not.toMatch(/NaN/);
    }
    const layout = JSON.parse(serializeLayout(perfLayout())) as { root: unknown };
    const weights: unknown[] = [];
    const walk = (node: { weight?: unknown; children?: unknown[] }): void => {
      weights.push(node.weight);
      for (const child of node.children ?? []) walk(child as { weight?: unknown });
    };
    walk(layout.root as { weight?: unknown });
    for (const weight of weights) {
      if (weight !== undefined) expect(Number.isFinite(weight as number)).toBe(true);
    }
  });

  test('an inactive container\'s tab does not re-render on a sibling move, resize or recolor', () => {
    const ref = { current: null as GridEngineHandle | null };
    vi.stubGlobal('PointerEvent', MouseEvent);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 800,
    } as DOMRect);

    render(engine(ref));
    const engineApi = ref.current!;
    const target = 'p-3-4-t0';
    const before = renders.get(target);
    expect(before).toBeTypeOf('number');

    act(() => engineApi.moveTab('p-0-0-t1', { kind: 'tab', containerId: 'p-0-1', index: 0 }));
    const separator = screen.getAllByRole('separator')[0]!;
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 400 });
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 400 });
    act(() => engineApi.updateTab('p-0-0-t2', { color: '#ff0000' }));
    act(() => engineApi.moveTab('p-0-0-t3', { kind: 'split', containerId: 'p-1-0', edge: 'right' }));

    expect(renders.get(target)).toBe(before);
  });
});
