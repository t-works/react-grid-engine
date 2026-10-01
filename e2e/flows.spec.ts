import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boxOf, center, container, containers, drag, jsonAttr, preview, sprite, tab } from './helpers';

/**
 * §9.1–§9.3 browser gates (task 12), driven against `standalone-basic`. The
 * fixture persists the real wire format to `localStorage` and mirrors the
 * current JSON into `data-twge-layout`, so a reload is a genuine
 * `parseLayout`/`serializeLayout` round-trip. The default fixture is
 * `row[s1:column[c1,c2], c3]`; `?flat` is the three-sibling row §9.1 nests.
 */

interface TestTab {
  id: string;
  title?: string;
}
interface TestNode {
  type: 'split' | 'container';
  id: string;
  axis?: 'row' | 'column';
  weight?: number;
  children?: TestNode[];
  tabs?: TestTab[];
}
interface TestLayout {
  version: number;
  activeContainerId?: string;
  root: TestNode;
}

async function readLayout(page: Page): Promise<TestLayout> {
  const raw = await jsonAttr(page).getAttribute('data-twge-layout');
  if (raw === null) throw new Error('no data-twge-layout yet');
  return JSON.parse(raw) as TestLayout;
}

const weights = (node: TestNode): number[] => (node.children ?? []).map((c) => c.weight ?? 1);
const titles = (node: TestNode): (string | undefined)[] => (node.tabs ?? []).map((t) => t.title);

/** Every node in the tree, depth-first. */
function flatten(node: TestNode): TestNode[] {
  return [node, ...(node.children ?? []).flatMap(flatten)];
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(container(page, 'c1')).toHaveCount(1);
  await expect(container(page, 'c2')).toHaveCount(1);
  await expect(container(page, 'c3')).toHaveCount(1);
});

test('§9.1 dragging a tab to an edge builds row[column[c1,c2],c3] and it reloads identically', async ({
  page,
}) => {
  await page.goto('/?flat');
  // Flat fixture: three full-height siblings side by side.
  const c1 = await boxOf(container(page, 'c1'));
  const c2 = await boxOf(container(page, 'c2'));
  expect(Math.abs(c1.y - c2.y)).toBeLessThan(2);

  // Center zone previews the whole target container.
  await drag(page, tab(page, 'Notes'), center(c1));
  const whole = await boxOf(preview(page));
  expect(whole.x).toBeCloseTo(c1.x, 0);
  expect(whole.y).toBeCloseTo(c1.y, 0);
  expect(whole.width).toBeCloseTo(c1.width, 0);
  expect(whole.height).toBeCloseTo(c1.height, 0);

  // Re-aim at c1's bottom edge: column[c1, new] replaces c1, c2 collapses.
  await page.mouse.move(c1.x + c1.width / 2, c1.y + 1, { steps: 4 });
  await page.mouse.move(c1.x + c1.width / 2, c1.y + c1.height - 2, { steps: 4 });
  await page.mouse.up();
  await expect(container(page, 'c2')).toHaveCount(0);

  const layout = await readLayout(page);
  const [left, right] = layout.root.children ?? [];
  expect(layout.root.axis).toBe('row');
  expect(layout.root.children).toHaveLength(2);
  expect(left?.type).toBe('split');
  expect(left?.axis).toBe('column');
  expect(left?.children).toHaveLength(2);
  expect(left?.children?.[0]?.id).toBe('c1');
  expect(titles(left!.children![0]!)).toEqual(['Welcome']);
  expect(titles(left!.children![1]!)).toEqual(['Notes']);
  expect(right?.type).toBe('container');
  expect(right?.id).toBe('c3');
  expect(titles(right!)).toEqual(['Activity']);

  // §9.1: the dragged tree reloads from JSON identically.
  const before = await jsonAttr(page).getAttribute('data-twge-layout');
  await page.reload();
  await expect(containers(page)).toHaveCount(3);
  expect(await jsonAttr(page).getAttribute('data-twge-layout')).toBe(before);
});

test('§9.2 an edge drop creates a 50/50 sibling and the parent fills exactly 100%', async ({
  page,
}) => {
  const viewport = page.viewportSize()!;
  const c3 = await boxOf(container(page, 'c3'));

  await drag(page, tab(page, 'Welcome'), { x: c3.x + c3.width - 2, y: c3.y + c3.height / 2 });
  await page.mouse.up();
  await expect(container(page, 'c1')).toHaveCount(0);

  const layout = await readLayout(page);
  const [left, split] = layout.root.children ?? [];
  expect(layout.root.axis).toBe('row');
  expect(layout.root.children).toHaveLength(2);
  expect(left?.id).toBe('c2');
  expect(split?.type).toBe('split');
  expect(split?.axis).toBe('row');

  // 50/50 inside the new split.
  expect(weights(split!)).toEqual([1, 1]);

  // Geometry: the parent (root) is filled exactly, no seam.
  const c3After = await boxOf(container(page, 'c3'));
  const welcomeOf = containers(page).filter({ has: tab(page, 'Welcome') });
  const welcomeBox = await boxOf(welcomeOf);
  const splitWidth = welcomeBox.x + welcomeBox.width - c3After.x;
  expect(welcomeBox.width).toBeCloseTo(c3After.width, 0);
  const c2 = await boxOf(container(page, 'c2'));
  const gap = (await boxOf(page.locator('[role="separator"][aria-orientation="vertical"]').first()))
    .width;
  expect(c2.width + gap + splitWidth).toBeCloseTo(viewport.width, 0);
});

test('§9.3 closing a container\'s only tab collapses the parent with no gap or empty container', async ({
  page,
}) => {
  const viewport = page.viewportSize()!;
  await page.getByLabel('Close Welcome').click();
  await expect(container(page, 'c1')).toHaveCount(0);

  // The parent split is spliced out and no empty container remains anywhere.
  const layout = await readLayout(page);
  expect(layout.root.axis).toBe('row');
  expect(layout.root.type).toBe('split');
  expect(layout.root.children?.map((c) => c.type)).toEqual(['container', 'container']);
  expect(containers(page)).toHaveCount(2);
  for (const node of flatten(layout.root)) {
    if (node.type === 'container') expect(node.tabs?.length ?? 0).toBeGreaterThan(0);
  }

  // No gap: the two remaining containers tile the width exactly.
  const c2 = await boxOf(container(page, 'c2'));
  const c3 = await boxOf(container(page, 'c3'));
  const gap = (await boxOf(page.locator('[role="separator"][aria-orientation="vertical"]').first()))
    .width;
  expect(c2.x).toBeCloseTo(0, 0);
  expect(c2.width + gap + c3.width).toBeCloseTo(viewport.width, 0);
});

test('a splitter honours the 0.05 floor and still fills exactly', async ({ page }) => {
  const viewport = page.viewportSize()!;
  const divider = page.locator('[role="separator"][aria-orientation="horizontal"]');
  const start = center(await boxOf(divider));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x, 1, { steps: 10 });
  await page.mouse.up();

  await expect.poll(async () => weights((await readLayout(page)).root.children![0]!)).toEqual([
    0.05, 1.95,
  ]);

  const c1 = await boxOf(container(page, 'c1'));
  const c2 = await boxOf(container(page, 'c2'));
  const gap = (await boxOf(divider)).height;
  // ~2.5% of the split, borders included; the floor is asserted on the weights.
  expect(c1.height).toBeGreaterThan(15);
  expect(c1.height).toBeLessThan(25);
  expect(c1.height + gap + c2.height).toBeCloseTo(viewport.height, 0);
});

test('Esc cancels a drag and the wire format is byte-identical', async ({ page }) => {
  const before = await jsonAttr(page).getAttribute('data-twge-layout');
  await drag(page, tab(page, 'Welcome'), center(await boxOf(container(page, 'c3'))));
  await expect(preview(page)).toBeVisible();
  await expect(sprite(page)).toHaveText('Welcome');

  await page.keyboard.press('Escape');
  await expect(preview(page)).toBeHidden();
  await expect(sprite(page)).toBeHidden();
  await page.mouse.up();

  await expect(container(page, 'c1')).toHaveCount(1);
  expect(await jsonAttr(page).getAttribute('data-twge-layout')).toBe(before);
});

test('a drop in the gap falls through to the nearest container\'s facing edge', async ({
  page,
}) => {
  const c2 = await boxOf(container(page, 'c2'));
  // The 4px root divider is not inside any container: no exact hit.
  const divider = await boxOf(
    page.locator('[role="separator"][aria-orientation="vertical"]').first(),
  );

  await drag(page, tab(page, 'Welcome'), {
    x: divider.x + divider.width / 2,
    y: c2.y + c2.height / 2,
  });
  await expect(preview(page)).toBeVisible();

  const box = await boxOf(preview(page));
  expect(box.x).toBeCloseTo(c2.x + c2.width / 2, 0);
  expect(box.width).toBeCloseTo(c2.width / 2, 0);
  expect(box.y).toBeCloseTo(c2.y, 0);
  expect(box.height).toBeCloseTo(c2.height, 0);

  await page.mouse.up();
});
