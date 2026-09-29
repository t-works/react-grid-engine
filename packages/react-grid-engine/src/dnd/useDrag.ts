/**
 * The hand-written drag layer (PRD §7, FR-4–FR-8). Pointer Events only —
 * `pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`; never
 * `mousedown`/`mousemove` (PRD §8).
 *
 * A press becomes a drag after a small movement threshold, so a plain click on
 * a tab still focuses it (and no pointer capture is taken before that, which is
 * what keeps the browser from retargeting the `click`). Dragging shows a
 * **preview**; the layout is only touched on `pointerup`, so `pointermove`
 * never relayouts and `Esc` needs no undo — the prior layout was never left.
 *
 * Measurement happens once, on `pointerdown`: the layout cannot change during a
 * drag, so per-move DOM reads (and `ResizeObserver`) are unnecessary.
 */
import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { DropTarget } from '../api';
import { containsPoint, previewRect, resolveDrop, tabInsertIndex } from './hitTest';
import type { DropCandidate, Rect } from './hitTest';

/** Pixels of movement before a press is a drag rather than a click. */
const DRAG_THRESHOLD = 4;

interface Session {
  kind: 'tab' | 'container';
  /** Dragged tab id, or dragged container id. */
  id: string;
  /** Home container of the dragged tab. */
  containerId: string;
  /** Text shown on the drag sprite. */
  label: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** The dragged container's own rect — dropping here is a no-op. */
  self: Rect;
  /** Home title bar (tab drags reorder while inside it). */
  titlebar: Rect | undefined;
  /** Sibling tab rects in the home title bar, dragged tab excluded. */
  tabRects: Rect[];
  candidates: DropCandidate[];
  root: Rect;
  active: boolean;
  target: DropTarget | null;
  /** Last rendered overlay, so a move within one zone does not re-render. */
  previewKey: string;
}

interface Resolution {
  target: DropTarget;
  /** `null` for an in-titlebar reorder (no overlay). */
  overlay: Rect | null;
}

export interface DragHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
}

export interface DragOptions {
  onDropTab: (tabId: string, target: DropTarget) => void;
  onDropContainer: (containerId: string, target: DropTarget) => void;
}

export interface DragResult {
  handlers: DragHandlers;
  /** Root-relative overlay box; `null` when nothing should be drawn. */
  preview: CSSProperties | null;
  /** Cursor-following label; `null` when not dragging. */
  sprite: { x: number; y: number; label: string } | null;
}

/** Viewport rect as a plain object — a `DOMRect` has no own enumerable props. */
const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

function overlayStyle(rect: Rect, root: Rect): CSSProperties {
  return {
    left: rect.left - root.left,
    top: rect.top - root.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  };
}

export function useDrag(rootRef: RefObject<HTMLElement | null>, opts: DragOptions): DragResult {
  const session = useRef<Session | null>(null);
  const [preview, setPreview] = useState<CSSProperties | null>(null);
  const [sprite, setSprite] = useState<{ x: number; y: number; label: string } | null>(null);

  const finish = (commit: boolean): void => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    document.removeEventListener('keydown', escapeRef.current);
    rootRef.current?.releasePointerCapture?.(s.pointerId);
    setPreview(null);
    setSprite(null);
    if (commit && s.active && s.target) {
      if (s.kind === 'tab') opts.onDropTab(s.id, s.target);
      else opts.onDropContainer(s.id, s.target);
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const escapeRef = useRef((e: KeyboardEvent) => {
    if (e.key === 'Escape') finishRef.current(false);
  });

  const measure = (root: HTMLElement): { candidates: DropCandidate[]; titlebars: Map<string, Rect> } => {
    const candidates: DropCandidate[] = [];
    for (const el of root.querySelectorAll<HTMLElement>('[data-twge-container]')) {
      const id = el.dataset.twgeContainer;
      if (id) candidates.push({ id, rect: rectOf(el) });
    }
    const titlebars = new Map<string, Rect>();
    for (const el of root.querySelectorAll<HTMLElement>('[data-twge-titlebar]')) {
      const id = el.dataset.twgeTitlebar;
      if (id) titlebars.set(id, rectOf(el));
    }
    return { candidates, titlebars };
  };

  const resolve = (s: Session, x: number, y: number): Resolution | null => {
    // A tab kept inside its home title bar reorders instead of dropping.
    if (s.kind === 'tab' && s.titlebar && containsPoint(s.titlebar, x, y)) {
      return {
        target: { kind: 'tab', containerId: s.containerId, index: tabInsertIndex(s.tabRects, x) },
        overlay: null,
      };
    }

    // A container cannot land on itself (A4); it is not in its own candidates.
    if (s.kind === 'container' && containsPoint(s.self, x, y)) return null;

    const hit = resolveDrop(s.candidates, x, y);
    const rect = hit && s.candidates.find((c) => c.id === hit.containerId)?.rect;
    if (!hit || !rect) return null;

    return {
      target:
        hit.zone === 'center'
          ? { kind: 'tab', containerId: hit.containerId }
          : { kind: 'split', containerId: hit.containerId, edge: hit.zone },
      overlay: previewRect(rect, hit.zone),
    };
  };

  const onPointerDown = (e: ReactPointerEvent): void => {
    if (e.button !== 0 || session.current) return;
    const root = rootRef.current;
    const target = e.target as Element | null;
    if (!root || !target) return;

    const containerEl = target.closest<HTMLElement>('[data-twge-container]');
    const containerId = containerEl?.dataset.twgeContainer;
    if (!containerEl || !containerId) return;

    const tabEl = target.closest<HTMLElement>('[data-twge-tab-id]');
    const tabId = tabEl?.dataset.twgeTabId;
    const titlebarEl = target.closest<HTMLElement>('[data-twge-titlebar]');

    let kind: Session['kind'];
    let id: string;
    let label: string;
    if (tabEl && tabId) {
      kind = 'tab';
      id = tabId;
      label = tabEl.textContent ?? '';
    } else if (titlebarEl && !target.closest('button')) {
      // Title-bar background drags the whole container (FR-8).
      kind = 'container';
      id = containerId;
      const selected = titlebarEl.querySelector('[role="tab"][aria-selected="true"]');
      label = selected?.textContent ?? '';
    } else {
      return;
    }

    const { candidates, titlebars } = measure(root);
    const home = candidates.find((c) => c.id === containerId)?.rect;
    if (!home) return;

    session.current = {
      kind,
      id,
      containerId,
      label,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      self: home,
      titlebar: titlebars.get(containerId),
      tabRects:
        kind === 'tab'
          ? Array.from(containerEl.querySelectorAll<HTMLElement>('[data-twge-tab-id]'))
              .filter((el) => el.dataset.twgeTabId !== id)
              .map(rectOf)
          : [],
      candidates: kind === 'container' ? candidates.filter((c) => c.id !== id) : candidates,
      root: rectOf(root),
      active: false,
      target: null,
      previewKey: '',
    };
  };

  const onPointerMove = (e: ReactPointerEvent): void => {
    const s = session.current;
    if (!s || e.pointerId !== s.pointerId) return;

    if (!s.active) {
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) < DRAG_THRESHOLD) return;
      s.active = true;
      rootRef.current?.setPointerCapture?.(s.pointerId);
      document.addEventListener('keydown', escapeRef.current);
    }
    setSprite({ x: e.clientX + 12, y: e.clientY + 8, label: s.label });

    const next = resolve(s, e.clientX, e.clientY);
    s.target = next?.target ?? null;
    const overlay = next?.overlay ?? null;
    const key = overlay
      ? `${overlay.left},${overlay.top},${overlay.right},${overlay.bottom}`
      : '';
    if (key !== s.previewKey) {
      s.previewKey = key;
      setPreview(overlay ? overlayStyle(overlay, s.root) : null);
    }
  };

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: () => finish(true),
      onPointerCancel: () => finish(false),
    },
    preview,
    sprite,
  };
}
