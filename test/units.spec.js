const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/units.html');

test('getUnit returns a preset\'s complete label/unit/scale/convert/range', async ({ page }) => {
  await page.goto(FIXTURE);
  const resolved = await page.evaluate(() => {
    var u = d3.easygraph.getUnit('temperatureF');
    return { label: u.label, unit: u.unit, scale: u.scale, converted: u.convert(0), range: u.range };
  });
  expect(resolved.label).toBe('Temperature');
  expect(resolved.unit).toBe('°F');
  expect(resolved.scale).toBe('linear');
  expect(resolved.converted).toBe(32); // 0°C -> 32°F
  expect(resolved.range).toEqual([-10, 110]);
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

test('works with no chart or container on the page at all', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('svg')).toHaveCount(0);
  const value = await page.evaluate(() => d3.easygraph.getUnit('windSpeedMph').convert(10));
  expect(value).toBeCloseTo(22.3694, 4);
  await expect(page.locator('svg')).toHaveCount(0);
});
