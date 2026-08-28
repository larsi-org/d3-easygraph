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

test('update([]) with no data yields a real [0,1] value domain, not [0, undefined]', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    window.graph.update([]);
    return {
      y: window.graph.y.$scale.domain(),
      bars: document.querySelectorAll('rect.data-bars').length
    };
  });
  // the value axis is the one that used to come back as [0, null] (d3.max over nothing)
  expect(result.y).toEqual([0, 1]);
  expect(result.y[1]).not.toBeNull();
  expect(result.bars).toBe(0);
});

test('mode rejects an unrecognized value, at construction and on a live toggle', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '400px'; document.body.appendChild(w);
    var data = [[{ x: 'a', y: 1 }], [{ x: 'a', y: 2 }]];

    var atConstruction;
    try {
      var bad = d3.easygraph.bars({ container: w, height: 200, mode: 'stakced' });
      bad.update(data); atConstruction = 'NO ERROR';
    } catch (e) { atConstruction = e.message; }

    // the live-toggle path -- mode is documented as switchable on a rendered chart
    var g = d3.easygraph.bars({ container: w, height: 200, mode: 'grouped' });
    g.update(data);
    var onToggle;
    try { g.mode = 'Stacked'; g.update(data); onToggle = 'NO ERROR'; }
    catch (e) { onToggle = e.message; }

    g.mode = 'stacked'; g.update(data);          // a correct toggle still works
    var validToggleBars = w.querySelectorAll('rect.data-bars').length;
    g.destroy(); w.remove();
    return { atConstruction, onToggle, validToggleBars };
  });
  expect(r.atConstruction).toContain('mode must be "stacked" or "grouped"');
  expect(r.atConstruction).toContain('stakced');
  expect(r.onToggle).toContain('mode must be "stacked" or "grouped"'); // case matters
  expect(r.validToggleBars).toBe(2);
});

test('horizontal bars render: grouped bars start at the value axis zero and run right', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(async () => {
    var w = document.createElement('div'); w.style.width = '600px'; document.body.appendChild(w);
    var g = d3.easygraph.bars({ container: w, height: 300, orientation: 'horizontal', mode: 'grouped', duration: 0 });
    g.update([[{ x: 'a', y: 10 }, { x: 'b', y: 20 }]]); // no ranges: categories and value auto-fit
    // d3 transitions run on the next frame even at duration 0, so the geometry below is the
    // enter state until they have flushed
    await new Promise(function (r) { setTimeout(r, 250); });
    var rects = [...w.querySelectorAll('rect.data-bars')].map(function (r) {
      return { x: +r.getAttribute('x'), width: +r.getAttribute('width'), y: +r.getAttribute('y') };
    });
    var zeroX = g.x.$scale(0), fullX = g.x.$scale(20);
    g.destroy(); w.remove();
    return { rects: rects, zeroX: zeroX, fullX: fullX };
  });
  expect(r.rects.length).toBe(2);
  // both start at the value axis origin...
  expect(r.rects[0].x).toBeCloseTo(r.zeroX, 0);
  expect(r.rects[1].x).toBeCloseTo(r.zeroX, 0);
  // ...and length encodes the value: y=20 spans the full axis, y=10 about half of it
  expect(r.rects[1].width).toBeCloseTo(r.fullX, 0);
  expect(r.rects[0].width).toBeCloseTo(r.fullX / 2, 0);
  // categories are separated on the band (y) axis, not stacked on top of each other
  expect(r.rects[0].y).not.toBe(r.rects[1].y);
});

test('horizontal bars render: stacked series pick up where the previous one ends', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(async () => {
    var w = document.createElement('div'); w.style.width = '600px'; document.body.appendChild(w);
    var g = d3.easygraph.bars({ container: w, height: 300, orientation: 'horizontal', mode: 'stacked', duration: 0 });
    // two series over one category: 10 then 20 stacked on top of it
    g.update([[{ x: 'a', y: 10 }], [{ x: 'a', y: 20 }]]);
    await new Promise(function (r) { setTimeout(r, 250); });
    var rects = [...w.querySelectorAll('rect.data-bars')].map(function (r) {
      return { x: +r.getAttribute('x'), width: +r.getAttribute('width'), y: +r.getAttribute('y') };
    });
    var scale = { at0: g.x.$scale(0), at10: g.x.$scale(10), at30: g.x.$scale(30) };
    g.destroy(); w.remove();
    return { rects: rects, scale: scale };
  });
  expect(r.rects.length).toBe(2);
  // first series sits at the origin
  expect(r.rects[0].x).toBeCloseTo(r.scale.at0, 0);
  // second starts exactly where the first ended -- the y0 offset, the whole point of stacking
  expect(r.rects[1].x).toBeCloseTo(r.scale.at10, 0);
  // and the stack's right edge lands on the combined total
  expect(r.rects[1].x + r.rects[1].width).toBeCloseTo(r.scale.at30, 0);
  // one shared category -> both on the same band row
  expect(r.rects[0].y).toBe(r.rects[1].y);
});
