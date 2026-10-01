# Expand active tab

> **Status:** design, not implemented.
> **Goal:** two controls at the right of every container's title bar promote that container
> (its active tab) to fill either the **engine's own area** (`maximize`) or the **whole page**
> (`fullscreen`), as an overlay. The active control doubles as the collapse control at the top-right
> of the overlay. The tab component **keeps its state** — no unmount, no reload, and switching mode
> does not remount it either.
> **Scope:** chrome only. No layout JSON change, no serialization change, no `onLayoutChange`.
> Two new optional `GridEngine` props gate the buttons globally (`hideMaximize`, `hideFullscreen`);
> one new optional CSS variable (`--twge-overlay-z-index`). This is not reopening the deferred
> "floating/undocked windows" non-goal (PRD §3): the overlay is transient presentation, not a
> second layout.

**Refs:** PRD FR-3 (one visible tab fills the container), FR-9 (the `+` is always rendered — see the
prop note below), FR-20 (chrome via `--twge-*`, library ships no stylesheet), FR-21 (content overflow
scrolls inside the container), FR-23 (zero deps), FR-24 (`keepMountedWhenInactive`), PRD §8
robustness/SSR, tech-spec D9 (no stylesheet); `src/chrome/Container.tsx`, `src/chrome/TitleBar.tsx`,
`src/chrome/PanelHost.tsx`, `src/GridEngine.tsx`, `docs/api.md`.

---

## Naming

| Term | Meaning |
|---|---|
| **expand** | the feature (both controls). `ExpandMode`, `data-twge-expand` |
| **`maximize`** | fill the engine root — the docked workspace area |
| **`fullscreen`** | fill the browser viewport |

*Maximize* and *fullscreen* are the standard idioms for "fill the available area" vs "cover the
screen", so neither prop needs a sentence to disambiguate; `fullscreen` is spelled as the platform
API spells it (`requestFullscreen`, `:fullscreen`).

---

## Why this is small

State preservation falls out of **not moving the component in the React tree**. The container stays
exactly where it is (same parent, same position, same key) and only its CSS changes. React reuses the
fiber, the `memo`'d `TabContent` is not even re-rendered, and every `useState` inside the tab component
survives — including across a `maximize` ↔ `fullscreen` mode switch, which is the same fiber with a
different positioning style. A portal or a second render tree would duplicate/remount the component and
lose state — rejected below.

| Mode | Style | Fills |
|---|---|---|
| `maximize` | `position: absolute; inset: 0` | the engine root (already `position: relative`) |
| `fullscreen` | `position: fixed; inset: 0` | the viewport |

Neither needs a portal, a measurement or a viewport listener: the engine root is the overlay's
containing block in `maximize` mode, and there is no transformed/filtered ancestor that would break
`fixed` in `fullscreen` mode (noted as a gotcha below).

---

## Design

### State: one expanded container, one mode

`GridEngine` owns a single transient value (like the existing `revsRef` state — runtime only):

```ts
export type ExpandMode = 'maximize' | 'fullscreen';
interface ExpandState { containerId: string; mode: ExpandMode }

const [expanded, setExpanded] = useState<ExpandState | null>(null);

// ChromeCtx additions:
expanded: ExpandState | null;
/** Same container + same mode → collapse; otherwise expand that container in that mode. */
toggleExpand: (containerId: string, mode: ExpandMode) => void;
/** Which buttons the title bar may render (see the props below). */
showMaximizeButton: boolean;     // !props.hideMaximize
showFullscreenButton: boolean;   // !props.hideFullscreen
```

One `{ containerId, mode }` pair (not a boolean per container, not a boolean per mode) makes "at most
one overlay exists" and "the two modes are mutually exclusive" structural, not guarded: expanding B,
or switching A from `maximize` to `fullscreen`, always replaces the previous value. Expanding is
deliberately *not* a layout write — it never calls `applyChange`, so no `onLayoutChange`, no
`programmatic` meta, and nothing is persisted.

### Props: hiding the buttons globally

```ts
export interface GridEngineProps {
  // …existing…
  /** Hides the "maximize" control (fill the engine area) in every title bar. Default false. */
  hideMaximize?: boolean;
  /** Hides the "fullscreen" control (fill the browser viewport) in every title bar. Default false. */
  hideFullscreen?: boolean;
}
```

Both default `false` (both controls shown). They are read during render, not once on mount, so a host
can flip them at runtime like any other prop. Turning both on leaves a title bar with no expand
controls — that is the host's call.

**Departure from FR-9 made explicit.** The add button has no `showAddButton` prop; its visibility is a
*per-registry capability* (`addable: false`). Expand visibility is a *global chrome policy* of the
host, with no per-component analogue, so a prop is the right shape here — and the per-registry flag
stays available additively if per-component control is ever wanted (Open questions #3).

**A hidden mode can still be exited.** The rule is "render the button when it is visible **or** when it
is the active mode", so a host that flips `hideMaximize` while the maximized overlay is open does not
strand the user with no collapse control:

```tsx
if (!visible && mode !== m) return null;
```

### Container: CSS promotion, not a new tree

`Container` reads `ctx.expanded` and merges the overlay style onto its existing root div:

```tsx
const expandMode = ctx.expanded?.containerId === container.id ? ctx.expanded.mode : null;

...(expandMode === 'maximize' && {
  position: 'absolute', inset: 0, zIndex: 1500,   // above the drag sprite (1000), below popovers (2000)
}),
...(expandMode === 'fullscreen' && {
  position: 'fixed', inset: 0,
  zIndex: `var(--twge-overlay-z-index, 9999)`,    // the host-page escape hatch (see below)
  overscrollBehavior: 'contain',                  // stop wheel chaining to the page behind
}),
...(expandMode && { boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }),
data-twge-expanded: expandMode ? container.id : undefined,
data-twge-expand-mode: expandMode ?? undefined,
// An overlay must not start a tab/container drag: its fullscreen rect would be measured as a
// drop candidate and a tab could be dropped onto containers hidden behind it.
onPointerDown: expandMode ? (e) => e.stopPropagation() : undefined,
```

Everything else in the container (title bar, `PanelHost`, `overflow: auto` content box) is unchanged,
so FR-21 still holds and a large tab still scrolls inside the overlay.

### Title bar: two buttons, one is the collapse

`TitleBar` gains two trailing buttons after the `+`. The first *rendered* one gets `marginLeft: 'auto'`
(the tab strip is content-sized today, so the `+` is not already at the edge; if the maximize button is
hidden, the fullscreen button takes the auto margin and stays right-aligned):

| Mode | `data-twge-expand` | `aria-label` idle / active | Icon idle → active |
|---|---|---|---|
| `maximize` | `maximize` | `Maximize` / `Restore` | fit-to-frame → inward arrows |
| `fullscreen` | `fullscreen` | `Full screen` / `Exit full screen` | four arrows out → inward arrows |

```tsx
const mode = ctx.expanded?.containerId === container.id ? ctx.expanded.mode : null;
const btn = (m: ExpandMode, visible: boolean, first: boolean, label: [string, string],
             Icon: ..., ExitIcon: ...) => {
  if (!visible && mode !== m) return null;
  const exit = mode === m;
  return (
    <button
      type="button"
      data-twge-expand={m}
      data-twge-container-button={container.id}
      aria-label={label[exit ? 1 : 0]}
      aria-pressed={exit}
      title={label[exit ? 1 : 0]}
      onClick={(e) => { e.stopPropagation(); ctx.toggleExpand(container.id, m); }}
      style={{ marginLeft: first ? 'auto' : undefined, border: 'none', background: 'transparent',
               color: 'inherit', font: 'inherit', cursor: 'pointer', padding: '0 4px',
               touchAction: 'none' }}
    >
      {exit ? <ExitIcon /> : <Icon />}
    </button>
  );
};
```

- **Collapse = press the active control again.** `aria-pressed` marks which mode is live, the active
  button sits at the top-right of the overlay and shows the exit icon. No third "close" button.
- **Switching mode is not a collapse:** with `maximize` active, pressing `fullscreen` moves the overlay
  to the viewport in the same fiber — state preserved. Pressing `fullscreen` again collapses.
- **Icons:** four tiny inline `<svg>`s, `14×14`, `stroke="currentColor"`, two corner brackets each
  (out / in). Inline SVG, not an icon font or a glyph — the library ships zero deps (FR-23) and
  `⤢`/`⛶` font coverage is unreliable. One local helper in `TitleBar.tsx`, no new file.
- The `closest('button')` guard in `useDrag.onPointerDown` already stops these buttons from starting a
  container drag, so no `onPointerDown` stopPropagation is needed (the sibling close button has one;
  not copied — it is redundant).

### Chrome variables

One new, optional variable — `fullscreen` mode is the only thing in the engine that must out-rank the
host's own page chrome, so the host needs a knob:

| Variable | Default | Meaning |
|---|---|---|
| `--twge-overlay-z-index` | `9999` | stacking order of the `fullscreen` overlay vs host UI |

`maximize` mode keeps the constant `1500` (it only competes with the engine's own internals). The
overlay otherwise paints with the container's existing `--twge-tab-active-bg` / `--twge-border-color`.

---

## Deliverables

| File | Change |
|---|---|
| `src/GridEngine.tsx` | `hideMaximize` / `hideFullscreen` props; `expanded` state; `toggleExpand`, `showMaximizeButton`, `showFullscreenButton` on `ChromeCtx`; no `applyChange` |
| `src/chrome/Container.tsx` | read `ChromeCtx`, pass `mode` + the two visibility flags to `TitleBar`, overlay style per mode, drag guard, `data-twge-expanded` / `data-twge-expand-mode` |
| `src/chrome/TitleBar.tsx` | the two trailing buttons, the "visible or active" rule, 4 inline icons and labels |
| `src/api.ts` (or `chrome/Container.tsx`) | `ExpandMode` type — internal only (not re-exported from `src/index.ts`) unless the review wants it public |
| `docs/api.md` | the two props in the `<GridEngine>` snippet + prop list, and the `--twge-overlay-z-index` row in the chrome table |
| `examples/standalone-basic/src/registry.tsx` | a stateful `counter` fixture behind `?expand` (mirrors the `?guards` pattern) for the E2E state-preservation assertion |
| `e2e/helpers.ts` | `expandButton(page, id, mode)` + `expandedContainer(page)` locators (optional, ~3 lines) |
| `packages/.../test/expand.test.tsx`, `e2e/expand.spec.ts` | new tests (gate below) |

Not doing: an `onTabExpand` event, a controlled `expanded` prop, per-registry / per-container
visibility flags, per-tab (as opposed to per-container) expansion, persistence in the layout JSON,
animated transitions, body-scroll locking, `Esc` handling (see Open questions).

---

## Test gate

**Unit (`vitest`, jsdom)** — `test/expand.test.tsx`:

- A component holding `useState` renders, increments its counter, then is maximized: the DOM node
  identity is unchanged and the counter still reads the incremented value (no remount). Still true
  after collapse, and after a `maximize → fullscreen` switch.
- State is `{ containerId, mode }`: expanding B while A is expanded leaves exactly one
  `[data-twge-expanded]` element, and it is B's; expanding A in `fullscreen` while A is in `maximize`
  leaves one overlay with `data-twge-expand-mode="fullscreen"`.
- Clicking either button fires **no** `onLayoutChange`; `serializeLayout(getLayout())` is
  byte-identical before/after and contains no expand field.
- Inline styles: `maximize` → `position: absolute; inset: 0`; `fullscreen` → `position: fixed; inset: 0`;
  collapsed → neither. `aria-pressed` is true on the active button only.
- Pressing the active button again clears `[data-twge-expanded]` entirely.
- Props: `hideMaximize` leaves only the `fullscreen` button, and it carries `marginLeft: auto` (still
  right-aligned); `hideFullscreen` the mirror; both hidden → neither button rendered.
- Props flipped while expanded: `hideMaximize` with the maximized overlay open keeps that one button
  rendered (the overlay stays escapable) and it still collapses.

**Browser (Playwright, Chromium)** — `e2e/expand.spec.ts` on `standalone-basic?expand`:

- `maximize`: the container's bounding box equals the engine root's box (±1 px).
- `fullscreen`: the container's box equals `page.viewportSize()` (±1 px) and it paints above a host
  element placed outside the engine (assert with `elementFromPoint` at the overlay's centre, not just
  the box).
- Stateful `counter` panel: increment → maximize → value survives → switch to `fullscreen` → survives
  → collapse → survives. This is the "no reload" ask, end to end.
- While expanded, a pointer drag starting on the overlay title bar does **not** move a tab (the guard).
- Collapse restores the original container box; the `data-twge-layout` JSON is unchanged throughout.

**Gate:** `npx turbo run lint typecheck test` plus `npm run test:browser` green; `docs/api.md` drift
check green (two props + one variable added; no type moved).

---

## Rejected alternatives

| Shape | Why not |
|---|---|
| `createPortal` into `document.body` | A second render tree means the tab component **remounts** — exactly the state loss the requirement forbids. It would only be needed if an ancestor created a containing block for `fixed`; not the case here |
| Render the active tab again in an overlay | Two instances of the same component (or a remount); violates the single-writer/one-instance model |
| One button cycling `none → maximize → fullscreen → none` | A hidden mode and a 3-state cycle in a 28 px title bar; two labeled buttons say what each does and make switching one press |
| Hiding the inactive button while expanded | Loses one-press switching, and the active icon + `aria-pressed` already mark the live mode |
| Hiding the active button too, per the prop | Flips a "hide a control" prop into "remove the only way out"; the overlay would be trap-able at runtime. Hence "visible **or** active" |
| Per-registry `expandable: false` / per-container flags (the FR-9-consistent shape) | Unrequested per-component control; the global prop is the ask, and the registry flag can be layered on top additively later without breaking the prop |
| A single `expandControls` array prop | A list type in place of two booleans; the pair is fixed at two, so the array buys only a shorter "hide both" spelling |
| `hideExpand` / `hideFullScreen` | `expand` is ambiguous once there are two expanding modes; *maximize* vs *fullscreen* names each target by an established idiom |
| `allowMaximize` / `allowFullscreen` (positive, registry-consistent) | Registry defs are positive capabilities per component (`closeable`, `addable`); these two are global host chrome policy, where `hide*` is the conventional shape. A rename is trivial if consistency wins |
| Per-mode z-index knob for `maximize` too | It only competes with the engine's internals (`Popover` is already a hardcoded `2000`); a knob there invites a broken overlay |
| Body-scroll lock (`document.body.style.overflow = 'hidden'`) | Needs a mount/unmount effect and a saved/restored value; `overscroll-behavior: contain` on the fixed overlay kills the wheel chaining with no lifecycle. Add the lock only if a host reports page scroll behind the overlay |
| Persisting the expanded mode | A transient view state, not the workspace; writing it would fire a phantom `onLayoutChange` and change the wire format for a UI mode |
| Fullscreen API (`requestFullscreen`) | DOM/imperative, permission-prompted in some flows, element-specific, untestable in jsdom; CSS `fixed` is 3 lines |

## Open questions

1. **`fullscreen` + a transformed/filtered ancestor.** `position: fixed` resolves against the nearest
   ancestor with a `transform`/`filter`/`will-change`/`contain`. The engine's own tree has none, but a
   host wrapper could. If that shows up, the fix is a portal — which remounts and loses state — or
   documenting it as a host constraint. Default: document it.
2. **Per-component visibility.** Should a registry entry be able to opt out (`expandable: false`), the
   way `addable` / `closeable` work? Not now; the prop is global-only as requested. The flag composes
   additively (registry flag AND prop) if it is ever needed.
3. **Icons.** Four inline SVGs are proposed (fit-to-frame / four-arrow-out × idle, inward arrows ×
   exit). The exact paths are wireframe-level; confirm they read as distinct at 14 px before the first
   cut.
4. **`Esc` to collapse?** Not requested, the collapse buttons are focusable, and PRD §8 defers
   keyboard. ~4 lines with the `document`-level listener pattern the `Popover` already uses.
5. **Should the overlay hide the *other* containers from assistive tech** (`aria-hidden` on the
   non-expanded subtree)? PRD §8 defers a11y semantics to v2; `fullscreen` makes it matter more than
   `maximize` did, so it is the cheap version if it is wanted now.
6. **`ExpandMode` public?** Proposed internal-only (the props encode the same two modes as booleans,
   so nothing public needs the type). Exporting it is additive and trivial if the review prefers it.
