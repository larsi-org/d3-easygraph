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

test('resolvePalette matches colorbrewerPalettes for a bare name', async ({ page }) => {
  await page.goto(FIXTURE);
  const { resolved, direct } = await page.evaluate(() => ({
    resolved: d3.easygraph.resolvePalette('RdYlBu'),
    direct:   d3.easygraph.colorbrewerPalettes['RdYlBu'],
  }));
  expect(resolved).toEqual(direct);
});

test('resolvePalette "_reversed" suffix reverses the color order without mutating the original', async ({ page }) => {
  await page.goto(FIXTURE);
  const { forward, reversed } = await page.evaluate(() => ({
    forward:  d3.easygraph.resolvePalette('RdYlBu'),
    reversed: d3.easygraph.resolvePalette('RdYlBu_reversed'),
  }));
  expect(reversed).toEqual(forward.slice().reverse());
});

test('resolvePalette colorClasses picks a specific class count instead of the largest', async ({ page }) => {
  await page.goto(FIXTURE);
  const four = await page.evaluate(() => d3.easygraph.resolvePalette('Blues', 4));
  expect(four.length).toBe(4);
});

test('colorScale builds a clamped linear scale spanning the palette across the given domain', async ({ page }) => {
  await page.goto(FIXTURE);
  const { first, last, belowMin, aboveMax } = await page.evaluate(() => {
    var scale = d3.easygraph.colorScale('RdYlBu_reversed', [0, 100]);
    var colors = d3.easygraph.resolvePalette('RdYlBu_reversed');
    // d3.scaleLinear's color interpolation normalizes output to an "rgb(...)" string even at an
    // exact stop, so compare parsed color values (d3.rgb) rather than the raw strings.
    return {
      first:    d3.rgb(scale(0)).toString() === d3.rgb(colors[0]).toString(),
      last:     d3.rgb(scale(100)).toString() === d3.rgb(colors[colors.length - 1]).toString(),
      belowMin: scale(-50) === scale(0),  // clamp(true): out-of-domain maps to the nearest end
      aboveMax: scale(500) === scale(100),
    };
  });
  expect(first).toBe(true);
  expect(last).toBe(true);
  expect(belowMin).toBe(true);
  expect(aboveMax).toBe(true);
});

test('colorScale quantize:true builds a quantize scale with PALETTE_COLORS.length discrete bands', async ({ page }) => {
  await page.goto(FIXTURE);
  const { colorCount, bandCount } = await page.evaluate(() => {
    var colors = d3.easygraph.resolvePalette('Blues', 4);
    var scale  = d3.easygraph.colorScale('Blues', [0, 100], { classes: 4, quantize: true });
    return { colorCount: colors.length, bandCount: scale.range().length };
  });
  expect(bandCount).toBe(colorCount);
});

test('label is optional: no label, no preset, no placeholder text needed -- the title renders blank', async ({ page }) => {
  await page.goto(FIXTURE);
  const title = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: '#graph', height: 200 });
    g.update([[{ x: 1, y: 1 }]]);
    var text = document.querySelector('#title').textContent;
    g.destroy();
    return text;
  });
  expect(title).toBe('');
});
