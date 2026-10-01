import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Browser-level `onTabEvent` smoke (task 09 / FR-18). Driven against
 * `standalone-dashboard` (task 11), whose registry adds the `emitter` fixture:
 * a panel with a button that calls `emit('ping', { n: 1 })`. The host app echoes
 * the event in a popup via `onTabEvent`, so this proves the panel -> engine
 * root -> host path end to end in a real browser (jsdom only covers the prop
 * wiring).
 */

const DASHBOARD_URL = 'http://localhost:5174';

test.use({ baseURL: DASHBOARD_URL });

const container = (page: Page, id: string): Locator =>
  page.locator(`[data-twge-container="${id}"]`);
const addButton = (page: Page, id: string): Locator =>
  container(page, id).locator('[data-twge-add]');
const activeTabId = (page: Page, id: string): Promise<string | null> =>
  container(page, id)
    .locator('[role="tab"][aria-selected="true"]')
    .getAttribute('data-twge-tab-id');

const echo = (page: Page): Locator => page.locator('[data-twge-event-echo]');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(container(page, 'right')).toHaveCount(1);
});

test('a panel emit reaches the host as onTabEvent(tabId, type, payload)', async ({ page }) => {
  const emitterTab = page.getByRole('tab', { name: 'Emitter', exact: true });
  await expect(emitterTab).toHaveCount(0);
  await expect(echo(page)).toHaveCount(0);

  // Add the emitting panel through the real `+` menu.
  await addButton(page, 'right').click();
  await page.getByRole('menuitem', { name: 'emitter', exact: true }).click();
  await expect(emitterTab).toHaveAttribute('aria-selected', 'true');

  await page.locator('[data-twge-emit]').click();

  // The host's popup echoes exactly what the panel pushed up, tagged with the
  // emitting tab's id (engine-generated, so read it from the DOM).
  const id = await activeTabId(page, 'right');
  await expect(echo(page)).toBeVisible();
  await expect(echo(page)).toHaveAttribute('data-twge-event-tab', id ?? '');
  await expect(echo(page).locator('[data-twge-event-type]')).toHaveText('ping');
  await expect(echo(page).locator('[data-twge-event-payload]')).toHaveText('{"n":1}');

  // A second emit updates the same popup rather than stacking one per event.
  await page.locator('[data-twge-emit]').click();
  await expect(echo(page)).toHaveCount(1);
});
