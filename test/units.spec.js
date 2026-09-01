const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/units.html');

test('getUnit returns a preset\'s complete label/unit/scale/convert', async ({ page }) => {
  await page.goto(FIXTURE);
  const resolved = await page.evaluate(() => {
    var u = d3.easygraph.getUnit('temperatureF');
    return { label: u.label, unit: u.unit, scale: u.scale, converted: u.convert(0) };
  });
  expect(resolved.label).toBe('Temperature');
  expect(resolved.unit).toBe('°F');
  expect(resolved.scale).toBe('linear');
  expect(resolved.converted).toBe(32); // 0°C -> 32°F
});

test('presets have no range property -- a sensible axis range is data-dependent, not a fixed property of the quantity', async ({ page }) => {
  await page.goto(FIXTURE);
  const ranges = await page.evaluate(() =>
    Object.keys(d3.easygraph.presets).map((name) => d3.easygraph.presets[name].range)
  );
  expect(ranges.every((r) => r === undefined)).toBe(true);
});

test('getUnit falls back to the "default" preset for a falsy or unrecognized name', async ({ page }) => {
  await page.goto(FIXTURE);
  const [missing, unknown, empty] = await page.evaluate(() => [
    d3.easygraph.getUnit(undefined),
    d3.easygraph.getUnit('notARealPreset'),
    d3.easygraph.getUnit('')
  ].map((u) => ({ unit: u.unit, scale: u.scale, converted: u.convert(5) })));
  const expected = { unit: '', scale: 'linear', converted: 5 };
  expect(missing).toEqual(expected);
  expect(unknown).toEqual(expected);
  expect(empty).toEqual(expected);
});

test('getUnit("default") is the same object as the implicit fallback', async ({ page }) => {
  await page.goto(FIXTURE);
  const isSame = await page.evaluate(() => d3.easygraph.getUnit('default') === d3.easygraph.getUnit());
  expect(isSame).toBe(true);
});

test('every preset (including default) has its own explicit convert function', async ({ page }) => {
  await page.goto(FIXTURE);
  const missing = await page.evaluate(() =>
    Object.keys(d3.easygraph.presets).filter((name) => typeof d3.easygraph.presets[name].convert !== 'function')
  );
  expect(missing).toEqual([]);
});

test('every real preset declares its own scale: "linear"', async ({ page }) => {
  await page.goto(FIXTURE);
  const scales = await page.evaluate(() =>
    Object.keys(d3.easygraph.presets)
      .filter((name) => name !== 'default')
      .map((name) => d3.easygraph.presets[name].scale)
  );
  expect(scales.every((s) => s === 'linear')).toBe(true);
});

test('convert() applies a preset\'s conversion (°C to °F)', async ({ page }) => {
  await page.goto(FIXTURE);
  const [freezing, boiling] = await page.evaluate(() => [
    d3.easygraph.getUnit('temperatureF').convert(0),
    d3.easygraph.getUnit('temperatureF').convert(100)
  ]);
  expect(freezing).toBe(32);
  expect(boiling).toBe(212);
});

test('convert() is a no-op (identity) for presets without a real conversion', async ({ page }) => {
  await page.goto(FIXTURE);
  const value = await page.evaluate(() => d3.easygraph.getUnit('pressureHpa').convert(1013.25));
  expect(value).toBe(1013.25);
});

test('convert(v, d) rounds the converted result to d decimal places', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.getUnit('temperatureF').convert(20.5, 0),  // 68.9 -> 69
    d3.easygraph.getUnit('temperatureF').convert(20.5, 1),  // 68.9 -> 68.9
    d3.easygraph.getUnit('pressureInhg').convert(1000, 2)   // 29.53 -> 29.53
  ]);
  expect(results[0]).toBe(69);
  expect(results[1]).toBe(68.9);
  expect(results[2]).toBe(29.53);
});

test('convert(v) without d stays unrounded, even for presets with a real conversion', async ({ page }) => {
  await page.goto(FIXTURE);
  const value = await page.evaluate(() => d3.easygraph.getUnit('temperatureF').convert(20.55555));
  expect(value).toBeCloseTo(68.99999, 4);
  expect(value).not.toBe(69);
});

test('works with no chart or container on the page at all', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('svg')).toHaveCount(0);
  const value = await page.evaluate(() => d3.easygraph.getUnit('windSpeedMph').convert(10));
  expect(value).toBeCloseTo(22.3694, 4);
  await expect(page.locator('svg')).toHaveCount(0);
});

test('round(x, n) rounds to n decimal places, or the nearest integer when n is omitted/0', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.round(68.549999, 1),
    d3.easygraph.round(68.55, 0),
    d3.easygraph.round(68.55),
    d3.easygraph.round(29.9212, 2)
  ]);
  expect(results).toEqual([68.5, 69, 69, 29.92]);
});

test('compassPoint16(direction) returns the nearest 16-point compass label', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.compassPoint16(0),     // N
    d3.easygraph.compassPoint16(23),    // NNE
    d3.easygraph.compassPoint16(45),    // NE
    d3.easygraph.compassPoint16(68),    // ENE
    d3.easygraph.compassPoint16(90),    // E
    d3.easygraph.compassPoint16(113),   // ESE
    d3.easygraph.compassPoint16(135),   // SE
    d3.easygraph.compassPoint16(158),   // SSE
    d3.easygraph.compassPoint16(180),   // S
    d3.easygraph.compassPoint16(203),   // SSW
    d3.easygraph.compassPoint16(225),   // SW
    d3.easygraph.compassPoint16(248),   // WSW
    d3.easygraph.compassPoint16(270),   // W
    d3.easygraph.compassPoint16(293),   // WNW
    d3.easygraph.compassPoint16(315),   // NW
    d3.easygraph.compassPoint16(338),   // NNW
    d3.easygraph.compassPoint16(360),   // wraps back to N
    d3.easygraph.compassPoint16(-1)     // negative input reads as 359, still N
  ]);
  expect(results).toEqual([
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N', 'N'
  ]);
});

test('compassPoint8(direction) returns the nearest 8-point compass label', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.compassPoint8(0),     // N
    d3.easygraph.compassPoint8(22),    // still N, just under the N/NE boundary
    d3.easygraph.compassPoint8(23),    // NE, just over it
    d3.easygraph.compassPoint8(45),    // NE
    d3.easygraph.compassPoint8(90),    // E
    d3.easygraph.compassPoint8(135),   // SE
    d3.easygraph.compassPoint8(180),   // S
    d3.easygraph.compassPoint8(225),   // SW
    d3.easygraph.compassPoint8(270),   // W
    d3.easygraph.compassPoint8(315),   // NW
    d3.easygraph.compassPoint8(337),   // still NW, just under the NW/N wraparound boundary
    d3.easygraph.compassPoint8(360),   // wraps back to N
    d3.easygraph.compassPoint8(-1)     // negative input reads as 359, still N
  ]);
  expect(results).toEqual(['N', 'N', 'NE', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'NW', 'N', 'N']);
});

test('compassPoint4(direction) returns the nearest 4-point compass label', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.compassPoint4(0),     // N
    d3.easygraph.compassPoint4(44),    // still N, just under the N/E boundary
    d3.easygraph.compassPoint4(46),    // E, just over it
    d3.easygraph.compassPoint4(90),    // E
    d3.easygraph.compassPoint4(134),   // still E, just under the E/S boundary
    d3.easygraph.compassPoint4(135),   // S, exactly on the boundary
    d3.easygraph.compassPoint4(180),   // S
    d3.easygraph.compassPoint4(225),   // W, exactly on the S/W boundary
    d3.easygraph.compassPoint4(270),   // W
    d3.easygraph.compassPoint4(315),   // N, exactly on the W/N wraparound boundary
    d3.easygraph.compassPoint4(360),   // wraps back to N
    d3.easygraph.compassPoint4(-1)     // negative input reads as 359, still N
  ]);
  expect(results).toEqual(['N', 'N', 'E', 'E', 'E', 'S', 'S', 'W', 'W', 'N', 'N', 'N']);
});

test('presets and colorPalettes are extensible -- the documented way to add your own', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    d3.easygraph.presets.soilMoisture =
      { label: 'Soil Moisture', unit: '%', scale: 'linear', convert: function (v) { return v; } };
    d3.easygraph.colorPalettes['Sequential.MyBrand'] = ['#eef', '#88a', '#114'];

    var unit = d3.easygraph.getUnit('soilMoisture');
    var palette = d3.easygraph.resolvePalette('Sequential.MyBrand');
    var reversed = d3.easygraph.resolvePalette('Sequential.MyBrand.reversed');

    var wrap = document.createElement('div');
    wrap.style.width = '400px';
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({
      container: wrap, height: 200, lines: true,
      y: { preset: 'soilMoisture' }, colorPalette: 'Sequential.MyBrand'
    });
    g.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }]]);
    var title = g.$title.text();
    var strokeUsesCustomPalette = g.getPaletteColor(0) === '#eef';
    g.destroy(); wrap.remove();

    delete d3.easygraph.presets.soilMoisture;
    delete d3.easygraph.colorPalettes['Sequential.MyBrand'];
    return { unitLabel: unit.label, unitSymbol: unit.unit, palette, reversed, title, strokeUsesCustomPalette };
  });
  expect(r.unitLabel).toBe('Soil Moisture');
  expect(r.unitSymbol).toBe('%');
  expect(r.palette).toEqual(['#eef', '#88a', '#114']);
  expect(r.reversed).toEqual(['#114', '#88a', '#eef']); // .reversed works on a caller-added name
  expect(r.title).toBe('Soil Moisture [%]');            // a custom preset drives the chart title
  expect(r.strokeUsesCustomPalette).toBe(true);
});
