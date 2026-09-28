# 04 — Static render + chrome

**Goal:** first visible workspace: tree → rects, one tab visible per container, no drag yet.
This is the "static render" step (§5.1 schema + registry).

**Depends on:** 03.

**Deliverables**

- `src/GridEngine.tsx` — `forwardRef`, uncontrolled `defaultLayout`, hosts registry + layout state.
- `src/chrome/Split.tsx` — children sized by normalized `weight` as `flexGrow` (one size number).
- `src/chrome/Container.tsx` / `TitleBar.tsx` — title bar + tab strip + content box.
- `src/chrome/PanelHost.tsx` — exactly one tab visible, fills content box, `overflow:auto`.
- `src/chrome/MissingComponent.tsx` — unknown registry key placeholder, node retained (FR-16).
- `--twge-*` defaults applied as inline styles / custom properties; **no stylesheet** (D9).

**Test gate**

- jsdom + Testing Library render smoke under `StrictMode`: no legacy-API warnings, no NaN weights.
- FR-1: engine fills host 100%×100%, no gaps, no layout scrollbars; content overflow scrolls inside
  the container (FR-21).
- `role="tablist"`/`"tab"`/`"tabpanel"` with `aria-selected`/`aria-controls` (v1 semantics).
- Missing key renders placeholder and survives a save/load round-trip (§9.8).
- `keepMountedWhenInactive` keeps an inactive panel mounted; default unmounts (FR-24).
- No DOM access at module top level (import-safe without a DOM).

**Refs:** PRD §5.1, §8; FR-1–3, FR-16, FR-20–22, FR-24; D9; §9.9.
