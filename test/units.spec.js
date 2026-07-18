const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/units.html');

test('resolveUnit fills in label/unit/convert/range from a preset', async ({ page }) => {
  await page.goto(FIXTURE);
  const resolved = await page.evaluate(() => {
    var r = d3.easygraph.resolveUnit({ preset: 'temperatureF' });
    return { label: r.label, unit: r.unit, converted: r.convert(0), range: r.range };
  });
  expect(resolved.label).toBe('Temperature');
  expect(resolved.unit).toBe('°F');
  expect(resolved.converted).toBe(32); // 0°C -> 32°F
  expect(resolved.range).toEqual([-10, 110]);
});

test('resolveUnit defaults convert to the identity function when a preset has none', async ({ page }) => {
  await page.goto(FIXTURE);
  const value = await page.evaluate(() => d3.easygraph.resolveUnit({ preset: 'pressureHpa' }).convert(1013.25));
  expect(value).toBe(1013.25);
});

test('"default" is a real, explicitly-referenceable preset entry, equivalent to no preset at all', async ({ page }) => {
  await page.goto(FIXTURE);
  const [explicit, omitted] = await page.evaluate(() => {
    var a = d3.easygraph.resolveUnit({ preset: 'default', label: 'X' });
    var b = d3.easygraph.resolveUnit({ label: 'X' });
    return [
      { label: a.label, unit: a.unit, scale: a.scale, noTick: a.noTick, converted: a.convert(5) },
      { label: b.label, unit: b.unit, scale: b.scale, noTick: b.noTick, converted: b.convert(5) }
    ];
  });
  expect(explicit).toEqual(omitted);
  expect(explicit).toEqual({ label: 'X', unit: '', scale: 'linear', noTick: undefined, converted: 5 });
});

test('every real preset declares its own scale: "linear" (not just via default)', async ({ page }) => {
  await page.goto(FIXTURE);
  const scales = await page.evaluate(() =>
    Object.keys(d3.easygraph.presets)
      .filter((name) => name !== 'default')
      .map((name) => d3.easygraph.presets[name].scale)
  );
  expect(scales.every((s) => s === 'linear')).toBe(true);
});

test('resolveUnit does not set noTick when the input config and preset are both silent on it', async ({ page }) => {
  await page.goto(FIXTURE);
  const noTick = await page.evaluate(() => d3.easygraph.resolveUnit({ preset: 'temperatureF' }).noTick);
  expect(noTick).toBeUndefined();
});

test('resolveUnit does not mutate the config object passed in', async ({ page }) => {
  await page.goto(FIXTURE);
  const original = await page.evaluate(() => {
    var config = { preset: 'temperatureF' };
    d3.easygraph.resolveUnit(config);
    return config;
  });
  expect(original).toEqual({ preset: 'temperatureF' });
});

test('convertUnit applies a preset\'s convert() function (°C to °F)', async ({ page }) => {
  await page.goto(FIXTURE);
  const [freezing, boiling] = await page.evaluate(() => [
    d3.easygraph.convertUnit(0, 'temperatureF'),
    d3.easygraph.convertUnit(100, 'temperatureF')
  ]);
  expect(freezing).toBe(32);
  expect(boiling).toBe(212);
});

test('convertUnit is a no-op (identity) for presets without an explicit convert()', async ({ page }) => {
  await page.goto(FIXTURE);
  const value = await page.evaluate(() => d3.easygraph.convertUnit(1013.25, 'pressureHpa'));
  expect(value).toBe(1013.25);
});

test('convertUnit accepts a preset name string or an equivalent config object', async ({ page }) => {
  await page.goto(FIXTURE);
  const [byString, byConfig] = await page.evaluate(() => [
    d3.easygraph.convertUnit(20, 'temperatureF'),
    d3.easygraph.convertUnit(20, { preset: 'temperatureF' })
  ]);
  expect(byString).toBe(byConfig);
});

test('works with no chart or container on the page at all', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('svg')).toHaveCount(0);
  const value = await page.evaluate(() => d3.easygraph.convertUnit(10, 'windSpeedMph'));
  expect(value).toBeCloseTo(22.3694, 4);
  await expect(page.locator('svg')).toHaveCount(0);
});
