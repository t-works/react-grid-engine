# 09 — Events + `rev` + ref API

**Goal:** the single-writer contract: events out, imperative writes in, no echo.

**Depends on:** 08.

**Deliverables**

- Four callbacks (FR-18): `onLayoutChange`, `onTabEvent`, `onTabConfigChange`, `onTabColorChange`,
  all firing after commit, never during render; `onLayoutChange` once per committed change (gesture
  end, not per `pointermove`).
- `LayoutAction` + meta `{ action, tabId?, containerId?, programmatic }`.
- Per-tab-config `rev`: `setTabConfig(id, config, rev?)` ignores `rev <=` current; upward
  `onTabConfigChange(tabId, config, { rev, source })`; **no echo** in the same tick; revs runtime-only.
- Full `GridEngineHandle` on the ref: `addTab`, `removeTab`, `updateTab`, `moveTab`, `setTabConfig`,
  `focusTab`, `getLayout` (snapshot). Unknown id → no-op, no throw.

**Test gate**

- `onLayoutChange` fires once per committed change and carries the right `action`.
- Stale `rev` write ignored; a newer write accepted; no echo to the tab that sent a value.
- §9.8: `addTab`/`removeTab` on a missing id does not throw; stale imperative call is a no-op.
- §9.4: `addTab` with no `target` appends to the active container and activates it; empty layout
  creates the root; returned id stable across save/load.
- `getLayout()` is a snapshot, not reactive; revs absent from the JSON.

**Refs:** PRD §5.2, §6.5, §8; FR-17, FR-18; A8, A10; §9.4, §9.8.
