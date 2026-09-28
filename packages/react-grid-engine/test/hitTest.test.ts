import { describe, expect, test } from 'vitest';
import {
  EDGE_FRACTION,
  previewRect,
  resolveDrop,
  tabInsertIndex,
  zoneAt,
} from '../src/dnd/hitTest';
import type { Rect } from '../src/dnd/hitTest';

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({
  left,
  top,
  right,
  bottom,
});

const A = { id: 'A', rect: rect(0, 0, 100, 100) };
const B = { id: 'B', rect: rect(100, 0, 200, 100) };

describe('zoneAt (5 zones)', () => {
  const r = rect(0, 0, 100, 100);

  test('center and the four edges', () => {
    expect(zoneAt(r, 50, 50)).toBe('center');
    expect(zoneAt(r, 5, 50)).toBe('left');
    expect(zoneAt(r, 95, 50)).toBe('right');
    expect(zoneAt(r, 50, 5)).toBe('top');
    expect(zoneAt(r, 50, 95)).toBe('bottom');
  });

  test('the edge band is exactly EDGE_FRACTION wide', () => {
    expect(zoneAt(r, 25, 50)).toBe('center');
    expect(zoneAt(r, 24, 50)).toBe('left');
    expect(EDGE_FRACTION).toBe(0.25);
  });

  test('the nearest side wins in a corner', () => {
    expect(zoneAt(r, 2, 10)).toBe('left');
    expect(zoneAt(r, 10, 2)).toBe('top');
  });
});

describe('resolveDrop', () => {
  test('an exact hit resolves inside that container', () => {
    expect(resolveDrop([A, B], 50, 50)).toEqual({ containerId: 'A', zone: 'center' });
    expect(resolveDrop([A, B], 150, 50)).toEqual({ containerId: 'B', zone: 'center' });
  });

  test('A5: a point outside every container resolves to the facing edge beneath it', () => {
    expect(resolveDrop([A, B], -10, 50)).toEqual({ containerId: 'A', zone: 'left' });
    expect(resolveDrop([A, B], 250, 50)).toEqual({ containerId: 'B', zone: 'right' });
    expect(resolveDrop([A, B], 50, -10)).toEqual({ containerId: 'A', zone: 'top' });
    expect(resolveDrop([A, B], 150, 110)).toEqual({ containerId: 'B', zone: 'bottom' });
  });

  test('a point in the gap resolves to the nearest container edge', () => {
    const gapped = [
      { id: 'A', rect: rect(0, 0, 100, 100) },
      { id: 'B', rect: rect(110, 0, 210, 100) },
    ];
    expect(resolveDrop(gapped, 105, 50)).toEqual({ containerId: 'A', zone: 'right' });
    expect(resolveDrop(gapped, 108, 50)).toEqual({ containerId: 'B', zone: 'left' });
  });

  test('no candidates resolves to undefined', () => {
    expect(resolveDrop([], 0, 0)).toBeUndefined();
  });
});

describe('previewRect', () => {
  const r = rect(0, 0, 100, 100);

  test('center is the whole container, an edge is that half', () => {
    expect(previewRect(r, 'center')).toEqual(r);
    expect(previewRect(r, 'left')).toEqual(rect(0, 0, 50, 100));
    expect(previewRect(r, 'right')).toEqual(rect(50, 0, 100, 100));
    expect(previewRect(r, 'top')).toEqual(rect(0, 0, 100, 50));
    expect(previewRect(r, 'bottom')).toEqual(rect(0, 50, 100, 100));
  });
});

describe('tabInsertIndex', () => {
  const tabs = [rect(0, 0, 60, 28), rect(60, 0, 120, 28), rect(120, 0, 180, 28)];

  test('counts the tabs whose midpoint is left of the pointer', () => {
    expect(tabInsertIndex(tabs, 10)).toBe(0);
    expect(tabInsertIndex(tabs, 59)).toBe(1);
    expect(tabInsertIndex(tabs, 95)).toBe(2);
    expect(tabInsertIndex(tabs, 200)).toBe(3);
  });
});
