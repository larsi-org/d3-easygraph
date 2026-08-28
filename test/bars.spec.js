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
