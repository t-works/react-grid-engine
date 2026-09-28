# 01 — Public types + `docs/api.md`

**Goal:** freeze the consumer contract once, in code and in prose, before behaviour exists.
This is §5 next-step 1.

**Depends on:** 00.

**Deliverables**

- `src/layout/types.ts` — `Layout`, `Node`, `SplitNode`, `ContainerNode`, `Tab` exactly as PRD §5.1.
- `src/api.ts` — `DropTarget`, `GridEngineHandle`, the four event payloads, `LayoutAction`,
  `onLayoutChange` meta.
- `src/registry.ts` — `PanelComponentDef`, `PanelComponentProps`.
- `docs/api.md` — hand-written contract: `DropTarget`, `GridEngineHandle`, `Layout`/`Node`/`Tab`,
  `PanelComponentDef`/`PanelComponentProps`, the four event payloads, and the `--twge-*` variable
  table. Note the deliberate `Panel*` vocabulary smell so nobody "fixes" half of it.

**Test gate**

- `tsc --noEmit` passes under `strict` + `noUncheckedIndexedAccess`; zero `any` in public types.
- A compile-only test file expresses **every §9 acceptance criterion** against the frozen types
  (add/remove/move/setColor/guards/events) — if one cannot be written, the type is wrong.
- `docs/api.md` reviewed line-by-line against PRD §5.1, §5.2, §6.5; every FR-18 event and every
  `--twge-*` variable from the PRD appears.

**Refs:** PRD §5.1, §5.2, §6.5; tech-spec §9; FR-18, FR-19, FR-20; A1–A12b.
