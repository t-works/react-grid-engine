# 13 — Performance smoke (last)

**Goal:** the sanity bound, measured last and documented as a smoke test, not a contract.

**Depends on:** 12.

**Deliverables**

- A reference fixture: **20 containers / 80 tabs**, rendered under `StrictMode`.
- A browser perf check for drag/hover preview and committed layout change.

**Test gate**

- §9.9: 20/80 under `StrictMode` → no legacy-API warnings, no NaN weights, no hydration mismatch.
- Inactive tab content does not re-render on a sibling's move/resize/color change.
- Numbers recorded with the caveat written down: perceived speed depends mostly on tab components the
  engine does not own — no frame budget is chased.
- Perf test does not gate the build; it is reported.

**Refs:** PRD §8 (Performance); §9.9.
