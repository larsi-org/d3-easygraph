const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/heatmap.html');
const CLIP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/heatmap-clip.html');

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

test('color clip narrows the domain away from a single outlier cell, clamped rather than extrapolated', async ({ page }) => {
  await page.goto(CLIP_FIXTURE);
  const result = await page.evaluate(() => {
    var scale = window.graph.color.$scale;
    var domain = scale.domain();
    var domainMax = domain[domain.length - 1];
    return {
      domainMax:       domainMax,
      outlierColor:    scale(1000),
      domainEdgeColor: scale(domainMax)
    };
  });
  // fixture's outlier cell is 1000, far past every other cell (1-8)
  expect(result.domainMax).toBeLessThan(500);
  expect(result.outlierColor).toBe(result.domainEdgeColor);
});
