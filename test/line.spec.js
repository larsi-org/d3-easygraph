const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line.html');
const CLIP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line-clip.html');
const GAP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line-gap.html');

test('renders lines and ribbons with the right element counts', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('path.data-lines')).toHaveCount(1);
  await expect(page.locator('path.data-ribbons')).toHaveCount(1);
});

test('stackedArea stacks series cumulatively, each layer riding on top of the previous', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({ container: wrap, x: { scale: 'linear' }, height: 200, stackedArea: true });
    g.update([
      [ { x: 0, y: 10 }, { x: 1, y: 10 } ],
      [ { x: 0, y: 5 },  { x: 1, y: 5 } ]
    ]);
    var yDomain = g.y.$scale.domain();
    var count = wrap.querySelectorAll('path.data-stack').length;
    g.destroy();
    wrap.remove();
    return { yDomain: yDomain, count: count };
  });
  expect(result.count).toBe(2);
  // cumulative top of the taller stack: series 0's 10 plus series 1's 5 riding on top of it
  expect(result.yDomain).toEqual([0, 15]);
});

test('stackedArea with no data falls back to a [0,1] y domain instead of NaN', async ({ page }) => {
  await page.goto(FIXTURE);
  const yDomain = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({ container: wrap, height: 200, stackedArea: true });
    g.update([]);
    var yDomain = g.y.$scale.domain();
    g.destroy();
    wrap.remove();
    return yDomain;
  });
  expect(yDomain).toEqual([0, 1]);
});

test('toggling stackedArea off and re-rendering removes its paths', async ({ page }) => {
  await page.goto(FIXTURE);
  const counts = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({ container: wrap, height: 200, stackedArea: true });
    var data = [[ { x: 0, y: 10 }, { x: 1, y: 10 } ]];
    g.update(data);
    var before = wrap.querySelectorAll('path.data-stack').length;
    g.stackedArea = false;
    g.update(data);
    var after = wrap.querySelectorAll('path.data-stack').length;
    g.destroy();
    wrap.remove();
    return { before: before, after: after };
  });
  expect(counts.before).toBe(1);
  expect(counts.after).toBe(0);
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

test('zoom pane has touch-action: none so iOS cannot hijack the gesture to zoom the whole page', async ({ page }) => {
  await page.goto(FIXTURE);
  const touchAction = await page.evaluate(() => getComputedStyle(window.graph.$pane.node()).touchAction);
  expect(touchAction).toBe('none');
});

test('update([]) (no series at all) falls back to a real domain instead of undefined/NaN', async ({ page }) => {
  await page.goto(FIXTURE);
  const domains = await page.evaluate(() => {
    window.graph.update([]);
    return { x: window.graph.x.$scale.domain(), y: window.graph.y.$scale.domain() };
  });
  expect(domains.x.length).toBe(2);
  expect(domains.x.every((d) => d !== undefined)).toBe(true);
  expect(domains.y).toEqual([0, 1]);
});

test('y clip narrows the data-driven domain away from a single outlier point', async ({ page }) => {
  await page.goto(CLIP_FIXTURE);
  const yMax = await page.evaluate(() => window.graph.y.$scale.domain()[1]);
  // fixture's outlier point is y=1000, far past every other point (0-80)
  expect(yMax).toBeLessThan(500);
});

test('units[i] gives the crosshair tooltip a per-series unit string, falling back to graph.unit', async ({ page }) => {
  await page.goto(FIXTURE);
  const html = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({
      container: wrap,
      x: { scale: 'time' },
      y: { preset: 'temperatureC' },
      height: 200,
      crosshair: true,
      lines: true,
      units: ['°F', null] // series 0 overrides, series 1 has no entry -- falls back to graph.unit
    });
    var t0 = new Date('2026-01-01T00:00:00');
    g.update([
      [ { x: t0, y: 1 }, { x: new Date('2026-01-01T01:00:00'), y: 2 } ],
      [ { x: t0, y: 3 }, { x: new Date('2026-01-01T01:00:00'), y: 4 } ]
    ]);
    g._moveCrosshair(g.x.$scale(t0));
    var html = g.$crosshairTip.html();
    g.destroy();
    wrap.remove();
    return html;
  });
  expect(html).toContain('1°F'); // series 0's own units[0]
  expect(html).toContain('3°C'); // series 1 falls back to graph.unit (from the y preset)
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

test('a null-y point breaks the line and ribbon into separate subpaths (gap)', async ({ page }) => {
  await page.goto(GAP_FIXTURE);

  const [lineD, ribbonD] = await page.evaluate(() => [
    document.querySelector('path.data-lines').getAttribute('d'),
    document.querySelector('path.data-ribbons').getAttribute('d')
  ]);

  // one gap among 4 real points -> two subpaths -> 2 "move to" commands
  expect((lineD.match(/M/g) || []).length).toBe(2);
  expect((ribbonD.match(/M/g) || []).length).toBe(2);
});

test('null, undefined and an absent key all mark a gap; NaN and Infinity do not (documented contract)', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function probe(series) {
      var w = document.createElement('div');
      w.style.width = '500px';
      document.body.appendChild(w);
      var g = d3.easygraph.line({ container: w, height: 200, lines: true, x: { scale: 'linear' } });
      g.update([series]);
      var d = w.querySelector('path.data-lines').getAttribute('d') || '';
      var out = {
        subpaths: d.split('M').length - 1,       // a gap splits the path in two
        yDomain: g.y.$scale.domain().map(function (v) { return Number.isFinite(v) ? v : String(v); })
      };
      g.destroy(); w.remove();
      return out;
    }
    return {
      whole:     probe([{ x: 0, y: 1 }, { x: 1, y: 2 },         { x: 2, y: 3 }]),
      nullGap:   probe([{ x: 0, y: 1 }, { x: 1, y: null },      { x: 2, y: 3 }]),
      undefGap:  probe([{ x: 0, y: 1 }, { x: 1, y: undefined }, { x: 2, y: 3 }]),
      absentKey: probe([{ x: 0, y: 1 }, { x: 1 },               { x: 2, y: 3 }]),
      nan:       probe([{ x: 0, y: 1 }, { x: 1, y: NaN },       { x: 2, y: 3 }]),
      infinity:  probe([{ x: 0, y: 1 }, { x: 1, y: Infinity },  { x: 2, y: 3 }])
    };
  });

  expect(r.whole.subpaths).toBe(1);
  // the three supported ways to say "no reading here"
  expect(r.nullGap.subpaths).toBe(2);
  expect(r.undefGap.subpaths).toBe(2);
  expect(r.absentKey.subpaths).toBe(2);
  // a gap never disturbs the domain
  expect(r.nullGap.yDomain).toEqual([1, 3]);

  // NaN is NOT a gap -- it is drawn, producing invalid path data
  expect(r.nan.subpaths).toBe(1);
  // Infinity is not a gap either, and additionally corrupts the domain
  expect(r.infinity.subpaths).toBe(1);
  expect(r.infinity.yDomain).toEqual([1, 'Infinity']);
});
