# Tech spec — monorepo layout and tooling

Repo structure and build tooling for the project described in `prd.md` (product requirements).
This document owns the *how it is built*, not the *what it does*.

## 1. Shape

**Turborepo monorepo, npm workspaces.** One publishable package, plus non-published example apps, a
plain markdown docs folder, and a placeholder for a website.

```
react-grid-engine/
├─ package.json                 # private root: workspaces, scripts, turbo/typescript devDeps
├─ package-lock.json
├─ turbo.json
├─ tsconfig.base.json
├─ .npmrc                       # (optional) save-exact / engine-strict
├─ packages/
│  └─ react-grid-engine/        # THE PUBLISHABLE LIBRARY
│     ├─ package.json           # @t-works/react-grid-engine
│     ├─ tsconfig.json
│     ├─ tsup.config.ts
│     ├─ src/                   # index.ts, layout/, dnd/, chrome/, registry/, store/
│     └─ test/
├─ examples/
│  ├─ standalone-basic/         # Vite + React + TS, private
│  └─ standalone-dashboard/     # Vite + React + TS, private
├─ docs/                        # markdown only — NOT a workspace, no build step
│  ├─ prd.md
│  ├─ tech-spec.md
│  ├─ api.md                     # hand-written API description, see §7
│  └─ obsolete/                  # superseded notes — history only, never normative
│     ├─ spec-initial.md
│     └─ initial-review.md
└─ apps/
   └─ website/                  # reserved, TBD — see §8
```

Workspace globs are `packages/*`, `examples/*`, `apps/*`. The `apps/*` glob is inert until the
website exists, so adding it later needs no root config change.

## 2. Decisions and why

| # | Decision | Why |
|---|---|---|
| D1 | **Library name `@t-works/react-grid-engine`** (directory stays `packages/react-grid-engine`) | `react-grid-engine` is unscoped and may be taken on npm; the GitHub org is `t-works`. Renaming after the first publish is a breaking change for consumers, so decide now |
| D2 | **npm workspaces, not pnpm/yarn** | Nothing extra to install; matches "as little tooling as possible". Verified: npm **does not** support `workspace:*` (npm 11.13.0 → `EUNSUPPORTEDPROTOCOL`); use `"*"`, which resolves to the local workspace |
| D3 | **Turborepo 2.x** | Task graph + local caching. Note `tasks`, not `pipeline` — Turbo 1 configs copied from blogs will not work |
| D4 | **Examples consume the library's built output, not `src/`** | Exercising the real `dist` + `exports` map is the only way to catch packaging breakage before publishing. Turbo wires `dependsOn: ["^build"]` so `turbo dev` builds the library first. Cost: a rebuild to see library changes; accepted |
| D5 | **ESM-only, built with `tsup`** | Decided (PRD Q10). Vite / webpack 5 / Next 13+ all consume ESM; CJS only when a real consumer demands it. `tsup` covers bundling, `.d.ts` and watch in one devDep; plain `tsc` would also suffice for ESM-only output |
| D6 | **`docs/` is not a workspace** | Markdown has no build. A package.json there would be pure ceremony |
| D7 | **No changesets yet** | One publishable package — a manual version bump and `npm publish -w packages/react-grid-engine` is the whole release process. Add changesets when a second publishable package appears |
| D8 | **No remote Turbo cache** | Local caching is enough for one machine and CI. Revisit if CI build time becomes real |
| D9 | **Chrome values as CSS custom properties, all prefixed `--twge-*`**; the library ships no stylesheet | Decided (PRD Q8). Keeps the layout JSON portable across themes; the prefix is the public theming contract and therefore a stable API |

## 3. Root files

`package.json`

```json
{
  "name": "react-grid-engine-monorepo",
  "private": true,
  "packageManager": "npm@11.13.0",
  "engines": { "node": ">=20" },
  "workspaces": ["packages/*", "examples/*", "apps/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:browser": "playwright test",
    "lint": "eslint .",
    "clean": "turbo run clean"
  },
  "devDependencies": {
    "turbo": "^2",
    "typescript": "^5",
    "eslint": "^9",
    "typescript-eslint": "^8",
    "@playwright/test": "^1"
  }
}
```

`turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev":       { "dependsOn": ["^build"], "cache": false, "persistent": true },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test":      { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "clean":     { "cache": false }
  }
}
```

`lint` is deliberately **not** a Turbo task: it runs once at the root over the whole repo
(`eslint .`, flat config in `eslint.config.js` using `typescript-eslint` recommended), so there is no
per-package lint script to drift. `test:browser` is root-level too (Playwright drives the example
apps); its config lives in `playwright.config.ts`.

`tsconfig.base.json` (every package extends it)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "noEmit": true
  }
}
```

Deliberately **not** enabled: `exactOptionalPropertyTypes`. It leaks into the published `.d.ts` and
makes building a patch object with possibly-absent values (`{ color: maybeUndefined }`, `{ title }`)
an error for consumers — a self-inflicted public-API papercut. Note the API contract that makes this
safe: `color: null` clears a tab color, `color: undefined` does not (PRD §6.5).

`.gitignore` additions: `.turbo/`, `dist/`, `node_modules/`, `coverage/`, `*.tsbuildinfo`.

## 4. The library package

`packages/react-grid-engine/package.json`

```json
{
  "name": "@t-works/react-grid-engine",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "files": ["dist"],
  "sideEffects": false,
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "types": "./dist/index.d.ts",
  "peerDependencies": {
    "react": "^18.3 || ^19",
    "react-dom": "^18.3 || ^19"
  },
  "devDependencies": {
    "@types/react": "^18.3",
    "@types/react-dom": "^18.3",
    "react": "^18.3",
    "react-dom": "^18.3",
    "tsup": "^8",
    "vitest": "^2",
    "@testing-library/react": "^16",
    "jsdom": "^25"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf dist .turbo"
  }
}
```

`vitest.config.ts` — the one library-level test config, per §9 (the render smoke test needs a DOM):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'jsdom', include: ['test/**/*.test.ts?(x)'] },
});
```

Notes that matter for publishing:

- **No `main` field.** With ESM-only output, `main` pointing at an ESM file gives CJS consumers a
  confusing `SyntaxError`; omitting it fails loudly and correctly. Add
  `"require": "./dist/index.cjs"` only if D5 is ever revisited.
- `sideEffects: false` is safe while nothing ships CSS (D9). If a stylesheet is ever added, it must
  become `"sideEffects": ["**/*.css"]` or bundlers will drop it.
- **Zero `dependencies`.** Everything above is dev-only, per PRD FR-23. `react`/`react-dom` stay
  peers, never dependencies.

`tsup.config.ts`

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom'],
});
```

## 5. Example apps

Vite + React + TS, each `private: true`, each depending on the library by workspace link:

```json
{
  "name": "standalone-basic",
  "private": true,
  "type": "module",
  "dependencies": {
    "@t-works/react-grid-engine": "*",
    "react": "^18.3",
    "react-dom": "^18.3"
  },
  "devDependencies": { "vite": "^6", "@vitejs/plugin-react": "^4", "typescript": "^5" },
  "scripts": { "dev": "vite", "build": "vite build", "typecheck": "tsc --noEmit" }
}
```

`"*"` is required — `workspace:*` is not an npm thing (D2). Examples are not published, so they may
take dependencies the library cannot.

Each example's `vite.config.ts` needs one line, otherwise a rebuilt `dist` is not picked up without a
manual server restart (D4's accepted cost is bigger than it looks):

```ts
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['@t-works/react-grid-engine'] },
});
```

Planned examples (one concern each, so a failure points at one thing):

| Example | Demonstrates |
|---|---|
| `standalone-basic` | Static layout from JSON, tabs, add/close tab, tab color, no drag |
| `standalone-dashboard` | Full drag/drop, splitters, registry with several component types, `onLayoutChange` persistence to localStorage |
| `standalone-plugins` *(later)* | Registry larger than the layout, unknown-key placeholder, `canClose` guard, lazy-loaded component |

## 6. Task graph

- `turbo run build` → library builds, then examples build against `dist` (D4).
- `turbo run dev` → `^build` then persistent Vite dev servers; library runs `tsup --watch`. Two
  terminals is fine (`turbo run dev --filter=standalone-dashboard` + library watch).
- `turbo run typecheck` → `dependsOn: ["^build"]` so examples typecheck against real `.d.ts` output,
  not against `src`. This is the check that catches a broken `exports`/`types` map.
- `npm run lint` → one root ESLint pass over the repo (not a Turbo task, see §3).
- `npm run test:browser` → Playwright against a built example (`turbo run build` first), Chromium only.
- `docs/` participates in nothing.

CI (when added): `npm ci && npm run lint && turbo run typecheck test build`, then
`npx playwright install --with-deps chromium && npm run test:browser`. No Turbo server/remote cache (D8).

## 7. Docs folder

Markdown only. `api.md` is **hand-written** and reviewed alongside the code; generating API docs
(typedoc) is a dependency we do not need until the hand-written file demonstrably drifts. Public API
symbols carry TSDoc comments regardless — they are the editor-level documentation, and they are what a
future generator would consume.

Convention: one `docs/*.md` per concern (`prd.md`, `tech-spec.md`, `api.md`), linked from
`README.md`. `docs/obsolete/` holds archived history and is not a source of requirements — nothing
normative may live there. No doc site in v1.

## 8. Website (TBD)

Reserved at `apps/website/`. Already covered by the root workspace glob, so it can be added without
touching root config. Unresolved until there is a reason to build it — when there is, the decision is
whether it consumes the library package (safe, exercises the artifact) or imports example sources
(faster to keep in sync, risks publishing a demo that only works against `src`). Default: consume the
package, same reason as D4. A static Vite build is the expected shape; nothing else is assumed now.

## 9. Conventions

- **Dependency direction:** `examples → library`, `website → library`. Nothing depends on `examples`,
  the library depends on nothing in the repo. Enforced by review, since npm/workspaces will happily
  let you create a cycle.
- **Type source of truth:** `packages/react-grid-engine/src/**`. Examples may not import from
  `.../src` (D4) except for test-only utilities exported under a `./testing` subpath if that becomes
  necessary.
- **Library changes that affect public types require a `docs/api.md` update in the same commit.**
- **No tool config in the library package beyond `tsup`/`tsconfig`/`vitest`.** Repo-level tooling
  (ESLint, Playwright) stays at the root.
- **CSS contract:** every custom property the library reads is prefixed `--twge-` and documented in
  `docs/api.md`; the library never emits a stylesheet (D9). Adding or renaming a variable is a public
  API change and needs the same review as a type change.
- **Client-only:** no example or app in this repo server-renders the engine. The library still keeps
  import-time DOM access and render-time id generation out of the code (also required by StrictMode).

## 10. Resolved in this revision

PRD §10 has no open questions; the two closed in the last pass (component→engine access, add-button
UI) did not affect the structure here:

- **ESM-only** (D5, confirmed) — `tsup format: ['esm']`, no `main` field, no `.cjs` output.
- **CSS variables only, prefixed `--twge-*`** (D9, confirmed) — fixed now because it is the public
  theming contract, documented in `docs/api.md`.
- **Client-only rendering** — examples assume no SSR; the two cheap rules (no DOM at import time, no
  generated ids during render) stay, since StrictMode requires them anyway.
- **Pointer Events only** — the drag layer must not use `mousedown`/`mousemove`. That single choice is
  what makes v2 touch/pen/keyboard work additive instead of a rewrite; keyboard landed in v2 (PRD §8).
- **Lint and browser tests are real** — ESLint at the root, Playwright for the drag flows, so the
  "no `any` in the public API" rule and the drag acceptance criteria are both enforceable.
- **No context provider for the engine.** Actions reach tab components through `props.engine`, so the
  engine can never invalidate a component by publishing a new context value; the only re-render source
  is the app's own tree. If a component ever needs layout state as a subscription, add a
  `useSyncExternalStore` reader (React built-in, no dependency) rather than a store library.
