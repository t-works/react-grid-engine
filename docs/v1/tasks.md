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
- [x] **05 — Splitters**
  - [x] 0.05 weight floor per side; exact fill after resize
  - [x] Pointer Events only; no `ResizeObserver`
- [x] **06 — Drag layer**
  - [x] 5 zones + preview; outer border resolves to underlying edge
  - [x] reorder; tabify + source collapse; edge split 50/50; `Esc` cancels
  - [x] no live relayout on `pointermove`; no `mousedown`/`mousemove`
- [x] **07 — Tab menu, add/close guards**
  - [x] `+` always rendered, filtered by `addable`, disabled when none
  - [x] §9.7 `canClose` false aborts; rejection → force close
  - [x] close-others/all skip non-closeable + `allowMultiple:false`
  - [x] rename writes `Tab.title`; `titleEditable:false` hides
- [x] **08 — Tab color**
  - [x] hex validation; invalid ignored + fallthrough (§9.5)
  - [x] resolution `tab.color → defaultColor → --twge-tab-accent`; pip + color-mix + underline
  - [x] popover swatches / Custom / Default; §9.6 `onTabColorChange` before persistence
  - [x] `null` clears, `undefined` does not
- [x] **09 — Events + `rev` + ref API**
  - [x] 4 callbacks after commit; `onLayoutChange` once per change + `LayoutAction`
  - [x] stale `rev` ignored; no echo; revs not serialized
  - [x] full handle; missing id no-ops; §9.4 stable id across save/load
- [x] **10 — `props.engine` guarantee** — memoized tabs stay put
  - [x] §9.10 memoized tab does not re-render on sibling move/resize/color (`test/engineHandle.test.tsx`)
  - [x] handle identity stable across those changes; no context provider (source scan test)
  - [x] fixed the actual re-render source: `PanelHost` handed fresh `emit`/`requestConfigChange`
        closures every render, so `React.memo` never matched — slots are now memoized with per-tab
        `useCallback`s and a latest-`ctx` ref
- [x] **11 — Example apps** — data first: each layout is a `layout.json` replayed through the real wire format
  - [x] `standalone-basic` — static JSON + colors (one tab colored on the wire, one via registry
        `defaultColor`), add/close/tab color; no drag plumbing
  - [x] `standalone-dashboard` — full drag/drop + splitters, three component types, `onLayoutChange`
        persisted via `serializeLayout` and reloaded via `parseLayout` (`localStorage` round-trip,
        `e2e/persistence.spec.ts`); the `onTabEvent` emitter/echo demo now lives here and
        `e2e/events.spec.ts` drives it (Playwright serves the dashboard on `5174` next to
        `standalone-basic` on `5173`)
  - [ ] `standalone-plugins` — **deferred** (feature file: "later"); its `canClose` (§9.7) and
        unknown-key placeholder (§9.8) criteria are covered by the basic `?guards` fixture and the
        dashboard's `forecast` tab
- [x] **12 — Playwright drag flows** — gates live in `e2e/` (the config is at the root; the
      feature file's `test/browser/` is the same idea, this repo already used `e2e/`)
  - [x] §9.1 tree `row[column[c1,c2],c3]` + identical JSON reload (`e2e/flows.spec.ts`, `?flat` fixture)
  - [x] §9.2 50% sibling, 100% fill; §9.3 last-tab collapse, no gaps
  - [x] splitter floor; `Esc` cancel (byte-identical wire format); previews (center vs edge vs gap
        fallthrough)
- [x] **13 — Performance smoke**
  - [x] §9.9 20/80 StrictMode clean; inactive content not re-rendered
        (`test/perf.test.tsx`: no legacy warnings / NaN / hydration mismatch; `e2e/perf.spec.ts`)
  - [x] results recorded with the perceived-speed caveat (`docs/v1/perf.md`)

## v1 done when

- [ ] All of §9 (acceptance criteria) passes.
- [ ] ESM-only artifact builds; zero production deps; `react`/`react-dom` remain peers.
- [ ] `docs/api.md` matches the shipped types in the same commit as any public change.
- [ ] `npm run lint`, `turbo run typecheck test build`, `npm run test:browser` all green.
