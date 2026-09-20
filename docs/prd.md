# PRD — react-grid-engine

Product requirements for the dockable layout engine. **This document is authoritative**; the raw
request lives in `spec-initial.md` and the design analysis (options, rejected alternatives, risk
register, full schema, React 18.3→19 checklist) in `initial-review.md` §1–§6. Decisions already
settled there are treated here as fixed and are not re-litigated.

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
| **Chrome** | Title bar, borders, gaps, padding, tab colors — presentation, styled via `--ge-*` CSS vars |

## 3. Goals / non-goals

**Goals:** fill the host element 100% at all times; drag-and-drop tabs and containers; JSON round-trip
of the complete layout; app-owned component config with a one-writer rule; zero production
dependencies; React 19-migration-ready.

**Non-goals for v1** (deliberately deferred, see `initial-review.md` §7): floating/undocked windows,
cross-window drag, responsive/breakpoint layouts, animated transitions, undo/redo, `minSize`
constraints (§6 rule 7 of the review), fill-style tab colors, saved layout presets.

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
| FR-2 | Layout is a tree: split nodes (`row`/`column`) with containers as leaves; node size is relative (`weight`) along the parent's axis only | P0 | Review §6 schema |
| FR-3 | Every container renders a title bar; exactly one tab's component is visible and fills the content box; others are hidden | P0 | Content box: `inset: <titlebar> 0 0 0`, `overflow:auto` |
| FR-4 | A tab is draggable within its own title bar to reorder | P0 | |
| FR-5 | A tab dragged onto another container joins that container's tabs (tabify); the source container collapses if it empties | P0 | |
| FR-6 | A tab dragged onto a container edge (left/right/top/bottom) splits that container, creating a new container holding the dragged tab | P0 | 50/50 initial weights |
| FR-7 | Splitters between siblings are draggable to resize; siblings always fill the parent exactly | P0 | Clamp only against a hard floor (e.g. 0 / 24px), weights renormalize |
| FR-8 | Dragging a container by its title-bar background moves the whole container (all its tabs) to a new split position | P1 | Satisfies spec item 2 ("draggable containers") |
| FR-9 | **Add tab:** a `+` control in each title bar opens a menu of registry entries with `addable !== false`; selecting one appends a new tab to that container and activates it | P0 | Hide with `showAddButton={false}` to own the UI |
| FR-10 | **Add tab (programmatic):** `addTab({ component, config?, title?, color?, target?, activate? }) → TabId`; default target = the active container, or `root` when the layout is empty | P0 | Fills the "add component with its container" need |
| FR-11 | **Delete tab:** close control on each tab when `closeable !== false`, plus a context-menu entry; the container is removed when its last tab closes and the space reflows | P0 | Empty root renders the app's placeholder |
| FR-12 | **Delete tab (guarded):** if a definition supplies `canClose(config)`, the UI close path awaits it and aborts when it resolves `false`/throws | P0 | Prevents silent loss of unsaved component state. The imperative `removeTab` is unconditional |
| FR-13 | **Tab color in serialized config:** `tab.color` is a hex accent, engine-rendered, present in the layout JSON and settable by the app | P0 | §6 below |
| FR-14 | **Tab color selector in the tab UI:** the tab context menu offers a preset swatch palette plus a native custom picker; the chosen color applies immediately and is persisted through the normal layout-change path | P0 | §6 below |
| FR-15 | Layout is serializable/deserializable with `version` + `migrate()`; malformed input falls back to `defaultLayout` instead of throwing | P0 | |
| FR-16 | Tabs bind to components by **registry string key**, never a reference; a key missing from the registry renders a "missing component" placeholder and the node is retained | P0 | Registry may be larger *or* smaller than the layout |
| FR-17 | Config is owned by the app, passed down opaquely, never mutated or deep-diffed by the engine; components request changes upward and the app decides | P0 | One store, one writer, `rev`-stamped writes — review §2b |
| FR-18 | Events: engine emits `onLayoutChange`, `onTabEvent`, `onTabConfigChange`, `onTabColorChange`; host app pushes config and layout changes through the root ref API | P0 | No event bus, no pub/sub dependency |
| FR-19 | Stable ids: container and tab ids are app-supplied (or returned by `addTab`); split ids are engine-generated in handlers only, never during render | P0 | SSR/hydration safety |
| FR-20 | Chrome — title bar height, borders, gaps, padding, tab colors — comes from `--ge-*` CSS custom properties with sensible defaults; the layout JSON carries no chrome values | P0 | Two themes can share one stored layout |
| FR-21 | Tab content is sandboxed from layout: `min-width:0; min-height:0; overflow:hidden` on split children; content overflow scrolls inside the container | P0 | Otherwise intrinsic content size breaks the 100% guarantee |
| FR-22 | React 18.3 + TypeScript (`strict`), migratable to 19: no `defaultProps`/`propTypes`/legacy context/`findDOMNode`, no `Math.random` during render, StrictMode-safe effects; keep `forwardRef` | P0 | Review §5 checklist |
| FR-23 | **Zero production dependencies.** `react`/`react-dom` are peer dependencies (`^18.3 \|\| ^19`) | P0 | Drag, hit-testing and a11y are hand-written |
| FR-24 | Inactive tabs are unmounted by default; a registry entry may opt into `keepMountedWhenInactive` | P1 | Video/editor tabs |

### 5.1 Traceability to the original spec

| `spec-initial.md` | Covered by |
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
| *new in this revision* | FR-9…FR-14 |

## 6. Tab color feature

### 6.1 Where the color lives

**`Tab.color`, a hex accent on the tab node — not inside `config`.** The engine treats `config` as
opaque (`unknown`), so a color hidden in there would be unreachable for the chrome, requiring a
registry hook to read it. The tab already carries `title` at node level with a registry fallback for
exactly this reason; `color` follows the same rule.

Resolution order (first hit wins):

1. `tab.color` — app-set or user-picked, serialized
2. `registry[tab.component].defaultColor` — the component type's identity color
3. `--ge-tab-accent` — theme default ("no color")

### 6.2 Value format and validation

- Accepted: `#rgb`, `#rrggbb`, `#rrggbbaa` (case-insensitive). The palette emits hex only.
- Anything else is **ignored with a dev-mode warning** and falls through the resolution chain. This
  keeps the engine from ever writing an arbitrary CSS token into a style attribute.
- No color space or theme-awareness in v1: a hex is a hex.

### 6.3 Rendering

- The color is an **accent, not a fill**: a leading pip plus `background: color-mix(in oklab, <color>
  12%, var(--ge-tab-bg))` on the active tab, and the accent as the active-tab underline.
- Tab **text color stays theme-controlled**, so contrast and dark mode never become the app's problem.
  A fill-style tab (`colorMode: 'fill'`) is explicitly deferred — it drags in contrast handling.
- Color is never the only carrier of meaning: label and active state remain visible regardless.

### 6.4 UI selector

- Reachable from the tab context menu ("Tab color") and via keyboard (menu → `aria-haspopup`).
- Popover contains: a **swatch row** (8–12 presets read from `--ge-tab-color-*` vars, themeable), a
  **Custom…** entry opening the native `<input type="color">` (platform feature, zero dependencies),
  and a **Default** entry that clears `tab.color`.
- Swatches are `role="menuitemradio"` with `aria-checked` and an accessible name ("Red", "Custom…"),
  focus is trapped while open, `Esc` closes and returns focus to the tab.
- Applying a color updates the UI immediately, then emits `onTabColorChange(tabId, color, meta)` and
  `onLayoutChange(...)`; the app owns persistence. In uncontrolled mode the engine keeps it in layout
  state and reports it.

### 6.5 Data and API delta

```ts
interface Tab {
  id: string;
  component: string;
  title?: string;
  color?: string;      // NEW — hex accent, see §6.1/§6.2
  config: unknown;
}

interface PanelDefinition<C = any> {   // a *tab component* definition
  component: React.ComponentType<PanelComponentProps<C>>;
  defaultConfig?: C;
  createConfig?: () => C;      // NEW — preferred: fresh object per tab (no shared mutable default)
  defaultColor?: string;       // NEW — identity color for this component type
  title?: (config: C) => React.ReactNode;
  addable?: boolean;           // NEW — appears in the "+" menu (default true)
  allowMultiple?: boolean;     // NEW — may exist in several tabs (default true)
  closeable?: boolean;         // close control + menu entry (default true)
  canClose?: (config: C) => boolean | Promise<boolean>;   // NEW — unsaved-state guard
  keepMountedWhenInactive?: boolean;
}

interface GridEngineHandle {
  addTab(p: { component: string; config?: unknown; title?: string; color?: string;
              target?: DropTarget; activate?: boolean }): string;   // NEW
  removeTab(id: string): void;                                      // NEW — unconditional
  updateTab(id: string, patch: { title?: string; color?: string }): void;  // NEW
  moveTab(id: string, target: DropTarget): void;
  setTabConfig(id: string, config: unknown): void;
  focusTab(id: string): void;
}
```

`defaultConfig`/`defaultColor` are shared references by contract; `createConfig()` exists so a new tab
can get an independent object (`{ items: [] }` handed out by reference is the classic instance
bleed-through bug).

## 7. Interaction spec

| Gesture | Result |
|---|---|
| Drag tab within its title bar | Reorder |
| Drag tab onto a container's center | Append to that container's tabs, activate |
| Drag tab onto a container's edge | Split that container, new container holds the tab |
| Drag tab onto the outer window edge | Split the root; new container takes that side |
| Drag splitter | Resize the two adjacent siblings, clamped to a hard floor |
| Drag empty title-bar space | Move the whole container |
| Click `+` | Add-tab menu (FR-9) |
| Click tab close (`×`) | Guard, then close; container removed when empty (FR-11, FR-12) |
| Right-click tab | Menu: close, close others, **tab color**, rename (if `title`-editable) |
| `Esc` during any drag | Cancel, restore prior layout |

Drop zones are 5 per container: 4 edges + center. Outer window edges and corners resolve to the
nearest applicable side. A drag shows a preview overlay, not a live relayout.

## 8. Non-functional requirements

- **Performance:** 60 fps drag/hover preview with 50 containers and 200 tabs; a layout change
  completes in < 16 ms and re-renders only the affected container(s) — inactive tab content never
  re-renders on a sibling's move.
- **Accessibility:** every pointer interaction has a keyboard equivalent (move tab between containers,
  split, resize, reorder); `role="tablist"`/`"tab"`/`"tabpanel"` with `aria-selected`,
  `aria-controls`; focus follows a moved tab; the color popover is keyboard-operable (§6.4); no
  meaning is carried by color alone.
- **Robustness:** corrupt, hostile or future-versioned JSON never throws — it validates, migrates or
  falls back. A stale imperative call (unknown id) is a no-op.
- **Packaging:** ESM + CJS builds, bundled `.d.ts`, `sideEffects` correct, peer deps as FR-23, SSR-safe
  (no DOM access at import time).
- **Testing:** pure-function tests for the tree ops (split/merge/collapse/reorder/migrate/color
  resolution) plus a StrictMode render smoke test; browser-level drag verification before v1 release.

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
9. Rendering 50 containers / 200 tabs under `StrictMode` produces no legacy-API warnings, no NaN
   weights and no hydration mismatch.

## 10. Open questions

1. **Input parity (Q4):** is touch/pen + full keyboard parity in v1, or is the keyboard fallback a P1?
   This drives a large share of the drag cost.
2. **CSS delivery (Q8):** confirm "no stylesheet shipped, inline styles + `--ge-*` variables only", or
   ship an optional theme file as well.
3. **SSR (Q9):** must the engine server-render a layout, or is client-only rendering with a
   placeholder acceptable?
4. **Package format (Q10):** ESM-only, or dual ESM+CJS?
5. **Color scope:** is a per-tab accent enough, or is a per-container accent also needed?
6. **Palette customization:** fixed `--ge-tab-color-*` set, or an app-supplied palette array in props?
