# 03 — Serialization, migration, repair

**Goal:** malformed input never throws; ids are authoritative; dangling pointers are repaired.
This is the "round-trip" step in the build order.

**Depends on:** 02.

**Deliverables**

- `src/layout/serialize.ts` — parse / serialize `Layout`.
- `src/layout/migrate.ts` — `version` + `migrate()`; an unknown/future version is unknown input.
- Unknown fields **dropped** on read (A6); chrome is never serialized (§5.1 rule 5, FR-20).

**Test gate**

- Round-trip identity for a valid tree.
- Unknown field dropped; future `version` → warn + `defaultLayout`.
- Structural violation (bad node shape, split with < 2 children) → warn + `defaultLayout`.
- Dangling `activeTabId` → first tab; dangling `activeContainerId` → first container in tree order;
  rest of workspace survives (the deliberate asymmetry).
- Hostile JSON table (`null`, `[]`, `{}`, deep nesting, wrong types) → never throws.
- Ids from JSON win on load; no id minted during read.

**Refs:** PRD §5.1 rules 4/5/7; FR-15, FR-19; A6; §8 robustness.
