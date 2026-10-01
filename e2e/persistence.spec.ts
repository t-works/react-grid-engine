import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Task-11 gate: the dashboard's saved layout round-trips through the real wire
 * format (§9.1) and a tab's id is stable across save/load (§9.4). Also covers
 * §9.8 — an unknown registry key renders the placeholder and survives a reload.
 */

const DASHBOARD_URL = 'http://localhost:5174';
const STORAGE_KEY = 'react-grid-engine:standalone-dashboard';

test.use({ baseURL: DASHBOARD_URL });

const container = (page: Page, id: string): Locator =>
  page.locator(`[data-twge-container="${id}"]`);
const tabsIn = (page: Page, id: string): Locator => container(page, id).locator('[role="tab"]');
const saved = (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('a mutated layout reloads identically from localStorage', async ({ page }) => {
  await expect(tabsIn(page, 'revenue')).toHaveCount(2);

  // Mutate through the handle (no `target` -> the active container, §9.4).
  await page.getByRole('button', { name: 'Add chart' }).click();
  await expect(tabsIn(page, 'revenue')).toHaveCount(3);

  const addedId = await tabsIn(page, 'revenue').nth(2).getAttribute('data-twge-tab-id');
  const before = await saved(page);
  expect(before).not.toBeNull();

  await page.reload();

  await expect(tabsIn(page, 'revenue')).toHaveCount(3);
  await expect(tabsIn(page, 'revenue').nth(2)).toHaveAttribute('data-twge-tab-id', addedId ?? '');
  expect(await saved(page)).toBe(before);
});

test('§9.8 an unknown registry key shows the placeholder and survives a reload', async ({
  page,
}) => {
  const forecastTab = page.getByRole('tab', { name: 'Forecast', exact: true });
  await forecastTab.click();
  await expect(page.locator('[data-twge-missing="forecast"]')).toBeVisible();

  await page.reload();
  await expect(forecastTab).toBeVisible();
  await forecastTab.click();
  await expect(page.locator('[data-twge-missing="forecast"]')).toBeVisible();
});
