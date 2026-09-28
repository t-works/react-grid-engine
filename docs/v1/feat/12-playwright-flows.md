# 12 — Playwright drag flows

**Goal:** §5 next-step 3 — browser-level verification of every drag interaction, Chromium + a manual
Safari smoke.

**Depends on:** 11.

**Deliverables**

- `test/browser/*.spec.ts` driven against a built example; `playwright.config.ts` at the root.
- Chromium in CI; Safari by hand (no automated cross-browser matrix).

**Test gate**

- §9.1: drag to edges builds `row[ column[c1, c2], c3 ]`; that tree reloads from JSON identically.
- §9.2: edge drop creates a 50% sibling; the parent still fills exactly 100%.
- §9.3: closing a container's only tab collapses the parent — no gap, no empty container except an
  emptied root showing the placeholder.
- Splitter resize honours the 0.05 floor; `Esc` cancels a drag and restores layout.
- Drop-zone previews (center outline vs edge region); outer-border drop resolves to the edge beneath.

**Refs:** tech-spec §3, §6; §9.1–§9.3; browsers in PRD §8.
