/**
 * UUID minting. Call this from handlers only — never during render (FR-19).
 * `crypto.randomUUID` exists in browsers and Node >= 19 and touches no DOM.
 */
export function createId(): string {
  return globalThis.crypto.randomUUID();
}
