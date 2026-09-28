import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GridEngine, parseLayout, serializeLayout } from '../src/index';
import type {
  GridEngineHandle,
  Layout,
  PanelComponentDef,
  PanelComponentProps,
  PanelRegistry,
} from '../src/index';

// --- fixtures ----------------------------------------------------------------

function TextPanel({ config, tabId }: PanelComponentProps<{ n?: number }>) {
  return (
    <div data-testid={`panel-${tabId}`} data-twge-text>
      n={String(config.n ?? 0)}
    </div>
  );
}

const textDef: PanelComponentDef = { component: TextPanel, title: () => 'fallback' };
const registry: PanelRegistry = { text: textDef };

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
          { id: 'a', component: 'text', title: 'A', config: { n: 1 } },
          { id: 'b', component: 'text', title: 'B', config: { n: 2 } },
        ],
      },
      {
        type: 'container',
        id: 'right',
        weight: 1,
        activeTabId: 'c',
        tabs: [{ id: 'c', component: 'ghost', config: {} }],
      },
    ],
  },
};

const mount = (overrides: { registry?: PanelRegistry; layout?: Layout } = {}) =>
  render(
    <StrictMode>
      <GridEngine
        defaultLayout={overrides.layout ?? layout}
        registry={overrides.registry ?? registry}
      />
    </StrictMode>,
  );

afterEach(cleanup);

// --- test gate ---------------------------------------------------------------

describe('static render (task 04)', () => {
  test('StrictMode render smoke: no warnings, no NaN weights', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { container } = mount();

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(container.innerHTML).not.toContain('NaN');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();

    error.mockRestore();
    warn.mockRestore();
  });

  test('fills the host and scrolls content inside the content box', () => {
    const { container } = mount();
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe('100%');
    expect(root.style.height).toBe('100%');
    expect(root.style.overflow).toBe('hidden');

    const panel = screen.getByRole('tabpanel', { name: 'A' });
    expect(panel.parentElement?.style.overflow).toBe('auto');
    expect(panel.style.width).toBe('100%');
    expect(panel.style.height).toBe('100%');
  });

  test('tablist / tab / tabpanel carry the aria wiring', () => {
    mount();
    expect(screen.getAllByRole('tablist')).toHaveLength(2);

    const tabA = screen.getByRole('tab', { name: 'A' });
    expect(tabA.getAttribute('aria-selected')).toBe('true');
    expect(tabA.getAttribute('aria-controls')).toBe('twge-panel-a');
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('false');

    const panel = screen.getByRole('tabpanel', { name: 'A' });
    expect(panel.id).toBe('twge-panel-a');
    expect(panel.getAttribute('aria-labelledby')).toBe('twge-tab-a');
  });

  test('unknown registry key renders the placeholder and the node survives', () => {
    const ref = { current: null as GridEngineHandle | null };
    render(
      <StrictMode>
        <GridEngine ref={ref} defaultLayout={layout} registry={registry} />
      </StrictMode>,
    );

    const placeholder = screen.getByText(/Missing component/);
    expect(placeholder.textContent).toContain('ghost');

    const saved = serializeLayout(ref.current!.getLayout());
    expect(saved).toContain('"ghost"');
    expect(serializeLayout(parseLayout(saved, layout))).toBe(saved);
  });

  test('keepMountedWhenInactive keeps inactive panels mounted; default unmounts', () => {
    const keeping: PanelRegistry = { text: { ...textDef, keepMountedWhenInactive: true } };
    const { container } = mount({ registry: keeping });
    expect(container.querySelector('#twge-panel-b')).not.toBeNull();
    expect(screen.getAllByRole('tabpanel', { hidden: true })).toHaveLength(3);

    cleanup();
    const { container: unmounting } = mount();
    expect(unmounting.querySelector('#twge-panel-b')).toBeNull();
  });

  test('clicking an inactive tab makes it the visible one', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(screen.getByRole('tabpanel', { name: 'B' }).id).toBe('twge-panel-b');
    expect(screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected')).toBe('true');
  });
});
