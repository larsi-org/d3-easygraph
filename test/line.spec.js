const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line.html');
const CLIP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line-clip.html');
const GAP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/line-gap.html');

test('renders lines and a minmax band with the right element counts', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('path.easygraph-line')).toHaveCount(1);
  await expect(page.locator('path.easygraph-minmax')).toHaveCount(1);
});

test('the sigma band renders a path nested between the minmax band and the line in z-order', async ({ page }) => {
  await page.goto(FIXTURE);
  const order = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({ container: wrap, height: 200, lines: true, bands: { minmax: true, sigma: true } });
    g.update([[
      { x: 0, y: 10, min: 5, max: 15, sigmaMin: 8, sigmaMax: 12 },
      { x: 1, y: 12, min: 6, max: 18, sigmaMin: 9, sigmaMax: 15 }
    ]]);
    var classes = Array.from(wrap.querySelectorAll('path')).map(function(p) { return p.getAttribute('class'); });
    g.destroy();
    wrap.remove();
    return classes;
  });
  expect(order.indexOf('easygraph-minmax')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('easygraph-sigma')).toBeGreaterThan(order.indexOf('easygraph-minmax'));
  expect(order.indexOf('easygraph-line')).toBeGreaterThan(order.indexOf('easygraph-sigma'));
});

test('a point missing sigmaMin/sigmaMax skips the sigma band there without affecting the minmax band/lines', async ({ page }) => {
  await page.goto(FIXTURE);
  const d = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({ container: wrap, height: 200, lines: true, bands: { minmax: true, sigma: true } });
    g.update([[
      { x: 0, y: 10, min: 5, max: 15 }, // no sigma this point
      { x: 1, y: 12, min: 6, max: 18, sigmaMin: 9, sigmaMax: 15 }
    ]]);
    var sigmaD = wrap.querySelector('path.easygraph-sigma').getAttribute('d');
    var linesCount = wrap.querySelectorAll('path.easygraph-line').length;
    var minmaxCount = wrap.querySelectorAll('path.easygraph-minmax').length;
    g.destroy();
    wrap.remove();
    return { sigmaD: sigmaD, linesCount: linesCount, minmaxCount: minmaxCount };
  });
  // only the second point is defined for sigma, so d3.area() draws a degenerate single-point
  // path there rather than throwing or drawing a false band across the undefined first point
  expect(d.sigmaD).not.toMatch(/NaN/);
  expect(d.linesCount).toBe(1);
  expect(d.minmaxCount).toBe(1);
});

test('the sigma band widens the y domain to its own extent when minmax is off', async ({ page }) => {
  await page.goto(FIXTURE);
  const yDomain = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({ container: wrap, height: 200, lines: true, bands: { sigma: true } });
    g.update([[
      { x: 0, y: 10, sigmaMin: 2, sigmaMax: 18 }
    ]]);
    var domain = g.y.$scale.domain();
    g.destroy();
    wrap.remove();
    return domain;
  });
  expect(yDomain).toEqual([2, 18]);
});

test('a series whose point count changes snaps its path instantly instead of morphing', async ({ page }) => {
  await page.goto(FIXTURE);
  const { dSoonAfter, finalD } = await page.evaluate(() => {
    return new Promise((resolve) => {
      // second update has half as many points as the fixture's initial 4-point series - the
      // hourly/daily-toggle shape this fix targets. Even a duration:0 transition is scheduled
      // through d3's timer rather than applied synchronously, so this reads back after a short
      // wait - well under graph.duration's 500ms default - rather than immediately.
      var reduced = [[
        { x: new Date("2026-01-01T00:00:00"), y: 2, min: 1, max: 3 },
        { x: new Date("2026-01-01T18:00:00"), y: 4, min: 2, max: 5 }
      ]];
      window.graph.update(reduced);
      var path = document.querySelector('path.easygraph-line');
      setTimeout(function() {
        resolve({ dSoonAfter: path.getAttribute('d'), finalD: window.graph.$line(reduced[0]) });
      }, 50);
    });
  });
  expect(dSoonAfter).toBe(finalD);
});

test('a series whose point count stays the same still transitions smoothly (regression)', async ({ page }) => {
  await page.goto(FIXTURE);
  const { immediateD, settledD, finalD } = await page.evaluate(() => {
    return new Promise((resolve) => {
      // same length (4 points) as the fixture's initial series, values moved enough that an
      // immediate vs. settled `d` reliably differ
      var moved = [[
        { x: new Date("2026-01-01T00:00:00"), y: 20, min: 19, max: 21 },
        { x: new Date("2026-01-01T06:00:00"), y: 22, min: 20, max: 23 },
        { x: new Date("2026-01-01T12:00:00"), y: 21, min: 19, max: 22 },
        { x: new Date("2026-01-01T18:00:00"), y: 24, min: 22, max: 25 }
      ]];
      window.graph.update(moved);
      var path = document.querySelector('path.easygraph-line');
      var immediateD = path.getAttribute('d');
      setTimeout(function() {
        resolve({ immediateD: immediateD, settledD: path.getAttribute('d'), finalD: window.graph.$line(moved[0]) });
      }, 700); // graph.duration defaults to 500ms
    });
  });
  expect(immediateD).not.toBe(finalD);
  expect(settledD).toBe(finalD);
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
    var count = wrap.querySelectorAll('path.easygraph-stack').length;
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
    var before = wrap.querySelectorAll('path.easygraph-stack').length;
    g.stackedArea = false;
    g.update(data);
    var after = wrap.querySelectorAll('path.easygraph-stack').length;
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
  const [width, plotWidth] = await page.evaluate(() => [window.graph.width, window.graph.plotWidth]);
  expect(plotWidth).toBeGreaterThan(0);
  expect(svgWidth).toBe(width);
  expect(plotWidth).toBe(width - 70); // margin.left(50) + margin.right(20)
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
    window.graph.plotWidth
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

test('series[i].unit gives the crosshair tooltip a per-series unit string, falling back to y.unit', async ({ page }) => {
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
      series: [{ unit: '°F' }] // series 0 overrides, series 1 has no entry - falls back to y.unit
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
  expect(html).toContain('3°C'); // series 1 falls back to y.unit (from the y preset)
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
    document.querySelector('path.easygraph-line').getAttribute('d'),
    document.querySelector('path.easygraph-minmax').getAttribute('d')
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
      var d = w.querySelector('path.easygraph-line').getAttribute('d') || '';
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

  // NaN is NOT a gap - it is drawn, producing invalid path data
  expect(r.nan.subpaths).toBe(1);
  // Infinity is not a gap either, and additionally corrupts the domain
  expect(r.infinity.subpaths).toBe(1);
  expect(r.infinity.yDomain).toEqual([1, 'Infinity']);
});

test('crosshair accepts { threshold } as well as true', async ({ page }) => {
  await page.goto(FIXTURE);
  const ok = await page.evaluate(() => {
    var w = document.createElement('div'); document.body.appendChild(w);
    var g = d3.easygraph.line({ container: w, height: 200, crosshair: { threshold: 4 }, lines: true });
    g.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }]]);
    return !!g.$crosshairTip;
  });
  expect(ok).toBe(true);
});

test('bands is an object: {} draws none, either key works alone, unknown keys, arrays and the old keys throw', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var data = [[{ x: 0, y: 1, min: 0, max: 2, sigmaMin: 0.5, sigmaMax: 1.5 }, { x: 1, y: 2, min: 1, max: 3, sigmaMin: 1.5, sigmaMax: 2.5 }]];
    function mk(extra) {
      var w = document.createElement('div'); document.body.appendChild(w);
      var g = d3.easygraph.line(Object.assign({ container: w, height: 200, lines: true }, extra));
      g.update(data);
      return { g: g, w: w };
    }
    function msg(fn) { try { fn(); return ''; } catch (e) { return e.message; } }
    var both = mk({ bands: { minmax: true, sigma: true } });
    var counts = function(o) { return [o.w.querySelectorAll('path.easygraph-minmax').length, o.w.querySelectorAll('path.easygraph-sigma').length]; };
    var out = { both: counts(both) };
    both.g.bands = {};            out.none = (both.g.update(data), counts(both));
    both.g.bands = { sigma: true }; out.sigmaOnly = (both.g.update(data), counts(both));
    out.unknown = msg(function() { mk({ bands: { median: true } }); });
    out.array = msg(function() { mk({ bands: ['minmax'] }); });
    out.old = msg(function() { mk({ ribbons: true }); });
    return out;
  });
  expect(r.both).toEqual([1, 1]);
  expect(r.none).toEqual([0, 0]);
  expect(r.sigmaOnly).toEqual([0, 1]);
  expect(r.unknown).toContain('median');
  expect(r.array).toContain('object');
  expect(r.old).toContain('bands');
});
