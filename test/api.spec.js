// The final pre-1.0 pass: nested option validation, update()'s domain argument, negative bars,
// the crosshair event payload, and sync helpers that do not depend on zoom.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/core.html');

test('a typo inside a nested option object throws with a did-you-mean, in every family', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function msg(ctor, cfg) {
      var w = document.createElement('div'); document.body.appendChild(w);
      try { d3.easygraph[ctor](Object.assign({ container: w, height: 200 }, cfg)); return ''; }
      catch (e) { return e.message; } finally { w.remove(); }
    }
    return {
      xLabel:    msg('line', { x: { lable: 'T' } }),
      yTrim:     msg('line', { y: { trimm: [0, 1] } }),
      clipOld:   msg('line', { y: { clip: [0, 1] } }),
      margin:    msg('line', { margin: { tpo: 1 } }),
      zoom:      msg('line', { zoom: { mn: 2 } }),
      zoomArray: msg('line', { zoom: [1, 10] }),
      crosshair: msg('line', { crosshair: { treshold: 5 } }),
      bands:     msg('line', { bands: { median: true } }),
      bandsTrue: msg('line', { bands: true }),
      color:     msg('heatmap', { color: { palete: 'Sequential.Blues' } }),
      colorLine: msg('line', { color: { domain: [0, 1] } }),
      points:    msg('scatter', { points: { radus: 9 } }),
      arrows:    msg('scatter', { arrows: { colour: 'red' } }),
      labels:    msg('scatter', { labels: { minzoom: 3 } }),
      voronoi:   msg('scatter', { voronoi: { alpha: 0.5 } }),
      pointsNum: msg('scatter', { points: 5 }),
      fine:      msg('scatter', { points: { radius: 2 }, arrows: true, labels: { minZoom: 2 }, voronoi: { opacity: 0.3 },
                                  color: { palette: 'Sequential.Blues', classes: 4, quantize: true, domain: [0, 1], trim: [0, 1] },
                                  x: { label: 'a', unit: 'u', preset: 'temperatureC', tickFormat: '.0f' }, margin: { top: 10 } })
    };
  });
  expect(r.xLabel).toContain("'x.lable'");   expect(r.xLabel).toContain("did you mean 'x.label'");
  expect(r.yTrim).toContain("did you mean 'y.trim'");
  expect(r.clipOld).toContain("'y.clip'");   expect(r.clipOld).toContain('y takes:');
  expect(r.margin).toContain("margin.top");
  expect(r.zoom).toContain("did you mean 'zoom.min'");
  expect(r.zoomArray).toContain('an array');
  expect(r.crosshair).toContain("crosshair.threshold");
  expect(r.bands).toContain("bands.median");
  expect(r.bandsTrue).toContain("'bands' must be an object");
  expect(r.color).toContain("color.palette");
  expect(r.colorLine).toContain("'color.domain'");
  expect(r.points).toContain("points.radius");
  expect(r.arrows).toContain("arrows.color");
  expect(r.labels).toContain("labels.minZoom");
  expect(r.voronoi).toContain("voronoi takes: opacity");
  expect(r.pointsNum).toContain('true or an object');
  expect(r.fine).toBe('');
});

test('update() checks its domains argument: x and y everywhere, color only on heatmap and scatter', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function msg(ctor, data, domains) {
      var w = document.createElement('div'); document.body.appendChild(w);
      try { d3.easygraph[ctor]({ container: w, height: 200 }).update(data, domains); return ''; }
      catch (e) { return e.message; } finally { w.remove(); }
    }
    var series = [[{ x: 0, y: 1 }, { x: 1, y: 2 }]], pts = [{ x: 0, y: 0, value: 1 }], grid = [[1, 2], [3, 4]];
    return {
      lineOk:    msg('line', series, { x: [0, 5], y: [0, 5] }),
      lineZ:     msg('line', series, { z: [0, 1] }),
      lineColor: msg('line', series, { color: [0, 1] }),
      scatterOk: msg('scatter', pts, { color: [0, 10] }),
      heatmapOk: msg('heatmap', grid, { color: [0, 10], x: [0, 2] }),
      notObject: msg('line', series, [0, 1]),
      omitted:   msg('line', series, undefined)
    };
  });
  expect(r.lineOk).toBe('');
  expect(r.lineZ).toContain("unknown domain 'z'");
  expect(r.lineColor).toContain('only heatmap and scatter have a color scale');
  expect(r.scatterOk).toBe('');
  expect(r.heatmapOk).toBe('');
  expect(r.notObject).toContain('second argument is an object');
  expect(r.omitted).toBe('');
});

// d3 transitions run on the next frame even at duration 0
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test('bars with negative values run below the zero line and the axis reaches them', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(async (settleSrc) => {
    var settle = eval(settleSrc);
    var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);
    var g = d3.easygraph.bars({ container: w, height: 300, duration: 0 });
    g.update([[{ x: 'a', y: -30 }, { x: 'b', y: 10 }]]);
    await settle();
    var S = g.y.$scale, zero = S(0);
    var rects = [...w.querySelectorAll('rect.easygraph-bar')].map(function(el) {
      return { y: +el.getAttribute('y'), h: +el.getAttribute('height') };
    });
    return { domain: S.domain(), zero: zero, neg: rects[0], pos: rects[1] };
  }, `(${settle.toString()})`);
  expect(r.domain).toEqual([-30, 10]);
  expect(r.neg.y).toBeCloseTo(r.zero, 1);                 // a negative bar hangs from the zero line
  expect(r.neg.h).toBeGreaterThan(0);
  expect(r.pos.y + r.pos.h).toBeCloseTo(r.zero, 1);       // a positive bar stands on it
  expect(r.neg.h).toBeCloseTo(r.pos.h * 3, 0);            // -30 is three times as tall as 10
});

test('stacked bars pile positives up and negatives down, each from zero; horizontal bars do the same on x', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(async (settleSrc) => {
    var settle = eval(settleSrc);
    function run(orientation) {
      var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);
      var g = d3.easygraph.bars({ container: w, height: 300, duration: 0, stacked: true, orientation: orientation });
      g.update([[{ x: 'a', y: 10 }], [{ x: 'a', y: -5 }], [{ x: 'a', y: 20 }], [{ x: 'a', y: -15 }]]);
      return settle().then(function() {
        var V = orientation === 'horizontal' ? g.x.$scale : g.y.$scale;
        var spans = [...w.querySelectorAll('rect.easygraph-bar')].map(function(el) {
          var a = orientation === 'horizontal' ? +el.getAttribute('x') : +el.getAttribute('y');
          var n = orientation === 'horizontal' ? +el.getAttribute('width') : +el.getAttribute('height');
          return [V.invert(a), V.invert(a + n)].sort(function(p, q) { return p - q; }).map(function(v) { return Math.round(v); });
        });
        return { domain: V.domain(), spans: spans };
      });
    }
    return { vertical: await run('vertical'), horizontal: await run('horizontal') };
  }, `(${settle.toString()})`);
  [r.vertical, r.horizontal].forEach(function(o) {
    expect(o.domain).toEqual([-20, 30]);
    // series in order: +10 and +20 stack up (0..10, 10..30); -5 and -15 stack down (-5..0, -20..-5)
    expect(o.spans).toEqual([[0, 10], [-5, 0], [10, 30], [-20, -5]]);
  });
});

test('all-positive bars are unchanged: the value axis still starts at zero, grouped and stacked', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function dom(stacked) {
      var w = document.createElement('div'); document.body.appendChild(w);
      var g = d3.easygraph.bars({ container: w, height: 200, stacked: stacked, duration: 0 });
      g.update([[{ x: 'a', y: 3 }, { x: 'b', y: 5 }], [{ x: 'a', y: 4 }, { x: 'b', y: 1 }]]);
      return g.y.$scale.domain();
    }
    return { grouped: dom(false), stacked: dom(true) };
  });
  expect(r.grouped).toEqual([0, 5]);
  expect(r.stacked).toEqual([0, 7]);
});

test('the crosshair event carries the data x and the plot pixel, and null when the pointer leaves', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);
    var g = d3.easygraph.line({ container: w, height: 200, duration: 0, crosshair: true });
    g.update([[{ x: 0, y: 1 }, { x: 10, y: 2 }]]);
    var got = [];
    g.on('crosshair', function(p) { got.push(p); });
    var svg = w.querySelector('svg'), box = svg.getBoundingClientRect();
    var px = g._margin.left + g.plotWidth / 2;
    svg.querySelector('g').dispatchEvent(new MouseEvent('mousemove', { clientX: box.left + px, clientY: box.top + 60, bubbles: true }));
    svg.querySelector('g').dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    return { got: got, plotWidth: g.plotWidth };
  });
  expect(r.got[0].x).toBeCloseTo(5, 1);                       // halfway across a 0..10 axis
  expect(r.got[0].pixel).toBeCloseTo(r.plotWidth / 2, 0);
  expect(r.got[r.got.length - 1]).toBeNull();
});

test('syncCrosshair links charts that have no zoom, and drops back to null with the pointer', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function mk() {
      var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);
      var g = d3.easygraph.line({ container: w, height: 200, duration: 0, crosshair: true });
      g.update([[{ x: 0, y: 1 }, { x: 10, y: 2 }]]);
      return { g: g, w: w };
    }
    var a = mk(), b = mk();
    d3.easygraph.syncCrosshair([a.g, b.g]);
    var svg = a.w.querySelector('svg'), box = svg.getBoundingClientRect();
    svg.querySelector('g').dispatchEvent(new MouseEvent('mousemove', { clientX: box.left + a.g._margin.left + 100, clientY: box.top + 60, bubbles: true }));
    var shown = b.g.$crosshairLine.style('display');
    svg.querySelector('g').dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    return { shown: shown, hidden: b.g.$crosshairLine.style('display') };
  });
  expect(r.shown).not.toBe('none');
  expect(r.hidden).toBe('none');
});
