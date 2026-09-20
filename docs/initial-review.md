# Critical review — `docs/spec-initial.md`

Status: greenfield. Repo contains only `.gitignore` and this spec (commit `5619e3c`), so everything
below is a design risk, not a code risk. Nothing is implemented yet — this is the cheapest possible
moment to fix the ambiguity.

**Verdict:** the functional requirements are reasonable, but the spec was under-specified on the one
thing that determines 80% of the architecture (what "grid engine" means) and on the one thing that
breaks most such libraries (who owns state). **§1 is now resolved** by the owner: it is docking
(B) — see §1c. One structural decider remains there (does space live in a nested split tree or a flat
rect list, which turns on whether users can resize). Requirement 7 remains the real architecture
problem (§2, §2b). Requirements 1–10 are still not a buildable spec; they are a wish list.

---

## 1. Blocking ambiguity: "grid engine" means three different products

The spec mixes vocabulary from two incompatible layout models:

| Interpretation | Model | Evidence in spec | Effort |
|---|---|---|---|
| **A. Masonry/packing grid** (react-grid-layout) | Free-form tiles on a column grid, drag/resize anywhere, vertical compaction | "grid engine", "always fill container 100%", "draggable containers" | Medium |
| **B. Docking layout** (golden-layout, dockview, VS Code) | Recursive split tree; panels live in leaf groups; groups have tab bars; drag a tab to split/tabify | "each container has a draggable tab", "containers can be grouped" | **High** |
| **C. CSS-grid cell reorder** | Fixed cell matrix, drag to swap cells | "grid" | Low |

Requirements 3 + 4 ("draggable **tab**", "containers can be **grouped**") only make sense in model
**B**. Requirement 1 ("fill 100%") and the name "grid engine" point at A. In A there are no tabs and
no groups; in B there is no packing algorithm and "fill 100%" is a property of the split tree, not a
feature you implement.

**Risk:** picking A and then bolting on tabs/groups produces the classic hybrid that has to be
rewritten (this is how react-grid-layout forks die). Picking B without saying so produces a spec
that reviewers and future contributors will misread.

**Solution (now confirmed by the owner — see §1c):** model **B**, with the vocabulary fixed as
"container" (a rect that owns tabs, exactly one visible), "tab", "title bar", "split". The layout is
a **recursive split tree**. A was never intended; requirements 3 and 4 were the tell.

### 1b. Why they are incompatible (the mechanics)

They are **different data structures**, not two settings of one:

- **A (grid):** `Item[] = { id, x, y, w, h }` — flat, positions **absolute** in a unit space, plus a
  global collision/compaction ("gravity") pass. Structure carries no meaning.
- **B (docking):** recursive tree — positions **relative** (fractions of the parent node), and the
  structure itself is the meaning (who is a sibling of whom, what is tabbed with what).

The concrete conflicts, in the order they bite:

1. **Nowhere to put a tab.** A flat coordinate list has no way to express "two panels, same rect,
   only one visible". Tabbing requires an object that owns the rect and holds N children — that is a
   tree node. Add a parallel `stacks: {groupId: [panelId]}` map and you now maintain two structures
   that must agree after *every* operation.
2. **Gravity vs merge.** Compaction is global (anything adjacent can push/pull); tabify is local
   (two rects become one). A packer has no reason to keep a group together, so a later drag of a
   neighbour can legalise itself by splitting your group apart. To stop that you must make groups
   atomic for the packer — i.e. pack *groups*, not panels, and give each group its own inner layout.
   That inner layout is a nested structure: you have built the tree anyway, plus a redundant gravity
   layer on top.
3. **Splits are not rectangles.** A|B split, then B split top/bottom. In coordinates you get three
   rects and the *intent* (those two are children of B) is gone. Resize B as a unit, or close B's
   area, and there is nothing addressable to operate on. Coordinates are a **lossy encoding of the
   tree**: many trees produce the same rect set, so `rects → tree` has no inverse and no round-trip.
4. **A tab bar needs a stable node identity.** Active tab, close button, tab overflow scrolling,
   reorder-within-bar, focus management — all attach to a node with an id and a lifecycle. Flat items
   have no node to attach to; you would invent group ids over coordinates, i.e. the tree again.
5. **Drop semantics share zero code.** A's drag = move a rect, then let collisions resolve (drop
   target = coordinates). B's drag = find the node under the cursor, pick one of 5 zones, run a
   structural op (drop target = node + zone). Hit-testing, drop preview, cancel, and animation are
   all different; nothing is reusable between them.
6. **Requirement 1 flips polarity.** In B, "fill 100%" is *free* — sibling fractions sum to 1 by
   construction, gaps are impossible. In A it is an active algorithm obligation (row-height math,
   compaction, gap removal, `minSize` overflow). So R1 is either a non-requirement or the core
   feature, and the spec cannot say which.
7. **The persisted file has the same problem.** A stores `[{x,y,w,h}]` (position is data); B stores
   `{size, children}` (structure is data). A hybrid file must contain a tree *next to* coordinates —
   two sources of truth, permanently, including in every future migration.

**The hybrid death spiral, in four steps:** add a tab stack map → keep coordinates and stacks
consistent in every op → make stacks atomic for the packer → discover nested splits are needed for a
real docking UX → you now maintain a worse docking engine. (react-grid-layout has had no tabs or
groups for years; golden-layout and dockview are trees. Those are not coincidences.)

CSS Grid is not a third way out either: a fixed cell matrix (model C) still has no tabs, no
nesting, and no relative sizing.

**Ten-minute disambiguation test — answer these and the model is decided:**

1. Can two panels ever occupy the same rect with one hidden? → **B**.
2. Must every square pixel be covered by a panel? → **B** (A allows/perpetuates gaps).
3. Can closing one panel free an *area* containing several others? → **B**.
4. Does every container carry tab chrome, even with one panel? → **B**.
5. Must a user be able to place a panel such that two others end up grouped *inside the space it
   came from*? → **B** (nested split).

If 3 of 5 answer B, it is a docking engine; A's features (free packing, arbitrary empty space) are
not wanted. If it is genuinely both — a free-tile dashboard area *and* a docked panel area — then
ship **two components over one serialization envelope** (each node tagged by `kind`), not one engine
pretending to be both.

### 1c. Resolution, and the one decider left

Owner clarification: a tab is an entry in a container's title bar; exactly one tab is visible and it
fills the container; there is title-bar chrome and borders between containers; dragging a tab onto a
container makes it join that container's tabs; dragging a tab onto an edge creates a new container.

**That is model B, specified well enough to build. The grid-vs-docking ambiguity is closed.** Note
what actually made A incompatible: nothing about tabs as such — A has no object that owns a rect.
The container is that object. That is the whole difference.

The remaining decision is *how container space is represented*: a nested split tree, or a flat list of
rectangles. `[container: [tab1, tab2]]` is the flat form. It reads better, but containers do not have
independent rects — the rects are the leaves of a chain of cuts, so the flat list is a projection that
loses which side each cut belonged to:

- **Resize a divider.** The seam between a full-height left tile and a stacked pair on its right is
  shared by **three** containers. Tree: `parent.size += delta`, whole subtree follows for free. Flat:
  rediscover which containers form the subtree on each side (edge + span matching), then move them.
- **Delete a container.** Its space must be reabsorbed by the sibling *subtree*. Tree: remove the leaf,
  redistribute the parent's children. Flat: the same geometric reconstruction, with no way to know
  which side the cut came from — a deterministic guess, which is how "resize moved the wrong panel"
  bugs appear 20 operations in, along with float drift and 1px seams.
- **Drop on the outer window edge.** Must steal from every container touching that edge. Tree: one
  subtree. Flat: another geometric query.
- Layouts produced by *guillotine* cuts are a slicing floorplan, and their tree is technically
  reconstructible from the rects — but implementing that reconstruction is the expensive part, and it
  is the code that rots. Non-guillotine results cannot be re-encoded at all.

**Recommendation (the lazy one): tree is the single source of truth; the flat shape is a derived,
read-only projection.** `getContainers()` returns `[{ id, rect, tabs, activeId }]` — precisely the
`[container: [tabs]]` the app wants to render, inspect and test — and nothing ever writes it back, so
there is no second source of truth and no reconstruction. Nested JSON is still plain JSON; R5 and R6
do not require flatness. If the persisted file must be flat, accept it only through one load-time
`parseLayout()` that either builds a tree or rejects to `defaultLayout`; accepted cost: a layout can
return with a different but equivalent internal grouping.

**The decider that shrinks or grows all of the above: can the user resize containers (drag
splitters)?**

- **No (v1):** flat rects become nearly viable — splits, merges and deletes are all local, guillotine
  cuts keep everything aligned, no adjacency solver needed. Tree is still simpler, but the gap narrows
  a lot.
- **Yes:** tree, unless you want to own and maintain the geometric adjacency solver.

The spec never mentions resize. Answer that and §1 is fully closed. Everything else is a defaultable
interaction detail, not a blocker: drop zones (center = merge, four edges = split; outer edges and
corners → nearest-side rule); new container's share (50% of the target, clamped to both `minSize`);
split axis from the dropped edge (left/right → vertical cut, top/bottom → horizontal); tab close,
tab reorder within the title bar, tab overflow scrolling; title-bar height, border width, and whether a
single-tab container hides the title bar (chrome constants → CSS variables); name for an emptied
container.

**Resolved (owner, this revision): space *is* a layout tree and the **container is the leaf**;
internal nodes are rows/columns; sizes are relative.** That is the recommendation above, adopted. It
also makes the decider moot in the good direction: drag-resize is cheap on a tree, so include it
(splitters cost one drag handler plus clamp math, not an adjacency solver). Schema is locked in §6.

---

## 2. Crux: state ownership (requirement 7 is the real architecture)

Requirement 7 asks for bidirectional flow in one sentence: config pushed *into* the panel in real
time, config changes dispatched *from* the panel saved, and panel events "emitted to app data
store". Left unqualified this yields the standard failure mode: two sources of truth, echo loops,
and re-render storms (the app updates config → engine re-renders panel → panel dispatches change →
app updates config → …).

Also undefined: does the engine own layout state, or does the host app own it? Both are defensible;
having both unstated is not.

**Solution — one rule, stated in the spec:**

> **The engine owns layout. The app owns panel content/config.**
> Every piece of state has exactly one owner; the other side only reads it or requests a change.

Concrete contract:

- Layout: **uncontrolled by default** (`defaultLayout` + `onLayoutChange` fired on user gesture
  end, not on every pointermove). Optional controlled `layout` prop for apps that need to drive it.
  Persist in `onLayoutChange` (debounced by the app, not by the engine).
- Config: engine stores it opaquely and **never mutates it**. Panel receives `config` as a prop.
  Panel asks for changes via `setConfig(partial)` (or `emit('configChange', …)`), which the engine
  forwards to `onPanelConfigChange(id, config)`; the app decides and pushes the new `config` back
  down. Optional built-in local state for apps that don't care, opt-in.
- Events: `onPanelEvent(panelId, type, payload)` — one generic sink, not an event bus. No
  `EventEmitter` dependency, no string-subscription API in v1.
- Never emit events during render (breaks concurrent rendering). Emit from handlers/effects.

This is a small paragraph in the spec that prevents a rewrite.

### 2b. "Config has to be mutated" — mutation, refs, and why this converges on one store

First, separate two questions that the word "mutated" is fusing together:

- **Who writes it?** (ownership — this is what causes echo loops)
- **Is the object mutated in place, or replaced?** (Reactivity — this is a rendering detail)

**Echo loops are a two-writer problem. Refs change the *route*, not the number of writers.** A ref
channel removes React from the path, but two writers are still two writers; you just lose the
devtools trail when it loops.

**On the proposed shape** (`config` prop as init-only, `onEvent('configUpdate')` up, ref down):
it does work at runtime and it is a legitimate pattern — it is an external command channel. But it has
three holes as written:

1. **Dropped commands.** In a tabbed layout, inactive panels are usually unmounted (or not yet
   mounted). A per-panel ref is `null` then, so `ref.setConfig(x)` silently does nothing and the
   value is lost on remount. Fixing that means holding pending values outside the component → a
   store. You have started building one; finish it.
2. **The loop is still possible**, just relocated and invisible to the React profiler. If the app
   pushes X, the panel reacts, emits `configUpdate`, the app applies and pushes again, you ping-pong
   forever. Refs do not solve this; only a single writer or a version stamp does.
3. **`config` as "init, never mutated" is the *uncontrolled* pattern** (`defaultValue`), and
   requirement 7 explicitly asks for the app to push updated config in real time. Uncontrolled-only
   cannot be pushed to. So both modes exist regardless — they just must not share one prop name.

**What "mutated" can mean, and the answer for each:**

| Meaning | Verdict |
|---|---|
| The **component** wants to change its own config (user drags a slider) | Not a mutation — a **request**. Emit a patch up, receive the new value down. Same as a controlled `<input value onChange>`: keep a local *draft* for instant feedback, let the app (or the engine's uncontrolled mode) be the writer of record. No loop, because the component never self-applies to the source of truth. |
| **In-place mutation** of a deep config object for performance / to avoid cloning | Allowed, **app-side only**. Engine treats `config` as an opaque reference, never deep-clones and never deep-diffs it, and re-renders on a `rev` counter. Sharp edge: in-place mutation is invisible to React, so the app must signal it (`setPanelConfig(id, sameRef)`). Document it; do not try to auto-detect it. |
| The **engine** mutating app config | Forbidden. Agreed, and it stays forbidden. |

**Recommended shape — one store, two syntaxes, one writer, rev-stamped echo suppression:**

```ts
// downward (imperative): the only mutable entry point, works even while the panel is not mounted
engineRef.current.setPanelConfig(id, config);

// downward (declarative): same store cell, both routes are legal, neither is the "real" one
<GridEngine configs={{ p1: { metric: 'mrr' } }} />

// upward: the engine does NOT apply this. It reports it and the app decides.
onPanelConfigChange(id, nextConfig, { rev, source: 'panel' });

// panel side
config: C;                                   // read-only input, always newest committed value
requestConfigChange(patch: Partial<C>): void; // may be rejected/ignored
```

Loop break is two lines: the engine keeps a monotonic `rev` per panel config cell, ignores any write
whose `rev` is `<= current`, and never echoes a value back down in the same tick it received one.

That `rev` earns its keep beyond echo suppression: it also fixes the **late-write race** — app sends
config to a server, the server returns the canonical config, and the response lands *after* a newer
user edit. Without a rev, the panel snaps back to the stale value. This is the same class of bug as
the classic uncontrolled-input warning, and it is the concrete reason to have the stamp rather than
ad-hoc "isApplying" booleans.

**So: yes to refs, but as the root-level API surface, not a per-panel channel.**
`ref = API, store = state, configs prop = sugar`. One channel underneath, because the prop channel and
the ref channel must not be able to disagree. Also keep `defaultConfig` and `config` as distinct prop
names — React has taught this lesson twice already.

---

## 3. Weak spots per requirement

- **R1 "always fill container 100%"** — undefined for the hard cases: container smaller than the sum
  of `minWidth` of the panels, zero/negative space, container resize below minimums, hidden
  container (`display:none` → size 0 → division by zero / NaN sizes), browser zoom and scrollbar
  width. Need an explicit precedence rule: *minimums win over filling; overflow scrolls*. Also decide
  the sizing unit up front: **percentages/fr with px minimums** (no JS measurement needed for
  layout, no first-paint flash, SSR-friendly) vs pixels (needs `ResizeObserver` before first valid
  paint). Percentages are the lazy win and avoid a whole class of bugs; only measure for drag
  hit-testing.
- **R2 "draggable containers"** — ambiguous whether the whole panel, the tab, or a header moves.
  Dragging a container and dragging its tab are different interactions (B does the latter). Touch,
  pen, iframes inside panels, and text selection during drag are all unmentioned and all bite.
- **R3 "each container has a draggable tab"** — a single panel group still shows a 1-tab bar? Can it
  be hidden? What is a tab when a panel is not tabbed with anything? Undefined chrome = churn later.
- **R4 "containers can be grouped"** — no semantics: does grouping keep which sizes, what happens to
  the group when its last tab is dragged out (empty group invariant), is grouping *nested* (group in
  group, infinitely) or one level deep, can a group hold a group. Nested groups are the single
  largest complexity multiplier in B; cap it deliberately or pay for it.
- **R5 serialization** — says "json" but not *deserializable into what*, no schema, no
  `version`, no migration path, no behaviour for unknown `component` keys, no validation of
  hostile/corrupt input, no statement about whether the JSON is the public API contract (it will be
  — everyone stores it in a DB, so changing it later is a breaking change and needs
  `schemaVersion` + `migrate()` **from day one**, even if v1 has only one version).
- **R6 binding + config in data** — "binding for the contained component" will be read as storing a
  component reference. **A component is not serializable.** Needs a **registry**: JSON stores a
  string key, the host app passes `components={{ chart: ChartPanel }}`. Consequences to specify:
  unknown key → render a placeholder, keep the node in state (don't silently drop the user's panel);
  keys are permanent identifiers (rename = migration); no functions, no DOM nodes, no `Date`, no
  cycles in `config` (enforce by documenting "JSON-serializable only").
- **R7 events** — see §2. Also unspecified: throttling/dedup, ordering guarantees, whether events
  may be emitted before mount (they can — drag of a not-yet-mounted panel).
- **R8 "each container should have an id"** — who generates it? If the engine generates it during
  render, you get `StrictMode` double-invocation and SSR hydration mismatches. Rule: **panel IDs come
  from the app** (they must survive rehydration and match persisted config), engine generates IDs
  only for groups, only in event handlers, never during render.
- **R9 React 18.3 → 19** — see checklist in §5. The spec says "as much as possible", which is not a
  testable requirement; replace with the concrete checklist.
- **R10 "as little dependencies as possible"** — good, but it is a *cost* here, not a free win:
  it means writing the drag/hit-test/drop-zone layer, keyboard accessibility, and pointer handling by
  hand. State the tradeoff explicitly so it isn't discovered mid-sprint. Prod deps target: **0**;
  `react`/`react-dom` as `peerDependencies`; anything else dev-only.

---

## 4. Risk register

Ranked by expected pain. L = likelihood, I = impact (H/M/L).

| ID | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Wrong layout model chosen (grid vs docking) → rewrite | H | H | Decide §1 before code; freeze vocabulary in the spec |
| R2 | Two sources of truth for config → echo loops, re-render storms | H | H | Ownership rule §2, uncontrolled-by-default, opaque config |
| R3 | Missing `schemaVersion`/migration → breaking persisted layouts in the wild | M | H | Ship `version: 1` + `migrate()` stub in v1 |
| R4 | Component binding by reference → unserializable / unstable identity | M | H | String-key registry, explicit consequences |
| R5 | Drag layer hand-written → touch, pen, iframe, cancel, selection bugs | H | M | `setPointerCapture` + `touch-action:none` + Escape/cancel + overlay over iframes; keyboard fallback |
| R6 | Re-render of all panels on every `pointermove` | H | M | rAF-coalesced drag state, transform-only updates, per-panel subscriptions (`useSyncExternalStore`), memoized panel wrappers |
| R7 | Unbounded nesting / long split chains → unusable UI, exponential bugs | M | M | Cap depth (e.g. configurable, default 2–3), or forbid group-in-group |
| R8 | Empty group / root with 0 children → crash or dead layout | M | H | Invariant: every group has ≥1 child; last panel dragged out collapses its group; validate on deserialize |
| R9 | Container measured as 0 (hidden tab, unmounted, `display:none`) → NaN sizes | H | M | Size in %, `ResizeObserver` with rAF write and unchanged-size guard; ignore 0-size measurements |
| R10 | SSR/hydration mismatch from generated ids | M | M | App-supplied panel ids; no `Math.random`/`randomUUID` during render |
| R11 | Accessibility as an afterthought | H | M | Keyboard move/resize from v1, `role=tablist/tab/tabpanel`, focus management on drag end (not optional per spec, but cheap if designed in) |
| R12 | Corrupt/hostile persisted JSON crashes the app | M | M | Validate on load, fall back to `defaultLayout`, never throw from render |
| R13 | Packaging drift (CJS/ESM, types, CSS) when publishing | M | M | `exports` map, ESM-first + CJS build, `.d.ts`, `sideEffects` set correctly |
| R14 | Scope creep in v1 (floating windows, cross-window drag, responsive breakpoints) | H | M | Phased cut §7, explicitly deferred list |

---

## 5. React 18.3 → 19 readiness (make it testable)

Keep `forwardRef` — it still works in 19, whereas ref-as-prop requires 19, so `forwardRef` is the
*compatible* choice, not the legacy one. Everything else:

- No `defaultProps` / `propTypes` on function components (removed in 19); use default parameters.
- No `childContextTypes`, string refs, `findDOMNode`, `ReactDOM.render`,
  `react-dom/test-utils`, `react-test-renderer`.
- Do not read `element.ref`. Do not ship code that reads `children` off `React.FC` — declare
  `children` explicitly (its type changed in 19).
- Always pass an argument to `useRef` (19 types require it): `useRef<T | null>(null)`.
- Effects and state initializers must be idempotent — `StrictMode` double-invokes them; drag
  listeners must clean up and not rely on being added once.
- No mutation of external state during render; use refs for transient drag state.
- `jsx: "react-jsx"` (no `import React` needed), TS `strict`, no `any` in the public API.
- Gate in CI: `npm run typecheck` against 18.3 types, plus a smoke test rendering the grid under
  `StrictMode`. A one-file test that renders, drags nothing, and asserts no legacy-API warnings is
  enough for v1.

---

## 6. Serialized schema — v1 (locked)

```ts
// wire format
interface Layout {
  version: 1;
  root: Node;                      // a lone container is a valid root (single-container layout)
}

type Node = SplitNode | ContainerNode;

interface SplitNode {              // internal node — the ONLY thing that owns space
  type: 'split';
  id: string;                      // engine-generated
  axis: 'row' | 'column';          // row: children side by side | column: children stacked
  weight?: number;                 // child-scoped: share along the PARENT's axis (default 1)
  minSize?: number;                // child-scoped: px floor along the PARENT's axis — deferred, rule 7
  children: Node[];                // >= 2; fewer means the node must be spliced out
}

interface ContainerNode {          // LEAF — owns a rect, owns tabs, shows exactly one
  type: 'container';
  id: string;                      // app-supplied, stable across rehydration
  weight?: number;                 // child-scoped, same meaning as above
  minSize?: number;                // child-scoped, same meaning as above
  activeTabId: string;
  tabs: Tab[];                     // >= 1, except an empty root
}

// weight/minSize belong to *being a child*, so both node types carry them: a split node is itself a
// child of its parent and may need constraining as a unit. minSize is always measured along the
// PARENT's axis — a container inside a column split has a minimum *height*, not a minimum width.

interface Tab {
  id: string;                      // app-supplied
  component: string;               // registry key, never a component reference
  title?: string;                  // falls back to registry title(config), then component name
  config: unknown;                 // opaque JSON; engine never mutates, clones or diffs it
}
```

```jsonc
// a full-width footer under two side-by-side columns — spanning is free, no span property needed
{ "version": 1, "root": {
  "type": "split", "id": "g1", "axis": "column", "children": [
    { "type": "split", "id": "g2", "axis": "row", "children": [
      { "type": "container", "id": "c1", "weight": 1, "activeTabId": "t1",
        "tabs": [ { "id": "t1", "component": "chart", "config": { "metric": "mrr" } },
                  { "id": "t2", "component": "table", "config": {} } ] },
      { "type": "container", "id": "c2", "weight": 2, "activeTabId": "t3",
        "tabs": [ { "id": "t3", "component": "logs", "config": {} } ] } ] },
    { "type": "container", "id": "c3", "weight": 1, "activeTabId": "t4",
      "tabs": [ { "id": "t4", "component": "toolbar", "config": {} } ] } ] } }
```

**Rules (these are the schema's real content):**

1. **One size number per node, never `width` + `height`.** `weight` is the share *along the parent's
   axis*; the cross axis is always the parent's full extent. Width *and* height on a container would
   be a second source of truth for the same pixels, with sum constraints on both axes that nothing
   enforces. (This is the correction to "container needs props for width and height".)
2. **Cross-axis spanning is a consequence of nesting, not a property.** The footer above spans both
   columns because it is a sibling of the row split in a column split. No `colSpan`. What a tree
   genuinely cannot express is a *non-guillotine* arrangement (a true pinwheel where no straight cut
   crosses the whole region). Docking UIs don't generate those; if one is ever needed that is a grid
   model, not a tweak to this one.
3. **Weights need not sum to 1** — they are normalized at render (`weight / Σ siblingWeights`),
   exactly like `flex-grow`. This deletes the whole float-drift bug class: no normalize-and-fix pass
   after every edit, no 0.9999 sums, no 1px seams. A splitter drag edits two weights and touches
   nothing else.
4. **`weight` / `minSize` / `maxSize` are the only numbers on the wire.** Chrome — title-bar height,
   border width, gap, padding — lives in CSS variables. Chrome in the layout JSON means two themes or
   two engine versions cannot share one stored layout.
5. **Invariants:** `children.length >= 2` for splits; `tabs.length >= 1` for containers, *except* an
   empty root (renders the app's placeholder). Leave one child in a split → splice that child into the
   parent. The reducer enforces this; nothing else needs to check.
6. **Content never affects layout.** The tab's component is rendered in a content box of
   `position:absolute; inset:<titlebar> 0 0 0; overflow:auto`, and every split child gets
   `min-width:0; min-height:0; overflow:hidden`. Without those two, a wide table or a long word gives
   the child an intrinsic minimum size, the fractions lose, and the layout stops filling — the most
   common real-world cause of "it overflows the window".
7. **`minSize` is deferred out of v1.** `Σ minSize > extent` is unavoidable by clamping alone (a
   browser-window resize can always violate it), so shipping it forces a resolution rule now for no
   current need. Drop it: v1 fills 100% unconditionally, content scrolls, and the problem cannot
   occur. When a real case appears, the rule is: clamp during splitter drag; if `Σ min < extent`,
   scale children proportionally so the root still fills exactly — `minSize` becomes advisory in that
   one case, never a layout-level scrollbar.
8. **Terminology:** this supersedes the "panel"/"group" wording still used in §6b/§1b — read
   *panel* as *tab* there, *group* as *split node*, and the `PanelDefinition` catalogue as describing
   a **tab component**. `addPanel` is `addTab`; the container is created by the target, not by the
   caller.

**Every operation is local on the tree — this is the payoff over §1c's flat rects:**

| op | tree change |
|---|---|
| split container `C` on edge `e` | replace `C` with `split(axis(e), [C, newContainer])`, weights 50/50 |
| drag tab onto container `C` | push tab into `C.tabs`, remove from source, then collapse the source if it emptied |
| drag tab to the edge of `C` | as split above, with the dragged tab in the new container |
| close tab | remove; if `tabs == 0` → drop the leaf, splice the parent if it now has one child |
| drag a splitter | `w_a += δ; w_b -= δ`, clamped by `minSize`/`maxSize` — nothing else recomputed |

**Derived (read-only) projection** for apps, tests and rendering: `getContainers()` returns
`[{ id, rect, tabs, activeTabId }]` — the `[container: { tabs, ... }]` shape from the discussion, with
rects computed from the tree. Nothing writes it back, so there is no second source of truth.

### 6b. Registry, open-ended config types, and runtime add/remove

**Registry = catalogue (code). Layout = instances (data).** The registry being larger than the layout
is normal. The direction people forget is the converse, and it is the one that must also be
tolerated: **the layout may transiently reference keys the registry does not have yet** (lazy-loaded
plugin chunk, HMR, user permissions, a second app reading the same persisted layout). So: unknown key
→ render a "missing component: `chart`" placeholder and **keep the node in state**. Never auto-delete
or silently drop it — that is data loss with a plausible-looking excuse.

```ts
export interface PanelComponentProps<C = unknown> {
  config: C;                                   // read-only input
  panelId: string;
  emit: (type: string, payload?: unknown) => void;        // up to the app
  requestConfigChange: (patch: Partial<C>) => void;       // up, may be rejected
}

export interface PanelDefinition<C = any, E extends string = string> {
  component: React.ComponentType<PanelComponentProps<C> & Record<E, any>>;
  defaultConfig?: C;                                       // how "add" gets a sane start
  title?: (config: C) => React.ReactNode;
  icon?: React.ComponentType<{ config: C }>;
  minSize?: number;                                        // %
  validateConfig?: (raw: unknown) => C;                    // hostile/corrupt persisted input
  singleton?: boolean;                                     // one instance max
  closeable?: boolean;
  keepMountedWhenInactive?: boolean;                       // video/editor panels opt in
}

/** catalogue — open-ended by construction: the app supplies the keys, the engine never enumerates */
export type Registry = Record<string, PanelDefinition<any, any>>;

/** per-panel config inference without making the engine generic */
export const definePanel = <C, E extends string = string>(d: PanelDefinition<C, E>) => d;
```

**Typing strategy (deliberate):** ship `Registry = Record<string, PanelDefinition<any, any>>` and
`config: unknown` at the engine boundary. The loose type is *contained* — the only untyped places are
engine internals; each panel's own props stay strongly typed via `PanelDefinition<C>` /
`definePanel`. If strictness across the boundary is later demanded, add a generic map parameter
(`GridEngine<TDefs extends Registry>`) — mechanical, one type parameter with a default, and it does
not touch the runtime. Do not build it first: the engine does not need to know config shapes, so
threading them through is type-level yak-shaving.

**Runtime add/remove — root ref is the API surface** (not per-panel refs, for the reasons in §2b):

```ts
type DropTarget =
  | { kind: 'tab';   groupId: string; index?: number }                              // add as a tab
  | { kind: 'split'; groupId: string; edge: 'left'|'right'|'top'|'bottom'; size?: number } // new container
  | { kind: 'root' };                                                              // first/only group

export interface GridEngineHandle {
  getLayout(): Layout;                                        // snapshot
  addPanel(p: { id?: string; component: string; config?: unknown; title?: string;
                target?: DropTarget; size?: number }): string;   // returns the id
  updatePanel(id: string, patch: { title?: string; config?: unknown }): void;
  removePanel(id: string): void;
  movePanel(id: string, target: DropTarget): void;
  setPanelConfig(id: string, config: unknown): void;
  focusPanel(id: string): void;                               // activate its tab
}
```

Rules that keep this small:

- **One reducer.** Drag, add, remove, move and tab-activation are all actions through the same pure
  `layoutReducer`; the imperative API only dispatches. That makes validation, undo/redo, and
  serialization fall out for free instead of being three separate features.
- **"With their containers" is `DropTarget`.** Appending a tab needs an existing group; a `split`
  target creates the new group *and* puts the panel in it. Default target = the active group as a
  tab; empty layout → `root`. So callers never have to construct the tree themselves.
- **Empty-root exception.** Every group must have ≥1 child, except the root, which may be empty and
  renders an app-supplied placeholder. That gives `removePanel` on the last panel a total, safe
  behaviour and keeps `addPanel`'s default target always valid.
- **Never throw on a stale id.** Async callbacks will target removed panels; unknown ids are no-ops
  (`false`), not exceptions. A menu click must not crash the app.
- **Ids:** app-supplied for panels (so persisted config and rehydrated layout agree); engine-generated
  only for groups, only in handlers — never during render.
- **Moving a panel must not unmount it.** React key = panel id, plus one stable portal host per panel
  id, so a video player, editor, or scroll position survives being dragged into another group. Cheap
  now, very expensive to retrofit later.
- **Registry updates must not touch layout state.** Look definitions up at render time; never capture
  a component reference in state. Otherwise every HMR or lazy-chunk arrival remounts every panel.
- **Report why:** `onLayoutChange(layout, { action, panelId, programmatic })` so the app can persist
  incrementally and skip saving when the change came from `setPanelConfig` rather than a gesture.

---

## 7. Suggested build order (MVP cut)

Nothing here needs a third-party dependency if scoped to this order.

1. **P0 — static render:** schema + registry + render split tree and tab bars from JSON. No
   interaction. Validates the two riskiest pieces (schema, ownership) for almost no code.
2. **P1 — resize:** splitters (pure geometry functions + pointer capture).
3. **P2 — drag:** tab drag between groups, 5 drop zones per group (center = tabify, edges = split),
   rAF-coalesced, overlay over iframes, Escape to cancel.
4. **P3 — round-trip + events:** `onLayoutChange`, config passthrough, `onPanelEvent`, validation and
   fallback on load.
5. **P4 — a11y + polish:** keyboard move/resize, focus management, empty-group collapse edge cases.

Deliberately **out of v1:** floating/undocked windows, cross-window drag, responsive breakpoints,
animated transitions, undo/redo (but model layout changes as pure reducer actions from P2 so undo
becomes ~free later), group-in-group beyond the configured depth cap.

**Fallback if P2 balloons:** `dnd-kit` is the one dependency worth breaking R10 for — but only after
hand-rolled pointer drag demonstrably fails on touch/iframe cases, not preemptively.

---

## 8. Testing and verification

- Prod deps 0; dev-only: `vitest`, `@testing-library/react`, `typescript`.
- jsdom does not implement layout or `PointerEvent` faithfully → put the weight on **pure functions**
  (tree insert/split/collapse, size redistribution, hit-testing, migrate) and test those directly.
  That is where the bugs will be anyway.
- One smoke test rendering under `StrictMode` (no legacy-API warnings, no NaN sizes), one
  serialize → deserialize round-trip property-style test.
- Real drag QA needs a browser; add Playwright only if the hand-rolled drag proves flaky (see R5).

---

## 9. Open questions that must be answered before coding

1. Model **A or B** (§1)? If B, is nesting capped, and at what depth?
2. Is layout state engine-owned (uncontrolled + `onLayoutChange`) or app-owned (controlled)? Or both
   with uncontrolled as default?
3. Is panel `config` owned by the app (recommended) or by the engine?
4. Target: modern browsers only, or touch/pen and keyboard parity too? (Drives most of the drag cost.)
5. Container smaller than the sum of minimums: scroll, or clamp and let the container scroll?
6. Is the JSON a public, versioned contract? (Recommend: yes → `version` + `migrate` in v1.)
7. Are panel IDs supplied by the app (recommend: yes) or generated by the engine?
8. Does the engine ship CSS (a `.css` file) or is everything inline + CSS variables? (Recommend:
   inline + CSS vars, zero build/type friction, but it constrains pseudo-elements and theming.)
9. Is SSR/hydration in scope for host apps?
10. Package publish target: ESM-only, or ESM + CJS dual build?

**Revision status:** Q1 **closed** — model B, and space is a layout tree with the container as the
leaf, sizes relative (§1c, §6); drag-resize comes along for free. Q2 and Q3 answered in §2b (one
store, one writer, `rev`-stamped writes, `config` vs `defaultConfig`); Q6 and Q7 answered in §6 (wire
contract; container/tab ids app-supplied, split ids engine-generated); Q5 **closed** by deferring
`minSize` out of v1 (§6 rule 7 — the condition becomes unrepresentable; content overflow is scroll,
rule 6). Still genuinely open: **Q4** (input parity: touch/pen/keyboard — drives most of the drag
cost), **Q8** (CSS vars only, or ship a stylesheet too), **Q9** (SSR in scope?), **Q10** (package
format).
