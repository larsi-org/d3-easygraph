const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line.html');
const CLIP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line-clip.html');

test('renders lines and areas with the right element counts', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('path.data-lines')).toHaveCount(1);
  await expect(page.locator('path.data-areas')).toHaveCount(1);
});

test('resize updates graph.width and the svg width attribute', async ({ page }) => {
  await page.goto(FIXTURE);
  const initialWidth = await page.evaluate(() => window.graph.width);

  await page.evaluate(() => { document.querySelector('#wrap').style.width = '300px'; });
  await page.waitForFunction((w) => window.graph.width < w, initialWidth);

  const svgWidth = await page.evaluate(() => Number(window.graph.$svgRoot.attr('width')));
  const graphWidth = await page.evaluate(() => window.graph.width);
  expect(graphWidth).toBeGreaterThan(0);
  expect(svgWidth).toBe(graphWidth + 70); // margin.left(50) + margin.right(20)
});

test('zoom then resize keeps $xScaleRef range in sync (regression)', async ({ page }) => {
  await page.goto(FIXTURE);

  // simulate a zoom so $xScaleRef is established as the pre-resize baseline
  await page.evaluate(() => {
    d3.select(window.graph.$pane.node()).call(window.graph.$zoom.transform, d3.zoomIdentity.scale(2));
  });

  const widthBefore = await page.evaluate(() => window.graph.width);
  await page.evaluate(() => { document.querySelector('#wrap').style.width = '300px'; });
  await page.waitForFunction((w) => window.graph.width < w, widthBefore);

  const [xScaleRefMax, graphWidth] = await page.evaluate(() => [
    window.graph.$xScaleRef.range()[1],
    window.graph.width
  ]);
  expect(xScaleRefMax).toBe(graphWidth);
});

test('y clip narrows the data-driven domain away from a single outlier point', async ({ page }) => {
  await page.goto(CLIP_FIXTURE);
  const yMax = await page.evaluate(() => window.graph.y.$scale.domain()[1]);
  // fixture's outlier point is y=1000, far past every other point (0-80)
  expect(yMax).toBeLessThan(500);
});

test('destroy() removes the svg and the crosshair tooltip; a later resize does not throw', async ({ page }) => {
  await page.goto(FIXTURE);

  const errors = [];
  page.on('pageerror', (e) => errors.push(e));

  await expect(page.locator('.easygraph-crosshair-tip')).toHaveCount(1);
  await page.evaluate(() => window.graph.destroy());

  await expect(page.locator('#graph svg')).toHaveCount(0);
  await expect(page.locator('.easygraph-crosshair-tip')).toHaveCount(0);

  await page.evaluate(() => { document.querySelector('#wrap').style.width = '250px'; });
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);
});
