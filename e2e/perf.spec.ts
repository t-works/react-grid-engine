import { expect, test } from '@playwright/test';
import { boxOf, center, container, drag, preview } from './helpers';

/**
 * Performance smoke (task 13, §9.9) — Chromium, against the 20/80 fixture in
 * `standalone-basic?perf`. A sanity bound, not a contract: the numbers are
 * reported and recorded in `docs/v1/perf.md`, with the caveat that perceived
 * speed is dominated by the host's tab components, which the engine does not
 * own. The ceilings are deliberately loose so a slow CI box cannot fail it.
 */

test.use({ baseURL: 'http://localhost:5173' });

test('§9.9 20 containers / 80 tabs under StrictMode: clean render, sane drag cost', async ({
  page,
}, testInfo) => {
  const messages: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') messages.push(msg.text());
  });
  page.on('pageerror', (error) => messages.push(String(error)));

  const start = Date.now();
  await page.goto('/?perf');
  await expect(page.locator('[data-twge-container]')).toHaveCount(20);
  await expect(page.locator('[role="tab"]')).toHaveCount(80);
  const mountMs = Date.now() - start;

  const text = messages.join('\n');
  expect(text).not.toMatch(/NaN/);
  expect(messages.filter((m) => /hydrat|findDOMNode|legacy/i.test(m))).toEqual([]);
  for (const style of await page
    .locator('[style]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('style') ?? ''))) {
    expect(style).not.toMatch(/NaN/);
  }

  // Drag / hover preview cost: press a tab and move it onto a sibling.
  const source = container(page, 'p-0-0').locator('[role="tab"]').nth(1);
  const target = await boxOf(container(page, 'p-0-1'));
  const hoverStart = Date.now();
  await drag(page, source, center(target));
  await expect(preview(page)).toBeVisible();
  const hoverMs = Date.now() - hoverStart;

  // Committed layout change cost: release and wait for the DOM to settle.
  const commitStart = Date.now();
  await page.mouse.up();
  await expect(container(page, 'p-0-1').locator('[role="tab"]')).toHaveCount(5);
  const commitMs = Date.now() - commitStart;

  // Wall-clock around Playwright actions, so IPC overhead is included; the
  // 2000ms ceilings only catch a pathological regression.
  const report =
    `[perf] 20 containers / 80 tabs — mount+load ${mountMs}ms, ` +
    `hover preview ${hoverMs}ms, commit ${commitMs}ms`;
  console.log(report);
  testInfo.annotations.push({ type: 'perf', description: report });

  expect(hoverMs).toBeLessThan(2000);
  expect(commitMs).toBeLessThan(2000);
});
