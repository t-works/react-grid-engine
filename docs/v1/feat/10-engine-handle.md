# 10 — `props.engine` guarantee

**Goal:** §5 next-step 4 — prove the stable-handle guarantee early, not at release.

**Depends on:** 09.

**Deliverables**

- The ref object and `props.engine` are the **same stable, action-only bundle**; no context provider,
  no state in the handle.
- `PanelComponentProps` handed to every tab component: `config`, `tabId`, `emit`,
  `requestConfigChange`, `engine`.

**Test gate**

- §9.10 / §8 render-counter check: a memoized tab component that received `props.engine` does **not**
  re-render when a sibling container's tab moves, resizes or changes color (render count unchanged).
- The handle identity is identical across those layout changes.
- No provider wraps tab components; the only re-render source is the app's own tree.
- Add this as a permanent regression test, not a one-off spike.

**Refs:** PRD §6.5, §8, §10; FR-23; §9.10; tech-spec §10.
