/**
 * Tab accent (FR-13, PRD §6.1/§6.2).
 *
 * Accepted values are `#rgb`, `#rrggbb`, `#rrggbbaa` (case-insensitive).
 * Anything else is ignored with a dev-mode warning and falls through the
 * resolution chain, so the engine never writes an arbitrary CSS token into a
 * style attribute. Hex in, hex out — no color spaces, no theme awareness.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** True for the accepted hex forms (case-insensitive). */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

/**
 * Built-in preset swatches (PRD §6.4). The `--twge-tab-color-<name>` variables
 * restyle them; the value the palette emits is always the hex below.
 */
export const TAB_COLOR_PRESETS: ReadonlyArray<{ name: string; hex: string }> = [
  { name: 'Red', hex: '#e5484d' },
  { name: 'Orange', hex: '#f76b15' },
  { name: 'Yellow', hex: '#e8b931' },
  { name: 'Green', hex: '#30a46c' },
  { name: 'Teal', hex: '#12a594' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Violet', hex: '#8e4ec6' },
  { name: 'Pink', hex: '#d6409f' },
  { name: 'Gray', hex: '#6b7280' },
];

/** Warn once per distinct bad value — resolution runs on every render. */
const warned = new Set<string>();

function warnInvalid(what: string, value: unknown): void {
  const key = `${what}:${String(value)}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(
    `[react-grid-engine] ignoring invalid ${what} ${JSON.stringify(value)}; expected #rgb, #rrggbb or #rrggbbaa.`,
  );
}

/**
 * Resolution order, first hit wins (PRD §6.1):
 * `tab.color` -> `registry[..].defaultColor` -> the theme default.
 *
 * Returns the validated hex, or `undefined` for the theme default — "no color".
 * The caller paints `--twge-tab-accent` as the underline in that case; a pip
 * and active-tab tint only appear when a tab actually carries an accent.
 */
export function resolveTabColor(
  tabColor: string | undefined,
  defaultColor: string | undefined,
): string | undefined {
  if (tabColor !== undefined) {
    if (isHexColor(tabColor)) return tabColor;
    warnInvalid('tab.color', tabColor);
  }
  if (defaultColor !== undefined) {
    if (isHexColor(defaultColor)) return defaultColor;
    warnInvalid('defaultColor', defaultColor);
  }
  return undefined;
}

/** Case-insensitive hex equality — the picker's `aria-checked`. */
export function sameColor(a: string | undefined, b: string): boolean {
  return a !== undefined && a.toLowerCase() === b.toLowerCase();
}

/** Any accepted hex -> `#rrggbb`, the only form `<input type="color">` takes. */
export function toInputHex(color: string | undefined): string {
  if (!isHexColor(color)) return '#ffffff';
  const hex = color.slice(1);
  if (hex.length === 3) {
    return `#${hex.charAt(0).repeat(2)}${hex.charAt(1).repeat(2)}${hex.charAt(2).repeat(2)}`;
  }
  return `#${hex.slice(0, 6)}`;
}
