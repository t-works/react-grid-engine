# Final review — devil's advocate (second pass)

Reviews the two **normative** documents: `prd.md` (what) and `tech-spec.md` (how it is built).
`docs/obsolete/` is archived history, not authority. This pass records what the owner decided, where
each decision landed, and what is genuinely still open. Everything raised in the first pass is either
closed below or listed in §2/§3.

**Verdict:** the doc set is buildable and has no open questions. No remaining item blocks P0 static
render. The biggest residual risk is not the spec — it is scope: v1 still carries the full drag layer
plus the color popover, and only keyboard/a11y was moved out.

---

## 1. Decisions applied

| ID | Decision | Landed in |
|---|---|---|
| A1 | Engine-generated **UUID** ids for containers, tabs and splits; ids live in the layout JSON and win on load | FR-19, §5.1 rule 7 |
| A2 | Active container = focused container, **default = first in tree order**, persisted as `Layout.activeContainerId` | §5.1 `Layout`, FR-10 |
| A3 | Splitter floor is a relative **`0.05` weight** — no pixel measurement, no `ResizeObserver` | FR-7 |
| A4 | Dropping a container into its own subtree, or a container's only tab on its own edge, is a **no-op** | §7 |
| A5 | **No host-edge drop zone** — the outer border/gap is chrome; a drop there resolves to the container edge underneath. Root split removed | §7 |
| A6 | Unknown fields are **dropped** on read; a future `version` is unknown input; structural salvage is v2; dangling ids are **repaired** instead | FR-15, §5.1 rule 4 |
| A7 | `color: null` clears; `color: undefined` does not | §6.4, §6.5, tech-spec §3 |
| A8 | Full event payloads and `LayoutAction` defined; `onLayoutChange` fires per committed change | §5.2 |
| A9 | `DropTarget` defined (`tab` / `split` / `root`); tabify, split and add flows written out | §6.5, §7 |
| A10 | **No controlled mode** — `defaultLayout` + ref in, events out | FR-18, §6.4 |
| A11 | New-tab config resolution: `config` → `createConfig()` → `defaultConfig` → **`{}`** | FR-10, §6.5 |
| A12 | `Tab.title` stays a serialized string; the registry `title(config)` callback may return a `ReactNode` | §6.5 |
| A12b | Engine actions reach a tab component as **`props.engine`** (stable handle). No context provider, no store dependency | §6.5, §10 |
| A15 | `+` always rendered; `addable: false` filters the menu only; `showAddButton` removed | FR-9, §10 |
| A13 | `allowMultiple: false` + instance exists → hidden from the `+` menu and **not closeable** | §6.5, FR-11 |
| A14 | Close-others/all skip non-closeable tabs; a throwing `canClose` warns and offers **force close** | FR-11, FR-12 |
| A16 | `titleEditable` (default true) added; rename writes `Tab.title` through `updateTab` | §6.5, §7 |
| #3 | `PanelDefinition` → **`PanelComponentDef`**; `color: undefined` clarified | §6.5, tech-spec §3 |
| #4 | a11y → **v2** (ARIA roles stay); perf target **20 containers / 80 tabs**, measured last; browsers Chrome/Edge/Safari, no matrix; corruption warns + `defaultLayout`; **Playwright** added | §8, §9 |
| #5 | ESLint at the root, vitest config with jsdom, `rm -rf node_modules` removed from root `clean`, `optimizeDeps.exclude` documented | tech-spec §3, §4, §5, §6 |
| #6 | Palette is app-supplied with built-in defaults (§10 closed) | §6.4, §10 |

Two policy consequences worth restating, because they changed existing text rather than adding to it:

- **Dangling references are repaired, not rejected.** An `activeTabId` naming no tab falls back to
  the container's first tab, an `activeContainerId` naming no container to the first container in tree
  order, and the rest of the layout survives. Structural damage (bad node shape, a split with fewer
  than two children) still takes the FR-15 path: warn + `defaultLayout`.
- **Root-edge split is gone**, so v1 splitting is container-edge only. Drop-zone math is one rule
  instead of two, and A5's contradiction disappears with it.

---

## 2. Open items

**None.** Both questions from the first pass are answered: component→engine access is `props.engine`
(a stable action bundle — no provider, no store dependency), and `showAddButton` is gone in favour of
an always-rendered `+` filtered by `addable`.

Deferred by decision, not unresolved: keyboard/a11y, pen input, corrupt-layout salvage, animated
transitions — all listed in the PRD's non-goals.

The residual risk that remains is scope (§4), not ambiguity.

---

## 3. Remaining contradictions

1. **Vocabulary.** `PanelComponentDef`/`PanelComponentProps`/`panelId` keep the `Panel*` prefix while
   everything user-facing is container/tab. Decided (owner) and internally consistent, so this is
   now a naming smell rather than a defect — note it in `docs/api.md` so nobody "fixes" half of it.
2. **None else.** The `rev`/API contradiction is closed by §5.2; the PRD/tech-spec `color`
   mismatch is closed by `null` clearing.

---

## 4. Residual risks (accepted, not open questions)

- **Scope.** v1 still contains: hand-written drag (pointer capture, 5 zones, preview overlay, cancel),
  splitters, tab reorder, tabify/split, add/close guards, a context menu, a color popover with native
  picker, migration, plus two examples and CI. a11y was the only substantial cut. If `0.1.0` slips,
  the next candidates in order are: FR-14 color popover UI, FR-8 container drag, rename.
- **Performance is a smoke test, not a contract.** 20/80 is a sanity bound; the honest statement is
  that perceived speed depends on tab components. That is now written down, so nobody will chase a
  frame budget the engine cannot own.
- **No cross-browser automation.** Playwright on Chromium plus a manual Safari smoke. Accepted.
- **Corrupt layouts reset, except for dangling pointers.** Structural damage discards the workspace
  (warn + `defaultLayout`), with salvage deferred to v2; a stale `activeTabId`/`activeContainerId` is
  repaired and the workspace survives. The asymmetry is deliberate — a stale id is a routine pointer,
  a malformed node is not.
- **`rm -rf` remains in the per-package `clean` script** (`dist`, `.turbo`). Root `clean` no longer
  touches `node_modules`, but package clean still assumes a POSIX shell on a Windows dev box.

---

## 5. Next steps

1. Write `docs/api.md` from what is now in the PRD — `DropTarget`, `GridEngineHandle`,
   `Layout`/`Node`/`Tab`, `PanelComponentDef`/`PanelComponentProps`, the four event payloads, and the
   `--twge-*` variable table. That file is the consumer contract; it is the last missing artifact.
2. Write the example apps' *data* first (a JSON layout with colors, an unknown registry key, a
   `canClose` guard) and the pure reducer tests, and check every §9 acceptance criterion is
   expressible against the frozen types.
3. Build in the order the PRD implies: static render (§5.1 schema + registry) → splitters → drag →
   round-trip/events → Playwright flows → perf smoke last.
4. Prove the `props.engine` guarantee early — it is now acceptance criterion 10 plus the §8
   render-counter check, so it cannot be discovered late: a memoized tab component must not re-render
   when a sibling moves.
