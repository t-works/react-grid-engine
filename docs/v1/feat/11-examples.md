# 11 — Example apps (data first)

**Goal:** §5 next-step 2 — write each example's *data* before its UI, and use them as the browser-test
fixtures. Vite + React + TS, consuming the built `dist` (D4), `optimizeDeps.exclude` set.

**Depends on:** 10.

**Deliverables**

- `examples/standalone-basic` — static layout from JSON, tabs, add/close, tab color, **no drag**.
  Data: a JSON layout with colors already populated.
- `examples/standalone-dashboard` — full drag/drop, splitters, several component types,
  `onLayoutChange` persisted to `localStorage`.
- `examples/standalone-plugins` (later) — registry larger than layout, unknown-key placeholder,
  `canClose` guard, lazy-loaded component. Data: an unknown registry key and a `canClose` guard.
- Data written first as plain JSON + a registry keyed by string, so a replayed layout exercises the
  real wire format.

**Test gate**

- `turbo run build typecheck` green; both examples build against `dist`, not `src`.
- Loading a saved layout, mutating it, reloading reproduces it (localStorage round-trip) — §9.1.
- Every §9 criterion expressible against the frozen types is exercised by at least one example.

**Refs:** tech-spec §5, §6; D4; §9.1, §9.4, §9.8.
