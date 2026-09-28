# 02 — Layout reducer (pure tree ops)

**Goal:** all layout mutation as pure functions, no React. The single place invariants live.

**Depends on:** 01.

**Deliverables**

- `src/layout/ops.ts` — add / remove / reorder / tabify / split / move-container / resize / focus.
- UUID minting only in handlers (FR-19); no ids generated during render.
- Invariant enforcement per §5.1 rules 4: split has ≥ 2 children, a split left with one child is
  spliced out, a container has ≥ 1 tab except an empty root.
- New-tab config resolution `config → createConfig() → defaultConfig → {}` (§6.5 / A11).
- `addTab` default target = `activeContainerId`, first container in tree order, or `root` when empty
  (FR-10).

**Test gate**

- vitest pure-function suite, one test per rule: `>=2` split, single-child splice, last-tab collapse,
  empty-root exception.
- No-op cases (A4): dropping a container into its own subtree; dropping a container's only tab on its
  own edge.
- Config resolution order and per-tab independence (`createConfig` gives fresh objects).
- No `Math.random`, no DOM, no React in this module.

**Refs:** PRD §5.1, §6.5, §7; FR-2, FR-5, FR-6, FR-8, FR-10, FR-19; A1, A4, A11.
