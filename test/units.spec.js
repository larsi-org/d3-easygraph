const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/units.html');

test('resolveUnit fills in label/unit/m/n/range from a preset', async ({ page }) => {
  await page.goto(FIXTURE);
  const resolved = await page.evaluate(() => d3.easygraph.resolveUnit({ preset: 'temperatureF' }));
  expect(resolved.label).toBe('Temperature');
  expect(resolved.unit).toBe('°F');
  expect(resolved.m).toBe(1.8);
  expect(resolved.n).toBe(32);
  expect(resolved.range).toEqual([-10, 110]);
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

test('convertUnit applies a preset\'s m/n coefficients (°C to °F)', async ({ page }) => {
  await page.goto(FIXTURE);
  const [freezing, boiling] = await page.evaluate(() => [
    d3.easygraph.convertUnit(0, 'temperatureF'),
    d3.easygraph.convertUnit(100, 'temperatureF')
  ]);
  expect(freezing).toBe(32);
  expect(boiling).toBe(212);
});

test('convertUnit is a no-op (m=1, n=0) for presets without explicit coefficients', async ({ page }) => {
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
