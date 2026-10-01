import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GridEngine, serializeLayout } from '../src/index';
import type { GridEngineHandle, Layout, PanelComponentProps, PanelRegistry } from '../src/index';

/**
 * Expand gate (docs/feat/expand.md). The core assertion is that promotion is a
 * CSS change in place, not a new render tree: a stateful tab component keeps its
 * counter, and no layout write happens.
 */

const Counter = ({ tabId }: PanelComponentProps) => {
  const [n, setN] = useState(0);
  return (
    <button data-testid={`counter-${tabId}`} type="button" onClick={() => setN(n + 1)}>
      {n}
    </button>
  );
};

const registry: PanelRegistry = { counter: { component: Counter, title: () => 'Counter' } };

const layout: Layout = {
  version: 1,
  activeContainerId: 'A',
  root: {
    type: 'split',
    id: 's0',
    axis: 'row',
    children: [
      {
        type: 'container',
        id: 'A',
        weight: 1,
        activeTabId: 't1',
        tabs: [{ id: 't1', component: 'counter', config: {} }],
      },
      {
        type: 'container',
        id: 'B',
        weight: 1,
        activeTabId: 't2',
        tabs: [{ id: 't2', component: 'counter', config: {} }],
      },
    ],
  },
};

function mount(onLayoutChange = vi.fn()) {
  const ref = { current: null as GridEngineHandle | null };
  const utils = render(
    <StrictMode>
      <GridEngine
        ref={ref}
        defaultLayout={layout}
        registry={registry}
        onLayoutChange={onLayoutChange}
      />
    </StrictMode>,
  );
  return { ref, onLayoutChange, ...utils };
}

const containerEl = (id: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-twge-container="${id}"]`);
  if (!el) throw new Error(`no container ${id}`);
  return el;
};

const button = (id: string, mode: 'maximize' | 'fullscreen'): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>(
    `[data-twge-expand="${mode}"][data-twge-container-button="${id}"]`,
  );

const press = (id: string, mode: 'maximize' | 'fullscreen'): void => {
  const el = button(id, mode);
  if (!el) throw new Error(`no ${mode} button for ${id}`);
  fireEvent.click(el);
};

const expanded = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-twge-expanded]'));

afterEach(cleanup);

describe('expand (maximize / fullscreen)', () => {
  test('a stateful tab keeps its DOM node and its state across maximize, mode switch and collapse', () => {
    mount();
    const node = screen.getByTestId('counter-t1');
    fireEvent.click(node);
    expect(node.textContent).toBe('1');

    press('A', 'maximize');
    expect(expanded()).toHaveLength(1);
    expect(screen.getByTestId('counter-t1')).toBe(node);
    expect(node.textContent).toBe('1');

    press('A', 'fullscreen');
    expect(expanded()[0]?.dataset.twgeExpandMode).toBe('fullscreen');
    expect(screen.getByTestId('counter-t1')).toBe(node);
    expect(node.textContent).toBe('1');

    press('A', 'fullscreen');
    expect(expanded()).toHaveLength(0);
    expect(screen.getByTestId('counter-t1')).toBe(node);
    expect(node.textContent).toBe('1');
  });

  test('one { containerId, mode } pair: the latest expands, always exactly one overlay', () => {
    mount();
    press('A', 'maximize');
    expect(expanded()).toHaveLength(1);
    expect(expanded()[0]?.dataset.twgeExpanded).toBe('A');

    press('B', 'maximize');
    expect(expanded()).toHaveLength(1);
    expect(expanded()[0]?.dataset.twgeExpanded).toBe('B');

    press('A', 'fullscreen');
    expect(expanded()).toHaveLength(1);
    expect(expanded()[0]?.dataset.twgeExpanded).toBe('A');
    expect(expanded()[0]?.dataset.twgeExpandMode).toBe('fullscreen');
  });

  test('expanding is not a layout write: no onLayoutChange, JSON byte-identical', () => {
    const { ref, onLayoutChange } = mount();
    const before = serializeLayout(ref.current!.getLayout());

    press('A', 'maximize');
    press('A', 'fullscreen');
    press('A', 'maximize');

    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(serializeLayout(ref.current!.getLayout())).toBe(before);
    expect(before).not.toContain('expand');
  });

  test('styles promote in place per mode and aria-pressed marks the live one', () => {
    mount();
    expect(containerEl('A').style.position).toBe('');

    press('A', 'maximize');
    expect(containerEl('A').style.position).toBe('absolute');
    expect(containerEl('A').style.inset).toBe('0');
    expect(containerEl('A').style.zIndex).toBe('1500');
    expect(button('A', 'maximize')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('A', 'fullscreen')?.getAttribute('aria-pressed')).toBe('false');

    press('A', 'fullscreen');
    expect(containerEl('A').style.position).toBe('fixed');
    expect(containerEl('A').style.inset).toBe('0');
    expect(containerEl('A').style.zIndex).toBe('var(--twge-overlay-z-index, 9999)');
    expect(containerEl('A').style.overscrollBehavior).toBe('contain');
    expect(button('A', 'fullscreen')?.getAttribute('aria-pressed')).toBe('true');
    expect(button('A', 'maximize')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('pressing the active button again collapses completely', () => {
    mount();
    press('A', 'maximize');
    expect(expanded()).toHaveLength(1);
    press('A', 'maximize');
    expect(expanded()).toHaveLength(0);
    expect(containerEl('A').style.position).toBe('');
  });

  test('hideMaximize leaves the fullscreen button, right-aligned via the auto margin', () => {
    render(
      <StrictMode>
        <GridEngine defaultLayout={layout} registry={registry} hideMaximize />
      </StrictMode>,
    );
    expect(button('A', 'maximize')).toBeNull();
    expect(button('A', 'fullscreen')?.style.marginLeft).toBe('auto');
    expect(button('B', 'fullscreen')?.style.marginLeft).toBe('auto');
  });

  test('hideFullscreen leaves the maximize button; both hidden renders neither', () => {
    const { unmount } = render(
      <StrictMode>
        <GridEngine defaultLayout={layout} registry={registry} hideFullscreen />
      </StrictMode>,
    );
    expect(button('A', 'fullscreen')).toBeNull();
    expect(button('A', 'maximize')?.style.marginLeft).toBe('auto');
    unmount();

    render(
      <StrictMode>
        <GridEngine defaultLayout={layout} registry={registry} hideMaximize hideFullscreen />
      </StrictMode>,
    );
    expect(button('A', 'maximize')).toBeNull();
    expect(button('A', 'fullscreen')).toBeNull();
  });

  test('a mode hidden while its overlay is open stays escapable', () => {
    const Harness = ({ hideMaximize }: { hideMaximize?: boolean }) => (
      <StrictMode>
        <GridEngine defaultLayout={layout} registry={registry} hideMaximize={hideMaximize} />
      </StrictMode>
    );
    const { rerender } = render(<Harness />);
    press('A', 'maximize');
    expect(expanded()).toHaveLength(1);

    rerender(<Harness hideMaximize />);
    // Hidden, but active: the collapse control stays so the overlay is escapable.
    const active = button('A', 'maximize');
    expect(active).not.toBeNull();
    expect(active?.getAttribute('aria-pressed')).toBe('true');
    expect(active?.style.marginLeft).toBe('auto');
    // The still-visible sibling mode is unaffected by the other's prop.
    expect(button('A', 'fullscreen')).not.toBeNull();

    press('A', 'maximize');
    expect(expanded()).toHaveLength(0);
  });
});
