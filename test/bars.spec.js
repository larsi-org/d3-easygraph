const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/bars.html');

test('renders grouped bars with the right element counts', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('g.bar-groups')).toHaveCount(2);
  await expect(page.locator('rect.data-bars')).toHaveCount(6);
});

test('live graph.mode toggle to stacked re-renders in place, no reconstruction', async ({ page }) => {
  await page.goto(FIXTURE);

  await page.evaluate(() => {
    window.graph.mode = 'stacked';
    window.graph.update(window.testData);
  });

  // still one <g.bar-groups> per series, one <rect.data-bars> per datum
  await expect(page.locator('g.bar-groups')).toHaveCount(2);
  await expect(page.locator('rect.data-bars')).toHaveCount(6);

  // stacked: the second series' bars sit on top of the first, so their y
  // should be strictly less than (higher up than) the first series' bars
  // for the same category
  const [firstSeriesY, secondSeriesY] = await page.evaluate(() => {
    const groups = document.querySelectorAll('g.bar-groups');
    const firstBar  = groups[0].querySelector('rect.data-bars');
    const secondBar = groups[1].querySelector('rect.data-bars');
    return [ Number(firstBar.getAttribute('y')), Number(secondBar.getAttribute('y')) ];
  });
  expect(secondSeriesY).toBeLessThan(firstSeriesY);
});

test('resize never produces a negative bar width (regression)', async ({ page }) => {
  await page.goto(FIXTURE);

  const widthBefore = await page.evaluate(() => window.graph.width);

  // shrink below the margin sum (64px) — a transient/degenerate reading the
  // core guard should reject rather than drive graph.width negative
  await page.evaluate(() => { document.querySelector('#wrap').style.width = '10px'; });
  await page.waitForTimeout(200);

  const widthAfter = await page.evaluate(() => window.graph.width);
  expect(widthAfter).toBe(widthBefore);

  const rectAttrs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('rect.data-bars')).map((r) => ({
      x: Number(r.getAttribute('x')),
      width: Number(r.getAttribute('width'))
    }))
  );
  for (const attrs of rectAttrs) {
    expect(attrs.width).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(attrs.x)).toBe(false);
  }
});
