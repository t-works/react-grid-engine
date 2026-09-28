# 00 — Monorepo scaffold

**Goal:** the empty shell that every later task builds inside: workspaces, Turbo, tsconfig, lint,
vitest, Playwright, and an ESM-only library package that emits `dist` + `.d.ts`.

**Depends on:** nothing.

**Deliverables**

- Root `package.json` (private, `workspaces: ["packages/*","examples/*","apps/*"]`), `turbo.json`,
  `tsconfig.base.json`, `eslint.config.js`, `playwright.config.ts`, `.gitignore` additions.
- `packages/react-grid-engine/` — `package.json` (`@t-works/react-grid-engine`, ESM, no `main`,
  peers `react`/`react-dom`), `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/index.ts`,
  `test/`.
- `examples/standalone-basic/` and `examples/standalone-dashboard/` package stubs (Vite, private,
  `"*"` dep, `optimizeDeps.exclude`).

**Test gate**

- `npm ci && npm run lint && turbo run build typecheck test` green on the skeleton.
- `turbo run build` emits `dist/index.js` + `dist/index.d.ts`; no `main` field.
- Examples typecheck against the built `.d.ts` (the `exports`/`types` map resolves).
- `clean` does **not** `rm -rf node_modules` at the root.

**Refs:** tech-spec §1–§6; decisions D1–D9; FR-22, FR-23.
