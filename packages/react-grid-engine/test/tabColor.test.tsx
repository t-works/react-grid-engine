import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GridEngine, parseLayout, serializeLayout } from '../src/index';
import type {
  GridEngineHandle,
  Layout,
  PanelComponentDef,
  PanelRegistry,
  Tab,
  TabColorChangeHandler,
} from '../src/index';
import { isHexColor, resolveTabColor, sameColor, toInputHex } from '../src/color';
import { findContainer } from '../src/layout/ops';

// --- fixtures ----------------------------------------------------------------

const Panel = ({ tabId }: { tabId: string }) => <div data-testid={`panel-${tabId}`} />;

const tab = (id: string, extra: Partial<Tab> = {}): Tab => ({
  id,
  component: 'text',
  title: id.toUpperCase(),
  config: {},
  ...extra,
});

const layoutOf = (tabs: Tab[]): Layout => ({
  version: 1,
  activeContainerId: 'A',
  root: { type: 'container', id: 'A', activeTabId: tabs[0]?.id ?? '', tabs },
});

interface MountOptions {
  layout: Layout;
  registry?: PanelRegistry;
  palette?: readonly string[];
  onColor?: TabColorChangeHandler;
}

const mount = ({ layout, registry, palette, onColor }: MountOptions) => {
  const ref = { current: null as GridEngineHandle | null };
  const utils = render(
    <StrictMode>
      <GridEngine
        ref={ref}
        defaultLayout={layout}
        registry={registry ?? { text: { component: Panel } }}
        tabColorPalette={palette}
        onTabColorChange={onColor}
      />
    </StrictMode>,
  );
  return { ref, ...utils };
};

const tabOf = (handle: GridEngineHandle, id: string): Tab | undefined =>
  findContainer(handle.getLayout().root, 'A')?.tabs.find((t) => t.id === id);

const wrapOf = (container: HTMLElement, id: string): HTMLElement =>
  container.querySelector(`[data-twge-tab-wrap="${id}"]`) as HTMLElement;

const pipOf = (container: HTMLElement, id: string): HTMLElement =>
  wrapOf(container, id).querySelector('[data-twge-tab-pip]') as HTMLElement;

/** Compare a declared color whether jsdom keeps the literal or normalizes it. */
const rgbOf = (hex: string): string => {
  const h = hex.slice(1);
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const declaresColor = (el: HTMLElement, value: string): boolean => {
  const raw = `${el.style.background}${el.style.backgroundColor}`.toLowerCase();
  return raw.includes(value.toLowerCase()) || raw.includes(rgbOf(value));
};

afterEach(cleanup);

// --- unit: validation + resolution -------------------------------------------

describe('tab color values (task 08)', () => {
  test('accepts #rgb / #rrggbb / #rrggbbaa, case-insensitively', () => {
    for (const ok of ['#e11', '#E11', '#ee1111', '#EE1111', '#ee1111aa', '#00000000']) {
      expect(isHexColor(ok)).toBe(true);
    }
    for (const bad of ['red', 'url(x)', '#e1', '#ee111', '#ee1111a', 'rgb(1,2,3)', '', undefined]) {
      expect(isHexColor(bad)).toBe(false);
    }
  });

  test('resolution: tab.color -> defaultColor -> theme default (undefined)', () => {
    expect(resolveTabColor('#e11', '#0af')).toBe('#e11');
    expect(resolveTabColor(undefined, '#0af')).toBe('#0af');
    expect(resolveTabColor(undefined, undefined)).toBeUndefined();
  });

  test('an invalid value is ignored and falls through, not thrown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveTabColor('url(x)', '#0af')).toBe('#0af');
    expect(resolveTabColor('red', undefined)).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('sameColor is case-insensitive; toInputHex normalizes to #rrggbb', () => {
    expect(sameColor('#E11', '#e11')).toBe(true);
    expect(sameColor(undefined, '#e11')).toBe(false);
    expect(toInputHex('#e11')).toBe('#ee1111');
    expect(toInputHex('#ee1111aa')).toBe('#ee1111');
    expect(toInputHex('red')).toBe('#ffffff');
  });
});

// --- §9.5 rendering + round-trip ---------------------------------------------

describe('§9.5 tab accent rendering', () => {
  test('#e11 renders pip + tinted active background after a save/load round-trip', () => {
    const colored = layoutOf([tab('c', { color: '#e11' })]);
    const reloaded = parseLayout(serializeLayout(colored), colored);

    const { container } = mount({ layout: reloaded });

    expect(declaresColor(pipOf(container, 'c'), '#e11')).toBe(true);
    const wrap = wrapOf(container, 'c');
    expect(wrap.style.background).toContain('color-mix(in oklab, #e11 12%');
    expect(wrap.style.boxShadow).toContain('#e11');
  });

  test('an invalid value falls back to the registry default, no throw (§9.5)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry: PanelRegistry = {
      text: { component: Panel, defaultColor: '#0af' } satisfies PanelComponentDef,
    };
    const { container } = mount({
      layout: layoutOf([tab('bad', { color: 'color(display-p3 1 0 0)' }), tab('fallback')]),
      registry,
    });

    expect(declaresColor(pipOf(container, 'bad'), '#0af')).toBe(true);
    expect(declaresColor(pipOf(container, 'fallback'), '#0af')).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test('color is never the only carrier of meaning: label and active state remain', () => {
    mount({ layout: layoutOf([tab('c', { color: '#e11' })]) });
    const selected = screen.getByRole('tab', { name: 'C' });
    expect(selected.textContent).toContain('C');
    expect(selected.getAttribute('aria-selected')).toBe('true');
  });

  test('without an accent there is no pip; the theme accent paints the underline', () => {
    const { container } = mount({ layout: layoutOf([tab('plain')]) });
    expect(container.querySelector('[data-twge-tab-pip]')).toBeNull();
    expect(wrapOf(container, 'plain').style.boxShadow).toContain('--twge-tab-accent');
  });
});

// --- §9.6 picker -------------------------------------------------------------

describe('§9.6 tab color picker', () => {
  const openColorMenu = (name: string): void => {
    fireEvent.contextMenu(screen.getByRole('tab', { name }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tab color' }));
  };

  test('a swatch emits onTabColorChange with the hex, after the tab updates', () => {
    const ref = { current: null as GridEngineHandle | null };
    const onColor = vi.fn();
    let colorAtEmit: string | undefined;
    onColor.mockImplementation(() => {
      colorAtEmit = tabOf(ref.current!, 't1')?.color;
    });

    render(
      <StrictMode>
        <GridEngine
          ref={ref}
          defaultLayout={layoutOf([tab('t1')])}
          registry={{ text: { component: Panel } }}
          tabColorPalette={['#e11', '#0af']}
          onTabColorChange={onColor}
        />
      </StrictMode>,
    );

    openColorMenu('T1');
    fireEvent.click(screen.getByRole('menuitemradio', { name: '#e11' }));

    expect(onColor).toHaveBeenCalledWith('t1', '#e11', { source: 'ui' });
    expect(colorAtEmit).toBe('#e11');
    expect(tabOf(ref.current!, 't1')?.color).toBe('#e11');
  });

  test('the current color is marked checked; the built-in preset set renders when no palette', () => {
    mount({ layout: layoutOf([tab('t1', { color: '#e11' })]), palette: ['#e11', '#0af'] });
    openColorMenu('T1');

    expect(screen.getByRole('menuitemradio', { name: '#e11' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: '#0af' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(screen.getByLabelText('Custom color')).toBeTruthy();

    cleanup();
    // No app palette -> themed built-in presets by accessible name.
    mount({ layout: layoutOf([tab('t1')]) });
    openColorMenu('T1');
    expect(screen.getByRole('menuitemradio', { name: 'Red' })).toBeTruthy();
    expect(screen.getByRole('menuitemradio', { name: 'Blue' })).toBeTruthy();
  });

  test('Custom… uses the native color input and applies immediately', () => {
    const onColor = vi.fn();
    mount({ layout: layoutOf([tab('t1', { color: '#e11' })]), onColor });
    openColorMenu('T1');

    const input = screen.getByLabelText('Custom color') as HTMLInputElement;
    expect(input.type).toBe('color');
    expect(input.value).toBe('#ee1111');

    fireEvent.change(input, { target: { value: '#123456' } });
    expect(onColor).toHaveBeenCalledWith('t1', '#123456', { source: 'ui' });
  });

  test('Default clears tab.color by emitting null', () => {
    const onColor = vi.fn();
    const { ref } = mount({ layout: layoutOf([tab('t1', { color: '#e11' })]), onColor });
    openColorMenu('T1');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Default' }));

    expect(onColor).toHaveBeenCalledWith('t1', null, { source: 'ui' });
    expect(tabOf(ref.current!, 't1')?.color).toBeUndefined();
  });

  test('an app palette filters non-hex entries', () => {
    mount({ layout: layoutOf([tab('t1')]), palette: ['#e11', 'red', '#0af'] });
    openColorMenu('T1');
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(2);
    expect(screen.getByRole('menuitemradio', { name: '#e11' })).toBeTruthy();
    expect(screen.queryByRole('menuitemradio', { name: 'red' })).toBeNull();
  });
});

// --- A7 updateTab semantics --------------------------------------------------

describe('A7 updateTab color semantics', () => {
  test('color: null clears; color: undefined leaves the value alone', () => {
    const { ref } = mount({ layout: layoutOf([tab('t1', { color: '#e11' })]) });

    ref.current!.updateTab('t1', { color: undefined });
    expect(tabOf(ref.current!, 't1')?.color).toBe('#e11');

    ref.current!.updateTab('t1', { color: null });
    expect(tabOf(ref.current!, 't1')?.color).toBeUndefined();
  });

  test('updateTab on a missing id is a no-op', () => {
    const { ref } = mount({ layout: layoutOf([tab('t1')]) });
    expect(() => ref.current!.updateTab('nope', { color: '#e11' })).not.toThrow();
    expect(tabOf(ref.current!, 't1')?.color).toBeUndefined();
  });
});
