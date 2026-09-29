import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Real-browser drag smoke (task 06). Driven against the `standalone-basic`
 * harness. jsdom covers the zone math; this proves pointer capture, the
 * preview overlay, the drag sprite and the commits work with a real
 * hit-tester. Assertions are relative to the fixture so the example's exact
 * container count can change without breaking them.
 */

const tab = (page: Page, name: string): Locator => page.getByRole('tab', { name, exact: true });
const containers = (page: Page): Locator => page.locator('[data-twge-container]');
const preview = (page: Page): Locator => page.locator('[data-twge-drop-preview]');
const sprite = (page: Page): Locator => page.locator('[data-twge-drag-sprite]');
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
  await expect(container(page, 'c1')).toHaveCount(1);
  await expect(container(page, 'c2')).toHaveCount(1);
  await expect(container(page, 'c3')).toHaveCount(1);
});

test('center drop tabifies and the emptied source collapses', async ({ page }) => {
  await drag(page, tab(page, 'Welcome'), center(await boxOf(container(page, 'c3'))));
  await expect(preview(page)).toBeVisible();
  await expect(sprite(page)).toHaveText('Welcome');
  await page.mouse.up();

  await expect(container(page, 'c1')).toHaveCount(0);
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
  const before = await containers(page).count();
  const c3 = await boxOf(container(page, 'c3'));

  await drag(page, tab(page, 'Welcome'), {
    x: c3.x + c3.width - 2,
    y: c3.y + c3.height / 2,
  });
  const box = await boxOf(preview(page));
  expect(box.x).toBeCloseTo(c3.x + c3.width / 2, 0);
  expect(box.width).toBeCloseTo(c3.width / 2, 0);
  expect(box.height).toBeCloseTo(c3.height, 0);

  await page.mouse.up();

  // c1's only tab left (c1 collapses) and c3 split in two: the count is unchanged.
  await expect(containers(page)).toHaveCount(before);
  await expect(tabsIn(page, 'c3')).toHaveCount(1);
  await expect(tab(page, 'Welcome')).toBeVisible();
});

test('a top/bottom split previews only the target container half', async ({ page }) => {
  const c2 = await boxOf(container(page, 'c2'));

  await drag(page, tab(page, 'Welcome'), { x: c2.x + c2.width / 2, y: c2.y + c2.height - 2 });
  await expect(sprite(page)).toHaveText('Welcome');

  const box = await boxOf(preview(page));
  expect(box.x).toBeCloseTo(c2.x, 0);
  expect(box.width).toBeCloseTo(c2.width, 0);
  expect(box.y).toBeCloseTo(c2.y + c2.height / 2, 0);
  expect(box.height).toBeCloseTo(c2.height / 2, 0);

  await page.mouse.up();
});

test('Esc cancels a drag and leaves the layout untouched', async ({ page }) => {
  const before = await containers(page).count();
  await drag(page, tab(page, 'Welcome'), center(await boxOf(container(page, 'c3'))));
  await expect(preview(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(preview(page)).toBeHidden();
  await expect(sprite(page)).toBeHidden();
  await page.mouse.up();

  await expect(containers(page)).toHaveCount(before);
  await expect(tabsIn(page, 'c3')).toHaveCount(1);
  await expect(container(page, 'c1')).toHaveCount(1);
});
