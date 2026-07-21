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
