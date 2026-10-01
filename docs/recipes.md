# Recipes

Task-oriented examples for `@t-works/react-grid-engine`. Every snippet is TypeScript and
assumes:

```tsx
import { useRef, useState } from 'react';
import { GridEngine, parseLayout, serializeLayout } from '@t-works/react-grid-engine';
import type { GridEngineHandle, Layout, PanelComponentProps, PanelRegistry } from '@t-works/react-grid-engine';
```

Full reference: [`../api.md`](docs/api.md). Rationale: [`./design.md`](design.md).

---

## Persist and restore a workspace

The engine never touches storage. You read once, write on every committed change.

```tsx
const STORAGE_KEY = 'my-app:layout';

const defaultLayout: Layout = {
  version: 1,
  root: {
    type: 'container', id: 'c1', activeTabId: 't1',
    tabs: [{ id: 't1', component: 'notes', title: 'Notes', config: {} }],
  },
};

function load(): Layout {
  const raw = localStorage.getItem(STORAGE_KEY);
  // Never throws: corruption warns and returns `defaultLayout`.
  return raw === null ? defaultLayout : parseLayout(raw, defaultLayout);
}

export default function App() {
  const [initial] = useState(load);   // read once, on mount

  return (
    <div style={{ height: '100vh' }}>
      <GridEngine
        defaultLayout={initial}
        registry={registry}
        onLayoutChange={(layout) => {
          // Called once per committed change — never per pointermove.
          localStorage.setItem(STORAGE_KEY, serializeLayout(layout));
        }}
      />
    </div>
  );
}
```

**Why read once in `useState`?** `defaultLayout` is only parsed on mount; passing a freshly
`parseLayout`-ed object every render would be ignored (and wasteful). See
[uncontrolled layout](design.md#uncontrolled-layout-one-writer).

### Migrating and repairing on read

```ts
const layout = parseLayout(raw, defaultLayout, (message) => report(message));
```

- A **future `version`** warns and falls back to `defaultLayout`.
- Unknown fields are dropped, so a round-trip is a normalizer, not a lossless copy.
- Dangling `activeTabId` / `activeContainerId` are repaired and the rest of the layout survives.

---

## Add and wire tabs programmatically

Use the handle from a toolbar; the layout is the only source of truth.

```tsx
function App() {
  const engine = useRef<GridEngineHandle>(null);

  return (
    <>
      <button onClick={() => engine.current?.addTab({ component: 'chart', config: { metric: 'Revenue' } })}>
        Add chart
      </button>
      <button onClick={() => engine.current?.addTab({ component: 'notes', target: { kind: 'tab', containerId: 'left' } })}>
        Add note to the left
      </button>
      <button onClick={() => engine.current?.addTab({ component: 'chart', target: { kind: 'split', containerId: 'right', edge: 'right' } })}>
        Split off a chart
      </button>
      <div style={{ height: '100vh' }}>
        <GridEngine ref={engine} defaultLayout={load()} registry={registry} />
      </div>
    </>
  );
}
```

- `addTab` returns the new tab id; use it to `updateTab`, `focusTab` or `removeTab` later.
- With no `target` it appends to the **active container** and activates the tab, or creates the
  root container when the layout is empty.
- A misspelled id in `target` is a **no-op**, never a throw.

**Why no `addTab` on the component props?** Panel components already receive the handle as
`props.engine`; one action surface (the same object) is easier to reason about than splitting
imperative actions across props.

---

## Guards, singletons and mounted tabs

Chrome and close policy are registry concerns, not layout concerns.

```ts
const registry: PanelRegistry = {
  editor: {
    component: Editor,
    // Async guard: called on the UI close path only (× and context menu).
    canClose: (config) => !config.dirty || window.confirm('Discard unsaved changes?'),
  },
  settings: {
    component: Settings,
    allowMultiple: false,      // hidden from "+" once one exists, and not UI-closeable
  },
  audit: {
    component: Audit,
    closeable: false,          // no ×, no menu entry
    titleEditable: false,      // no Rename entry
  },
  video: {
    component: Video,
    keepMountedWhenInactive: true,   // stays mounted while another tab is active
  },
};
```

- `canClose` resolving **`false`** aborts; **rejecting** warns and offers *Force close*.
- `removeTab` is **unconditional** — it bypasses `canClose` by design. Use it for “close anyway”
  and for app-driven closes; use the UI to respect the guard.
- `allowMultiple: false` gates the **menu**, not the API: `addTab` and loaded JSON can still
  create another instance (that is the only way one is created in the first place).
- Close-others / close-all skip non-closeable tabs and `allowMultiple: false` instances.

**Why two close paths?** A guard is a question for the *user*; the imperative API is a
statement from the *app*. Making `removeTab` prompt would make programmatic cleanup impossible to
write reliably.

---

## Sync config up and down (`rev`)

Config is owned by your app, passed down opaquely. The engine never mutates or deep-diffs it.

```tsx
function App() {
  const engine = useRef<GridEngineHandle>(null);
  const configs = useRef(new Map<string, { value: unknown; rev: number }>());

  return (
    <GridEngine
      ref={engine}
      defaultLayout={load()}
      registry={registry}
      onTabConfigChange={(tabId, config, { rev, source }) => {
        // `source: 'tab'` for requestConfigChange, `'app'` for your setTabConfig echo.
        if (source !== 'tab') return;
        configs.current.set(tabId, { value: config, rev });
        persist(tabId, config, rev);
        // Push the accepted value back down, rev-stamped:
        engine.current?.setTabConfig(tabId, config, rev);
      }}
    />
  );
}
```

A panel asks for a change; it never writes:

```tsx
function Filter({ config, requestConfigChange }: PanelComponentProps<{ from: string }>) {
  return (
    <input
      value={config.from}
      onChange={(e) => requestConfigChange({ from: e.target.value })}
    />
  );
}
```

- **Downward** `setTabConfig(id, config, rev?)` ignores `rev <= current` (stale-write guard).
- **Upward** `onTabConfigChange` reports the `rev` the value carries.
- **No echo:** a value received from a tab is not written back down in the same tick.

**Why `rev`?** Two writers (app and panel) can race. A monotonic revision per config cell turns
“last write wins” into “newest revision wins”, which is deterministic. It is runtime-only — revs
are never serialized.

---

## Push events from a panel

`emit` is a one-way, fire-and-forget channel for things that are *not* config:

```tsx
function Log({ tabId, emit }: PanelComponentProps) {
  return <button onClick={() => emit('scroll-to-end', { tabId })}>Latest</button>;
}

// Host:
<GridEngine
  defaultLayout={load()}
  registry={registry}
  onTabEvent={(tabId, type, payload) => console.log(tabId, type, payload)}
/>
```

**Why not reuse `config` for commands?** A command that changes no state would force a layout
write (and an `onLayoutChange`) just to signal. `emit` keeps the layout for layout.

> The host → panel direction (imperative commands *into* a tab) is a v2 proposal:
> [`../feat/imperative-events.md`](docs/feat/imperative-events.md).

---

## Color tabs

A color is a **hex accent**, serialized on the tab. Three ways to set one:

```ts
// 1. Registry default — every tab of this component type inherits it.
const registry: PanelRegistry = { production: { component: Prod, defaultColor: '#e5484d' } };

// 2. On the wire / through the handle.
engine.current?.updateTab(tabId, { color: '#e11' });   // #rgb, #rrggbb, #rrggbbaa

// 3. The user picks one in the tab's context menu (or Custom… / Default).
```

```ts
engine.current?.updateTab(tabId, { color: null });  // clears -> falls back to the registry/theme
engine.current?.updateTab(tabId, { color: undefined }); // does nothing
```

Resolution is `tab.color → registry[component].defaultColor → --twge-tab-accent`. Any non-hex
value (`"red"`, `"url(x)"`) is ignored with a dev warning and falls through — the engine never
writes an arbitrary CSS token into a style attribute.

Limit the popover with your own swatches (hex strings only):

```tsx
<GridEngine ... tabColorPalette={['#e5484d', '#3b82f6', '#30a46c']} />
```

**Why an accent, not a fill?** A colored background forces a decision about text contrast that the
engine cannot make without owning the theme. A pip, a 12 % tinted active tab and an underline
carry the signal while text stays theme-controlled. See
[Color](design.md#color-is-an-accent-not-a-fill).

---

## Theme the chrome

The library ships **no stylesheet**. Chrome is inline styles reading `--twge-*` custom
properties, so you theme it with plain CSS on any ancestor:

```css
.workspace {
  --twge-titlebar-height: 34px;
  --twge-titlebar-bg: #0f172a;
  --twge-titlebar-fg: #e2e8f0;
  --twge-border-color: #1e293b;
  --twge-border-width: 1px;
  --twge-gap: 6px;            /* also the splitter handle width */
  --twge-padding: 8px;
  --twge-tab-bg: #1e293b;
  --twge-tab-active-bg: #0f172a;
  --twge-tab-accent: #3b82f6; /* the "no color" default accent */
  --twge-drop-bg: rgba(59, 130, 246, 0.15);
  --twge-drop-border-color: #3b82f6;
}
```

```tsx
<div className="workspace" style={{ height: '100vh' }}>
  <GridEngine defaultLayout={load()} registry={registry} />
</div>
```

The full variable table is in [`../api.md`](../../api.md). The
`--twge-` prefix **is the public theming API** — renaming a variable is a breaking change.

**Why no stylesheet?** Two apps with different themes can share one stored layout: the layout
JSON carries no chrome values. It also means there is no CSS import step and no stylesheet to
load-order or reset.

---

## Render an empty-workspace placeholder

The engine keeps an **empty root container** (a title bar with `+`) rather than unmounting
itself. Detecting “nothing is open” is your job:

```tsx
function App() {
  const engine = useRef<GridEngineHandle>(null);
  const [empty, setEmpty] = useState(false);

  const checkEmpty = (layout: Layout) =>
    layout.root.type === 'container' && layout.root.tabs.length === 0;

  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <GridEngine
        ref={engine}
        defaultLayout={load()}
        registry={registry}
        onLayoutChange={(layout) => setEmpty(checkEmpty(layout))}
      />
      {empty && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <button onClick={() => engine.current?.addTab({ component: 'notes' })}>
            Open a note
          </button>
        </div>
      )}
    </div>
  );
}
```

`addTab` with no `target` creates the root container when the layout is empty, so the same
button works for both a fresh and an emptied workspace.

---

## Build or mutate a layout in code

`getLayout()` returns a snapshot; `moveTab`/`addTab` are the supported mutations.

```ts
// Snapshot for export/diffing — not reactive, do not render from it.
const snapshot = engine.current?.getLayout();

// Move a tab into a specific container, at the front.
engine.current?.moveTab('t3', { kind: 'tab', containerId: 'left', index: 0 });

// Split a container and put the tab there.
engine.current?.moveTab('t3', { kind: 'split', containerId: 'left', edge: 'bottom' });
```

To render a **custom tree** from scratch, author a `Layout` object (or parse JSON) and pass it as
`defaultLayout`. Remember the invariants: splits have ≥ 2 children, containers have ≥ 1 tab
(except an empty root), and every node needs a unique `id`.

---

## React to who changed the layout

```tsx
onLayoutChange={(layout, meta) => {
  if (!meta.programmatic) analytics.track('layout-gesture', meta.action);
  persist(serializeLayout(layout));
}}
```

`meta.action` is one of `add-tab`, `remove-tab`, `reorder-tab`, `move-tab`, `split`, `resize`,
`focus`, `set-color`, `set-title`, `set-config`; `meta.tabId` / `meta.containerId` name the
subject when known.

---

## Use the engine from inside a panel

`props.engine` is the **same object** as the ref handle, and its identity is stable across
layout changes — so a memoized panel does not re-render when a sibling moves:

```tsx
const Chart = memo(function Chart({ engine, tabId }: PanelComponentProps) {
  return (
    <button onClick={() => engine.focusTab(tabId)}>Focus me</button>
  );
});
```

This is the guarantee that makes handing the API to consumers safe
([`./design.md#the-engine-handle-is-the-only-action-surface`](design.mdhe-engine-handle-is-the-only-action-surface)).
