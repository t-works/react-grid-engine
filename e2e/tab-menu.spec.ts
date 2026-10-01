import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Browser-level tab-menu / add-close-guard smoke (task 07). jsdom covers the
 * logic; this proves the real DOM paths: the fixed-position menus, the native
 * `contextmenu` event, click-outside/Esc dismissal, and the `canClose` guard
 * end to end. Driven against `standalone-basic?guards`, whose registry adds the
 * guard fixtures (`guarded`, `unsaved`, `single`, `locked`).
 */

const container = (page: Page, id: string): Locator =>
  page.locator(`[data-twge-container="${id}"]`);
const tabsIn = (page: Page, id: string): Locator =>
  container(page, id).locator('[role="tab"]');
const tabIn = (page: Page, id: string, name: string): Locator =>
  container(page, id).getByRole('tab', { name, exact: true });
const addButton = (page: Page, id: string): Locator =>
  container(page, id).locator('[data-twge-add]');
const menu = (page: Page): Locator => page.getByRole('menu');
const menuitem = (page: Page, name: string): Locator =>
  page.getByRole('menuitem', { name, exact: true });

/** Open a container's `+` menu and pick a registry entry. */
async function addTab(page: Page, containerId: string, key: string): Promise<void> {
  await addButton(page, containerId).click();
  await menuitem(page, key).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?guards');
  await expect(container(page, 'c3')).toHaveCount(1);
});

test('+ opens the addable menu, and selecting an entry adds and activates the tab', async ({
  page,
}) => {
  await addButton(page, 'c3').click();
  await expect(menu(page)).toBeVisible();
  await expect(menuitem(page, 'guarded')).toBeVisible();
  await expect(menuitem(page, 'locked')).toBeVisible();

  await menuitem(page, 'guarded').click();
  await expect(menu(page)).toBeHidden();
  await expect(tabsIn(page, 'c3')).toHaveCount(2);
  await expect(tabIn(page, 'c3', 'Guarded')).toHaveAttribute('aria-selected', 'true');
});

test('the + menu dismisses on outside click and on Esc', async ({ page }) => {
  await addButton(page, 'c3').click();
  await expect(menu(page)).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(menu(page)).toBeHidden();

  await addButton(page, 'c3').click();
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
});

test('§9.7 canClose resolving false leaves the tab and its container', async ({ page }) => {
  await addTab(page, 'c3', 'guarded');
  await page.getByLabel('Close Guarded').click();

  await expect(tabIn(page, 'c3', 'Guarded')).toBeVisible();
  await expect(tabsIn(page, 'c3')).toHaveCount(2);
});

test('§9.7 a rejecting canClose warns and offers force close that then closes', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'warning') warnings.push(msg.text());
  });

  await addTab(page, 'c3', 'unsaved');
  await page.getByLabel('Close Unsaved').click();

  await expect(menuitem(page, 'Force close')).toBeVisible();
  await expect(tabIn(page, 'c3', 'Unsaved')).toBeVisible();
  expect(warnings.some((w) => w.includes('canClose'))).toBe(true);

  await menuitem(page, 'Force close').click();
  await expect(tabIn(page, 'c3', 'Unsaved')).toHaveCount(0);
  await expect(tabsIn(page, 'c3')).toHaveCount(1);
});

test('allowMultiple:false: hidden from + once present, and not closeable', async ({ page }) => {
  await addTab(page, 'c3', 'single');
  await expect(tabIn(page, 'c3', 'Single')).toBeVisible();
  await expect(page.getByLabel('Close Single')).toHaveCount(0);

  await addButton(page, 'c3').click();
  await expect(menuitem(page, 'single')).toHaveCount(0);
  await expect(menuitem(page, 'locked')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('closeable:false and titleEditable:false remove the close and rename controls', async ({
  page,
}) => {
  await addTab(page, 'c3', 'locked');

  await expect(page.getByLabel('Close Locked')).toHaveCount(0);
  await tabIn(page, 'c3', 'Locked').click({ button: 'right' });
  await expect(menu(page)).toBeVisible();
  await expect(menuitem(page, 'Rename')).toHaveCount(0);
  await expect(menuitem(page, 'Close')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('close others skips closeable:false and allowMultiple:false tabs', async ({ page }) => {
  await addTab(page, 'c3', 'locked');
  await addTab(page, 'c3', 'single');
  await addTab(page, 'c3', 'guarded');
  await expect(tabsIn(page, 'c3')).toHaveCount(4);

  await tabIn(page, 'c3', 'Activity').click({ button: 'right' });
  await menuitem(page, 'Close others').click();

  await expect(tabsIn(page, 'c3')).toHaveCount(3);
  await expect(tabIn(page, 'c3', 'Guarded')).toHaveCount(0);
  await expect(tabIn(page, 'c3', 'Locked')).toBeVisible();
  await expect(tabIn(page, 'c3', 'Single')).toBeVisible();
});

test('close all skips closeable:false and allowMultiple:false tabs', async ({ page }) => {
  await addTab(page, 'c3', 'locked');
  await addTab(page, 'c3', 'single');

  await tabIn(page, 'c3', 'Activity').click({ button: 'right' });
  await menuitem(page, 'Close all').click();

  await expect(tabsIn(page, 'c3')).toHaveCount(2);
  await expect(tabIn(page, 'c3', 'Activity')).toHaveCount(0);
});

test('rename writes the tab title through the context menu', async ({ page }) => {
  await tabIn(page, 'c3', 'Activity').click({ button: 'right' });
  await menuitem(page, 'Rename').click();
  await page.getByLabel('Tab title').fill('Renamed');
  await page.getByLabel('Tab title').press('Enter');

  await expect(tabIn(page, 'c3', 'Renamed')).toBeVisible();
  await expect(tabIn(page, 'c3', 'Activity')).toHaveCount(0);
});

test('closing a container\u2019s only tab removes the container', async ({ page }) => {
  await page.getByLabel('Close Welcome').click();
  await expect(container(page, 'c1')).toHaveCount(0);
});
