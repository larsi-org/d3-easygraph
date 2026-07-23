const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter.html');
const VORONOI_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-voronoi.html');
const CLIP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-clip.html');
const ARROWS_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-arrows.html');

test('renders one point per data item', async ({ page }) => {
  await page.goto(FIXTURE);
  // 3 points in the fixture data
  await expect(page.locator('circle.scatter-point')).toHaveCount(3);
});

test('points are positioned via the x/y scale, not raw data coordinates', async ({ page }) => {
  await page.goto(FIXTURE);
  const positions = await page.evaluate(() => {
    var graphWidth = window.graph.width;
    var graphHeight = window.graph.height;
    var cxs = [...document.querySelectorAll('circle.scatter-point')].map((c) => Number(c.getAttribute('cx')));
    var cys = [...document.querySelectorAll('circle.scatter-point')].map((c) => Number(c.getAttribute('cy')));
    return { graphWidth, graphHeight, cxs, cys };
  });
  // domain [0,10] over range [0, graphWidth] -- x=0/5/10 map to 0/half/full width
  expect(positions.cxs[0]).toBeCloseTo(0, 0);
  expect(positions.cxs[1]).toBeCloseTo(positions.graphWidth / 2, 0);
  expect(positions.cxs[2]).toBeCloseTo(positions.graphWidth, 0);
  // y range is flipped ([height, 0]) like every other family, for the usual cartesian
  // "higher value plots higher on screen" reading
  expect(positions.cys[0]).toBeCloseTo(positions.graphHeight, 0);
  expect(positions.cys[1]).toBeCloseTo(positions.graphHeight / 2, 0);
  expect(positions.cys[2]).toBeCloseTo(0, 0);
});

test('color scale spans the data\'s min/max value, not a single fixed color', async ({ page }) => {
  await page.goto(FIXTURE);
  const fills = await page.evaluate(() =>
    [...document.querySelectorAll('circle.scatter-point')].map((c) => getComputedStyle(c).fill)
  );
  expect(new Set(fills).size).toBeGreaterThan(1);
});

test('resize updates point positions proportionally', async ({ page }) => {
  await page.goto(FIXTURE);

  const cxBefore = await page.evaluate(() =>
    Number(document.querySelectorAll('circle.scatter-point')[2].getAttribute('cx'))
  );

  await page.evaluate(() => { document.querySelector('#wrap').style.width = '300px'; });
  await page.waitForFunction((cx0) => {
    var cx = Number(document.querySelectorAll('circle.scatter-point')[2].getAttribute('cx'));
    return cx > 0 && cx < cx0;
  }, cxBefore);

  const cxAfter = await page.evaluate(() =>
    Number(document.querySelectorAll('circle.scatter-point')[2].getAttribute('cx'))
  );
  expect(cxAfter).toBeLessThan(cxBefore);
  expect(cxAfter).toBeGreaterThan(0);
});

test('voronoi defaults to off -- no cells rendered unless explicitly enabled', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('path.scatter-cell')).toHaveCount(0);
});

test('voronoi: true renders one cell per point, behind the points in z-order', async ({ page }) => {
  await page.goto(VORONOI_FIXTURE);
  // 4 points in the fixture data
  await expect(page.locator('path.scatter-cell')).toHaveCount(4);
  await expect(page.locator('circle.scatter-point')).toHaveCount(4);

  const cellsBeforePoints = await page.evaluate(() => {
    var cellsGroup = document.querySelector('g.scatter-cells');
    var pointsGroup = document.querySelector('g.scatter-points');
    // DOM position comparison: cellsGroup should come before pointsGroup as a sibling
    return !!(cellsGroup && pointsGroup &&
      (cellsGroup.compareDocumentPosition(pointsGroup) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(cellsBeforePoints).toBe(true);
});

test('each cell is colored the same as its own point', async ({ page }) => {
  await page.goto(VORONOI_FIXTURE);
  const colors = await page.evaluate(() => {
    var cellFills = [...document.querySelectorAll('path.scatter-cell')].map((c) => getComputedStyle(c).fill);
    var pointFills = [...document.querySelectorAll('circle.scatter-point')].map((c) => getComputedStyle(c).fill);
    return { cellFills, pointFills };
  });
  expect(colors.cellFills).toEqual(colors.pointFills);
});

test('cells render semi-transparent so an underlying layer stays visible', async ({ page }) => {
  await page.goto(VORONOI_FIXTURE);
  const opacity = await page.evaluate(() =>
    getComputedStyle(document.querySelector('path.scatter-cell')).fillOpacity
  );
  expect(Number(opacity)).toBeCloseTo(0.6, 1);
  expect(Number(opacity)).toBeLessThan(1);
});

test('x/y clip narrows the data-driven domain away from a single outlier point', async ({ page }) => {
  await page.goto(CLIP_FIXTURE);
  const domains = await page.evaluate(() => ({
    x: window.graph.x.$scale.domain(),
    y: window.graph.y.$scale.domain()
  }));
  // fixture's outlier point sits at x=100/y=100, far past every other point (0-8)
  expect(domains.x[1]).toBeLessThan(50);
  expect(domains.y[1]).toBeLessThan(50);
});

test('color clip narrows the domain away from a single outlier value, clamped rather than extrapolated', async ({ page }) => {
  await page.goto(CLIP_FIXTURE);
  const result = await page.evaluate(() => {
    var scale = window.graph.color.$scale;
    var domain = scale.domain();
    var domainMax = domain[domain.length - 1];
    return {
      domainMax:      domainMax,
      // fixture's outlier value (1000) is past the clipped domain -- clamp(true) means it
      // resolves to exactly the same color as the domain's own top edge, not an
      // extrapolated one past it
      outlierColor:   scale(1000),
      domainEdgeColor: scale(domainMax)
    };
  });
  // fixture's outlier value is 1000, far past every other value (0-80)
  expect(result.domainMax).toBeLessThan(500);
  expect(result.outlierColor).toBe(result.domainEdgeColor);
});

test('arrows defaults to off -- no arrow glyphs rendered', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('path.scatter-arrow')).toHaveCount(0);
});

test('arrows: true renders one glyph per point that has both angle and magnitude, skipping the rest', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  // 3 points in the fixture, only 2 carry angle/magnitude
  await expect(page.locator('circle.scatter-point')).toHaveCount(3);
  await expect(page.locator('path.scatter-arrow')).toHaveCount(2);
});

test('arrows render after (on top of, in z-order) points', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const arrowsAfterPoints = await page.evaluate(() => {
    var pointsGroup = document.querySelector('g.scatter-points');
    var arrowsGroup = document.querySelector('g.scatter-arrows');
    return !!(pointsGroup && arrowsGroup &&
      (pointsGroup.compareDocumentPosition(arrowsGroup) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(arrowsAfterPoints).toBe(true);
});

test('an angle=0 arrow points along +x (screen right) from its own point', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const shape = await page.evaluate(() => {
    var d = document.querySelectorAll('path.scatter-arrow')[0].getAttribute('d');
    // "M{cx},{cy}L{tipX},{tipY}M..." -- pull the shaft's start/end points back out
    var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
    return { cx: +m[1], cy: +m[2], tipX: +m[3], tipY: +m[4] };
  });
  expect(shape.tipX).toBeGreaterThan(shape.cx);
  expect(shape.tipY).toBeCloseTo(shape.cy, 0);
});

test('an angle=PI/2 arrow points along +y (screen down) from its own point', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const shape = await page.evaluate(() => {
    var d = document.querySelectorAll('path.scatter-arrow')[1].getAttribute('d');
    var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
    return { cx: +m[1], cy: +m[2], tipX: +m[3], tipY: +m[4] };
  });
  expect(shape.tipY).toBeGreaterThan(shape.cy);
  expect(shape.tipX).toBeCloseTo(shape.cx, 0);
});

test('magnitude scales arrow shaft length -- a bigger magnitude draws a longer shaft', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const lengths = await page.evaluate(() => {
    return [...document.querySelectorAll('path.scatter-arrow')].map((el) => {
      var d = el.getAttribute('d');
      var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
      var cx = +m[1], cy = +m[2], tipX = +m[3], tipY = +m[4];
      return Math.hypot(tipX - cx, tipY - cy);
    });
  });
  // fixture's first point has magnitude 5, second has magnitude 20
  expect(lengths[1]).toBeGreaterThan(lengths[0]);
});
