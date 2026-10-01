# Design decisions, and what they mean for you

The API is shaped by a handful of decisions. This page explains each one — the problem it solves,
the alternative that was rejected, and the consequence you will actually feel while building with
the engine. The requirements behind them are in [`../prd.md`](../prd.md); the packaging/build
choices are in [`../tech-spec.md`](../tech-spec.md).

- [Layout is JSON, not React state](#layout-is-json-not-react-state)
- [Uncontrolled layout: one writer](#uncontrolled-layout-one-writer)
- [Relative weights, no pixels](#relative-weights-no-pixels)
- [No stylesheet, only CSS variables](#no-stylesheet-only-css-variables)
- [Tabs bind to registry string keys](#tabs-bind-to-registry-string-keys)
- [The engine handle is the only action surface](#the-engine-handle-is-the-only-action-surface)
- [Config is app-owned, `rev`-stamped](#config-is-app-owned-rev-stamped)
- [Events fire after commit, and never echo](#events-fire-after-commit-and-never-echo)
- [Color is an accent, not a fill](#color-is-an-accent-not-a-fill)
- [Pointer Events only](#pointer-events-only)
- [Zero production dependencies, ESM-only](#zero-production-dependencies-esm-only)
- [Client-only by design](#client-only-by-design)
- [Explicit non-goals in v1](#explicit-non-goals-in-v1)

---

## Layout is JSON, not React state

**Decision.** The workspace is a versioned JSON tree (`Layout` → `SplitNode` / `ContainerNode` /
`Tab`) with string ids and a string `component` key. `serializeLayout` emits only wire fields;
`parseLayout` never throws and never mints ids.

**Why.** The primary use case is “store the workspace, restore it next session, same components,
same configs”. Anything that cannot survive `JSON.stringify` (a component reference, a class
instance, a DOM node) would break that. A string-keyed document also crosses versions: an older
layout loads into a newer registry and vice versa.

**Rejected alternative:** storing React elements or component references in the layout. It would
make serialization impossible and tie saved data to a specific bundle.

**What it means for you:** ids are data — if you author a `defaultLayout` by hand, supply unique
ids and expect them to be authoritative. Unknown fields are dropped on read, so don’t stash
app-only data on nodes; keep it in the registry or in `Tab.config`.

---

## Uncontrolled layout: one writer

**Decision.** `defaultLayout` is read once on mount. There is no controlled `layout` prop. Writes
go through the ref handle; reads come back through `onLayoutChange` and `getLayout()`.

**Why.** A drag produces a stream of `pointermove` events and exactly one commit. If the app owned
the layout, every frame would have to round-trip: engine proposes → app state → engine re-renders
with the value it just proposed. That is a feedback loop waiting to happen (especially with React
StrictMode double-invocation), and it forces the app to reconcile in-flight gestures.

**Rejected alternative:** a controlled `layout` + `onLayoutChange` pair (the usual “dumb component”
shape). It reads nicely in a blog post and is miserable for high-frequency gestures.

**What it means for you:** **you own persistence.** That is not a tax, it is the feature — the
layout is yours to store, sync and migrate. Hold the handle in a ref, not in state:

```tsx
const engine = useRef<GridEngineHandle>(null);
// read once; later changes arrive via onLayoutChange
const [initial] = useState(() => loadFromStorage() ?? defaultLayout);
```

`getLayout()` is a snapshot for export/diffing — rendering from it would create a second, lagging
source of truth.

---

## Relative weights, no pixels

**Decision.** Each child carries one number, `weight`, meaning its share of the parent’s axis.
Weights are normalized at render like `flex-grow`; the cross axis is always the parent’s full
extent. There is no `width`/`height`, no `minSize`, no `ResizeObserver` in the layout path.

**Why.** Absolute pixels plus a browser window that changes size is a normalization problem
(hairline seams, `0.9999` sums, “who owns rounding?”). Relative weights never need fixing up: the
browser resolves them, and the root always fills exactly.

**Rejected alternative:** storing pixel geometry and re-solving on resize. More state, more edge
cases, no benefit for a tiling layout.

**What it means for you:** `[1, 1]` and `[50, 50]` are the same layout; don’t try to make weights
sum to 1. The splitter clamp is a relative `0.05` floor per side, so it behaves the same on any
screen. Non-guillotine arrangements (a true pinwheel) cannot be expressed — and the drag
interactions never produce one.

---

## No stylesheet, only CSS variables

**Decision.** The package ships **no CSS**. Chrome is inline styles that read `--twge-*` custom
properties, each with a built-in default. Chrome values are never serialized.

**Why.** A stored layout should not encode a theme. Two apps with different themes load the same
JSON and look different. There is also no stylesheet to import, no load order to get right, and no
global selectors to fight.

**Rejected alternative:** a bundled CSS file. It would make the layout less portable, add an
import step, and create specificity conflicts with host styles.

**What it means for you:** set variables on any ancestor of the engine (see
[Theme the chrome](recipes.md#theme-the-chrome)). The `--twge-` prefix is a stable contract —
adding or renaming a variable is a public API change, so pin the version if you depend on one.
`--twge-gap` is both the visual gap and the splitter hit area.

---

## Tabs bind to registry string keys

**Decision.** `Tab.component` is a string looked up in an app-supplied `PanelRegistry`. A key
missing from the registry renders a placeholder and the tab node is retained.

**Why.** A layout can outlive any single component: a feature flag is off, a plugin is not
installed, an old layout names a panel that moved. Resetting the whole workspace because one key
is unknown would lose the user’s arrangement. A placeholder degrades gracefully.

**Rejected alternative:** fail fast on unknown components. Safer-looking, worse in production —
one missing panel nukes the workspace.

**What it means for you:** treat registry keys as a public contract of your app. The registry may
be larger or smaller than any given layout, and it is never serialized, so it is the right place
for components, colors, guards and titles.

---

## The engine handle is the only action surface

**Decision.** `GridEngineHandle` is a stable, action-only object. The host gets it from the ref;
**every panel component gets the same object** as `props.engine`. There is no React context
provider and no store dependency.

**Why.** A context provider would make every tab re-render when anything in the layout changed
unless every consumer were carefully memoized. Passing one stable object keeps the reactive graph
flat: `config` is the only reactive input a panel needs.

**Guarantee:** the handle identity is stable across layout changes, and a `React.memo` panel does
not re-render when a sibling moves, resizes or recolors. That is what makes it safe to hand the
engine API to third-party components.

**What it means for you:** don’t stuff the handle into component state or recreate it. Call
`engine.current?.…` from handlers. If you need reactive reads, subscribe yourself — the engine does
not push state down.

---

## Config is app-owned, `rev`-stamped

**Decision.** The engine passes `config` down opaquely and never mutates or deep-diffs it. A panel
asks for a change with `requestConfigChange`; the app decides. Config writes carry a monotonic
`rev`, and a stale `rev` is ignored.

**Why.** Two writers (the app and a panel) can race. “Newest revision wins” is deterministic and
cheap; deep-diffing arbitrary app state would make the engine care about data it does not own.

**What it means for you:** implement `onTabConfigChange` and call `setTabConfig(id, config, rev)`
to push the accepted value back down. If you never sync config, the panel’s `config` prop will not
change — the engine deliberately does not apply a panel’s request itself. Revs are runtime-only;
never serialize them.

---

## Events fire after commit, and never echo

**Decision.** All four callbacks fire once per **committed** change, after the layout is updated —
never during render, never per `pointermove`. `meta.programmatic` distinguishes your ref calls from
user gestures.

**Why.** Firing during a gesture would make the host re-render mid-drag and turn a smooth
interaction into a janky one; firing an echo (a change caused by a change you just reported) is the
classic infinite-loop bug in component libraries.

**What it means for you:** persist in `onLayoutChange` without worrying about write volume. Use
`meta.action` for analytics and `meta.programmatic` to tell “user did this” from “app did this”.

---

## Color is an accent, not a fill

**Decision.** `Tab.color` is a validated hex accent. When present it renders a pip, a 12 % tinted
active tab and an underline; text stays theme-controlled. Invalid values are ignored and fall
through the chain `tab.color → registry.defaultColor → --twge-tab-accent`.

**Why.** A colored fill forces a text-contrast decision the engine cannot make without owning the
theme, and color as the *only* signal is an accessibility problem. An accent decorates without
taking over legibility.

**Rejected alternative:** panes with arbitrary CSS backgrounds. That lets a host inject
`url(...)` or a theme-breaking token into a style attribute, and the layout would start carrying
presentation.

**What it means for you:** hex in, hex out. Use `defaultColor` for type identity and `tab.color`
for user marking; a fill-style mode is a deferred v2 item because it drags in contrast handling.

---

## Pointer Events only

**Decision.** Drag and resize use `pointerdown`/`pointermove`/`pointerup` with
`setPointerCapture` and `touch-action: none`. There are no `mousedown`/`mousemove` handlers and no
`ResizeObserver` for layout.

**Why.** Pointer Events cover mouse, touch and pen with one code path. No gesture library, no
per-device branches — which is also how the package keeps zero production dependencies.

**What it means for you:** mouse and touch work by construction. **Keyboard-driven resize and drag
are not implemented in v1** (ARIA roles and focus order are present; full keyboard operation is the
v2 a11y item). If you need it today, expose equivalent actions through the handle — `moveTab` and
`focusTab` are the primitives.

---

## Zero production dependencies, ESM-only

**Decision.** `dependencies` is empty; `react`/`react-dom` are peers (`^18.3 || ^19`). The package
is ESM-only, has no `main` field, and is marked `sideEffects: false`.

**Why.** A layout engine sits in the hot path of every render, so its bundle should be your
components, not someone’s gesture library. ESM-only matches every modern bundler (Vite, webpack 5,
Next 13+) and avoids dual-package hazards.

**What it means for you:** no CJS build. If a tool in your pipeline genuinely needs `require()`,
that is a blocker today — say so, because it changes the packaging decision. Tree-shaking works;
the engine’s own runtime is small.

---

## Client-only by design

**Decision.** The module is import-safe on a server (no DOM access at module scope, no ids minted
during render), but rendering requires a browser. Server rendering is a non-goal.

**Why.** Layout depends on measured pixel extents for hit-testing, and the drag model is
inherently interactive. Pretending to SSR it would ship a hydration mismatch for no benefit.

**What it means for you:** in a framework with SSR, render the engine on the client only (Next.js
shown here):

```tsx
const GridEngine = dynamic(
  () => import('@t-works/react-grid-engine').then((m) => m.GridEngine),
  { ssr: false },
);
```

(Ids being data, not render artefacts, is what keeps even a client-only mount deterministic.)

---

## Explicit non-goals in v1

Some things are deliberately absent. They are decisions, not oversights:

| Not in v1 | Why / when it might return |
|---|---|
| Keyboard drag/resize, focus management | ARIA roles ship now; full keyboard operation is the a11y follow-up |
| Pen-specific behaviour | Pointer Events already get basic pen; special-casing is v2 |
| Salvaging parts of a structurally corrupt layout | Fall back to `defaultLayout` and warn; a partial workspace is confusing |
| Floating windows, cross-window drag | Different layout model |
| Animated transitions | Visual polish, not layout correctness |
| `minSize`, undo/redo, saved presets | Drag-and-resize clamps are relative; undo needs a history model the app may already own |
| Fill-style tab colors | Drags in contrast handling (see above) |
| A docs site / generated API reference | One hand-written [`../api.md`](../api.md) until it demonstrably drifts |

If you hit one of these limits, the workaround is usually the handle: `addTab`, `moveTab`,
`focusTab` and `updateTab` can express most programmatic intent without new engine features.
