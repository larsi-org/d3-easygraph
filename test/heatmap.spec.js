const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/heatmap.html');

test('renders a cell grid matching the data dimensions', async ({ page }) => {
  await page.goto(FIXTURE);
  // 4 rows x 6 cols in the fixture data
  await expect(page.locator('g.heatmap_row')).toHaveCount(4);
  await expect(page.locator('rect.heatmap_cells')).toHaveCount(24);
});

test('resize updates cell width proportionally', async ({ page }) => {
  await page.goto(FIXTURE);

  const widthBefore = await page.evaluate(() =>
    Number(document.querySelector('rect.heatmap_cells').getAttribute('width'))
  );

  await page.evaluate(() => { document.querySelector('#wrap').style.width = '300px'; });
  await page.waitForFunction((w0) => {
    const w = Number(document.querySelector('rect.heatmap_cells').getAttribute('width'));
    return w > 0 && w < w0;
  }, widthBefore);

  const widthAfter = await page.evaluate(() =>
    Number(document.querySelector('rect.heatmap_cells').getAttribute('width'))
  );
  expect(widthAfter).toBeLessThan(widthBefore);
  expect(widthAfter).toBeGreaterThan(0);
});
