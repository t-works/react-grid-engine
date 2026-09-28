/**
 * Pure drop-zone math (PRD §7). Rects in, target out — no DOM, no React. This
 * is what the pointer layer calls on every move and what the unit tests drive
 * directly.
 *
 * Zones are 5 per container: 4 edges (a fractional band) + center. There is no
 * host-edge zone (A5): a point outside every container resolves to the nearest
 * container's facing edge, i.e. the outer border/gap drops onto the edge
 * underneath it.
 */
import type { SplitEdge } from '../api';

export type DropZone = 'center' | SplitEdge;

/** Viewport-space rectangle (a `DOMRect` structurally satisfies this). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DropCandidate {
  /** Container id. */
  id: string;
  rect: Rect;
}

export interface ResolvedDrop {
  containerId: string;
  zone: DropZone;
}

/** Fraction of a container's width/height that counts as an edge band. */
export const EDGE_FRACTION = 0.25;

const width = (r: Rect): number => r.right - r.left;
const height = (r: Rect): number => r.bottom - r.top;

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** Zone of a point already known to be inside `rect`. */
export function zoneAt(rect: Rect, x: number, y: number, edge = EDGE_FRACTION): DropZone {
  const w = width(rect);
  const h = height(rect);
  const fx = w > 0 ? (x - rect.left) / w : 0.5;
  const fy = h > 0 ? (y - rect.top) / h : 0.5;
  const sides: [SplitEdge, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['top', fy],
    ['bottom', 1 - fy],
  ];
  let side: SplitEdge = 'left';
  let dist = Infinity;
  for (const [candidate, d] of sides) {
    if (d < dist) {
      dist = d;
      side = candidate;
    }
  }
  return dist < edge ? side : 'center';
}

export function distanceTo(rect: Rect, x: number, y: number): number {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return Math.hypot(dx, dy);
}

/** Facing edge of a point outside `rect` (A5). */
function nearestEdge(rect: Rect, x: number, y: number): DropZone {
  if (containsPoint(rect, x, y)) return zoneAt(rect, x, y);
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
  return dx >= dy
    ? x < (rect.left + rect.right) / 2
      ? 'left'
      : 'right'
    : y < (rect.top + rect.bottom) / 2
      ? 'top'
      : 'bottom';
}

/**
 * Resolve a pointer position against every visible container. Containers never
 * overlap, so the first exact hit wins (candidates are in tree order); a point
 * in a border/gap falls through to the closest container's facing edge.
 */
export function resolveDrop(
  candidates: readonly DropCandidate[],
  x: number,
  y: number,
): ResolvedDrop | undefined {
  const hit = candidates.find((c) => containsPoint(c.rect, x, y));
  if (hit) return { containerId: hit.id, zone: zoneAt(hit.rect, x, y) };

  let best: DropCandidate | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const d = distanceTo(candidate.rect, x, y);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best ? { containerId: best.id, zone: nearestEdge(best.rect, x, y) } : undefined;
}

/** The region a drop would occupy: the whole container for center, its half otherwise. */
export function previewRect(rect: Rect, zone: DropZone): Rect {
  const midX = (rect.left + rect.right) / 2;
  const midY = (rect.top + rect.bottom) / 2;
  switch (zone) {
    case 'left':
      return { ...rect, right: midX };
    case 'right':
      return { ...rect, left: midX };
    case 'top':
      return { ...rect, bottom: midY };
    case 'bottom':
      return { ...rect, top: midY };
    default:
      return rect;
  }
}

/** Reorder index for a tab dragged along a title bar: tabs whose midpoint is left of `x`. */
export function tabInsertIndex(tabRects: readonly Rect[], x: number): number {
  let index = 0;
  for (const rect of tabRects) if (x > (rect.left + rect.right) / 2) index++;
  return index;
}
