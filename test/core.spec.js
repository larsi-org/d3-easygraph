const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/core.html');

test('throws when the container cannot be resolved', async ({ page }) => {
  await page.goto(FIXTURE);
  const message = await page.evaluate(() => {
    try {
      d3.easygraph.line({ container: '#does-not-exist', height: 200 });
      return null;
    } catch (e) {
      return e.message;
    }
  });
  expect(message).toContain('container not found');
});

test('throws when height is missing or not a positive number', async ({ page }) => {
  await page.goto(FIXTURE);
  const messages = await page.evaluate(() => {
    return [ 'graph', 0, -10, 'abc' ].map((height) => {
      try {
        d3.easygraph.line({ container: '#graph', height: height });
        return null;
      } catch (e) {
        return e.message;
      }
    });
  });
  for (const message of messages) {
    expect(message).toContain('height must be a positive number');
  }
});

test('accepts a DOM element or a d3 selection as the container, not just a selector string', async ({ page }) => {
  await page.goto(FIXTURE);
  const ok = await page.evaluate(() => {
    var byElement = d3.easygraph.line({ container: document.getElementById('graph'), height: 200 });
    byElement.destroy();
    var bySelection = d3.easygraph.line({ container: d3.select('#graph'), height: 200 });
    bySelection.destroy();
    return true;
  });
  expect(ok).toBe(true);
});

test('omitted margin falls back to the default', async ({ page }) => {
  await page.goto(FIXTURE);
  const margin = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200 });
    var m = g.margin;
    g.destroy();
    return m;
  });
  expect(margin).toEqual({ top: 20, right: 20, bottom: 30, left: 50 });
});

test('a partial margin object fills in only the missing keys, not the whole thing', async ({ page }) => {
  await page.goto(FIXTURE);
  const margin = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200, margin: { top: 5 } });
    var m = g.margin;
    g.destroy();
    return m;
  });
  expect(margin).toEqual({ top: 5, right: 20, bottom: 30, left: 50 });
});

test('a shared x/y config object is cloned, not mutated, across two chart instances', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    var sharedY = { preset: 'temperatureC' };
    var wrap2 = document.createElement('div');
    document.body.appendChild(wrap2);

    var g1 = d3.easygraph.line({ container: '#graph', height: 200, y: sharedY });
    var g2 = d3.easygraph.line({ container: wrap2, height: 200, y: sharedY });

    var originalUntouched = sharedY.$scale === undefined;
    var independentScales = g1.y.$scale !== g2.y.$scale;

    g1.destroy();
    g2.destroy();
    wrap2.remove();
    return { originalUntouched, independentScales };
  });
  expect(result.originalUntouched).toBe(true);
  expect(result.independentScales).toBe(true);
});

test('a shared color config object is cloned, not mutated, across two chart instances (heatmap)', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    var sharedColor = { preset: 'temperatureC' };
    var wrap2 = document.createElement('div');
    document.body.appendChild(wrap2);

    var g1 = d3.easygraph.heatmap({ container: '#graph', height: 200, color: sharedColor });
    var g2 = d3.easygraph.heatmap({ container: wrap2, height: 200, color: sharedColor });

    var originalUntouched = sharedColor.$scale === undefined;
    var independentScales = g1.color.$scale !== g2.color.$scale;

    g1.destroy();
    g2.destroy();
    wrap2.remove();
    return { originalUntouched, independentScales };
  });
  expect(result.originalUntouched).toBe(true);
  expect(result.independentScales).toBe(true);
});

test('update(data, ranges) accepts { x, y } to pin either domain independently', async ({ page }) => {
  await page.goto(FIXTURE);
  const domains = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200 });
    g.update([[{ x: 1, y: 1 }, { x: 2, y: 2 }]], { x: [0, 100] });
    var domains = { x: g.x.$scale.domain(), y: g.y.$scale.domain() };
    g.destroy();
    return domains;
  });
  expect(domains.x).toEqual([0, 100]);
  expect(domains.y).toEqual([1, 2]); // y auto-fits from data since ranges.y wasn't given
});

test('a preset fills in label/unit onto x/y config, but never a range -- that stays caller-supplied or unset', async ({ page }) => {
  await page.goto(FIXTURE);
  const y = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200, y: { preset: 'temperatureC' } });
    var y = { label: g.y.label, unit: g.y.unit, range: g.y.range };
    g.destroy();
    return y;
  });
  expect(y.label).toBe('Temperature');
  expect(y.unit).toBe('°C');
  expect(y.range).toBeUndefined();
});

test('_clippedExtent returns the true min/max when no clip is given', async ({ page }) => {
  await page.goto(FIXTURE);
  const extent = await page.evaluate(() => d3.easygraph._clippedExtent([0, 10, 20, 30, 1000]));
  expect(extent).toEqual([0, 1000]);
});

test('_clippedExtent narrows to the given quantiles when a clip is given', async ({ page }) => {
  await page.goto(FIXTURE);
  const extent = await page.evaluate(() => d3.easygraph._clippedExtent([0, 10, 20, 30, 1000], [0, 0.5]));
  // median of [0,10,20,30,1000] is 20 -- the outlier no longer reaches the upper bound
  expect(extent[0]).toBe(0);
  expect(extent[1]).toBe(20);
});

test('label is optional: no label, no preset, no placeholder text needed -- the title renders blank', async ({ page }) => {
  await page.goto(FIXTURE);
  const title = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200 });
    g.update([[{ x: 1, y: 1 }]]);
    var text = document.querySelector('text.easygraph-title').textContent;
    g.destroy();
    return text;
  });
  expect(title).toBe('');
});

test('the caller\'s config object is never mutated, and two charts can share one config', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    var wrap2 = document.createElement('div');
    wrap2.style.width = '600px';
    document.body.appendChild(wrap2);

    var cfg = { container: '#graph', height: 320, lines: true };
    var g1 = d3.easygraph.line(cfg);
    var heightAfterFirst = cfg.height;
    cfg.container = wrap2;
    var g2 = d3.easygraph.line(cfg);

    var r = {
      configHeightUntouched: heightAfterFirst === 320 && cfg.height === 320,
      configKeyCount: Object.keys(cfg).length,   // stays 3, not ~45
      chartsAreDistinct: g1 !== g2,
      // chart 1's plot height must survive chart 2's construction: 320 - 20 - 30 = 270
      g1PlotHeight: g1.height,
      g2PlotHeight: g2.height
    };

    g1.destroy();
    g2.destroy();
    r.bothTornDown = document.querySelectorAll('#graph svg').length === 0 &&
                     wrap2.querySelectorAll('svg').length === 0;
    wrap2.remove();
    return r;
  });
  expect(result.configHeightUntouched).toBe(true);
  expect(result.configKeyCount).toBe(3);
  expect(result.chartsAreDistinct).toBe(true);
  expect(result.g1PlotHeight).toBe(270);
  expect(result.g2PlotHeight).toBe(270);
  expect(result.bothTornDown).toBe(true);
});

test('the chart title is a class, not a page-unique id -- N charts do not collide', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    var wrap2 = document.createElement('div');
    wrap2.style.width = '600px';
    document.body.appendChild(wrap2);
    var g1 = d3.easygraph.line({ container: '#graph', height: 200, y: { preset: 'temperatureC' } });
    var g2 = d3.easygraph.line({ container: wrap2,   height: 200, y: { preset: 'relativeHumidity' } });
    g1.update([[{ x: 1, y: 1 }]]);
    g2.update([[{ x: 1, y: 1 }]]);
    var r = {
      idTitleElements: document.querySelectorAll('#title').length,
      titleClassElements: document.querySelectorAll('text.easygraph-title').length,
      firstTitle: g1.$title.text(),
      secondTitle: g2.$title.text()
    };
    g1.destroy(); g2.destroy(); wrap2.remove();
    return r;
  });
  expect(result.idTitleElements).toBe(0);
  expect(result.titleClassElements).toBe(2);
  expect(result.firstTitle).toBe('Temperature [°C]');
  expect(result.secondTitle).toBe('Relative Humidity [%]');
});

test('the stylesheet does not restyle a host page element named #title / .tick / .axis', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(async () => {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '../../dist/d3.easygraph.css';
    document.head.appendChild(link);
    await new Promise(function(r) { link.onload = r; link.onerror = r; setTimeout(r, 500); });

    var h1 = document.createElement('h1'); h1.id = 'title'; h1.textContent = 'Host page title';
    var tick = document.createElement('div'); tick.className = 'tick'; tick.textContent = 'x';
    document.body.appendChild(h1); document.body.appendChild(tick);
    var r = { h1FontSize: getComputedStyle(h1).fontSize, tickFontSize: getComputedStyle(tick).fontSize };
    h1.remove(); tick.remove();
    return r;
  });
  // browser defaults, i.e. untouched by the library: h1 32px, div 16px
  expect(result.h1FontSize).toBe('32px');
  expect(result.tickFontSize).toBe('16px');
});

test('setting graph.y.label after construction updates the title; graph.label still overrides', async ({ page }) => {
  await page.goto(FIXTURE);
  const titles = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200, y: { preset: 'temperatureC' } });
    g.update([[{ x: 1, y: 1 }]]);
    var fromPreset = g.$title.text();

    g.y.label = 'Cabin Temperature';
    g.update([[{ x: 1, y: 1 }]]);
    var fromYConfig = g.$title.text();

    g.label = 'Explicit Override';
    g.update([[{ x: 1, y: 1 }]]);
    var fromOverride = g.$title.text();

    g.destroy();
    return { fromPreset, fromYConfig, fromOverride };
  });
  expect(titles.fromPreset).toBe('Temperature [°C]');
  expect(titles.fromYConfig).toBe('Cabin Temperature [°C]');
  expect(titles.fromOverride).toBe('Explicit Override [°C]');
});

test('the chart svg carries an accessible name for assistive tech', async ({ page }) => {
  await page.goto(FIXTURE);
  const a11y = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200, y: { preset: 'temperatureC' }, lines: true });
    g.update([[{ x: 1, y: 1 }, { x: 2, y: 2 }]]);
    var svg = document.querySelector('#graph svg');
    var r = {
      role: svg.getAttribute('role'),
      ariaLabel: svg.getAttribute('aria-label'),
      titleEl: svg.querySelector('title') && svg.querySelector('title').textContent
    };
    g.destroy();
    return r;
  });
  expect(a11y.role).toBe('img');
  expect(a11y.ariaLabel).toBe('Temperature [°C]');
  expect(a11y.titleEl).toBe('Temperature [°C]');
});

test('an unlabeled chart still announces as its family rather than as bare axis numbers', async ({ page }) => {
  await page.goto(FIXTURE);
  const label = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200 });
    g.update([[{ x: 1, y: 1 }]]);
    var l = document.querySelector('#graph svg').getAttribute('aria-label');
    g.destroy();
    return l;
  });
  expect(label).toBe('line chart');
});

test('update() returns the graph, so calls can chain', async ({ page }) => {
  await page.goto(FIXTURE);
  const chained = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200, lines: true });
    var returned = g.update([[{ x: 1, y: 1 }]]);
    var isSame = returned === g;
    g.destroy();
    return isSame;
  });
  expect(chained).toBe(true);
});

test('the bundle leaks no helper globals onto window', async ({ page }) => {
  await page.goto(FIXTURE);
  const leaked = await page.evaluate(() => {
    return ['_resolveContainer', '_nextClipId', '_identity', '_withRounding', '_roundedIdentity',
            'DIVERGING', 'QUALITATIVE', 'SEQUENTIAL', 'DEFAULT_INTERPOLATE_SAMPLES',
            'schemeColors', '_curveMap', '_nestedValues', '_temperatureC2F']
      .filter(function(name) { return name in window; });
  });
  expect(leaked).toEqual([]);
});

test('_chartType is internal: a caller cannot override the accessible-name fallback', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    // passing _chartType in config must not win -- it isn't config, it's the family's own name
    var g = d3.easygraph.line({ container: '#graph', height: 200, _chartType: 'hacked' });
    g.update([[{ x: 1, y: 1 }]]);
    var r = {
      chartType: g._chartType,
      ariaLabel: document.querySelector('#graph svg').getAttribute('aria-label'),
      noPublicAlias: g.chartType === undefined
    };
    g.destroy();
    return r;
  });
  expect(result.chartType).toBe('line');
  expect(result.ariaLabel).toBe('line chart');
  expect(result.noPublicAlias).toBe(true);
});

test('update() rejects a wrong-shaped data argument with a message naming the family and the fix', async ({ page }) => {
  await page.goto(FIXTURE);
  const messages = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '400px'; document.body.appendChild(w);
    function msg(fn) { try { fn(); return 'NO ERROR'; } catch (e) { return e.message; } }

    var line = d3.easygraph.line({ container: w, height: 200, lines: true });
    var flatIntoLine = msg(function() { line.update([{ x: 0, y: 1 }]); });
    var noArgs = msg(function() { line.update(); });
    var notAnArray = msg(function() { line.update('nope'); });
    line.destroy();

    var scatter = d3.easygraph.scatter({ container: w, height: 200 });
    var nestedIntoScatter = msg(function() { scatter.update([[{ x: 0, y: 1, value: 1 }]]); });
    scatter.destroy();

    var heat = d3.easygraph.heatmap({ container: w, height: 200 });
    var objectsIntoHeatmap = msg(function() { heat.update([[{ v: 1 }]]); });
    heat.destroy();

    w.remove();
    return { flatIntoLine, noArgs, notAnArray, nestedIntoScatter, objectsIntoHeatmap };
  });
  expect(messages.flatIntoLine).toContain('line.update() expects an array of series');
  expect(messages.flatIntoLine).toContain('Wrap a single series as [yourArray]');
  expect(messages.noArgs).toContain('no argument at all');
  expect(messages.notAnArray).toContain('string');
  expect(messages.nestedIntoScatter).toContain('scatter.update() expects a flat array of point objects');
  expect(messages.nestedIntoScatter).toContain('did you mean d3.easygraph.line()');
  expect(messages.objectsIntoHeatmap).toContain('Heatmap cells are plain numbers');
});

test('every family still accepts its own correct shape, and an empty array', async ({ page }) => {
  await page.goto(FIXTURE);
  const ok = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '400px'; document.body.appendChild(w);
    var built = [];
    try {
      var l = d3.easygraph.line({ container: w, height: 200, lines: true });
      l.update([[{ x: 0, y: 1 }]]); l.update([]); built.push(l);
      var b = d3.easygraph.bars({ container: w, height: 200 });
      b.update([[{ x: 'a', y: 1 }]]); b.update([]); built.push(b);
      var s = d3.easygraph.scatter({ container: w, height: 200 });
      s.update([{ x: 0, y: 1, value: 1 }]); s.update([]); built.push(s);
      var h = d3.easygraph.heatmap({ container: w, height: 200 });
      h.update([[1, 2], [3, 4]]); h.update([]); built.push(h);
      return true;
    } catch (e) { return 'THREW: ' + e.message; }
    finally { built.forEach(function(g) { g.destroy(); }); w.remove(); }
  });
  expect(ok).toBe(true);
});

test('syncZoom/syncCrosshair compose with a caller-set callback instead of replacing it', async ({ page }) => {
  await page.goto(FIXTURE);
  const result = await page.evaluate(() => {
    var w1 = document.createElement('div'), w2 = document.createElement('div');
    w1.style.width = w2.style.width = '400px';
    document.body.appendChild(w1); document.body.appendChild(w2);

    var a = d3.easygraph.line({ container: w1, height: 200, zoom: [1, 10], crosshair: true, lines: true });
    var b = d3.easygraph.line({ container: w2, height: 200, zoom: [1, 10], crosshair: true, lines: true });
    a.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }]]);
    b.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }]]);

    var zoomCalls = 0, crosshairCalls = 0;
    a.onZoom = function() { zoomCalls++; };
    a.onCrosshair = function() { crosshairCalls++; };
    d3.easygraph.syncZoom([a, b]);
    d3.easygraph.syncCrosshair([a, b]);

    // drive both through the same path a real gesture would
    d3.select(a.$pane.node()).call(a.$zoom.transform, d3.zoomIdentity.scale(2));
    a.onCrosshair(10);

    var syncedDomain = b.x.$scale.domain();
    a.destroy(); b.destroy(); w1.remove(); w2.remove();
    return { zoomCalls, crosshairCalls, syncedDomain };
  });
  // the caller's own callbacks still fire...
  expect(result.zoomCalls).toBeGreaterThan(0);
  expect(result.crosshairCalls).toBeGreaterThan(0);
  // ...and syncing still happened
  expect(result.syncedDomain).toBeDefined();
});

test('outerWidth/outerHeight are the full svg box; width/height are the plot area', async ({ page }) => {
  await page.goto(FIXTURE);
  const dims = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 320, margin: { top: 20, right: 20, bottom: 30, left: 50 } });
    var svg = document.querySelector('#graph svg');
    var d = {
      outerHeight: g.outerHeight, height: g.height,
      outerWidth: g.outerWidth, width: g.width,
      svgHeightAttr: Number(svg.getAttribute('height')),
      svgWidthAttr: Number(svg.getAttribute('width'))
    };
    g.destroy();
    return d;
  });
  expect(dims.outerHeight).toBe(320);
  expect(dims.height).toBe(270);              // 320 - 20 - 30
  expect(dims.svgHeightAttr).toBe(dims.outerHeight);
  expect(dims.width).toBe(dims.outerWidth - 70); // margin.left + margin.right
  expect(dims.svgWidthAttr).toBe(dims.outerWidth);
});

test('height must leave room to plot in once margins are subtracted', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function msg(h) {
      try {
        var g = d3.easygraph.line({ container: '#graph', height: h, margin: { top: 20, right: 20, bottom: 30, left: 50 } });
        var inner = g.height; g.destroy();
        return 'built, plot height ' + inner;
      } catch (e) { return e.message; }
    }
    return { tooShort: msg(40), exactlyMargins: msg(50), fine: msg(200) };
  });
  expect(r.tooShort).toContain('must be greater than');
  expect(r.tooShort).toContain('margin.top + margin.bottom');
  expect(r.exactlyMargins).toContain('must be greater than'); // zero plot height is no good either
  expect(r.fine).toBe('built, plot height 150');
});

test('a destroyed chart refuses update() and releases its data reference', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200, lines: true });
    var data = [[{ x: 0, y: 1 }]];
    g.update(data);
    g.destroy();
    var err;
    try { g.update([[{ x: 0, y: 99 }]]); err = 'NO ERROR'; } catch (e) { err = e.message; }
    return { err, lastData: g._lastData, secondDestroyThrew: (function () {
      try { g.destroy(); return false; } catch (e) { return true; }
    })() };
  });
  expect(r.err).toContain('update() called on a destroyed chart');
  expect(r.lastData).toBeNull();
  expect(r.secondDestroyThrew).toBe(false); // destroy stays idempotent
});

test('curve accepts a shortcut name or a d3 curve factory directly', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function pathFor(curve) {
      var w = document.createElement('div'); w.style.width = '400px'; document.body.appendChild(w);
      var g = d3.easygraph.line({ container: w, height: 200, lines: true, curve: curve, duration: 0 });
      g.update([[{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]]);
      var d = w.querySelector('path.data-lines').getAttribute('d');
      g.destroy(); w.remove();
      return d;
    }
    return {
      linear: pathFor('linear'),
      stepAfter: pathFor('step-after'),
      rawFactory: pathFor(d3.curveNatural),
      unknownFallsBackToLinear: pathFor('not-a-curve')
    };
  });
  // a step curve emits horizontal/vertical segments a linear path does not
  expect(r.stepAfter).not.toBe(r.linear);
  // a d3 curve factory passed straight through produces a real curved path (C commands)
  expect(r.rawFactory).toContain('C');
  expect(r.unknownFallsBackToLinear).toBe(r.linear);
});

test('tickLabels: false blanks the tick text but keeps the tick marks', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '400px'; document.body.appendChild(w);
    var g = d3.easygraph.line({ container: w, height: 200, x: { scale: 'linear', tickLabels: false } });
    g.update([[{ x: 0, y: 0 }, { x: 10, y: 10 }]]);
    var xAxis = w.querySelector('g.x.axis');
    var r = {
      tickCount: xAxis.querySelectorAll('.tick').length,
      labelText: [...xAxis.querySelectorAll('.tick text')].map(function (t) { return t.textContent; }).join('')
    };
    g.destroy(); w.remove();
    return r;
  });
  expect(r.tickCount).toBeGreaterThan(0);  // ticks and gridlines survive
  expect(r.labelText).toBe('');            // only the text is blanked
});

test('bars: colorPerData reads each datum\'s own `color` field', async ({ page }) => {
  await page.goto(FIXTURE);
  const fills = await page.evaluate(() => {
    return new Promise(function (resolve) {
      var w = document.createElement('div'); w.style.width = '400px'; document.body.appendChild(w);
      var g = d3.easygraph.bars({ container: w, height: 200, colorPerData: true });
      g.update([[{ x: 'a', y: 1, color: '#ff0000' }, { x: 'b', y: 2, color: '#00ff00' }]]);
      setTimeout(function () {
        var f = [...w.querySelectorAll('rect.data-bars')].map(function (r) { return r.style.fill; });
        g.destroy(); w.remove(); resolve(f);
      }, 700);
    });
  });
  expect(fills).toEqual(['rgb(255, 0, 0)', 'rgb(0, 255, 0)']);
});

test('bars: orientation takes full words and rejects anything else', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function build(orientation) {
      var w = document.createElement('div'); w.style.width = '400px'; document.body.appendChild(w);
      try {
        var g = d3.easygraph.bars({ container: w, height: 200, orientation: orientation });
        g.update([[{ x: 'a', y: 1 }]]);
        var banded = g.x.$scale.bandwidth ? 'x' : 'y';
        g.destroy(); return 'ok, category axis on ' + banded;
      } catch (e) { return e.message; }
      finally { w.remove(); }
    }
    return { vertical: build('vertical'), horizontal: build('horizontal'), typo: build('v') };
  });
  expect(r.vertical).toBe('ok, category axis on x');
  expect(r.horizontal).toBe('ok, category axis on y');
  expect(r.typo).toContain('orientation must be "vertical" or "horizontal"');
});

test('every family re-renders its axes on resize, not just line (regression)', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise(function (res) { setTimeout(res, ms); });
    async function lastTickX(build, data) {
      var w = document.createElement('div');
      w.style.width = '600px';
      document.body.appendChild(w);
      var g = build(w);
      g.update(data);
      await wait(600);
      w.style.width = '300px';
      await wait(900); // ResizeObserver -> _layout -> _reflow
      var ticks = [...w.querySelectorAll('g.x.axis .tick')];
      var last = ticks[ticks.length - 1].getAttribute('transform');
      var x = Number(/translate\(\s*([\d.]+)/.exec(last)[1]);
      var plotWidth = g.width;
      g.destroy(); w.remove();
      return { tickX: x, plotWidth: plotWidth };
    }
    return {
      line: await lastTickX(function (w) {
        return d3.easygraph.line({ container: w, height: 200, lines: true, x: { scale: 'linear' } });
      }, [[{ x: 0, y: 1 }, { x: 10, y: 2 }]]),
      bars: await lastTickX(function (w) {
        return d3.easygraph.bars({ container: w, height: 200 });
      }, [[{ x: 'a', y: 1 }, { x: 'b', y: 2 }, { x: 'c', y: 3 }]]),
      scatter: await lastTickX(function (w) {
        return d3.easygraph.scatter({ container: w, height: 200 });
      }, [{ x: 0, y: 0, value: 1 }, { x: 10, y: 10, value: 2 }]),
      heatmap: await lastTickX(function (w) {
        return d3.easygraph.heatmap({ container: w, height: 200 });
      }, [[1, 2, 3], [4, 5, 6]])
    };
  });
  // after shrinking, the furthest-right tick must sit inside the new plot area -- before this
  // fix bars/scatter/heatmap left theirs frozen hundreds of px outside it
  for (const family of ['line', 'bars', 'scatter', 'heatmap']) {
    expect(r[family].tickX).toBeLessThanOrEqual(r[family].plotWidth + 1);
  }
});

test('draw() is no longer part of the public surface', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200, lines: true });
    g.update([[{ x: 0, y: 1 }]]);
    var out = { publicDraw: typeof g.draw, hasInternalRedraw: typeof g._redraw };
    g.destroy();
    var b = d3.easygraph.bars({ container: '#graph', height: 200 });
    out.barsHasNoRedraw = b._redraw === undefined; // only line needs the zoom fast path
    b.destroy();
    return out;
  });
  expect(r.publicDraw).toBe('undefined');
  expect(r.hasInternalRedraw).toBe('function');
  expect(r.barsHasNoRedraw).toBe(true);
});

test('graph.legendItems(): line/bars give one row per series, labelled from `names`', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);

    var line = d3.easygraph.line({ container: w, height: 200, lines: true, names: ['HVAC', 'Lighting'] });
    line.update([[{ x: 0, y: 1 }], [{ x: 0, y: 2 }]]);
    var withNames = line.legendItems();
    line.destroy();

    var bare = d3.easygraph.line({ container: w, height: 200, lines: true });
    bare.update([[{ x: 0, y: 1 }], [{ x: 0, y: 2 }]]);
    var withoutNames = bare.legendItems();
    bare.destroy();

    // before any update(), `names` alone is enough to draw a legend
    var early = d3.easygraph.bars({ container: w, height: 200, names: ['A', 'B', 'C'] });
    var beforeData = early.legendItems();
    early.destroy();

    w.remove();
    return { withNames, withoutNames, beforeData };
  });
  expect(r.withNames.map(i => i.label)).toEqual(['HVAC', 'Lighting']);
  expect(r.withNames[0].color).toBe('#4e79a7');            // Tableau10's first
  expect(r.withNames[1].color).toBe('#f28e2c');
  expect(r.withNames.map(i => i.index)).toEqual([0, 1]);
  // no names -> still one row per series, but no invented "Series 1" placeholder
  expect(r.withoutNames.length).toBe(2);
  expect(r.withoutNames[0].label).toBeUndefined();
  expect(r.beforeData.map(i => i.label)).toEqual(['A', 'B', 'C']);
});

test('graph.legendItems(): a quantized color scale gives bands with from/to edges', async ({ page }) => {
  await page.goto(FIXTURE);
  const items = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);
    var g = d3.easygraph.scatter({
      container: w, height: 200,
      color: { domain: [0, 40000], quantize: true },
      colorPalette: 'Sequential.Blues', colorClasses: 4
    });
    g.update([{ x: 0, y: 0, value: 0 }, { x: 1, y: 1, value: 40000 }], { x: [0, 1], y: [0, 1] });
    var items = g.legendItems();
    g.destroy(); w.remove();
    return items;
  });
  expect(items.length).toBe(4);                       // one per band, matching colorClasses
  expect(items[0].from).toBe(0);
  expect(items[0].to).toBe(10000);
  expect(items[3].from).toBe(30000);
  expect(items[3].to).toBe(40000);
  // labels read in the same notation as the axis ticks (graph.numberFormat)
  expect(items[0].label).toBe('0–10.0k');
  expect(new Set(items.map(i => i.color)).size).toBe(4);
});

test('graph.legendItems(): a continuous color scale gives one stop per palette color', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);
    var g = d3.easygraph.heatmap({ container: w, height: 200 });
    var beforeData = g.legendItems();               // domain not meaningful yet
    g.update([[0, 50], [50, 100]]);
    var items = g.legendItems();
    g.destroy(); w.remove();
    return { beforeData: beforeData, items: items };
  });
  expect(r.beforeData).toEqual([]);                  // nothing rendered -> nothing to label
  expect(r.items.length).toBeGreaterThan(1);
  expect(r.items[0].value).toBe(0);
  expect(r.items[r.items.length - 1].value).toBe(100);
  expect(r.items[0].label).toBe('0');
});

test('`names` also labels each crosshair row', async ({ page }) => {
  await page.goto(FIXTURE);
  const html = await page.evaluate(() => {
    var w = document.createElement('div'); w.style.width = '500px'; document.body.appendChild(w);
    var g = d3.easygraph.line({
      container: w, height: 200, lines: true, crosshair: true,
      x: { scale: 'linear' }, y: { preset: 'temperatureC' }, names: ['Indoor', 'Outdoor']
    });
    g.update([[{ x: 0, y: 21 }, { x: 1, y: 22 }], [{ x: 0, y: 5 }, { x: 1, y: 6 }]]);
    g._moveCrosshair(g.x.$scale(0));
    var html = g.$crosshairTip.html();
    g.destroy(); w.remove();
    return html;
  });
  expect(html).toContain('Indoor 21°C');
  expect(html).toContain('Outdoor 5°C');
});
