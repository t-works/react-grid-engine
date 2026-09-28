/**
 * Draggable divider between two adjacent siblings (FR-7). Pointer Events only
 * (`setPointerCapture`, `touch-action: none`) — never `mousedown`/`mousemove`
 * (PRD §8). No `ResizeObserver`: the parent's extent is read once, on
 * `pointerdown`, only to turn pointer pixels into a relative weight delta; the
 * resize itself is pure weight arithmetic in the reducer (A3).
 *
 * The starting weights are snapshotted on `pointerdown`, so the live
 * re-renders a drag causes cannot feed back into the drag.
 */
import { useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SplitNode } from '../layout/types';
import { weightOf } from '../layout/ops';
import { chrome } from './styles';

interface DragStart {
  /** Pointer position along the parent's axis, in px. */
  pos: number;
  /** Parent extent along that axis, in px. */
  extent: number;
  /** Σ of all sibling weights — converts px to weight (`Δw = Δpx / extent * Σ`). */
  sumWeights: number;
  /** Absolute weight of the child before the divider when the drag started. */
  left: number;
}

export function Splitter({
  split,
  index,
  onResize,
}: {
  /** The split whose children this divider separates. */
  split: SplitNode;
  /** Child index *before* the divider. */
  index: number;
  /** Requested absolute weight for `children[index]`; its next sibling absorbs it. */
  onResize: (splitId: string, index: number, weight: number) => void;
}) {
  const start = useRef<DragStart | null>(null);
  const horizontal = split.axis === 'row';
  const axis = (e: ReactPointerEvent): number => (horizontal ? e.clientX : e.clientY);

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      onPointerDown={(e) => {
        const parent = e.currentTarget.parentElement;
        const left = split.children[index];
        if (!parent || !left) return;
        const rect = parent.getBoundingClientRect();
        const extent = horizontal ? rect.width : rect.height;
        if (!(extent > 0)) return;
        start.current = {
          pos: axis(e),
          extent,
          sumWeights: split.children.reduce((sum, child) => sum + weightOf(child), 0),
          left: weightOf(left),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        const drag = start.current;
        if (!drag) return;
        const delta = (axis(e) - drag.pos) / drag.extent;
        onResize(split.id, index, drag.left + delta * drag.sumWeights);
      }}
      onPointerUp={(e) => {
        start.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      style={{
        flex: '0 0 auto',
        alignSelf: 'stretch',
        // ponytail: the handle is exactly the chrome gap; a fatter touch target is a v2 accessibility item.
        [horizontal ? 'width' : 'height']: chrome('gap', '4px'),
        cursor: horizontal ? 'col-resize' : 'row-resize',
        touchAction: 'none',
        background: 'transparent',
      }}
    />
  );
}
