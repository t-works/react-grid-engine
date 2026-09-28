# 06 — Drag layer

**Goal:** the hand-written drag system: reorder, tabify, split, container move, preview, cancel.

**Depends on:** 05.

**Deliverables**

- `src/dnd/` — pointer capture, hit-testing, 5 drop zones per container (4 edges + center), preview
  overlay (outline target container for center; empty region for edge), `Esc` cancel.
- No host-edge drop zone: the outer border/gap resolves to the container edge underneath (A5).
- Tab reorder within a title bar; title-bar-background drag moves the whole container (FR-8).

**Test gate**

- Pure hit-test unit tests: zone resolution, outer-border → underlying edge, container-into-own-subtree
  and only-tab-own-edge no-ops (A4).
- Playwright: reorder; center drop tabifies + source collapses (§9.1 part); edge drop splits 50/50
  (§9.2); `Esc` restores the prior layout.
- Preview only — no live relayout during `pointermove`.
- Pointer Events only; mouse and touch work by construction (no `mousedown`/`mousemove`).

**Refs:** PRD §7, §8; FR-4–6, FR-8; A4, A5.
