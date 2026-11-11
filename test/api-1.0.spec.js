// The API shape settled for 1.0: set(), frozen x/y/color, the three DOM handles, color.reverse,
// strict color and axis keys, the bar constructor, scatter points: false, the zoom event object,
// module-level formatNumber, the sealed graph object with its internals on _, bar categories by name.
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/core.html');

function setup() {
  window.mk = function () {
    var d = document.createElement('div');
    d.style.width = '500px';
    document.body.appendChild(d);
    return d;
  };
  window.msg = function (fn) { try { fn(); return null; } catch (e) { return e.message; } };
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.evaluate(setup);
});

test('set() changes live keys, merges x/y/color key by key, chains, and checks keys like the config', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200, y: { preset: 'temperatureC' } });
    var chained = g.set({ stacked: true, y: { label: 'Load' }, duration: 0 }) === g;
    g.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }], [{ x: 0, y: 1 }, { x: 1, y: 1 }]]);
    return {
      chained: chained,
      stacked: g.stacked,
      label: g.y.label,
      unitKept: g.y.unit,
      stackPaths: g.$marks.selectAll('path.easygraph-stack').size(),
      typo: msg(() => g.set({ stackd: true })),
      nestedTypo: msg(() => g.set({ y: { lable: 'x' } })),
      wrongFamily: msg(() => g.set({ orientation: 'horizontal' })),
      notObject: msg(() => g.set(true))
    };
  });
  expect(r.chained).toBe(true);
  expect(r.stacked).toBe(true);
  expect(r.label).toBe('Load');
  expect(r.unitKept).toBe('°C');
  expect(r.stackPaths).toBe(2);
  expect(r.typo).toContain("did you mean 'stacked'");
  expect(r.nestedTypo).toContain("did you mean 'y.label'");
  expect(r.wrongFamily).toContain('bar option');
  expect(r.notObject).toContain('takes an object of options');
});

test('set() with a build-time key throws before changing anything', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200 });
    var fixedTop = msg(() => g.set({ stacked: true, height: 300 }));
    var fixedNested = msg(() => g.set({ title: 'T', y: { label: 'L', type: 'time' } }));
    var fixedColor = msg(() => g.set({ color: { reverse: true } }));
    var owned = msg(() => g.set({ stacked: true, width: 300 }));
    return { fixedTop, fixedNested, fixedColor, owned, stacked: g.stacked, title: g.title, label: g.y.label };
  });
  expect(r.fixedTop).toContain("'height' is fixed");
  expect(r.fixedNested).toContain("'y.type' is fixed");
  expect(r.fixedColor).toContain("'color.reverse' is fixed");
  expect(r.owned).toContain("'width' is set by the chart");
  expect(r.stacked).toBe(false);       // nothing from the failed calls was applied
  expect(r.title).toBeUndefined();
  expect(r.label).toBeUndefined();
});

test('x, y and color cannot be replaced, and their keys change only through set()', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200 });
    var s = d3.easygraph.scatter({ container: mk(), height: 200 });
    return {
      y: msg(() => { g.y = { label: 'T' }; }),
      color: msg(() => { s.color = { domain: [0, 1] }; }),
      key: msg(() => { g.y.label = 'T'; }),
      viaSet: (g.set({ y: { label: 'T' } }), g.y.label)
    };
  });
  expect(r.y).toContain("'y' holds the chart's scales");
  expect(r.color).toContain("'color' holds the chart's scales");
  expect(r.key).toContain("'y.label' is changed with graph.set({ y: { label: ... } })");
  expect(r.viaSet).toBe('T');
});

test('$svg is the <svg>, $plot the margin-shifted group, $marks the marks layer', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200, margin: { top: 7, left: 33 } });
    g.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }]]);
    return {
      svg: g.$svg.node().tagName,
      svgClass: g.$svg.attr('class'),
      plot: g.$plot.node().tagName,
      plotParent: g.$plot.node().parentNode === g.$svg.node(),
      plotTransform: g.$plot.attr('transform'),
      marksParent: g.$marks.node().parentNode === g.$plot.node(),
      marksClass: g.$marks.attr('class'),
      lineInMarks: g.$marks.selectAll('path.easygraph-line').size(),
      oldGroup: g.$group, oldRoot: g.$svgRoot
    };
  });
  expect(r.svg.toLowerCase()).toBe('svg');
  expect(r.svgClass).toBe('easygraph');
  expect(r.plot.toLowerCase()).toBe('g');
  expect(r.plotParent).toBe(true);
  expect(r.plotTransform).toBe('translate(33,7)');
  expect(r.marksParent).toBe(true);
  expect(r.marksClass).toBe('easygraph-marks');
  expect(r.lineInMarks).toBe(1);
  expect(r.oldGroup).toBeUndefined();
  expect(r.oldRoot).toBeUndefined();
});

test('color.reverse: the heatmap default is reversed RdBu, reverse: false undoes it, a named palette is reversed only when asked', async ({ page }) => {
  const r = await page.evaluate(() => {
    var rdbu = d3.easygraph.palette('Diverging.RdBu');
    var blues = d3.easygraph.palette('Sequential.Blues');
    function colors(cfg) { var d = document.createElement('div'); document.body.appendChild(d);
                           return d3.easygraph.heatmap(Object.assign({ container: d, height: 200 }, cfg)).paletteColors; }
    return {
      def: colors({})[0] === rdbu[rdbu.length - 1],
      notReversed: colors({ color: { reverse: false } })[0] === rdbu[0],
      named: colors({ color: { palette: 'Sequential.Blues' } })[0] === blues[0],
      namedReversed: colors({ color: { palette: 'Sequential.Blues', reverse: true } })[0] === blues[blues.length - 1],
      oldSuffix: (function () { try { colors({ color: { palette: 'Diverging.RdBu.reversed' } }); return null; } catch (e) { return e.message; } })()
    };
  });
  expect(r.def).toBe(true);
  expect(r.notReversed).toBe(true);
  expect(r.named).toBe(true);
  expect(r.namedReversed).toBe(true);
  expect(r.oldSuffix).toContain('{ reverse: true }');
});

test('convert is not axis config, color takes no preset keys; a preset still puts convert on graph.y', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200, y: { preset: 'temperatureF' } });
    return {
      convert: msg(() => d3.easygraph.line({ container: mk(), height: 200, y: { convert: (v) => v } })),
      rounded: msg(() => d3.easygraph.line({ container: mk(), height: 200, x: { convertRounded: (v) => v } })),
      colorPreset: msg(() => d3.easygraph.scatter({ container: mk(), height: 200, color: { preset: 'pressureHpa' } })),
      colorScale: msg(() => d3.easygraph.heatmap({ container: mk(), height: 200, color: { scale: 'time' } })),
      fromPreset: g.y.convert(100),
      roundedFromPreset: g.y.convertRounded(20.5, 1),
      type: g.y.type
    };
  });
  expect(r.convert).toContain("unknown option 'y.convert'");
  expect(r.rounded).toContain("unknown option 'x.convertRounded'");
  expect(r.colorPreset).toContain("unknown option 'color.preset'");
  expect(r.colorScale).toContain("unknown option 'color.scale'");
  expect(r.fromPreset).toBe(212);
  expect(r.roundedFromPreset).toBe(68.9);
  expect(r.type).toBe('linear');      // an axis is linear unless it says time
});

test('the bar constructor is d3.easygraph.bar; bars is gone', async ({ page }) => {
  const r = await page.evaluate(() => {
    var b = d3.easygraph.bar({ container: mk(), height: 200 });
    return { bars: typeof d3.easygraph.bars, aria: (b.update([[{ category: 'a', value: 1 }]]), b.$svg.attr('aria-label')),
             zoom: msg(() => d3.easygraph.bar({ container: mk(), height: 200, zoom: true })) };
  });
  expect(r.bars).toBe('undefined');
  expect(r.aria).toBe('bar chart');
  expect(r.zoom).toContain('d3.easygraph.bar:');
});

test('scatter points: false draws no circles; arrows and labels still draw; true brings them back', async ({ page }) => {
  const r = await page.evaluate(() => {
    var data = [{ x: 0, y: 0, value: 1, bearing: 90, magnitude: 1, label: 'A' }, { x: 1, y: 1, value: 2, label: 'B' }];
    var s = d3.easygraph.scatter({ container: mk(), height: 200, points: false, arrows: true, labels: true, duration: 0 });
    s.update(data);
    var off = { circles: s.$marks.selectAll('circle.easygraph-point').size(),
                arrows: s.$marks.selectAll('path.easygraph-arrow').size(),
                labels: s.$marks.selectAll('text.easygraph-label').size() };
    s.set({ points: true }).update(data);
    return { off: off, on: s.$marks.selectAll('circle.easygraph-point').size() };
  });
  expect(r.off).toEqual({ circles: 0, arrows: 1, labels: 2 });
  expect(r.on).toBe(2);
});

test('the zoom event passes { transform, x } with the x domain in view', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200, zoom: true, duration: 0 });
    g.update([[{ x: 0, y: 1 }, { x: 100, y: 2 }]]);
    var got = null;
    g.on('zoom', function (e) { got = e; });
    d3.select(g._.$pane.node()).call(g._.$zoom.transform, d3.zoomIdentity.scale(2));
    return { k: got.transform.k, x: got.x, domain: g.x.$scale.domain() };
  });
  expect(r.k).toBe(2);
  expect(r.x).toEqual(r.domain);
  expect(r.x[1] - r.x[0]).toBeCloseTo(50, 6);   // twice the zoom, half the span
});

test('formatNumber is module-level; graph.numberFormat is gone', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200 });
    return { a: d3.easygraph.formatNumber(21.333333333), b: d3.easygraph.formatNumber(12345),
             c: d3.easygraph.formatNumber(0), old: typeof g.numberFormat };
  });
  expect(r.a).toBe('21.3333');
  expect(r.b).toBe('12.3k');
  expect(r.c).toBe('0');
  expect(r.old).toBe('undefined');
});

test('the graph object holds config keys, the public handles and methods only; internals are on the hidden _', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200, zoom: true, crosshair: true });
    g.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }]]);
    var keys = Object.keys(g);
    return {
      privateKeys: keys.filter(function (k) { return k.charAt(0) === '_' || (k.charAt(0) === '$' && ['$svg', '$plot', '$marks'].indexOf(k) < 0); }),
      hasHidden: typeof g._ === 'object' && keys.indexOf('_') < 0,
      sealed: Object.isSealed(g) && Object.isSealed(g.x) && Object.isSealed(g.color),
      xKeys: Object.keys(g.x).sort(),
      title: g.title   // a live key never passed is still there, undefined, so set() can reach it
    };
  });
  expect(r.privateKeys).toEqual([]);
  expect(r.hasHidden).toBe(true);
  expect(r.sealed).toBe(true);
  expect(r.xKeys).toEqual(['$axis', '$scale', 'convert', 'convertRounded', 'label', 'preset', 'tickFormat', 'tickLabels', 'trim', 'type', 'unit']);
  expect(r.title).toBeUndefined();
});

test('bars are { category, value }; categories are every series\' categories in first-seen order; stacking matches bars by category, not position', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.bar({ container: mk(), height: 200, duration: 0 });
    var data = [[{ category: 'a', value: 1 }, { category: 'b', value: 2 }],
                [{ category: 'b', value: 3 }, { category: 'c', value: 4 }, { category: 'a', value: -1 }]];
    g.update(data);
    var grouped = g.x.$scale.domain();
    g.set({ stacked: true }).update(data);
    var y = g.y.$scale, bars = {};
    d3.selectAll(g.$marks.selectAll('g.easygraph-bar-group').nodes()).each(function (s, i) {
      d3.select(this).selectAll('rect.easygraph-bar').each(function (d) { bars[i + d.category] = [d.base, d.base + d.value]; });
    });
    return { grouped: grouped, stackedDomain: g.x.$scale.domain(), valueDomain: y.domain(), bars: bars };
  });
  expect(r.grouped).toEqual(['a', 'b', 'c']);
  expect(r.stackedDomain).toEqual(['a', 'b', 'c']);
  // b: 2 then 3 on top of it; a: 1 up, -1 on its own pile down; c only in series 1, from zero
  expect(r.bars).toEqual({ '0a': [0, 1], '0b': [0, 2], '1b': [2, 5], '1c': [0, 4], '1a': [0, -1] });
  expect(r.valueDomain).toEqual([-1, 5]);
});

test('bar data written the line way ({ x, y }) throws and names { category, value }', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.bar({ container: mk(), height: 200, duration: 0 });
    function msg(data) { try { g.update(data); return 'no error'; } catch (e) { return e.message; } }
    return { xy: msg([[{ x: 'a', y: 1 }]]), emptyFirst: msg([[], [{ x: 'a', y: 1 }]]), ok: msg([[], [{ category: 'a', value: null }]]) };
  });
  expect(r.xy).toContain('A bar is { category, value }');
  expect(r.emptyFirst).toContain('A bar is { category, value }');
  expect(r.ok).toBe('no error');
});

test('scatter zoomScale(k) reads back with no argument and rejects a non-positive factor; rescale is gone', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.scatter({ container: mk(), height: 200, duration: 0 });
    var before = g.zoomScale();
    var chained = g.zoomScale(2) === g;
    var err; try { g.zoomScale(0); } catch (e) { err = e.message; }
    return { before: before, chained: chained, after: g.zoomScale(), err: err, rescale: typeof g.rescale };
  });
  expect(r.before).toBe(1);
  expect(r.chained).toBe(true);
  expect(r.after).toBe(2);
  expect(r.err).toContain('zoomScale(k) needs the zoom factor');
  expect(r.rescale).toBe('undefined');
});
