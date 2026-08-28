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
    var text = document.querySelector('#title').textContent;
    g.destroy();
    return text;
  });
  expect(title).toBe('');
});
