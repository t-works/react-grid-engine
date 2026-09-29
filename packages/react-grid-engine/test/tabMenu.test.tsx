import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GridEngine } from '../src/index';
import type {
  GridEngineHandle,
  Layout,
  PanelComponentDef,
  PanelRegistry,
  Tab,
} from '../src/index';
import { findContainer } from '../src/layout/ops';

// --- fixtures ----------------------------------------------------------------

const Panel = ({ tabId }: { tabId: string }) => <div data-testid={`panel-${tabId}`} />;

const tab = (id: string, component = 'text', extra: Partial<Tab> = {}): Tab => ({
  id,
  component,
  title: id.toUpperCase(),
  config: {},
  ...extra,
});

const layoutOf = (tabs: Tab[]): Layout => ({
  version: 1,
  activeContainerId: 'A',
  root: { type: 'container', id: 'A', activeTabId: tabs[0]?.id ?? '', tabs },
});

const mount = (registry: PanelRegistry, layout: Layout) => {
  const ref = { current: null as GridEngineHandle | null };
  const utils = render(
    <StrictMode>
      <GridEngine ref={ref} defaultLayout={layout} registry={registry} />
    </StrictMode>,
  );
  return { ref, ...utils };
};

const containerTabs = (handle: GridEngineHandle): string[] =>
  findContainer(handle.getLayout().root, 'A')?.tabs.map((t) => t.id) ?? [];

const titleOf = (handle: GridEngineHandle, tabId: string): string | undefined =>
  findContainer(handle.getLayout().root, 'A')?.tabs.find((t) => t.id === tabId)?.title;

afterEach(cleanup);

// --- test gate ---------------------------------------------------------------

describe('tab menu + add/close guards (task 07)', () => {
  test('the + control is always rendered and lists only addable entries (A15)', () => {
    const registry: PanelRegistry = {
      alpha: { component: Panel, addable: true } satisfies PanelComponentDef,
      beta: { component: Panel, addable: false } satisfies PanelComponentDef,
    };
    mount(registry, layoutOf([tab('t1')]));

    const add = screen.getByLabelText('Add tab') as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    fireEvent.click(add);

    expect(screen.getByRole('menuitem', { name: 'alpha' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'beta' })).toBeNull();
  });

  test('the + control is disabled with zero addable entries, but still rendered (A15)', () => {
    const registry: PanelRegistry = {
      beta: { component: Panel, addable: false } satisfies PanelComponentDef,
    };
    // The existing tab uses a component that is itself not addable.
    mount(registry, layoutOf([tab('b', 'beta')]));

    const add = screen.getByLabelText('Add tab') as HTMLButtonElement;
    expect(add).toBeTruthy();
    expect(add.disabled).toBe(true);
  });

  test('an allowMultiple:false instance is hidden from + ; programmatic add still works (A13)', () => {
    const registry: PanelRegistry = {
      single: { component: Panel, allowMultiple: false } satisfies PanelComponentDef,
      other: { component: Panel } satisfies PanelComponentDef,
    };
    const { ref } = mount(registry, layoutOf([tab('s', 'single')]));

    fireEvent.click(screen.getByLabelText('Add tab'));
    expect(screen.queryByRole('menuitem', { name: 'single' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'other' })).toBeTruthy();
    // Close the menu so the click below is not swallowed by the outside handler.
    fireEvent.keyDown(document, { key: 'Escape' });

    const id = ref.current!.addTab({ component: 'single' });
    expect(containerTabs(ref.current!)).toContain(id);
  });

  test('close controls honour closeable:false and allowMultiple:false (FR-11)', () => {
    const registry: PanelRegistry = {
      locked: { component: Panel, closeable: false } satisfies PanelComponentDef,
      single: { component: Panel, allowMultiple: false } satisfies PanelComponentDef,
      normal: { component: Panel } satisfies PanelComponentDef,
    };
    mount(registry, layoutOf([tab('l', 'locked'), tab('s', 'single'), tab('n', 'normal')]));

    expect(screen.queryByLabelText('Close L')).toBeNull();
    expect(screen.queryByLabelText('Close S')).toBeNull();
    expect(screen.getByLabelText('Close N')).toBeTruthy();
  });

  test('§9.7 canClose resolving false leaves the tab and container in place', async () => {
    const canClose = vi.fn().mockResolvedValue(false);
    const registry: PanelRegistry = {
      guarded: { component: Panel, canClose } satisfies PanelComponentDef,
    };
    const { ref } = mount(registry, layoutOf([tab('g', 'guarded')]));

    fireEvent.click(screen.getByLabelText('Close G'));
    await waitFor(() => expect(canClose).toHaveBeenCalledTimes(1));
    expect(containerTabs(ref.current!)).toEqual(['g']);
  });

  test('§9.7 a rejecting canClose warns and offers force close (A14)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const canClose = vi.fn().mockRejectedValue(new Error('unsaved'));
    const registry: PanelRegistry = {
      guarded: { component: Panel, canClose } satisfies PanelComponentDef,
    };
    const { ref } = mount(registry, layoutOf([tab('g', 'guarded')]));

    fireEvent.click(screen.getByLabelText('Close G'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Force close' }));

    expect(warn).toHaveBeenCalled();
    expect(containerTabs(ref.current!)).toEqual([]);
    warn.mockRestore();
  });

  test('the imperative removeTab bypasses canClose (FR-12)', () => {
    const canClose = vi.fn(() => false);
    const registry: PanelRegistry = {
      guarded: { component: Panel, canClose } satisfies PanelComponentDef,
    };
    const { ref } = mount(registry, layoutOf([tab('g', 'guarded')]));

    ref.current!.removeTab('g');
    expect(canClose).not.toHaveBeenCalled();
    expect(containerTabs(ref.current!)).toEqual([]);
  });

  test('close others skips non-closeable and allowMultiple:false tabs (A14)', () => {
    const registry: PanelRegistry = {
      normal: { component: Panel } satisfies PanelComponentDef,
      locked: { component: Panel, closeable: false } satisfies PanelComponentDef,
      single: { component: Panel, allowMultiple: false } satisfies PanelComponentDef,
    };
    const { ref } = mount(
      registry,
      layoutOf([tab('n1', 'normal'), tab('n2', 'normal'), tab('l', 'locked'), tab('s', 'single')]),
    );

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'N1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close others' }));

    expect(containerTabs(ref.current!)).toEqual(['n1', 'l', 's']);
  });

  test('close all skips non-closeable and allowMultiple:false tabs (A14)', () => {
    const registry: PanelRegistry = {
      normal: { component: Panel } satisfies PanelComponentDef,
      locked: { component: Panel, closeable: false } satisfies PanelComponentDef,
      single: { component: Panel, allowMultiple: false } satisfies PanelComponentDef,
    };
    const { ref } = mount(
      registry,
      layoutOf([tab('n1', 'normal'), tab('l', 'locked'), tab('s', 'single')]),
    );

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'N1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close all' }));

    expect(containerTabs(ref.current!)).toEqual(['l', 's']);
  });

  test('rename writes Tab.title; titleEditable:false hides the entry (A16)', () => {
    const registry: PanelRegistry = {
      normal: { component: Panel } satisfies PanelComponentDef,
      fixed: { component: Panel, titleEditable: false } satisfies PanelComponentDef,
    };
    const { ref } = mount(registry, layoutOf([tab('n', 'normal'), tab('f', 'fixed')]));

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'N' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Tab title'), { target: { value: 'Renamed' } });
    fireEvent.keyDown(screen.getByLabelText('Tab title'), { key: 'Enter' });

    expect(titleOf(ref.current!, 'n')).toBe('Renamed');

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'F' }));
    expect(screen.queryByRole('menuitem', { name: 'Rename' })).toBeNull();
  });

  test('tab controls carry text/ARIA, not color alone', () => {
    const registry: PanelRegistry = { normal: { component: Panel } satisfies PanelComponentDef };
    mount(registry, layoutOf([tab('n', 'normal')]));

    expect(screen.getByRole('tab', { name: 'N' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('Close N')).toBeTruthy();
  });
});
