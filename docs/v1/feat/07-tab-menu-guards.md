# 07 — Tab menu, add/close guards

**Goal:** every tab control: always-rendered `+`, close guards, context menu, rename.

**Depends on:** 06 (context menu reuses the drag/target plumbing).

**Deliverables**

- `src/chrome/TabMenu.tsx` — context menu: close, close others, close all, tab color (→ 08), rename.
- `+` always rendered; menu lists registry entries with `addable !== false`; disabled when none (A15).
- Close guard: `canClose(config)` awaited; `false` aborts; a rejection warns + offers **force close**;
  `removeTab` stays unconditional (FR-12).
- Close-others/all skip non-closeable; `allowMultiple: false` instance hidden from `+` and not
  closeable; programmatic `addTab`/JSON load still allowed (A13, A14).
- Rename writes `Tab.title` through `updateTab` when `titleEditable !== false` (A16).

**Test gate**

- §9.7: `canClose` resolving `false` leaves the tab and container; rejection surfaces force close.
- Close-others/all skip `closeable: false` and `allowMultiple: false` tabs.
- `+` filtered by `addable`; disabled with zero addable entries; always visible otherwise.
- Rename persists `Tab.title`; `titleEditable: false` hides the entry.
- No meaning carried by color alone.

**Refs:** PRD §6.4, §7; FR-9, FR-11, FR-12, FR-14; A13–A16.
