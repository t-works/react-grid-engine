import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Real-browser drag smoke (task 06). The reference fixture is the
 * `standalone-basic` layout: `row[ column[c1, c2], c3 ]` with a lone tab in
 * each container. jsdom covers the zone math; this proves the pointer capture,
 * preview overlay and commits work with a real hit-tester.
 */

const tab = (page: Page, name: string): Locator => page.getByRole('tab', { name, exact: true });
const containers = (page: Page): Locator => page.locator('[data-twge-container]');
const preview = (page: Page): Locator => page.locator('[data-twge-drop-preview]');
const container = (page: Page, id: string): Locator => page.locator(`[data-twge-container="${id}"]`);
const tabsIn = (page: Page, id: string): Locator =>
  page.locator(`[data-twge-container="${id}"] [role="tab"]`);

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return box;
}

const center = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Pointer press + move, in Chromium's synthesised pointer events. */
async function drag(page: Page, from: Locator, to: { x: number; y: number }): Promise<void> {
  const start = center(await boxOf(from));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(containers(page)).toHaveCount(3);
});

test('center drop tabifies and the emptied source collapses', async ({ page }) => {
  const target = center(await boxOf(container(page, 'c3')));

  await drag(page, tab(page, 'Welcome'), target);
  await expect(preview(page)).toBeVisible();
  await page.mouse.up();

  await expect(containers(page)).toHaveCount(2);
  await expect(tabsIn(page, 'c3')).toHaveCount(2);
  await expect(tab(page, 'Welcome')).toHaveAttribute('aria-selected', 'true');
});

test('a tab reorders within its title bar', async ({ page }) => {
  // Tabify Welcome into c2 first, so the container has two tabs to order.
  await drag(page, tab(page, 'Welcome'), center(await boxOf(container(page, 'c2'))));
  await page.mouse.up();
  await expect(tabsIn(page, 'c2')).toHaveCount(2);

  // Then drag it to the far left of the (re-measured) title bar.
  const c2 = await boxOf(container(page, 'c2'));
  await drag(page, tab(page, 'Welcome'), { x: c2.x + 4, y: c2.y + 14 });
  await page.mouse.up();

  await expect(tabsIn(page, 'c2').nth(0)).toHaveText('Welcome');
  await expect(tabsIn(page, 'c2').nth(1)).toHaveText('Notes');
});

test('an edge drop splits 50/50 into a new sibling', async ({ page }) => {
  const c3 = await boxOf(container(page, 'c3'));

  await drag(page, tab(page, 'Welcome'), {
    x: c3.x + c3.width - 2,
    y: c3.y + c3.height / 2,
  });
  await expect(preview(page)).toBeVisible();
  await page.mouse.up();

  // c1's only tab left, so c1 collapses: 3 containers before, 3 after (c3 split in two).
  await expect(containers(page)).toHaveCount(3);
  await expect(tabsIn(page, 'c3')).toHaveCount(1);
  await expect(tab(page, 'Welcome')).toBeVisible();
});

test('Esc cancels a drag and leaves the layout untouched', async ({ page }) => {
  await drag(page, tab(page, 'Welcome'), center(await boxOf(container(page, 'c3'))));
  await expect(preview(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(preview(page)).toBeHidden();
  await page.mouse.up();

  await expect(containers(page)).toHaveCount(3);
  await expect(tabsIn(page, 'c3')).toHaveCount(1);
});
