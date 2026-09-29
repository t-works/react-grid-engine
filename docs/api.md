# API — `@t-works/react-grid-engine`

The consumer contract. Hand-written, reviewed alongside the code: **any public type
change needs an update here in the same commit.** Sources of truth are
[`prd.md`](./prd.md) §5.1, §5.2, §6.5 and the frozen types in
`packages/react-grid-engine/src/`.

> **Naming note — the `Panel*` smell is deliberate.** `PanelComponentDef`,
> `PanelComponentProps` (and the historical `panelId`) keep the `Panel*` prefix for
> *tab components*; everything user-facing is container/tab. This is a naming smell, not
> a defect — do **not** rename half of it. Either the whole vocabulary moves in a
> breaking release, or it stays.

---

## Layout JSON (wire format)

The layout is the versioned, serializable contract. `weight` is the only number on the
wire; all chrome comes from `--twge-*` CSS variables. Ids are data and authoritative on
load — the engine mints UUIDs only when it creates a node in a handler.

```ts
interface Layout {
  version: 1;
  root: Node;                       // a lone container is a valid root
  activeContainerId?: string;       // focused container; default = first in tree order
}

type Node = SplitNode | ContainerNode;   // the only two node kinds

interface SplitNode {                // internal node — the ONLY thing that owns space
  type: 'split';
  id: string;
  axis: 'row' | 'column';            // row: side by side | column: stacked
  weight?: number;                   // share along the PARENT's axis (default 1)
  children: Node[];                  // >= 2
}

interface ContainerNode {            // leaf — owns a rect, owns tabs, shows exactly one
  type: 'container';
  id: string;
  weight?: number;
  activeTabId: string;
  tabs: Tab[];                       // >= 1, except an empty root
}

interface Tab {
  id: string;
  component: string;                 // registry string key — never a reference
  title?: string;                    // serialized; registry `title(config)` is fallback
  color?: string;                    // hex accent — see Color
  config: unknown;                   // app-owned, opaque to the engine
}
```

**Schema rules** (the rules, not the field list, are the schema):

1. One size number per node, never `width` + `height`. `weight` is the share along the
   parent's axis; the cross axis is always the parent's full extent.
2. Weights are normalized at render (`weight / Σ siblingWeights`), like `flex-grow`.
   They need not sum to 1.
3. Cross-axis spanning is a consequence of nesting; there is no `span` field.
4. Invariants: a split has ≥ 2 children; a one-child split is spliced out; a container
   has ≥ 1 tab except an empty root. Structural violations warn + fall back to
   `defaultLayout`. **Dangling references are repaired, not rejected** —
   `activeTabId` → that container's first tab, `activeContainerId` → first container in
   tree order, rest of the layout kept.
5. Chrome is never serialized.
6. Non-guillotine layouts (pinwheels) are out of scope.
7. Ids are data, not render artefacts.

---

## Serialization

```ts
const CURRENT_LAYOUT_VERSION = 1;

function parseLayout(
  input: unknown,               // JSON string or already-parsed value
  defaultLayout: Layout,
  warn?: (message: string) => void,
): Layout;

function serializeLayout(layout: Layout): string;
```

Reading **never throws** and **never mints ids** — ids in the JSON are authoritative:

- Unknown fields are **dropped** on read; `serializeLayout` emits only wire fields, never chrome.
- A **structural violation** — bad node shape, a split with fewer than two children, a non-root
  empty container, a tab without `id`/`component`, nesting beyond the depth guard — warns and
  returns a copy of `defaultLayout`. Structural damage discards the workspace.
- A **dangling reference** is repaired instead, and the rest of the layout survives: `activeTabId`
  → that container's first tab, `activeContainerId` → first container in tree order. An *absent*
  `activeContainerId` stays absent (it is optional); a present-but-dangling one is rewritten.
- A **future `version`** is unknown input — it warns and falls back like any other invalid payload.
- `warn` defaults to `console.warn` with a `[react-grid-engine]` prefix; pass a sink to capture or
  silence it. Successful reads warn about nothing.

---

## `<GridEngine>`

The engine root. The layout is **uncontrolled**: `defaultLayout` is parsed and normalized once, on
mount; every later write goes through the ref handle (no controlled `layout` prop).

```tsx
<GridEngine
  ref={engineRef}                     // GridEngineHandle
  defaultLayout={layout}              // Layout — read once, on mount
  registry={registry}                 // Record<string, PanelComponentDef> — never serialized
  onTabEvent={(tabId, type, payload) => {}}          // optional
  onTabConfigChange={(tabId, config, meta) => {}}    // optional
  onTabColorChange={(tabId, color, meta) => {}}      // optional — meta.source is 'ui' | 'app'
  tabColorPalette={['#e11', '#0af']}                 // optional swatches; built-in presets when omitted
  className="workspace"
  style={{ height: '100vh' }}
/>
```

The root fills its host 100% × 100% and carries no stylesheet: a container's title bar, borders,
gaps, padding and tab colors all read `--twge-*` variables (defaults below). A `component` key
missing from the registry renders a placeholder and the tab node is retained.

## `GridEngineHandle`

A stable, action-only bundle — no state, no subscription. The host gets it from the ref;
every tab component gets the **same object** as `props.engine`. Holding it never causes a
re-render. The layout is **uncontrolled**: `defaultLayout` in, `onLayoutChange` out,
writes through this handle. There is no controlled `layout` prop.

```ts
interface GridEngineHandle {
  addTab(p: {
    component: string;
    config?: unknown;
    title?: string;
    color?: string;
    target?: DropTarget;             // default: active container, or root when empty
    activate?: boolean;
  }): string;                        // returns the new tab id
  removeTab(id: string): void;       // unconditional — bypasses canClose
  updateTab(id: string, patch: { title?: string; color?: string | null }): void;
  moveTab(id: string, target: DropTarget): void;
  setTabConfig(id: string, config: unknown, rev?: number): void;
  focusTab(id: string): void;
  getLayout(): Layout;               // snapshot, not reactive
}
```

- Missing ids are a **no-op** — never a throw.
- `updateTab` with `color: null` **clears** `tab.color`; `color: undefined` **does not**
  (A7).
- New-tab config resolves `explicit config → createConfig() → defaultConfig → {}`;
  the result is always serializable, never `undefined` (A11).
- `setTabConfig` carrying a `rev <= current` is ignored (stale-write guard, §5.2).

## `DropTarget`

```ts
type SplitEdge = 'left' | 'right' | 'top' | 'bottom';

type DropTarget =
  | { kind: 'tab'; containerId: string; index?: number }   // tabify; index omitted = append
  | { kind: 'split'; containerId: string; edge: SplitEdge }
  | { kind: 'root' };                                      // empty layout only
```

There is **no host-edge drop zone** — the outer border/gap is chrome, and a drop there
resolves to the container edge underneath it. Dropping a container into its own subtree,
or a container's only tab onto its own edge, is a no-op. Edge splits start at 50/50.

Dragging shows a **preview**, never a live relayout: `pointermove` draws an overlay (the
target container for a center drop, the new container's region for an edge drop) plus a small
sprite that follows the pointer, and the layout is committed once, on release. `Esc` cancels —
the prior layout is still in place. Pointer Events only (`setPointerCapture`, `touch-action: none`),
so mouse and touch work by construction.

---

## Registry and tab components

The registry is app-supplied and **never serialized**. It may be larger *or* smaller than
the layout; a missing `component` key renders a placeholder and the node survives a
round-trip.

```ts
interface PanelComponentProps<C = unknown> {
  config: C;                                        // read-only, newest committed value
  tabId: string;
  emit: (type: string, payload?: unknown) => void;
  requestConfigChange: (patch: Partial<C>) => void; // app decides
  engine: GridEngineHandle;                         // the stable handle
}

interface PanelComponentDef<C = any> {              // a *tab component* definition
  component: React.ComponentType<PanelComponentProps<C>>;
  defaultConfig?: C;                 // shared reference by contract
  createConfig?: () => C;            // preferred: fresh object per tab
  defaultColor?: string;             // identity color for this component type
  title?: (config: C) => React.ReactNode;   // used when Tab.title is absent
  titleEditable?: boolean;           // default true — rename writes Tab.title
  addable?: boolean;                 // default true — appears in the "+" menu
  allowMultiple?: boolean;           // default true; false + an instance exists =>
                                     // hidden from "+" and not closeable
  closeable?: boolean;               // default true — close control + menu entry
  canClose?: (config: C) => boolean | Promise<boolean>;   // unsaved-state guard
  keepMountedWhenInactive?: boolean; // default false
}
```

The `C = any` default is deliberate: a registry mixes entries with different config
shapes, and a contravariant `ComponentType` would reject them all. It is the single
sanctioned `any` in the public surface.

- `canClose` is on the **UI close path only**; `removeTab` is unconditional. A `false`
  result aborts; a rejection warns and offers **force close** (A14).
- Close-others/close-all skip non-closeable tabs and any `allowMultiple: false` instance.
- The `+` control is always rendered — it is chrome, not an opt-in. `addable: false`
  filters the menu; with no addable entry the control is disabled.
- `allowMultiple: false` gates the **menu only**; programmatic `addTab` and layouts loaded
  from JSON are not blocked (that is how such a tab gets created).

---

## Events

All four fire **after** the change is committed, never during render. `onLayoutChange`
fires once per committed change (gesture end, not per `pointermove`). The engine never
applies a tab's own request — it reports it and the app decides (FR-17). Revs are
runtime-only and are not serialized.

```ts
onLayoutChange(layout: Layout, meta: {
  action: LayoutAction;
  tabId?: string;
  containerId?: string;
  programmatic: boolean;             // true = ref API, false = user gesture
}): void;

onTabEvent(tabId: string, type: string, payload?: unknown): void;

onTabConfigChange(tabId: string, config: unknown, meta: {
  rev: number;
  source: 'tab' | 'app';
}): void;

onTabColorChange(tabId: string, color: string | null, meta: {
  source: 'ui' | 'app';
}): void;

type LayoutAction =
  | 'add-tab' | 'remove-tab' | 'reorder-tab' | 'move-tab'
  | 'split' | 'resize' | 'focus' | 'set-color' | 'set-title' | 'set-config';
```

`rev` mechanism (§5.2): the engine keeps a monotonic `rev` per tab config cell.
**Downward** `setTabConfig(id, config, rev?)` ignores `rev <= current`. **Upward**
`onTabConfigChange` reports the `rev` the value carries. **No echo** — a value received
from a tab is never written back down in the same tick.

---

## Color

`Tab.color` is a hex accent, engine-rendered, serialized. Accepted: `#rgb`, `#rrggbb`,
`#rrggbbaa` (case-insensitive). Anything else is ignored with a dev-mode warning and
falls through the resolution chain — the engine never writes an arbitrary CSS token into
a style attribute.

Resolution order (first hit wins):

1. `tab.color`
2. `registry[tab.component].defaultColor`
3. `--twge-tab-accent`

Rendering is an **accent, not a fill**: when a tab has an accent, it gets a leading pip,
`background: color-mix(in oklab, <color> 12%, var(--twge-tab-bg))` on the active tab, and
the accent as the active-tab underline. With no accent (the `--twge-tab-accent` theme
default — "no color") there is no pip or tint: the active tab keeps
`--twge-tab-active-bg`, and `--twge-tab-accent` still paints the underline. Tab **text
color stays theme-controlled**. Color is never the only carrier of meaning. A fill-style
mode is deferred (it drags in contrast handling).

The context-menu popover offers the app-supplied `tabColorPalette?: string[]` (or the
themeable `--twge-tab-color-*` presets), a **Custom…** entry opening the native
`<input type="color">`, and a **Default** entry that clears `tab.color` by emitting
`null`. Applying a color updates the UI immediately, then emits `onTabColorChange` and
`onLayoutChange` — the app owns persistence. Palette entries must be hex; non-hex
values are filtered. The built-in preset swatches read `--twge-tab-color-<name>` for
their appearance but always emit the built-in hex.

---

## Chrome — `--twge-*` CSS variables

The library ships **no stylesheet** (D9). All chrome comes from these custom properties;
the `--twge-` prefix is the stable public theming contract, so adding or renaming a
variable is a public API change. Every value below has a built-in default. The layout JSON
carries none of them.

| Variable | Used for |
|---|---|
| `--twge-titlebar-height` | title-bar height |
| `--twge-titlebar-bg` | title-bar background |
| `--twge-titlebar-fg` | title-bar text color |
| `--twge-border-color` | container borders |
| `--twge-border-width` | container border thickness |
| `--twge-gap` | gap between adjacent containers — this is also the draggable splitter handle |
| `--twge-padding` | inset padding around a container's content box |
| `--twge-tab-bg` | inactive tab background (also the `color-mix` base) |
| `--twge-tab-active-bg` | active tab background |
| `--twge-tab-accent` | theme default accent — "no color" |
| `--twge-drop-bg` | drop-preview fill |
| `--twge-drop-border-color` | drop-preview outline |
| `--twge-tab-color-<name>` | built-in preset swatches (e.g. `--twge-tab-color-red`) |

`color-mix(in oklab, …)` and `<input type="color">` are assumed available (PRD §8).

Splitters are the gap itself: dragging one resizes the two adjacent siblings and the
sibling absorbs the difference, so the parent keeps filling exactly. Weights stay relative —
the clamp is a `0.05` weight floor per side, never a pixel measurement or `ResizeObserver`
(FR-7 / A3). Keyboard resize is a v2 item.

---

## Guarantees and non-goals

- **Fill:** the engine fills its host 100% × 100% at all times; content overflow scrolls
  inside the container (`min-width:0; min-height:0; overflow:hidden` on split children).
- **Stability (A12b):** `props.engine` is the same object as the ref handle, and its
  identity is stable across layout changes — a memoized tab component does not re-render
  when a sibling moves, resizes or changes color.
- **Client-only:** import is DOM-safe (no DOM access at module top level, no generated ids
  during render). Server rendering is out of scope.
- **Zero production dependencies**; `react`/`react-dom` are peers (`^18.3 || ^19`).
- **ESM-only**, no `main` field, `sideEffects: false`.
- **Out of scope for v1:** keyboard/a11y (ARIA roles still shipped), pen-specific input,
  corrupt-layout salvage, floating windows, cross-window drag, animated transitions,
  undo/redo, `minSize`, fill-style tab colors, saved presets.
