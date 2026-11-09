const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter.html');
const VORONOI_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-voronoi.html');
const CLIP_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-clip.html');
const COLOR_DOMAIN_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-color-domain.html');
const QUANTIZE_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-quantize.html');
const ARROWS_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-arrows.html');
const LABELS_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-labels.html');
const LABELS_MINZOOM_FIXTURE = 'file://' + path.join(__dirname, 'fixtures/scatter-labels-minzoom.html');

test('renders one point per data item', async ({ page }) => {
  await page.goto(FIXTURE);
  // 3 points in the fixture data
  await expect(page.locator('circle.easygraph-point')).toHaveCount(3);
});

test('a point\'s own radius overrides the graph-level radius (bubble chart)', async ({ page }) => {
  await page.goto(FIXTURE);
  const radii = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.scatter({ container: wrap, height: 200, points: { radius: 4 } });
    g.update([
      { x: 0, y: 0, value: 0, radius: 10 },
      { x: 1, y: 1, value: 1 } // no radius - falls back to the graph-level default (4)
    ], { x: [0, 1], y: [0, 1] });
    var rs = [...wrap.querySelectorAll('circle.easygraph-point')].map((c) => Number(c.getAttribute('r')));
    g.destroy();
    wrap.remove();
    return rs;
  });
  expect(radii).toEqual([10, 4]);
});

test('rescale(k) still shrinks a per-point radius override by 1/k', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var wrap = document.createElement('div');
    document.body.appendChild(wrap);
    var g = d3.easygraph.scatter({ container: wrap, height: 200 });
    g.update([{ x: 0, y: 0, value: 0, radius: 10 }], { x: [0, 1], y: [0, 1] });
    g.rescale(2);
    var r = Number(wrap.querySelector('circle.easygraph-point').getAttribute('r'));
    g.destroy();
    wrap.remove();
    return r;
  });
  expect(r).toBe(5);
});

test('points are positioned via the x/y scale, not raw data coordinates', async ({ page }) => {
  await page.goto(FIXTURE);
  const positions = await page.evaluate(() => {
    var graphWidth = window.graph.plotWidth;
    var graphHeight = window.graph.plotHeight;
    var cxs = [...document.querySelectorAll('circle.easygraph-point')].map((c) => Number(c.getAttribute('cx')));
    var cys = [...document.querySelectorAll('circle.easygraph-point')].map((c) => Number(c.getAttribute('cy')));
    return { graphWidth, graphHeight, cxs, cys };
  });
  // domain [0,10] over range [0, graphWidth] - x=0/5/10 map to 0/half/full width
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
    [...document.querySelectorAll('circle.easygraph-point')].map((c) => getComputedStyle(c).fill)
  );
  expect(new Set(fills).size).toBeGreaterThan(1);
});

test('resize updates point positions proportionally', async ({ page }) => {
  await page.goto(FIXTURE);

  const cxBefore = await page.evaluate(() =>
    Number(document.querySelectorAll('circle.easygraph-point')[2].getAttribute('cx'))
  );

  await page.evaluate(() => { document.querySelector('#wrap').style.width = '300px'; });
  await page.waitForFunction((cx0) => {
    var cx = Number(document.querySelectorAll('circle.easygraph-point')[2].getAttribute('cx'));
    return cx > 0 && cx < cx0;
  }, cxBefore);

  const cxAfter = await page.evaluate(() =>
    Number(document.querySelectorAll('circle.easygraph-point')[2].getAttribute('cx'))
  );
  expect(cxAfter).toBeLessThan(cxBefore);
  expect(cxAfter).toBeGreaterThan(0);
});

test('point cx/fill transition over graph.duration on a data update, not an instant swap', async ({ page }) => {
  await page.goto(FIXTURE);
  const { immediateCx, settledCx, finalCx } = await page.evaluate(() => {
    return new Promise((resolve) => {
      var point = document.querySelector('circle.easygraph-point');
      // first point moves from x=0 (far left) to x=10 (far right) - a big enough jump that
      // an immediate vs. settled cx reliably differ
      var moved = [
        { x: 10, y: 10, value: 100 },
        { x: 5,  y: 5,  value: 50 },
        { x: 0,  y: 0,  value: 0 }
      ];
      window.graph.update(moved, { x: [0, 10], y: [0, 10] });
      var immediateCx = point.getAttribute('cx');
      setTimeout(function() {
        resolve({
          immediateCx: immediateCx,
          settledCx: point.getAttribute('cx'),
          finalCx: window.graph.x.$scale(10)
        });
      }, 700); // graph.duration defaults to 500ms
    });
  });
  expect(immediateCx).not.toBe(settledCx);
  expect(Number(settledCx)).toBeCloseTo(finalCx, 0);
});

test('rescale(k) re-renders synchronously, not through the same transition points/fill use', async ({ page }) => {
  await page.goto(FIXTURE);
  const { rBeforeAnyWait } = await page.evaluate(() => {
    window.graph.rescale(2);
    // fixture uses the default radius (4) - if rescale() were transitioned like cx/cy/fill,
    // this synchronous read (no wait at all) would still show the old radius (4)
    return { rBeforeAnyWait: document.querySelector('circle.easygraph-point').getAttribute('r') };
  });
  expect(Number(rBeforeAnyWait)).toBe(2);
});

test('voronoi defaults to off - no cells rendered unless explicitly enabled', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('path.easygraph-voronoi-cell')).toHaveCount(0);
});

test('voronoi: true renders one cell per point, behind the points in z-order', async ({ page }) => {
  await page.goto(VORONOI_FIXTURE);
  // 4 points in the fixture data
  await expect(page.locator('path.easygraph-voronoi-cell')).toHaveCount(4);
  await expect(page.locator('circle.easygraph-point')).toHaveCount(4);

  const cellsBeforePoints = await page.evaluate(() => {
    var cellsGroup = document.querySelector('g.easygraph-voronoi-cells');
    var pointsGroup = document.querySelector('g.easygraph-points');
    // DOM position comparison: cellsGroup should come before pointsGroup as a sibling
    return !!(cellsGroup && pointsGroup &&
      (cellsGroup.compareDocumentPosition(pointsGroup) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(cellsBeforePoints).toBe(true);
});

test('each cell is colored the same as its own point', async ({ page }) => {
  await page.goto(VORONOI_FIXTURE);
  const colors = await page.evaluate(() => {
    var cellFills = [...document.querySelectorAll('path.easygraph-voronoi-cell')].map((c) => getComputedStyle(c).fill);
    var pointFills = [...document.querySelectorAll('circle.easygraph-point')].map((c) => getComputedStyle(c).fill);
    return { cellFills, pointFills };
  });
  expect(colors.cellFills).toEqual(colors.pointFills);
});

test('cells render semi-transparent so an underlying layer stays visible', async ({ page }) => {
  await page.goto(VORONOI_FIXTURE);
  const opacity = await page.evaluate(() =>
    getComputedStyle(document.querySelector('path.easygraph-voronoi-cell')).fillOpacity
  );
  expect(Number(opacity)).toBeCloseTo(0.6, 1);
  expect(Number(opacity)).toBeLessThan(1);
});

test('update([]) (no points at all) falls back to a [0,1] domain instead of undefined/NaN', async ({ page }) => {
  await page.goto(FIXTURE);
  const domains = await page.evaluate(() => {
    window.graph.update([]);
    return { x: window.graph.x.$scale.domain(), y: window.graph.y.$scale.domain() };
  });
  expect(domains.x).toEqual([0, 1]);
  expect(domains.y).toEqual([0, 1]);
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
      // fixture's outlier value (1000) is past the clipped domain - clamp(true) means it
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

test('color.domain fixes the scale to an explicit range, ignoring both the data and clip', async ({ page }) => {
  await page.goto(COLOR_DOMAIN_FIXTURE);
  const domain = await page.evaluate(() => window.graph.color.$scale.domain());
  const first = domain[0], last = domain[domain.length - 1];
  // fixture's data values are all 40-60, and clip is set alongside domain - if either the
  // data or the clip won out instead of the fixed domain, this would be nowhere near 0-40000
  expect(first).toBe(0);
  expect(last).toBe(40000);
});

test('color.quantize: true buckets points into paletteColors.length discrete color bands, not a continuous gradient', async ({ page }) => {
  await page.goto(QUANTIZE_FIXTURE);
  const fills = await page.evaluate(() =>
    [...document.querySelectorAll('circle.easygraph-point')].map((c) => getComputedStyle(c).fill)
  );
  // 5 points across 4 bands (color.classes: 4) - exactly 4 distinct colors, not 5
  expect(new Set(fills).size).toBe(4);
  // the two points in the same 30-40k band (32000 and 38000) get the identical color, not
  // two subtly different shades the way a continuous gradient would produce
  expect(fills[3]).toBe(fills[4]);
});

test('color.classes picks a specific class count from a Sequential palette instead of its largest available', async ({ page }) => {
  await page.goto(QUANTIZE_FIXTURE);
  const paletteLength = await page.evaluate(() => window.graph.paletteColors.length);
  expect(paletteLength).toBe(4);
});

test('arrows defaults to off - no arrow glyphs rendered', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('path.easygraph-arrow')).toHaveCount(0);
});

test('arrows: true renders one glyph per point that has both angle and magnitude, skipping the rest', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  // 3 points in the fixture, only 2 carry angle/magnitude
  await expect(page.locator('circle.easygraph-point')).toHaveCount(3);
  await expect(page.locator('path.easygraph-arrow')).toHaveCount(2);
});

test('arrows render after (on top of, in z-order) points', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const arrowsAfterPoints = await page.evaluate(() => {
    var pointsGroup = document.querySelector('g.easygraph-points');
    var arrowsGroup = document.querySelector('g.easygraph-arrows');
    return !!(pointsGroup && arrowsGroup &&
      (pointsGroup.compareDocumentPosition(arrowsGroup) & Node.DOCUMENT_POSITION_FOLLOWING));
  });
  expect(arrowsAfterPoints).toBe(true);
});

test('an angle=0 arrow points along +x (screen right) from its own point', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const shape = await page.evaluate(() => {
    var d = document.querySelectorAll('path.easygraph-arrow')[0].getAttribute('d');
    // "M{cx},{cy}L{tipX},{tipY}M..." - pull the shaft's start/end points back out
    var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
    return { cx: +m[1], cy: +m[2], tipX: +m[3], tipY: +m[4] };
  });
  expect(shape.tipX).toBeGreaterThan(shape.cx);
  expect(shape.tipY).toBeCloseTo(shape.cy, 0);
});

test('an angle=PI/2 arrow points along +y (screen down) from its own point', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const shape = await page.evaluate(() => {
    var d = document.querySelectorAll('path.easygraph-arrow')[1].getAttribute('d');
    var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
    return { cx: +m[1], cy: +m[2], tipX: +m[3], tipY: +m[4] };
  });
  expect(shape.tipY).toBeGreaterThan(shape.cy);
  expect(shape.tipX).toBeCloseTo(shape.cx, 0);
});

test('magnitude scales arrow shaft length - a bigger magnitude draws a longer shaft', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const lengths = await page.evaluate(() => {
    return [...document.querySelectorAll('path.easygraph-arrow')].map((el) => {
      var d = el.getAttribute('d');
      var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
      var cx = +m[1], cy = +m[2], tipX = +m[3], tipY = +m[4];
      return Math.hypot(tipX - cx, tipY - cy);
    });
  });
  // fixture's first point has magnitude 5, second has magnitude 20
  expect(lengths[1]).toBeGreaterThan(lengths[0]);
});

test('rescale(k) shrinks point radius by 1/k, for a caller layering its own zoom transform', async ({ page }) => {
  await page.goto(FIXTURE);
  const before = await page.evaluate(() => +document.querySelector('circle.easygraph-point').getAttribute('r'));
  const after = await page.evaluate(() => {
    window.graph.rescale(2);
    return +document.querySelector('circle.easygraph-point').getAttribute('r');
  });
  // fixture uses the default radius (4) - rescale(2) should halve it
  expect(before).toBe(4);
  expect(after).toBe(2);
});

test('rescale(1) (or never calling it) leaves radius at its normal, unscaled size', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    window.graph.rescale(2);
    window.graph.rescale(1);
    return +document.querySelector('circle.easygraph-point').getAttribute('r');
  });
  expect(r).toBe(4);
});

test('rescale(k) shrinks arrow shaft length by 1/k too', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  function shaftLength() {
    var d = document.querySelector('path.easygraph-arrow').getAttribute('d');
    var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
    return Math.hypot(+m[3] - +m[1], +m[4] - +m[2]);
  }
  const before = await page.evaluate(shaftLength);
  const after = await page.evaluate(() => {
    window.graph.rescale(2);
    return document.querySelector('path.easygraph-arrow').getAttribute('d');
  }).then((d) => {
    var m = d.match(/^M([\d.\-]+),([\d.\-]+)L([\d.\-]+),([\d.\-]+)/);
    return Math.hypot(+m[3] - +m[1], +m[4] - +m[2]);
  });
  expect(after).toBeCloseTo(before / 2, 5);
});

test('labels defaults to off - no label text rendered', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('text.easygraph-label')).toHaveCount(0);
});

test('labels: true renders one text per point that has a label, skipping the rest', async ({ page }) => {
  await page.goto(LABELS_FIXTURE);
  const texts = await page.evaluate(() =>
    [...document.querySelectorAll('text.easygraph-label')].map((el) => el.textContent)
  );
  // fixture has 3 points - 2 with a label ("AAA", "BBB"), 1 without
  expect(texts.sort()).toEqual(['AAA', 'BBB']);
});

test('rescale(k) shrinks label font size by 1/k', async ({ page }) => {
  await page.goto(LABELS_FIXTURE);
  const before = await page.evaluate(() =>
    document.querySelector('text.easygraph-label').style.fontSize
  );
  const after = await page.evaluate(() => {
    window.graph.rescale(2);
    return document.querySelector('text.easygraph-label').style.fontSize;
  });
  // fixture sets labels.size: 10
  expect(before).toBe('10px');
  expect(after).toBe('5px');
});

test('labels.minZoom hides labels below the threshold and shows them once it\'s reached', async ({ page }) => {
  await page.goto(LABELS_MINZOOM_FIXTURE);
  const atDefaultZoom = await page.locator('text.easygraph-label').count();
  const belowThreshold = await page.evaluate(() => {
    window.graph.rescale(2.9);
    return document.querySelectorAll('text.easygraph-label').length;
  });
  const atThreshold = await page.evaluate(() => {
    window.graph.rescale(3);
    return document.querySelectorAll('text.easygraph-label').length;
  });
  // fixture sets labels.minZoom: 3; default zoom (k=1, never having called rescale) is below it
  expect(atDefaultZoom).toBe(0);
  expect(belowThreshold).toBe(0);
  expect(atThreshold).toBe(2);
});

test('rescale(k) shrinks point stroke-width by 1/k too, not just radius', async ({ page }) => {
  await page.goto(FIXTURE);
  const before = await page.evaluate(() => document.querySelector('circle.easygraph-point').style.strokeWidth);
  const after = await page.evaluate(() => {
    window.graph.rescale(2);
    return document.querySelector('circle.easygraph-point').style.strokeWidth;
  });
  // default points.strokeWidth is 0.5
  expect(before).toBe('0.5px');
  expect(after).toBe('0.25px');
});

test('rescale(k) shrinks arrow stroke-width by 1/k too, not just shaft length', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const before = await page.evaluate(() => document.querySelector('path.easygraph-arrow').style.strokeWidth);
  const after = await page.evaluate(() => {
    window.graph.rescale(2);
    return document.querySelector('path.easygraph-arrow').style.strokeWidth;
  });
  // default arrows.strokeWidth is 1.5
  expect(before).toBe('1.5px');
  expect(after).toBe('0.75px');
});

test('arrows and labels accept an options object; unset keys keep their defaults', async ({ page }) => {
  await page.goto(ARROWS_FIXTURE);
  const stroke = await page.evaluate(() => {
    window.graph.arrows = { color: '#f00', strokeWidth: 3 };
    window.graph.update(window.testData, { x: [0, 10], y: [0, 10] });
    var el = document.querySelector('path.easygraph-arrow');
    return [el.style.stroke, el.style.strokeWidth];
  });
  expect(stroke[1]).toBe('3px');
  expect(stroke[0]).toMatch(/rgb\(255, 0, 0\)|#f00/);
});

test('voronoi accepts { opacity }; plain true keeps the 0.6 default', async ({ page }) => {
  await page.goto(VORONOI_FIXTURE);
  const dflt = await page.evaluate(() => document.querySelector('path.easygraph-voronoi-cell').style.fillOpacity);
  expect(dflt).toBe('0.6');
  const custom = await page.evaluate(() => {
    window.graph.voronoi = { opacity: 0.2 };
    window.graph.update(window.testData, { x: [0, 10], y: [0, 10] });
    return document.querySelector('path.easygraph-voronoi-cell').style.fillOpacity;
  });
  expect(custom).toBe('0.2');
});

test('points join by id first, then label, then position - a dropped point keeps the others\' circles', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function run(keyField) {
      var w = document.createElement('div'); document.body.appendChild(w);
      var g = d3.easygraph.scatter({ container: w, height: 200, x: { scale: 'linear' }, y: { scale: 'linear' } });
      function pts(names) {
        return names.map(function(n, i) {
          var p = { x: i, y: i, value: i };
          if (keyField) p[keyField] = n;
          return p;
        });
      }
      g.update(pts(['a', 'b', 'c']));
      var before = w.querySelectorAll('circle.easygraph-point')[2];
      // drop 'a': with a stable key, the circle for 'c' must be reused; by position it would not
      var next = [{ x: 1, y: 1, value: 1 }, { x: 2, y: 2, value: 2 }];
      if (keyField) { next[0][keyField] = 'b'; next[1][keyField] = 'c'; }
      g.update(next);
      var after = [...w.querySelectorAll('circle.easygraph-point')];
      return after.indexOf(before) >= 0;
    }
    return { id: run('id'), label: run('label'), none: run(null) };
  });
  expect(r.id).toBe(true);
  expect(r.label).toBe(true);
  expect(r.none).toBe(false);
});

test('width + height is a fixed-size chart: viewBox, no relayout, marks keep their screen size', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(async () => {
    var wrap = document.createElement('div');
    wrap.style.width = '400px';
    document.body.appendChild(wrap);
    var g = d3.easygraph.scatter({ container: wrap, width: 800, height: 400, points: { radius: 6 },
                                   margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    g.update([{ x: 0, y: 0, value: 0 }, { x: 1, y: 1, value: 1 }], { x: [0, 800], y: [400, 0] });
    var svg = wrap.querySelector('svg');
    var out = { vb: svg.getAttribute('viewBox'), w: g.width, h: g.height,
                rendered: svg.getBoundingClientRect().height, r1: Number(wrap.querySelector('circle').getAttribute('r')) };
    wrap.style.width = '200px';
    await new Promise((res) => setTimeout(res, 150));
    out.w2 = g.width; out.rendered2 = svg.getBoundingClientRect().height;
    out.r2 = Number(wrap.querySelector('circle').getAttribute('r'));
    g.destroy(); wrap.remove();
    return out;
  });
  expect(r.vb).toBe('0 0 800 400');
  expect(r.w).toBe(800); expect(r.w2).toBe(800);
  expect(r.rendered).toBeCloseTo(200, 0);   // 400px wide, 2:1
  expect(r.rendered2).toBeCloseTo(100, 0);  // halves with the container: shape is kept
  expect(r.r1).toBeCloseTo(12, 1);          // 6 screen px at scale 0.5
  expect(r.r2).toBeCloseTo(24, 1);          // 6 screen px at scale 0.25
});

test('width must be positive', async ({ page }) => {
  await page.goto(FIXTURE);
  const msg = await page.evaluate(() => {
    try { d3.easygraph.scatter({ container: '#graph', width: -5, height: 100 }); return 'no error'; }
    catch (e) { return e.message; }
  });
  expect(msg).toContain('width must be a positive number');
});
