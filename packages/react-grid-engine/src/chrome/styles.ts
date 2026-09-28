/**
 * Inline chrome. The library ships no stylesheet (D9): every value reads a
 * `--twge-*` custom property and falls back to its built-in default, so the
 * engine renders correctly whether or not the host defines the variables.
 */

/** `var(--twge-<name>, <fallback>)`. */
export function chrome(name: string, fallback: string): string {
  return `var(--twge-${name}, ${fallback})`;
}

/**
 * A layout child's share of its parent: normalized `weight` as `flexGrow`, with
 * a zero basis so only the weight decides. Absent or non-finite (never NaN)
 * weights fall back to 1; the cross axis stretches.
 */
export function grow(weight: number | undefined): {
  flexGrow: number;
  flexBasis: number;
  minWidth: number;
  minHeight: number;
} {
  const w = typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 1;
  return { flexGrow: w, flexBasis: 0, minWidth: 0, minHeight: 0 };
}

/** DOM id of a tab / its panel, for `aria-controls` / `aria-labelledby`. */
export const tabDomId = (tabId: string): string => `twge-tab-${tabId}`;
export const panelDomId = (tabId: string): string => `twge-panel-${tabId}`;
