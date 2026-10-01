# Using `@t-works/react-grid-engine`

**Audience:** app developers embedding the engine. You should be comfortable with React
function components, TypeScript and `useRef`.

This folder is the learning material; [`../api.md`](../api.md) is the exhaustive reference
(every type, every field, the `--twge-*` table). Read this page once top-to-bottom for the
mental model, then keep `../api.md` open while coding. The *why* behind the shape of the API
lives in [`./design.md`](./design.md).

- [Install](#install)
- [Five-minute example](#five-minute-example)
- [The mental model](#the-mental-model)
- [The core API in practice](#the-core-api-in-practice)
- [Panel components](#panel-components)
- [Layout is uncontrolled](#layout-is-uncontrolled)
- [Where to go next](#where-to-go-next)

---

## Install

```sh
npm install @t-works/react-grid-engine react react-dom
```

- `react` / `react-dom` are **peer** dependencies, `^18.3 || ^19`. The package has **zero
  production dependencies**.
- **ESM-only** (no CommonJS build). Vite, webpack 5, Next 13+ and any modern bundler consume it
  directly.
- **Client-only.** Importing is safe on a server, but rendering needs a DOM — see
  [Client-only by design](design.md#client-only-by-design).
- The package is typed; all examples below typecheck with `strict: true`.

---

## Five-minute example

The engine renders a **layout** (a JSON tree) using a **registry** (your components). Nothing
else is required.

```tsx
import { GridEngine } from '@t-works/react-grid-engine';
import type { Layout, PanelComponentProps, PanelRegistry } from '@t-works/react-grid-engine';

// 1. Your tab component. It receives `config`, `tabId`, `emit`,
//    `requestConfigChange` and the stable `engine` handle.
function Notes({ config }: PanelComponentProps<{ text?: string }>) {
  return <div style={{ padding: 12 }}>{config.text ?? 'Empty note'}</div>;
}

// 2. The registry maps string keys -> components. Never serialized.
const registry: PanelRegistry = {
  notes: { component: Notes },
};

// 3. A layout: a JSON tree with ids, tabs and (optionally) weights.
const defaultLayout: Layout = {
  version: 1,
  activeContainerId: 'left',
  root: {
    type: 'container',
    id: 'left',
    activeTabId: 'note-1',
    tabs: [
      { id: 'note-1', component: 'notes', title: 'Notes', config: { text: 'Hello' } },
    ],
  },
};

export default function App() {
  return (
    // The engine fills its parent 100% x 100% — the parent must have a height.
    <div style={{ height: '100vh' }}>
      <GridEngine defaultLayout={defaultLayout} registry={registry} />
    </div>
  );
}
```

That renders a title bar with a **Notes** tab, a `+` menu, a close control, and the panel. Drag
the tab onto the content area of another container to tabify; drag it to an edge to split; drag
the gap between containers to resize.

> **Gotcha:** a height of `auto` on the parent gives the engine nothing to fill. Always give the
> host — or an ancestor — an explicit height (`100vh`, flex `1 1 0`, a pixel value).

---

## The mental model

### The layout is a tree of two node kinds

```ts
Layout {
  version: 1;
  root: Node;
  activeContainerId?: string;
}

type Node = SplitNode | ContainerNode;
```

- **`SplitNode`** is the only node that owns space. It has an `axis` (`row` = side by side,
  `column` = stacked), a relative `weight`, and **two or more** children.
- **`ContainerNode`** is a leaf: it owns a rectangle and a set of `Tab`s, and shows exactly one.
- A lone container is a valid root (a one-panel workspace).

```ts
// row[ column[c1, c2], c3 ] — c1 over c2 on the left, c3 full height on the right.
import type { ContainerNode } from '@t-works/react-grid-engine';

const layout: Layout = {
  version: 1,
  root: {
    type: 'split', id: 's0', axis: 'row',
    children: [
      {
        type: 'split', id: 's1', axis: 'column', weight: 1,
        children: [
          container('c1', 't1', 'chart', 'Revenue'),
          container('c2', 't2', 'table', 'Rows'),
        ],
      },
      container('c3', 't3', 'notes', 'Notes'),
    ],
  },
};

function container(id: string, tabId: string, component: string, title: string): ContainerNode {
  return { type: 'container', id, activeTabId: tabId, weight: 1,
           tabs: [{ id: tabId, component, title, config: {} }] };
}
```

### Space is relative, nothing else

Each child carries one number — `weight`, the share of its **parent's** axis. Weights are
normalized at render exactly like CSS `flex-grow` (`weight / Σ siblingWeights`), so:

- they **need not sum to 1** — `[1, 1]` and `[50, 50]` are the same layout;
- the cross axis is always the parent's full extent — there is no `height`/`width` on the wire;
- “spanning” is produced by nesting, not by a `span` field.

Every layout that satisfies the invariants fills its host **100% × 100%** with no gaps and no
layout-level scrollbar.

### Tabs bind to components by string key

`Tab.component` is `"notes"`, not a component reference. That is what makes a layout a portable
JSON document: it survives `JSON.stringify`, a page reload, and a new app version. A key missing
from the registry renders a **missing component** placeholder and the tab node is kept, so an
older/newer layout still loads.

---

## The core API in practice

### Read/serialize layouts

```ts
import { parseLayout, serializeLayout, CURRENT_LAYOUT_VERSION } from '@t-works/react-grid-engine';

serializeLayout(layout);                 // -> string, wire fields only
parseLayout(json, defaultLayout);        // -> Layout; never throws
```

- `parseLayout` **never throws** and **never mints ids** — ids in the JSON are authoritative.
- Unknown fields are dropped. Structural damage (a split with one child, a tab with no
  `component`, deep nesting) warns and falls back to `defaultLayout`. Dangling pointers
  (`activeTabId`, `activeContainerId`) are **repaired**, not rejected, so a workspace does not
  reset over one stale id.
- Pass a `warn` sink as the third argument to capture warnings in tests or silence them.

See [Persist and restore a workspace](recipes.md#persist-and-restore-a-workspace).

### The handle (`GridEngineHandle`)

Get it from the ref; **panel components get the same object** as `props.engine`. It is
action-only — holding it never causes a re-render.

```tsx
const engine = useRef<GridEngineHandle>(null);

const id = engine.current?.addTab({ component: 'chart', config: { metric: 'Revenue' } });
engine.current?.updateTab(id, { title: 'Prod', color: '#e11' });
engine.current?.focusTab(id);
engine.current?.moveTab(id, { kind: 'split', containerId: 'right', edge: 'right' });
engine.current?.removeTab(id);            // unconditional — bypasses `canClose`
engine.current?.setTabConfig(id, nextConfig, rev);
const snapshot = engine.current?.getLayout();  // not reactive
```

- **Missing ids are a no-op**, never a throw — safe to call from stale callbacks.
- `addTab` with no `target` appends to the **active container** (or creates the root when the
  layout is empty) and returns the new tab id.
- `updateTab(id, { color: null })` **clears** the color; `{ color: undefined }` leaves it.
- `moveTab` target is a [`DropTarget`](#drop-targets): tabify, split, or root.

### Drop targets

```ts
type DropTarget =
  | { kind: 'tab';   containerId: string; index?: number }   // join; index omitted = append
  | { kind: 'split'; containerId: string; edge: 'left' | 'right' | 'top' | 'bottom' }
  | { kind: 'root' };                                        // empty layout only
```

Edge splits start at 50/50. Dropping a container into its own subtree, or a container's only tab
onto its own edge, is a no-op.

### Events

All four callbacks fire **after** a change is committed — once per change, never per
`pointermove`. The engine reports; your app decides.

```tsx
<GridEngine
  defaultLayout={initial}
  registry={registry}
  onLayoutChange={(layout, meta) => {
    // meta: { action, tabId?, containerId?, programmatic }
    persist(serializeLayout(layout));
  }}
  onTabEvent={(tabId, type, payload) => console.log(tabId, type, payload)}
  onTabConfigChange={(tabId, config, { rev, source }) => saveConfig(tabId, config, rev)}
  onTabColorChange={(tabId, color, { source }) => saveColor(tabId, color)}
/>
```

`meta.programmatic` is `true` for changes you made through the ref and `false` for user gestures
(drag, menu, close control) — useful for analytics or “dirty” tracking.

---

## Panel components

A panel component is an ordinary React component with these props:

```ts
interface PanelComponentProps<C = unknown> {
  config: C;                                         // read-only, newest committed value
  tabId: string;
  emit: (type: string, payload?: unknown) => void;   // push an event up
  requestConfigChange: (patch: Partial<C>) => void;  // ask the app to change config
  engine: GridEngineHandle;                          // the stable action handle
}
```

```tsx
function Chart({ config, tabId, emit, engine }: PanelComponentProps<{ range: string }>) {
  return (
    <div>
      <strong>{config.range}</strong>
      <button onClick={() => emit('legend-click', { series: 'revenue' })}>Legend</button>
      <button onClick={() => engine.moveTab(tabId, { kind: 'split', containerId: 'right', edge: 'top' })}>
        Pop out
      </button>
    </div>
  );
}
```

The **registry entry** controls chrome and behaviour:

```ts
interface PanelComponentDef<C = any> {
  component: React.ComponentType<PanelComponentProps<C>>;
  title?: (config: C) => React.ReactNode;  // fallback when Tab.title is absent
  defaultConfig?: C;                        // shared reference — prefer createConfig
  createConfig?: () => C;                   // fresh config per new tab
  defaultColor?: string;                    // identity accent for this component type
  titleEditable?: boolean;                  // default true
  addable?: boolean;                        // default true — appears in the "+" menu
  allowMultiple?: boolean;                  // default true; false hides it once one exists
  closeable?: boolean;                      // default true
  canClose?: (config: C) => boolean | Promise<boolean>;  // unsaved-work guard
  keepMountedWhenInactive?: boolean;        // default false — opt into keeping DOM
}
```

New-tab config resolves `explicit config → createConfig() → defaultConfig → {}` and is always a
serializable value. The `+` control is **always rendered**; `addable: false` only removes that
entry from the menu (with nothing addable it is disabled). See
[Guards, singletons and mounted tabs](recipes.md#guards-singletons-and-mounted-tabs).

---

## Layout is uncontrolled

`defaultLayout` is read **once, on mount**. After that the engine never accepts a `layout` prop:

```tsx
const [initial] = useState(() => loadFromStorage() ?? defaultLayout);

<GridEngine
  defaultLayout={initial}
  registry={registry}
  onLayoutChange={(layout) => saveToStorage(serializeLayout(layout))}
/>
```

Writes go **through the handle**, reads come back through `onLayoutChange` / `getLayout()`.

**Why:** an uncontrolled layout gives the layout exactly one writer. A controlled `layout` prop
would have to reconcile the app's copy with in-flight gestures every frame and invites feedback
loops (engine writes → app state → engine re-renders with the write it just made). The cost is
that *you* own persistence — which you wanted anyway, because that is the feature. The rationale
and the alternatives considered are in [`./design.md`](./design.md#uncontrolled-layout-one-writer).

---

## Where to go next

| I want to… | Read |
|---|---|
| Install, serialize, restore, add tabs, guard closes, theme | [`./recipes.md`](./recipes.md) |
| Understand *why* the API looks like this | [`./design.md`](./design.md) |
| Look up an exact field, event or CSS variable | [`../api.md`](../api.md) |
| See a full app with drag/drop and `localStorage` persistence | `examples/standalone-dashboard/` |
| See a minimal static layout | `examples/standalone-basic/` |
