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
