import type { Locator, Page } from '@playwright/test';

/**
 * Shared browser-test plumbing (tasks 06 / 12 / 13). Kept dependency-free so
 * every spec drives the same pointer sequence and the same fixture hooks.
 */

export type Box = { x: number; y: number; width: number; height: number };

export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return box;
}

export const center = (box: Box): { x: number; y: number } => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

/** Pointer press + move; the caller commits with `mouse.up()`. */
export async function drag(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  const start = center(await boxOf(from));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

export const tab = (page: Page, name: string): Locator =>
  page.getByRole('tab', { name, exact: true });
export const containers = (page: Page): Locator => page.locator('[data-twge-container]');
export const container = (page: Page, id: string): Locator =>
  page.locator(`[data-twge-container="${id}"]`);
export const preview = (page: Page): Locator => page.locator('[data-twge-drop-preview]');
export const sprite = (page: Page): Locator => page.locator('[data-twge-drag-sprite]');
/** The fixture mirrors the current wire format here (task 12). */
export const jsonAttr = (page: Page): Locator => page.locator('[data-twge-layout]');
