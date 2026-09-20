# PRD — react-grid-engine

Product requirements for the dockable layout engine. **This document is authoritative and
self-contained**: every requirement it depends on is stated here, and it defers to no earlier notes.

Scope of this revision: adds **add/delete tab** requirements and the **tab color** feature, on top of
the original ten spec items.

---

## 1. Summary

A React 18.3 + TypeScript npm library that lays out **containers** in a resizable, dockable
**layout tree**. Each container owns a **title bar** of **tabs**, exactly one of which is visible and
fills the container. Tabs are dragged between containers, or onto a container edge to create a new
container by splitting it. The whole layout — including which component each tab is bound to, that
component's config, and the tab's color — round-trips through versioned JSON. The host app owns
component config; the engine owns layout.

## 2. Terminology

| Term | Meaning |
|---|---|
| **Layout tree** | The serialized structure: `SplitNode`s (internal) and `ContainerNode`s (leaves) |
| **Split node** | Internal node with `axis: 'row' \| 'column'`; the only node that owns space |
| **Container** | Leaf node. Owns a rect, a title bar, and a set of tabs. Exactly one tab visible |
| **Tab** | An entry in a container's title bar, bound to a registry `component` key, carrying `config` |
| **Registry** | App-supplied catalogue mapping string keys → tab component definitions. Never serialized |
| **Chrome** | Title bar, borders, gaps, padding, tab colors — presentation, styled via `--twge-*` CSS vars |

## 3. Goals / non-goals

**Goals:** fill the host element 100% at all times; drag-and-drop tabs and containers; JSON round-trip
of the complete layout; app-owned component config with a one-writer rule; zero production
dependencies; React 19-migration-ready.

**Non-goals for v1** (deliberately deferred): floating/undocked windows, cross-window drag,
responsive/breakpoint layouts, animated transitions, undo/redo, `minSize` constraints, fill-style tab
colors, saved layout presets. When `minSize` does arrive, its rule is fixed now: clamp during
splitter drag; if `Σ minSize > extent` (a browser resize can always cause this), scale the affected
children proportionally so the root still fills exactly — `minSize` is advisory in that one case and
a layout-level scrollbar is never the answer.

## 4. Users and primary use cases

1. **Dashboard author** composes a screen of charts and tables, stores the JSON, reloads it next
   session and sees the same layout with the same component configs.
2. **End user** reorganizes their workspace: drags a log tab next to the chart tab to tabify it,
   drags a tab to the right edge to split off a new column, resizes the splitter.
3. **End user** reduces clutter: closes tabs they don't need; the space reflows and no empty container
   is left behind.
4. **End user** marks workspace areas: colors the "Production" tabs red so they stand out at a glance.
5. **Host app** pushes live config into a visible tab (e.g. a new time range) and receives events
   (legend clicked, row selected) without owning the layout.

## 5. Functional requirements

Priority: **P0** = v1 must-have, **P1** = v1 if cheap / first follow-up, **P2** = later.

| ID | Requirement | Prio | Notes |
|---|---|---|---|
| FR-1 | The engine fills its host element **100% × 100%** at all times; no gaps, no layout-level scrollbars | P0 | Guaranteed structurally by relative weights |
| FR-2 | Layout is a tree: split nodes (`row`/`column`) with containers as leaves; node size is relative (`weight`) along the parent's axis only | P0 | Split nodes own space; a child's `weight` is relative along the parent's axis; wire format in §5.1 |
| FR-3 | Every container renders a title bar; exactly one tab's component is visible and fills the content box; others are hidden | P0 | Content box: `inset: <titlebar> 0 0 0`, `overflow:auto` |
| FR-4 | A tab is draggable within its own title bar to reorder | P0 | |
| FR-5 | A tab dragged onto another container joins that container's tabs (tabify); the source container collapses if it empties | P0 | |
| FR-6 | A tab dragged onto a container edge (left/right/top/bottom) splits that container, creating a new container holding the dragged tab | P0 | 50/50 initial weights |
| FR-7 | Splitters between siblings are draggable to resize; siblings always fill the parent exactly | P0 | Clamp against a relative floor of `0.05` weight per side — no pixel measurement, no `ResizeObserver` for layout |
| FR-8 | Dragging a container by its title-bar background moves the whole container (all its tabs) to a new split position | P1 | Satisfies spec item 2 ("draggable containers") |
| FR-9 | **Add tab:** a `+` control in every title bar opens a menu of registry entries with `addable !== false`; selecting one appends a new tab to that container and activates it | P0 | The `+` is always rendered — it is chrome, not a per-component opt-in; `addable: false` only removes that entry from the menu. With no addable entry the control is disabled |
| FR-10 | **Add tab (programmatic):** `addTab({ component, config?, title?, color?, target?, activate? }) → TabId`; default target = the **active container** (the focused one, defaulting to the first container in tree order, persisted as `Layout.activeContainerId`), or `root` when the layout is empty | P0 | Fills the "add component with its container" need; `config` defaults to `{}` |
| FR-11 | **Delete tab:** close control on each tab when `closeable !== false`, plus a context-menu entry; the container is removed when its last tab closes and the space reflows | P0 | Hidden and excluded from close-others/close-all: `closeable === false`, and any instance of an `allowMultiple: false` component (the UI cannot re-add it). Empty root renders the app's placeholder |
| FR-12 | **Delete tab (guarded):** if a definition supplies `canClose(config)`, the UI close path awaits it; `false` aborts the close, a rejection logs a warning and offers the user a **force close** | P0 | Prevents silent loss of unsaved component state. The imperative `removeTab` is unconditional |
| FR-13 | **Tab color in serialized config:** `tab.color` is a hex accent, engine-rendered, present in the layout JSON and settable by the app | P0 | §6 below |
| FR-14 | **Tab color selector in the tab UI:** the tab context menu offers a preset swatch palette plus a native custom picker; the chosen color applies immediately and is persisted through the normal layout-change path | P0 | §6 below |
| FR-15 | Layout is serializable/deserializable with `version` + `migrate()`; malformed or partially corrupt input never throws — it warns and falls back to `defaultLayout` | P0 | Unrecognised fields are dropped on read, not preserved on round-trip. A future `version` counts as unknown input; additive v2 handling is a later problem, as is salvaging the valid parts of a structurally corrupt layout. Dangling `activeTabId`/`activeContainerId` references are repaired, not rejected (§5.1 rule 4) |
| FR-16 | Tabs bind to components by **registry string key**, never a reference; a key missing from the registry renders a "missing component" placeholder and the node is retained | P0 | Registry may be larger *or* smaller than the layout |
| FR-17 | Config is owned by the app, passed down opaquely, never mutated or deep-diffed by the engine; components request changes upward and the app decides | P0 | One store, one writer, `rev`-stamped writes (§5.2); the engine never applies a tab's request itself |
| FR-18 | Events: engine emits `onLayoutChange`, `onTabEvent`, `onTabConfigChange`, `onTabColorChange`; host app pushes config and layout changes through the root ref API | P0 | No event bus, no pub/sub dependency. Layout is **uncontrolled**: `defaultLayout` in, `onLayoutChange` out, writes through the ref. No controlled `layout` prop in v1. Payloads in §5.2 |
| FR-19 | Stable ids: the engine generates UUIDs for every container, tab and split node it creates (`addTab` returns the tab id); ids live in the layout JSON and are authoritative on load; nothing is generated during render | P0 | SSR/hydration safety. An app authoring a `defaultLayout` supplies ids in the JSON |
| FR-20 | Chrome — title bar height, borders, gaps, padding, tab colors — comes from `--twge-*` CSS custom properties with sensible defaults; the layout JSON carries no chrome values | P0 | Two themes can share one stored layout. Prefix is the public theming contract |
| FR-21 | Tab content is sandboxed from layout: `min-width:0; min-height:0; overflow:hidden` on split children; content overflow scrolls inside the container | P0 | Otherwise intrinsic content size breaks the 100% guarantee |
| FR-22 | React 18.3 + TypeScript (`strict`), migratable to 19: no `defaultProps`/`propTypes`/legacy context/`findDOMNode`, no `Math.random` during render, StrictMode-safe effects; keep `forwardRef` | P0 | Gate: typecheck under React 18.3 types + StrictMode render smoke test (§8) |
| FR-23 | **Zero production dependencies.** `react`/`react-dom` are peer dependencies (`^18.3 \|\| ^19`) | P0 | Drag and hit-testing are hand-written |
| FR-24 | Inactive tabs are unmounted by default; a registry entry may opt into `keepMountedWhenInactive` | P1 | Video/editor tabs |

### 5.1 Layout JSON (wire format)

The serialized layout is the public contract (FR-15). `Tab` is defined in §6.5; the types below are
the whole wire format.

```ts
interface Layout {
  version: 1;
  root: Node;                       // a lone container is a valid root
  activeContainerId?: string;       // focused container; default = first container in tree order
}

type Node = SplitNode | ContainerNode;   // the only two node kinds

interface SplitNode {                // internal node — the ONLY thing that owns space
  type: 'split';
  id: string;                        // engine-generated, handlers only (FR-19)
  axis: 'row' | 'column';            // row: children side by side | column: children stacked
  weight?: number;                   // child-scoped: share along the PARENT's axis (default 1)
  children: Node[];                  // >= 2
}

interface ContainerNode {            // leaf — owns a rect, owns tabs, shows exactly one
  type: 'container';
  id: string;                        // see FR-19
  weight?: number;                   // child-scoped, same meaning as above
  activeTabId: string;
  tabs: Tab[];                       // >= 1, except an empty root
}
```

Rules — these, not the field list, are the schema's real content:

1. **One size number per node, never `width` + `height`.** `weight` is the share along the parent's
   axis; the cross axis is always the parent's full extent. Carrying both would be a second source of
   truth for the same pixels, with sum constraints nothing enforces.
2. **Weights are normalized at render** (`weight / Σ siblingWeights`), exactly like `flex-grow`, so
   they need not sum to 1. No normalize-and-fix pass, no 0.9999 sums, no 1px seams.
3. **Cross-axis spanning is a consequence of nesting, not a property.** A node that "spans" two
   siblings is a sibling of their parent; there is no `span`/`colSpan` field.
4. **Invariants, enforced by the reducer and re-checked on load:** a split has ≥ 2 children; a split
   left with one child is spliced out; a container has ≥ 1 tab except an empty root. A structural
   violation is malformed input and takes the FR-15 path (warn + `defaultLayout`). Dangling
   **references are repaired instead of rejected** — a workspace must not reset over a stale pointer:
   an `activeTabId` naming no tab falls back to that container's first tab, an `activeContainerId`
   naming no container falls back to the first container in tree order, and the rest of the layout is
   kept.
5. **`weight` is the only number on the wire.** Chrome comes from CSS variables (FR-20) and is never
   serialized. `minSize` is not in v1 (§3).
6. **Non-guillotine layouts are out of scope:** a true pinwheel, where no straight cut crosses the
   whole region, cannot be expressed — and is not produced by the interactions in §7.
7. **Ids are data, not render artefacts** (FR-19): every node id is serialized and authoritative on
   load; the engine mints UUIDs only when it creates a node in a handler.

### 5.2 Events and config revision stamps (`rev`)

FR-17's `rev` mechanism, spelled out — it is what makes the single-writer rule implementable:

- The engine keeps a monotonic `rev` per tab config cell, incremented on every accepted write.
- **Downward:** `setTabConfig(id, config, rev?)` (§6.5). A write carrying a `rev` that is `<=` the
  cell's current rev is ignored. That is what stops a slow server response from snapping a tab back
  to a stale value.
- **Upward:** `onTabConfigChange(tabId, config, { rev, source })`, where `source` is `'tab' | 'app'`
  and `rev` is the one the reported value carries.
- **No echo:** a value received from a tab is never written back down in the same tick, and the
  engine never applies a tab's request itself (FR-17) — it reports it and the app decides.
- Revs are runtime-only and are **not** serialized.

Event payloads (FR-18). All fire **after** the change is committed, never during render; `onLayoutChange`
fires once per committed change (gesture end, not per `pointermove`):

```ts
onLayoutChange(layout: Layout, meta: {
  action: LayoutAction; tabId?: string; containerId?: string; programmatic: boolean;
}): void
onTabEvent(tabId: string, type: string, payload?: unknown): void
onTabConfigChange(tabId: string, config: unknown, meta: { rev: number; source: 'tab' | 'app' }): void
onTabColorChange(tabId: string, color: string | null, meta: { source: 'ui' | 'app' }): void

type LayoutAction =
  | 'add-tab' | 'remove-tab' | 'reorder-tab' | 'move-tab'
  | 'split' | 'resize' | 'focus' | 'set-color' | 'set-title' | 'set-config';
```

### 5.3 Traceability to the original request

| Original request item | Covered by |
|---|---|
| 1 fill 100% × 100% | FR-1, FR-2, FR-7, FR-21 |
| 2 draggable containers | FR-5, FR-7, FR-8 |
| 3 container has a draggable tab | FR-3, FR-4, FR-6 |
| 4 containers can be grouped | FR-2, FR-5 |
| 5 JSON serializable / deserializable | FR-15, FR-19 |
| 6 component binding + per-component config in data | FR-16, FR-17 |
| 7 emit/receive events, live config | FR-17, FR-18 |
| 8 container has an id | FR-19 |
| 9 React 18.3 + TS, 19-ready | FR-22 |
| 10 minimal dependencies | FR-23 |
| *added by this revision* | FR-9…FR-14 |

## 6. Tab color feature

### 6.1 Where the color lives

**`Tab.color`, a hex accent on the tab node — not inside `config`.** The engine treats `config` as
opaque (`unknown`), so a color hidden in there would be unreachable for the chrome, requiring a
registry hook to read it. The tab already carries `title` at node level with a registry fallback for
exactly this reason; `color` follows the same rule.

Resolution order (first hit wins):

1. `tab.color` — app-set or user-picked, serialized
2. `registry[tab.component].defaultColor` — the component type's identity color
3. `--twge-tab-accent` — theme default ("no color")

### 6.2 Value format and validation

- Accepted: `#rgb`, `#rrggbb`, `#rrggbbaa` (case-insensitive). The palette emits hex only.
- Anything else is **ignored with a dev-mode warning** and falls through the resolution chain. This
  keeps the engine from ever writing an arbitrary CSS token into a style attribute.
- No color space or theme-awareness in v1: a hex is a hex.

### 6.3 Rendering

- The color is an **accent, not a fill**: a leading pip plus `background: color-mix(in oklab, <color>
  12%, var(--twge-tab-bg))` on the active tab, and the accent as the active-tab underline.
- Tab **text color stays theme-controlled**, so contrast and dark mode never become the app's problem.
  A fill-style tab (`colorMode: 'fill'`) is explicitly deferred — it drags in contrast handling.
- Color is never the only carrier of meaning: label and active state remain visible regardless.

### 6.4 UI selector

- Reachable from the tab context menu ("Tab color"); keyboard reachability of the menu and popover is
a v2 item (§8, accessibility).
- Popover contains: a **swatch row** (the app-supplied `tabColorPalette?: string[]` when given,
  otherwise the themeable `--twge-tab-color-*` presets), a **Custom…** entry opening the native
  `<input type="color">` (platform feature, zero dependencies), and a **Default** entry that clears
  `tab.color` by emitting `null`.
- Swatches are `role="menuitemradio"` with `aria-checked` and an accessible name ("Red", "Custom…");
  the focus trap and `Esc`-returns-focus behaviour are v2.
- Applying a color updates the UI immediately, then emits `onTabColorChange(tabId, color, { source: 'ui' })`
  and `onLayoutChange(...)`; the app owns persistence. Layout is engine-owned and uncontrolled — the
  engine keeps it in state and reports it; there is no controlled `layout` prop to push back.

### 6.5 Data and API delta

```ts
interface Tab {
  id: string;
  component: string;
  title?: string;
  color?: string;      // NEW — hex accent, see §6.1/§6.2
  config: unknown;
}

interface PanelComponentProps<C = unknown> {   // props the engine hands to every tab component
  config: C;                                        // read-only input, always the newest committed value
  tabId: string;
  emit: (type: string, payload?: unknown) => void;  // up to the app (FR-18)
  requestConfigChange: (patch: Partial<C>) => void; // up to the app; the app decides
  engine: GridEngineHandle;                         // stable action bundle (see below)
}

interface PanelComponentDef<C = any> {   // a *tab component* definition
  component: React.ComponentType<PanelComponentProps<C>>;
  defaultConfig?: C;
  createConfig?: () => C;      // NEW — preferred: fresh object per tab (no shared mutable default)
  defaultColor?: string;       // NEW — identity color for this component type
  title?: (config: C) => React.ReactNode;     // rendered when `Tab.title` is absent
  titleEditable?: boolean;     // NEW — enables context-menu rename, which writes `Tab.title` (default true)
  addable?: boolean;           // NEW — appears in the "+" menu (default true)
  allowMultiple?: boolean;     // NEW — may exist in several tabs (default true). When false and an
                               // instance exists: hidden from the "+" menu and not closeable. The
                               // gate is the menu only — programmatic `addTab` and layouts loaded
                               // from JSON are not blocked (that is how such a tab is created)
  closeable?: boolean;         // close control + menu entry (default true)
  canClose?: (config: C) => boolean | Promise<boolean>;   // NEW — unsaved-state guard
  keepMountedWhenInactive?: boolean;
}

type DropTarget =
  | { kind: 'tab';   containerId: string; index?: number }   // tabify; index omitted = append
  | { kind: 'split'; containerId: string; edge: 'left' | 'right' | 'top' | 'bottom' }
  | { kind: 'root' };                                        // empty layout only

interface GridEngineHandle {
  addTab(p: { component: string; config?: unknown; title?: string; color?: string;
              target?: DropTarget; activate?: boolean }): string;   // NEW
  removeTab(id: string): void;                                      // NEW — unconditional
  updateTab(id: string, patch: { title?: string; color?: string | null }): void;  // NEW — `null` clears
  moveTab(id: string, target: DropTarget): void;
  setTabConfig(id: string, config: unknown, rev?: number): void;   // see §5.2
  focusTab(id: string): void;
  getLayout(): Layout;                                             // snapshot, not reactive
}
```

`defaultConfig`/`defaultColor` are shared references by contract; `createConfig()` exists so a new tab
can get an independent object (`{ items: [] }` handed out by reference is the classic instance
bleed-through bug).

Config for a new tab resolves in this order: explicit `config` → `createConfig()` → `defaultConfig` →
`{}`. The result is always a serializable value, never `undefined`.

`props.engine` is the **same object the host gets from the ref**: a stable, action-only bundle (no
state, no subscription), so handing it to a tab component cannot invalidate a memoized component. It
is passed as a prop rather than through a context provider on purpose — a provider whose value carried
engine state would re-render every consumer, and an action bundle needs no provider at all. Reactive
reads stay opt-in: the app re-renders its own tree from `onLayoutChange`; a component that needs to
react to layout state gets it from the host's props. No state-management dependency is added (FR-23);
if a component ever genuinely needs to subscribe, the zero-dependency path is a hand-rolled
`useSyncExternalStore` subscription, added only once measured.

## 7. Interaction spec

| Gesture | Result |
|---|---|
| Drag tab within its title bar | Reorder |
| Drag tab onto a container's center | Append to that container's tabs, activate |
| Drag tab onto a container's edge | Split that container, new container holds the tab |
| Drag splitter | Resize the two adjacent siblings, clamped to the 0.05 weight floor |
| Drag empty title-bar space | Move the whole container |
| Click `+` | Add-tab menu (FR-9) |
| Click tab close (`×`) | Guard, then close; container removed when empty (FR-11, FR-12) |
| Right-click tab | Menu: close, close others, **tab color**, rename (when `titleEditable !== false`) |
| `Esc` during any drag | Cancel, restore prior layout |

Drop zones are 5 per container: 4 edges + center. There is **no host-edge drop zone** — the outer
border and gaps are chrome, and a drop there resolves to the container edge underneath it. Dropping a
container onto itself or into its own subtree is a no-op, as is dropping a container's only tab onto
that container's own edge. A drag shows a preview overlay, not a live relayout: a center drop outlines
the target container, an edge drop outlines the new container's space as an empty region.

Flows:

1. **Tabify:** drag a tab over another container's center → drop → the tab joins that container's tabs
   and is activated; an emptied source container collapses (FR-5).
2. **Split:** drag a tab over a container's edge → an empty outlined region appears on that side →
   drop → a new container is created there holding the tab, weights 50/50 (FR-6).
3. **Add:** click `+` in a title bar → menu of registry entries with `addable !== false` → select →
   confirm → the tab is appended to that container and activated (FR-9).

## 8. Non-functional requirements

- **Performance:** 60 fps drag/hover preview and < 16 ms per committed layout change at a reference
  size of **20 containers / 80 tabs**; a change re-renders only the affected container(s) — inactive
  tab content never re-renders on a sibling's move. Measured **last**, as a smoke test: how fast a
  workspace feels depends mostly on the tab components, which the engine does not control.
- **Accessibility (v2):** keyboard equivalents for move / split / resize / reorder and focus management
  are deferred to v2. v1 keeps the cheap semantics: `role="tablist"`/`"tab"`/`"tabpanel"` with
  `aria-selected`/`aria-controls`, the popover's `role="menuitemradio"`/`aria-checked`, and no meaning
  carried by color alone.
- **Robustness:** corrupt, hostile or future-versioned JSON never throws — it warns and falls back to
  `defaultLayout` (FR-15). A stale imperative call (unknown id) is a no-op.
- **Input:** all pointer input goes through **Pointer Events** (`pointerdown`/`pointermove`/`pointerup`,
  `setPointerCapture`, `touch-action: none`) — never `mousedown`/`mousemove`. Mouse and touch therefore
  work in v1 by construction, and pen-specific behaviour (pressure, hover, tilt, barrel) can be added
  in v2 without structural change. Keyboard equivalents are a v2 item (see Accessibility).
- **Browsers:** current Chrome, Edge and Safari. No automated cross-browser matrix: the reference
  check is Playwright on Chromium plus a manual Safari smoke. `color-mix(in oklab, …)` and
  `<input type="color">` are assumed available.
- **Server-side rendering:** out of scope — client-only rendering. The library must still import
  cleanly without a DOM (no DOM access at module top level, no generated ids during render), so SSR
  frameworks can bundle it and render it on the client.
- **Packaging:** **ESM-only** — `.d.ts` + sourcemaps, `sideEffects: false`, peer deps per FR-23, no
  `main` field and no CJS build. Revisit only if a real consumer requires CJS.
- **Testing:** vitest (jsdom) — pure-function tests for the tree ops (split/merge/collapse/reorder/
  migrate/color resolution) plus a StrictMode render smoke test. **Playwright** for browser-level drag
  verification (drag, drop zones, splitter, cancel) before v1 release. Performance smoke test last.
  The smoke suite includes a **render-counter check**: a memoized tab component receiving
  `props.engine` must not re-render when a sibling moves, and the handle identity must be stable — the
  guarantee that makes handing the engine API to consumers safe.

## 9. Acceptance criteria

1. A layout built by dragging tabs to edges yields the tree
   `row[ column[c1, c2], c3 ]` for the reference case (c1/c2 stacked left, c3 full height right), and
   that tree reloads from JSON identically.
2. Dragging a tab to the right edge of a container creates a sibling container at 50% weight; the
   parent still fills exactly 100%.
3. Closing the only tab of a container removes the container, its parent collapses, and no gap or
   empty container remains (except an emptied root, which shows the placeholder).
4. `addTab` with no `target` appends to the active container and activates the new tab; with an empty
   layout it creates the root container. Returned id is stable across save/load.
5. A tab with `tab.color = "#e11"` renders the accent pip and tinted active background after a
   save/load round-trip; an invalid value (`"url(x)"`, `"red"`) is ignored and falls back to the
   registry default without throwing.
6. Choosing a swatch in the tab context menu emits `onTabColorChange` with the hex and updates the tab
   before the app persists anything.
7. `canClose` returning a promise that resolves `false` leaves the tab open and does not remove the
   container.
8. `addTab`/`removeTab` on a missing id does not throw; a tab whose `component` key is absent from the
   registry renders the placeholder and survives a save/load round-trip.
9. Rendering 20 containers / 80 tabs under `StrictMode` produces no legacy-API warnings, no NaN
   weights and no hydration mismatch.
10. A memoized tab component that received `props.engine` does **not** re-render when a sibling
    container's tab moves, resizes or changes color (render count unchanged), and the handle object it
    holds is identical across those layout changes.

## 10. Decisions and remaining open questions

**Closed:**

| Question | Decision |
|---|---|
| Q10 package format | **ESM-only.** No CJS build, no `main` field |
| Q8 CSS delivery | **No stylesheet — inline styles + CSS custom properties only.** Every variable namespaced `--twge-*`; that prefix is the public theming contract, documented in `api.md` |
| Q4 input parity | **Pointer Events only** (mouse + touch by construction). Keyboard equivalents and focus management deferred to v2; pen behaviour likewise |
| Palette | **App-supplied `tabColorPalette?: string[]`**, falling back to the built-in themeable preset set |
| Q9 SSR | **Client-only.** Import must be DOM-safe; server rendering is not a goal |
| Color scope | **Per-tab accent only.** No per-container accent |
| Component → engine access | `GridEngineHandle` is passed to every tab component as `props.engine` — the same stable, action-only object the host uses through the ref. No context provider, no store dependency (FR-23). Reactive reads stay opt-in; if one is ever needed, a hand-rolled `useSyncExternalStore` subscription is the zero-dependency path |
| Add-button UI | No `showAddButton` prop. The `+` is always rendered (FR-9); `addable: false` only filters the menu |

**Still open:** none as of this revision. Deferred by decision, not unresolved (see §3 non-goals):
keyboard/a11y, pen-specific input, corrupt-layout salvage, animated transitions.
