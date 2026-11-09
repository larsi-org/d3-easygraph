const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/presets.html');

test('preset returns a preset\'s label/unit/convert; presets carry no scale', async ({ page }) => {
  await page.goto(FIXTURE);
  const resolved = await page.evaluate(() => {
    var u = d3.easygraph.preset('temperatureF');
    return { label: u.label, unit: u.unit, converted: u.convert(0),
             scales: Object.keys(d3.easygraph.presets).filter((n) => 'scale' in d3.easygraph.presets[n]) };
  });
  expect(resolved.label).toBe('Temperature');
  expect(resolved.unit).toBe('°F');
  expect(resolved.converted).toBe(32); // 0°C -> 32°F
  expect(resolved.scales).toEqual([]);
});

test('preset names are quantity + unit, and the old names are gone', async ({ page }) => {
  await page.goto(FIXTURE);
  const names = await page.evaluate(() => Object.keys(d3.easygraph.presets).sort());
  expect(names).toEqual(['batteryStateOfCharge', 'clouds', 'electricCurrent', 'electricPower', 'electricVoltage',
    'pressureHpa', 'pressureInHg', 'rainfallIn', 'rainfallMm', 'relativeHumidity', 'solarRadiation',
    'temperatureC', 'temperatureF', 'windDirection', 'windSpeedKmh', 'windSpeedMph', 'windSpeedMs']);
});

test('presets have no range property - a sensible axis range is data-dependent, not a fixed property of the quantity', async ({ page }) => {
  await page.goto(FIXTURE);
  const ranges = await page.evaluate(() =>
    Object.keys(d3.easygraph.presets).map((name) => d3.easygraph.presets[name].range)
  );
  expect(ranges.every((r) => r === undefined)).toBe(true);
});

test('preset falls back to a no-preset entry for a falsy name and throws on an unrecognized one', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var out = [d3.easygraph.preset(undefined), d3.easygraph.preset('')]
      .map((u) => ({ label: u.label, unit: u.unit, converted: u.convert(5) }));
    function msg(fn) { try { fn(); return ''; } catch (e) { return e.message; } }
    return {
      out: out,
      same: d3.easygraph.preset() === d3.easygraph.preset(''),
      unknown: msg(function() { d3.easygraph.preset('temprature'); }),
      defaultGone: msg(function() { d3.easygraph.preset('default'); }),
      inherited: msg(function() { d3.easygraph.preset('toString'); }),
      inChart: msg(function() {
        var w = document.createElement('div'); document.body.appendChild(w);
        d3.easygraph.line({ container: w, height: 200, y: { preset: 'temprature' } });
      }),
      old: typeof d3.easygraph['get' + 'Unit']
    };
  });
  const expected = { label: undefined, unit: '', converted: 5 };
  expect(r.out[0]).toEqual(expected);
  expect(r.out[1]).toEqual(expected);
  expect(r.same).toBe(true);
  expect(r.unknown).toContain('unrecognized preset "temprature"');
  expect(r.defaultGone).toContain('unrecognized preset "default"');
  expect(r.inherited).toContain('unrecognized preset');
  expect(r.inChart).toContain('unrecognized preset');
  expect(r.old).toBe('undefined');
});

test('every preset has a convert function', async ({ page }) => {
  await page.goto(FIXTURE);
  const missing = await page.evaluate(() =>
    Object.keys(d3.easygraph.presets).filter((name) => typeof d3.easygraph.presets[name].convert !== 'function')
  );
  expect(missing).toEqual([]);
});

test('convert() applies a preset\'s conversion (°C to °F)', async ({ page }) => {
  await page.goto(FIXTURE);
  const [freezing, boiling] = await page.evaluate(() => [
    d3.easygraph.preset('temperatureF').convert(0),
    d3.easygraph.preset('temperatureF').convert(100)
  ]);
  expect(freezing).toBe(32);
  expect(boiling).toBe(212);
});

test('convert() is a no-op (identity) for presets without a real conversion', async ({ page }) => {
  await page.goto(FIXTURE);
  const value = await page.evaluate(() => d3.easygraph.preset('pressureHpa').convert(1013.25));
  expect(value).toBe(1013.25);
});

test('convertRounded(v, d) rounds the converted result', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.preset('temperatureF').convertRounded(20.5, 0),  // 68.9 -> 69
    d3.easygraph.preset('temperatureF').convertRounded(20.5, 1),  // 68.9 -> 68.9
    d3.easygraph.preset('pressureInHg').convertRounded(1000, 2)   // 29.53 -> 29.53
  ]);
  expect(results[0]).toBe(69);
  expect(results[1]).toBe(68.9);
  expect(results[2]).toBe(29.53);
});

test('convert(v) without d stays unrounded, even for presets with a real conversion', async ({ page }) => {
  await page.goto(FIXTURE);
  const value = await page.evaluate(() => d3.easygraph.preset('temperatureF').convert(20.55555));
  expect(value).toBeCloseTo(68.99999, 4);
  expect(value).not.toBe(69);
});

test('works with no chart or container on the page at all', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('svg')).toHaveCount(0);
  const value = await page.evaluate(() => d3.easygraph.preset('windSpeedMph').convert(10));
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

test('compassPoint(direction) returns the nearest 16-point compass label', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.compassPoint(0),     // N
    d3.easygraph.compassPoint(23),    // NNE
    d3.easygraph.compassPoint(45),    // NE
    d3.easygraph.compassPoint(68),    // ENE
    d3.easygraph.compassPoint(90),    // E
    d3.easygraph.compassPoint(113),   // ESE
    d3.easygraph.compassPoint(135),   // SE
    d3.easygraph.compassPoint(158),   // SSE
    d3.easygraph.compassPoint(180),   // S
    d3.easygraph.compassPoint(203),   // SSW
    d3.easygraph.compassPoint(225),   // SW
    d3.easygraph.compassPoint(248),   // WSW
    d3.easygraph.compassPoint(270),   // W
    d3.easygraph.compassPoint(293),   // WNW
    d3.easygraph.compassPoint(315),   // NW
    d3.easygraph.compassPoint(338),   // NNW
    d3.easygraph.compassPoint(360),   // wraps back to N
    d3.easygraph.compassPoint(-1)     // negative input reads as 359, still N
  ]);
  expect(results).toEqual([
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N', 'N'
  ]);
});

test('compassPoint(direction, 8) returns the nearest 8-point compass label', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.compassPoint(0, 8),     // N
    d3.easygraph.compassPoint(22, 8),    // still N, just under the N/NE boundary
    d3.easygraph.compassPoint(23, 8),    // NE, just over it
    d3.easygraph.compassPoint(45, 8),    // NE
    d3.easygraph.compassPoint(90, 8),    // E
    d3.easygraph.compassPoint(135, 8),   // SE
    d3.easygraph.compassPoint(180, 8),   // S
    d3.easygraph.compassPoint(225, 8),   // SW
    d3.easygraph.compassPoint(270, 8),   // W
    d3.easygraph.compassPoint(315, 8),   // NW
    d3.easygraph.compassPoint(337, 8),   // still NW, just under the NW/N wraparound boundary
    d3.easygraph.compassPoint(360, 8),   // wraps back to N
    d3.easygraph.compassPoint(-1, 8)     // negative input reads as 359, still N
  ]);
  expect(results).toEqual(['N', 'N', 'NE', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'NW', 'N', 'N']);
});

test('compassPoint(direction, 4) returns the nearest 4-point compass label', async ({ page }) => {
  await page.goto(FIXTURE);
  const results = await page.evaluate(() => [
    d3.easygraph.compassPoint(0, 4),     // N
    d3.easygraph.compassPoint(44, 4),    // still N, just under the N/E boundary
    d3.easygraph.compassPoint(46, 4),    // E, just over it
    d3.easygraph.compassPoint(90, 4),    // E
    d3.easygraph.compassPoint(134, 4),   // still E, just under the E/S boundary
    d3.easygraph.compassPoint(135, 4),   // S, exactly on the boundary
    d3.easygraph.compassPoint(180, 4),   // S
    d3.easygraph.compassPoint(225, 4),   // W, exactly on the S/W boundary
    d3.easygraph.compassPoint(270, 4),   // W
    d3.easygraph.compassPoint(315, 4),   // N, exactly on the W/N wraparound boundary
    d3.easygraph.compassPoint(360, 4),   // wraps back to N
    d3.easygraph.compassPoint(-1, 4)     // negative input reads as 359, still N
  ]);
  expect(results).toEqual(['N', 'N', 'E', 'E', 'E', 'S', 'S', 'W', 'W', 'N', 'N', 'N']);
});

test('compassPoint takes only 16, 8 or 4 points; the three old functions are gone', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function msg(fn) { try { fn(); return ''; } catch (e) { return e.message; } }
    return { bad: msg(() => d3.easygraph.compassPoint(10, 32)),
             old: ['compassPoint16', 'compassPoint8', 'compassPoint4'].map((n) => typeof d3.easygraph[n]) };
  });
  expect(r.bad).toContain('points must be 16, 8 or 4');
  expect(r.old).toEqual(['undefined', 'undefined', 'undefined']);
});

test('presets and palettes are extensible - the documented way to add your own', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    d3.easygraph.presets.soilMoisture =
      { label: 'Soil Moisture', unit: '%' };   // convert is optional
    d3.easygraph.palettes['Sequential.MyBrand'] = ['#eef', '#88a', '#114'];

    var unit = d3.easygraph.preset('soilMoisture');
    var filled = [unit.convert(7), unit.convertRounded(7.26, 1)];
    var palette = d3.easygraph.palette('Sequential.MyBrand');
    var reversed = d3.easygraph.palette('Sequential.MyBrand', { reverse: true });

    var wrap = document.createElement('div');
    wrap.style.width = '400px';
    document.body.appendChild(wrap);
    var g = d3.easygraph.line({
      container: wrap, height: 200, lines: true,
      y: { preset: 'soilMoisture' }, color: { palette: 'Sequential.MyBrand' }
    });
    g.update([[{ x: 0, y: 1 }, { x: 1, y: 2 }]]);
    var title = g.$yTitle.text();
    var strokeUsesCustomPalette = g.paletteColor(0) === '#eef';
    g.destroy(); wrap.remove();

    delete d3.easygraph.presets.soilMoisture;
    delete d3.easygraph.palettes['Sequential.MyBrand'];
    return { unitLabel: unit.label, unitSymbol: unit.unit, filled, palette, reversed, title, strokeUsesCustomPalette };
  });
  expect(r.unitLabel).toBe('Soil Moisture');
  expect(r.unitSymbol).toBe('%');
  expect(r.filled).toEqual([7, 7.3]);              // preset() fills in convert and convertRounded
  expect(r.palette).toEqual(['#eef', '#88a', '#114']);
  expect(r.reversed).toEqual(['#114', '#88a', '#eef']); // reverse works on a caller-added name
  expect(r.title).toBe('Soil Moisture [%]');            // a custom preset drives the y axis title
  expect(r.strokeUsesCustomPalette).toBe(true);
});

test('bandStats and bandStatsFromSums give mean +- k sigma clamped into [min, max]; empty input gives nulls', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var e = d3.easygraph;
    var vals = [2, 4, 4, 4, 5, 5, 7, 9]; // mean 5, population sigma 2
    var sums = vals.reduce(function(t, v) { t.sum += v; t.sumSq += v * v; t.count++; return t; },
                           { sum: 0, sumSq: 0, count: 0, min: 2, max: 9 });
    return {
      arr: e.bandStats(vals),
      fromSums: e.bandStatsFromSums(sums),
      k2: e.bandStats(vals, 2),
      skips: e.bandStats([1, null, NaN, undefined, 3, Infinity]),
      skewed: e.bandStats([0, 0, 0, 0, 0, 0, 0, 0, 0, 10]), // mean 1, sigma 3: mean - sigma is below the min
      same: e.bandStats([5, 5, 5]),
      empty: e.bandStats([]),
      none: e.bandStatsFromSums(null)
    };
  });
  expect(r.arr).toEqual({ count: 8, mean: 5, min: 2, max: 9, sigmaMin: 3, sigmaMax: 7 });
  expect(r.fromSums).toEqual(r.arr);
  expect(r.k2.sigmaMin).toBe(2);   // 5 - 4 = 1, clamped up to the min of 2
  expect(r.k2.sigmaMax).toBe(9);   // 5 + 4 = 9
  expect(r.skips.count).toBe(2);
  expect(r.skips.mean).toBe(2);
  expect(r.skewed.sigmaMin).toBe(0);  // clamped, not -2
  expect(r.same).toEqual({ count: 3, mean: 5, min: 5, max: 5, sigmaMin: 5, sigmaMax: 5 });
  expect(r.empty).toEqual({ count: 0, mean: null, min: null, max: null, sigmaMin: null, sigmaMax: null });
  expect(r.none.count).toBe(0);
});
