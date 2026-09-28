# 05 — Splitters

**Goal:** drag between siblings to resize, clamped, always filling the parent exactly.

**Depends on:** 04.

**Deliverables**

- `src/chrome/Splitter.tsx` — pointer-events drag handle between adjacent siblings.
- Resize wired through the reducer (02); `weight` updated, normalized at render.

**Test gate**

- Resize math clamps to the relative **0.05 weight floor** per side — no pixel measurement, no
  `ResizeObserver` (A3).
- Siblings always fill the parent exactly after a resize (§9.2, FR-7).
- Pointer Events only (`setPointerCapture`, `touch-action: none`), never `mousedown`/`mousemove`.
- Keyboard resize is out of scope (v2).

**Refs:** PRD §7, §8; FR-7; A3.
