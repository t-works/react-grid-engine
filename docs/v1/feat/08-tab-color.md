# 08 — Tab color

**Goal:** the per-tab accent end to end: validation, resolution, rendering, picker.

**Depends on:** 07.

**Deliverables**

- `src/color.ts` — accept `#rgb`/`#rrggbb`/`#rrggbbaa` (case-insensitive); invalid → dev warning +
  fall through the chain (never write an arbitrary CSS token).
- Resolution order: `tab.color` → `registry[..].defaultColor` → `--twge-tab-accent` (§6.1).
- Rendering: leading pip + `color-mix(in oklab, <color> 12%, var(--twge-tab-bg))` on active tab +
  accent underline; text color stays theme-controlled (§6.3).
- Popover: swatch row (app `tabColorPalette` or `--twge-tab-color-*` presets), **Custom…** native
  `<input type="color">`, **Default** clearing via `null`; `role="menuitemradio"`/`aria-checked`.

**Test gate**

- §9.5: `#e11` renders pip + tint after save/load; `"url(x)"` and `"red"` ignored + fallback, no throw.
- §9.6: swatch selection emits `onTabColorChange(tabId, hex, { source: 'ui' })` and updates the tab
  before the app persists.
- `color: null` clears; `color: undefined` does not (A7); `updateTab` honoured.
- Focus trap / `Esc`-returns-focus / keyboard menu reachability are **v2** — not built here.

**Refs:** PRD §6, §8; FR-13, FR-14; A7; §9.5, §9.6.
