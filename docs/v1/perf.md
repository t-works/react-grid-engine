# Performance smoke — results (task 13, §9.9)

**Not a contract.** The engine ships no frame budget, and these numbers are not a CI gate
(no CI workflow exists; `npm run test:browser` is the only place they run). They are a
regression tripwire plus a record of what the reference fixture cost on the dev box.

## Fixture

- **20 containers / 80 tabs**, rendered under `StrictMode`: 4 columns × 5 rows, 4 tabs each.
- Browser fixture: `examples/standalone-basic/src/fixtures.ts` (`perfLayout()`), served at
  `standalone-basic` (`5173`) behind `?perf`.
- jsdom fixture: `packages/react-grid-engine/test/perf.test.tsx` (mirrors the same shape).

## Numbers

Run 2026-09-30, `win32 x64`, Node v24.15.0, Chromium (Playwright `Desktop Chrome`), warm
dev server. Wall-clock measured around Playwright actions, so it includes Playwright IPC —
treat it as an upper bound on engine work.

| Measurement | Value |
|---|---|
| Mount + load (20/80) | ~175–200 ms |
| Drag / hover preview latency | ~175–190 ms |
| Committed layout change (drop → DOM settled) | ~12–13 ms |

(Wall-clock varies run to run; the spans are three runs on the same box.)

Upper bounds only. The 2000 ms ceilings in `e2e/perf.spec.ts` exist to catch a pathological
regression, not to police speed.

## What is actually asserted

- `test/perf.test.tsx` — no legacy-API warnings, no `NaN` weights/styles, no hydration
  mismatch (`renderToString` + `hydrateRoot`), and a memoized tab in a sibling container does
  not re-render on a move, splitter resize or recolor.
- `e2e/perf.spec.ts` — 20/80 renders under `StrictMode` with a clean console (no `NaN`,
  hydration or legacy warnings) and the drag/hover + commit costs above.

## Caveat

Perceived speed is dominated by the host's own tab components: the engine only positions
containers and swaps the active panel, and it mounts exactly one tab per container (unless
`keepMountedWhenInactive` is set). A slow component will dominate; no frame budget is chased
here.

## Reproduce

```sh
npx playwright test e2e/perf.spec.ts
npm run test -w @t-works/react-grid-engine -- perf
```
