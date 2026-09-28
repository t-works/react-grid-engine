# v1 — Task tracker

Checklist for the §5 next steps of `../final-review.md`, split into testable chunks in
[`feat/`](./feat). Tick a box only when its **Test gate** passes; the gates live in each feature file.

**Build order** (PRD-implied): types → pure ops → serialization → static render → splitters → drag →
menu/color → events → handle guarantee → examples → browser flows → perf last.
Each feature **depends on** the one above it; do not start a box before its dependency is ticked.

| # | Feature | Depends on | Gate |
|---|---|---|---|
| 00 | [Monorepo scaffold](./feat/00-scaffold.md) | — | build + lint + typecheck + test green |
| 01 | [Public types + `docs/api.md`](./feat/01-public-types.md) | 00 | §9 criteria expressible; api.md complete |
| 02 | [Layout reducer](./feat/02-layout-reducer.md) | 01 | pure-op vitest suite |
| 03 | [Serialization, migration, repair](./feat/03-serialization.md) | 02 | round-trip + hostile JSON |
| 04 | [Static render + chrome](./feat/04-static-render.md) | 03 | StrictMode render smoke |
| 05 | [Splitters](./feat/05-splitters.md) | 04 | 0.05 clamp + exact fill |
| 06 | [Drag layer](./feat/06-drag-layer.md) | 05 | hit-test + Playwright drag |
| 07 | [Tab menu, add/close guards](./feat/07-tab-menu-guards.md) | 06 | §9.7 guard tests |
| 08 | [Tab color](./feat/08-tab-color.md) | 07 | §9.5, §9.6 |
| 09 | [Events + `rev` + ref API](./feat/09-events-rev.md) | 08 | §9.4, §9.8 |
| 10 | [`props.engine` guarantee](./feat/10-engine-handle.md) | 09 | §9.10 render counter |
| 11 | [Example apps (data first)](./feat/11-examples.md) | 10 | examples build vs `dist` |
| 12 | [Playwright drag flows](./feat/12-playwright-flows.md) | 11 | §9.1–§9.3 |
| 13 | [Performance smoke (last)](./feat/13-perf-smoke.md) | 12 | §9.9 |

## Progress

- [x] **00 — Scaffold** — workspaces, Turbo, tsconfig, ESLint, vitest, Playwright, ESM-only package
  - [x] `npm ci && npm run lint && turbo run build typecheck test` green
  - [x] `dist/index.js` + `dist/index.d.ts` emitted; no `main` field
  - [x] examples typecheck against built `.d.ts`
  - [x] root `clean` does not touch `node_modules`
- [x] **01 — Public types + `docs/api.md`** — freeze the consumer contract
  - [x] `Layout`/`Node`/`Tab`, `DropTarget`, `GridEngineHandle`, `PanelComponentDef`/`Props`, 4 payloads
  - [x] every §9 criterion written against the frozen types
  - [x] `api.md` has `--twge-*` table + `Panel*` naming note; reviewed vs PRD §5.1/§5.2/§6.5
- [x] **02 — Layout reducer** — pure tree ops, invariants
  - [x] split ≥ 2, single-child splice, last-tab collapse, empty-root exception
  - [x] no-ops: own-subtree drop; only tab on own edge
  - [x] config order `config → createConfig → defaultConfig → {}`; per-tab independence
- [x] **03 — Serialization** — round-trip, migration, repair
  - [x] valid round-trip identity
  - [x] unknown field dropped; future `version` → warn + `defaultLayout`
  - [x] structural violation → `defaultLayout`; dangling ids repaired, workspace survives
  - [x] hostile JSON never throws
- [x] **04 — Static render + chrome**
  - [x] StrictMode: no legacy warnings, no NaN weights
  - [x] 100%×100% fill; content overflow scrolls inside; no stylesheet
  - [x] tablist/tab/tabpanel + aria; missing-key placeholder survives round-trip
  - [x] `keepMountedWhenInactive`; import-safe without a DOM
- [ ] **05 — Splitters**
  - [ ] 0.05 weight floor per side; exact fill after resize
  - [ ] Pointer Events only; no `ResizeObserver`
- [ ] **06 — Drag layer**
  - [ ] 5 zones + preview; outer border resolves to underlying edge
  - [ ] reorder; tabify + source collapse; edge split 50/50; `Esc` cancels
  - [ ] no live relayout on `pointermove`; no `mousedown`/`mousemove`
- [ ] **07 — Tab menu, add/close guards**
  - [ ] `+` always rendered, filtered by `addable`, disabled when none
  - [ ] §9.7 `canClose` false aborts; rejection → force close
  - [ ] close-others/all skip non-closeable + `allowMultiple:false`
  - [ ] rename writes `Tab.title`; `titleEditable:false` hides
- [ ] **08 — Tab color**
  - [ ] hex validation; invalid ignored + fallthrough (§9.5)
  - [ ] resolution `tab.color → defaultColor → --twge-tab-accent`; pip + color-mix + underline
  - [ ] popover swatches / Custom / Default; §9.6 `onTabColorChange` before persistence
  - [ ] `null` clears, `undefined` does not
- [ ] **09 — Events + `rev` + ref API**
  - [ ] 4 callbacks after commit; `onLayoutChange` once per change + `LayoutAction`
  - [ ] stale `rev` ignored; no echo; revs not serialized
  - [ ] full handle; missing id no-ops; §9.4 stable id across save/load
- [ ] **10 — `props.engine` guarantee**
  - [ ] §9.10 memoized tab does not re-render on sibling move/resize/color
  - [ ] handle identity stable across those changes; no context provider
- [ ] **11 — Example apps**
  - [ ] `standalone-basic` static JSON + colors, no drag
  - [ ] `standalone-dashboard` full drag + localStorage persistence
  - [ ] `standalone-plugins` unknown key + `canClose` guard
- [ ] **12 — Playwright drag flows**
  - [ ] §9.1 tree `row[column[c1,c2],c3]` + identical JSON reload
  - [ ] §9.2 50% sibling, 100% fill; §9.3 last-tab collapse, no gaps
  - [ ] splitter floor; `Esc` cancel; previews
- [ ] **13 — Performance smoke**
  - [ ] §9.9 20/80 StrictMode clean; inactive content not re-rendered
  - [ ] results recorded with the perceived-speed caveat

## v1 done when

- [ ] All of §9 (acceptance criteria) passes.
- [ ] ESM-only artifact builds; zero production deps; `react`/`react-dom` remain peers.
- [ ] `docs/api.md` matches the shipped types in the same commit as any public change.
- [ ] `npm run lint`, `turbo run typecheck test build`, `npm run test:browser` all green.
