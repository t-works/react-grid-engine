import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { boxOf, container, expandButton, expandedContainer, jsonAttr, sprite } from './helpers';

/**
 * Expand at the browser level (docs/feat/expand.md) on `standalone-basic?expand`,
 * whose registry adds a stateful `counter` panel. jsdom covers the state/attrs;
 * this proves the real geometry: `absolute` against the engine root, `fixed`
 * against the viewport, the z-order, and that a drag on the overlay is a no-op.
 */

const addButton = (page: Page, id: string): Locator =>
  container(page, id).locator('[data-twge-add]');
const titlebar = (page: Page, id: string): Locator => page.locator(`[data-twge-titlebar="${id}"]`);

const expectBox = async (a: Locator, b: { x: number; y: number; width: number; height: number }) => {
  const box = await boxOf(a);
  expect(Math.abs(box.x - b.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y - b.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - b.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - b.height)).toBeLessThanOrEqual(1);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/?expand');
  await expect(container(page, 'c1')).toHaveCount(1);
});

test('maximize fills the engine root, collapse restores the original box', async ({ page }) => {
  const original = await boxOf(container(page, 'c1'));
  const root = await boxOf(page.locator('[data-twge-layout]'));
  const before = await jsonAttr(page).getAttribute('data-twge-layout');

  await expandButton(page, 'c1', 'maximize').click();
  await expect(expandedContainer(page)).toHaveCount(1);
  await expectBox(container(page, 'c1'), root);

  await expandButton(page, 'c1', 'maximize').click();
  await expect(expandedContainer(page)).toHaveCount(0);
  await expectBox(container(page, 'c1'), original);
  expect(await jsonAttr(page).getAttribute('data-twge-layout')).toBe(before);
});

test('fullscreen fills the viewport and paints above the page', async ({ page }) => {
  const viewport = page.viewportSize()!;
  await expandButton(page, 'c1', 'fullscreen').click();

  const box = await boxOf(expandedContainer(page));
  expect(box.x).toBeLessThanOrEqual(1);
  expect(box.y).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - viewport.height)).toBeLessThanOrEqual(1);

  // Hits, not just geometry: the overlay is what the pointer reaches.
  const topmost = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return el?.closest('[data-twge-expanded]') !== null;
  });
  expect(topmost).toBe(true);

  // `maximize` <-> `fullscreen` keeps the same container expanded.
  await expandButton(page, 'c1', 'maximize').click();
  await expect(expandedContainer(page)).toHaveAttribute('data-twge-expand-mode', 'maximize');
  await expect(expandedContainer(page)).toHaveAttribute('data-twge-expanded', 'c1');
});

test('a stateful panel survives maximize, a mode switch and collapse', async ({ page }) => {
  await addButton(page, 'c1').click();
  await page.getByRole('menuitem', { name: 'counter', exact: true }).click();

  const counter = page.locator('[data-twge-counter]');
  await counter.click();
  await counter.click();
  await counter.click();
  await expect(counter).toHaveText('count: 3');

  await expandButton(page, 'c1', 'maximize').click();
  await expect(counter).toHaveText('count: 3');
  await expandButton(page, 'c1', 'fullscreen').click();
  await expect(counter).toHaveText('count: 3');
  await expandButton(page, 'c1', 'fullscreen').click();
  await expect(expandedContainer(page)).toHaveCount(0);
  await expect(counter).toHaveText('count: 3');
});

test('a drag starting on the overlay title bar does not move anything', async ({ page }) => {
  const before = await jsonAttr(page).getAttribute('data-twge-layout');
  await expandButton(page, 'c1', 'maximize').click();

  const box = await boxOf(titlebar(page, 'c1'));
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 60, { steps: 5 });
  await expect(sprite(page)).toHaveCount(0);
  await page.mouse.up();

  expect(await jsonAttr(page).getAttribute('data-twge-layout')).toBe(before);
});
