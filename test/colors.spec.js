const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/colors.html');

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

test('hueWheelPalette returns count [r, g, b] triples, evenly spaced around the hue wheel', async ({ page }) => {
  await page.goto(FIXTURE);
  const { length, isTripleOfNumbers, firstIsRed, distinctCount } = await page.evaluate(() => {
    var palette = d3.easygraph.hueWheelPalette(5);
    var distinct = new Set(palette.map(function(c) { return c.join(','); }));
    return {
      length: palette.length,
      isTripleOfNumbers: palette.every(function(c) {
        return Array.isArray(c) && c.length === 3 && c.every(function(v) { return typeof v === 'number'; });
      }),
      firstIsRed: palette[0][0] > palette[0][1] && palette[0][0] > palette[0][2], // hue 0 = red
      distinctCount: distinct.size,
    };
  });
  expect(length).toBe(5);
  expect(isTripleOfNumbers).toBe(true);
  expect(firstIsRed).toBe(true);
  expect(distinctCount).toBe(5); // 5 evenly-spaced hues should all be visually distinct colors
});

test('hueWheelPalette(count) is deterministic -- same count always produces the same colors', async ({ page }) => {
  await page.goto(FIXTURE);
  const { a, b } = await page.evaluate(() => ({
    a: d3.easygraph.hueWheelPalette(7),
    b: d3.easygraph.hueWheelPalette(7),
  }));
  expect(a).toEqual(b);
});
