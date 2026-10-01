# Imperative events — host → panel commands

> **Status:** v2 proposal. Not built in v1 — v1 deliberately ships **upward events only**
> (`emit` → `onTabEvent`, `requestConfigChange` → `onTabConfigChange`) and serves the
> down direction with config pushes (`setTabConfig` / `updateTab`), observed by the panel
> through its `config` prop.

**Goal:** close spec item 7's second half — *"receive events from the react app that hosts it"* —
without reopening the two-writer/echo problem that closed requirement 7 in v1.

**Depends on:** v1 tasks 01 (public types), 09 (events + `rev` + ref API), 10 (`props.engine`).

**Refs:** `../obsolete/spec-initial.md:8` (original ask); `../obsolete/initial-review.md:162-190`
(the v1 resolution); PRD FR-17, FR-18, §5.2, §6.2, §10; FR-23; `../api.md` Events.

---

## Why

The host can already push **state** down (config, rev-stamped) and can call layout actions through
the ref, but there is no way to push a **named event/command** into a specific, possibly
not-yet-mounted tab. Real uses that config alone expresses badly:

- "Scroll this log tab to the end" / "Re-run this query" — an action, not a value.
- An app-wide toolbar ("Apply date range") firing at every tab showing a date-driven component.
- A keyboard shortcut routed to the focused tab.

Config can approximate these with a `{ runId }` sentinel, but that is a second, unnamed command
channel that every component re-invents, and it forces a layout write (`onLayoutChange`) for what is
not a layout change.

## Design

Add one **imperative, per-tab, runtime-only mailbox** — not an event bus, not a store, not
serialized:

```ts
// GridEngineHandle (additive, one method)
/** Pushes a runtime event to one tab. Unknown id -> no-op. Never a layout change. */
emitToTab(tabId: string, type: string, payload?: unknown): void;

// PanelComponentProps (additive, optional so existing components keep compiling)
/** The most recent command for this tab, or undefined. Runtime-only; not in the layout JSON. */
lastEvent?: TabHostEvent;

interface TabHostEvent {
  type: string;
  payload?: unknown;
  /** Monotonic per tab; gaps mean a command was superseded. */
  seq: number;
}
```

Semantics:

- **One slot, latest wins.** The engine keeps `Map<tabId, TabHostEvent>` (like `revsRef`), not a
  queue: it survives unmount, so an inactive tab (default `keepMountedWhenInactive: false`) receives
  the command when it mounts. This is the "dropped commands" hole in `initial-review.md` §2b, closed
  by keeping the cell in the engine rather than in the child.
- **`seq` makes drops visible.** A consumer that must see every command compares `seq` and asks for a
  stream (below) instead of pretending a slot is lossless.
- **No echo, no layout write.** `emitToTab` never fires `onLayoutChange` / `onTabEvent`, never touches
  `Layout`, and never writes `config`. If a command should change persisted state, the app still does
  that through `setTabConfig` — the panel's `config` prop remains the single source of truth.
- **Runtime-only.** Mailboxes are not serialized (mirrors `rev`); `serializeLayout` output is
  unchanged, so the wire format stays `version: 1`.
- **Scope is the tab, not the component.** Two tabs of the same registry key get independent slots.
- **Unknown id is a no-op**, matching `GridEngineHandle`'s existing rule (§9.8). `removeTab` drops the
  mailbox; `addTab` starts empty.
- **SSR:** client-only, same as the rest (import stays DOM-safe; nothing runs at module scope).

## Deliverables

- `TabHostEvent` type + `emitToTab` on `GridEngineHandle`; optional `lastEvent` on
  `PanelComponentProps`; engine mailbox ref + delivery through `PanelHost`; cleanup in `removeTab`.
- `docs/api.md`: the method, the prop, the runtime-only note, and "no echo / no layout write".
- Optional follow-up, only if a consumer measures supersession loss: a `useTabEventStream(tabId)`
  reader built on React's `useSyncExternalStore` over a small ring buffer (the v1 decision's
  zero-dependency subscription path — `prd.md:398`). Not part of the first cut.

## Test gate

- A mounted panel observes `emitToTab(id, type, payload)` as `lastEvent` with a monotonic `seq`.
- `emitToTab` fires **neither** `onLayoutChange` nor `onTabEvent` (no echo, no phantom layout change).
- A command sent while the tab is inactive/unmounted is delivered on mount (no silent drop), and
  `addTab`/`removeTab` reset the slot.
- Unknown id: no-op, no throw (§9.8 consistency).
- `serializeLayout(getLayout())` contains no event/seq (runtime-only).
- Browser (Playwright, `standalone-basic?events`): host buttons emit to the visible tab and to a
  background tab; the visible panel shows it immediately and the background panel shows it on
  activation.
- No provider, no context, no dependency (FR-23); `props.engine` identity stays stable (task 10 gate
  still passes).

## Rejected alternatives

| Shape | Why not |
|---|---|
| Per-panel `useImperativeHandle` ref the host calls | The ref is `null` while the tab is inactive — commands are dropped (initial-review §2b, hole 1) |
| `EventEmitter` / string `subscribe` API | FR-23: zero production deps; and a subscription list is a second store to keep in sync |
| Put the command in `config` | Commands are facts, not state; every component re-invents a `runId` sentinel and a layout write/`onLayoutChange` fires for a non-layout event |
| Global `engine.emit(type)` (broadcast to all tabs) | Ambiguous scope; the app can loop tabs itself and `emitToTab` each, keeping the primitive one-target |
| Queue every command until acknowledged | That is a message bus with back-pressure; unmeasured complexity. `seq` + an opt-in stream if it is ever measured |

## Open questions

- **Prop name:** `lastEvent` vs `command` vs `inbox`. `lastEvent` reads as a fact, `command` as an
  intent; the engine cannot tell which, so the neutral `lastEvent` is proposed.
- **Broadcast helper:** add `emitToTabs(ids, type, payload)` later only if the loop shows up in app
  code; the app can write the loop in one line today.
- **Payload cloning:** `payload` is passed through **by reference**, exactly like `config`. The app
  owns mutation; the engine never clones or deep-diffs.
