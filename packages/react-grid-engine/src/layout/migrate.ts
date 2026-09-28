/**
 * Wire-format version handling (FR-15, A6).
 *
 * v1 is the only version and has no migrations yet. `migrate` therefore only
 * classifies an already-parsed payload: the current version passes through, a
 * future version is *unknown input* (warn + `defaultLayout`), everything else is
 * invalid.
 */

/** The only wire version this build understands. */
export const CURRENT_LAYOUT_VERSION = 1;

export type MigrationResult =
  /** Current version — `payload` is the raw object, still to be validated. */
  | { kind: 'current'; payload: Record<string, unknown> }
  /** A version newer than this build knows. */
  | { kind: 'unsupported'; version: unknown }
  /** Not a versioned layout object at all. */
  | { kind: 'invalid' };

/** `true` for a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrate(raw: unknown): MigrationResult {
  if (!isRecord(raw)) return { kind: 'invalid' };
  const version = raw.version;
  if (version === CURRENT_LAYOUT_VERSION) return { kind: 'current', payload: raw };
  if (typeof version === 'number' && Number.isFinite(version) && version > CURRENT_LAYOUT_VERSION) {
    return { kind: 'unsupported', version };
  }
  return { kind: 'invalid' };
}
