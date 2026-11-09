const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/colors.html');

test('palette(name) matches the palettes table for a bare name', async ({ page }) => {
  await page.goto(FIXTURE);
  const { resolved, direct } = await page.evaluate(() => ({
    resolved: d3.easygraph.palette('Diverging.RdYlBu'),
    direct:   d3.easygraph.palettes['Diverging.RdYlBu'],
  }));
  expect(resolved).toEqual(direct);
});

test('palette(name, { reverse: true }) reverses the color order without mutating the original', async ({ page }) => {
  await page.goto(FIXTURE);
  const { forward, reversed } = await page.evaluate(() => ({
    forward:  d3.easygraph.palette('Diverging.RdYlBu'),
    reversed: d3.easygraph.palette('Diverging.RdYlBu', { reverse: true }),
  }));
  expect(reversed).toEqual(forward.slice().reverse());
});

test('palette(name, { classes }) picks a specific class count instead of the largest', async ({ page }) => {
  await page.goto(FIXTURE);
  const four = await page.evaluate(() => d3.easygraph.palette('Sequential.Blues', { classes: 4 }));
  expect(four.length).toBe(4);
});

test('default colorPalette is Qualitative.Tableau10', async ({ page }) => {
  await page.goto(FIXTURE);
  const { paletteColors, d3Tableau } = await page.evaluate(() => {
    var div = document.createElement('div');
    div.id = 'temp-graph';
    document.body.appendChild(div);
    var graph = d3.easygraph.line({ container: '#temp-graph', height: 100 });
    var result = { paletteColors: graph.paletteColors, d3Tableau: d3.schemeTableau10 };
    graph.destroy();
    div.remove();
    return result;
  });
  expect(paletteColors).toEqual(d3Tableau);
});

test('Qualitative.Category10 was removed - palette() no longer resolves it', async ({ page }) => {
  await page.goto(FIXTURE);
  const threw = await page.evaluate(() => {
    try {
      d3.easygraph.palette('Qualitative.Category10');
      return false;
    } catch (e) {
      return true;
    }
  });
  expect(threw).toBe(true);
});

test('palette() throws a clear, named error for an unrecognized palette - not a cryptic TypeError', async ({ page }) => {
  await page.goto(FIXTURE);
  const message = await page.evaluate(() => {
    try {
      d3.easygraph.palette('Sequential.NotARealPalette');
      return null;
    } catch (e) {
      return e.message;
    }
  });
  expect(message).toContain('unrecognized palette');
  expect(message).toContain('Sequential.NotARealPalette');
});

test('Qualitative.Tableau10 and Qualitative.Observable10 resolve to d3-scale-chromatic\'s own schemes', async ({ page }) => {
  await page.goto(FIXTURE);
  const { tableau, observable, d3Tableau, d3Observable } = await page.evaluate(() => ({
    tableau:    d3.easygraph.palette('Qualitative.Tableau10'),
    observable: d3.easygraph.palette('Qualitative.Observable10'),
    d3Tableau:    d3.schemeTableau10,
    d3Observable: d3.schemeObservable10,
  }));
  expect(tableau).toEqual(d3Tableau);
  expect(observable).toEqual(d3Observable);
});

test('colorScale builds a clamped linear scale spanning the palette across the given domain', async ({ page }) => {
  await page.goto(FIXTURE);
  const { first, last, belowMin, aboveMax } = await page.evaluate(() => {
    var scale = d3.easygraph.colorScale({ palette: 'Diverging.RdYlBu', reverse: true, domain: [0, 100] });
    var colors = d3.easygraph.palette('Diverging.RdYlBu', { reverse: true });
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

test('colorScale quantize:true builds a quantize scale with palette-length discrete bands', async ({ page }) => {
  await page.goto(FIXTURE);
  const { colorCount, bandCount } = await page.evaluate(() => {
    var colors = d3.easygraph.palette('Sequential.Blues', { classes: 4 });
    var scale  = d3.easygraph.colorScale({ palette: 'Sequential.Blues', domain: [0, 100], classes: 4, quantize: true });
    return { colorCount: colors.length, bandCount: scale.range().length };
  });
  expect(bandCount).toBe(colorCount);
});

test('a ".reversed" name throws and points at { reverse: true }; option typos throw', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    function msg(fn) { try { fn(); return null; } catch (e) { return e.message; } }
    return {
      suffix:      msg(() => d3.easygraph.palette('Diverging.RdBu.reversed')),
      paletteOpt:  msg(() => d3.easygraph.palette('Diverging.RdBu', { revers: true })),
      scaleOpt:    msg(() => d3.easygraph.colorScale({ palette: 'Diverging.RdBu', domain: [0, 1], qantize: true })),
      noDomain:    msg(() => d3.easygraph.colorScale({ palette: 'Diverging.RdBu' })),
      oldSignature: msg(() => d3.easygraph.colorScale('Diverging.RdBu', [0, 1]))
    };
  });
  expect(r.suffix).toContain('{ reverse: true }');
  expect(r.paletteOpt).toContain("did you mean 'options.reverse'");
  expect(r.scaleOpt).toContain("did you mean 'options.quantize'");
  expect(r.noDomain).toContain('domain must be [min, max]');
  expect(r.oldSignature).toContain('options must be an object');
});

test('classes is ignored for a Qualitative palette, which is not classed data', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => ({
    four: d3.easygraph.palette('Qualitative.Set1', { classes: 4 }),
    all:  d3.easygraph.palette('Qualitative.Set1')
  }));
  expect(r.four).toEqual(r.all);
});

test('Sequential.Turbo resolves via d3.interpolateTurbo, since d3.schemeTurbo does not exist', async ({ page }) => {
  await page.goto(FIXTURE);
  const { hasScheme, hasInterpolate, nine, first, last } = await page.evaluate(() => ({
    hasScheme:      typeof d3.schemeTurbo !== 'undefined',
    hasInterpolate: typeof d3.interpolateTurbo === 'function',
    nine:  d3.easygraph.palette('Sequential.Turbo').length,
    first: d3.rgb(d3.easygraph.palette('Sequential.Turbo')[0]).toString(),
    last:  d3.rgb(d3.easygraph.palette('Sequential.Turbo')[8]).toString(),
  }));
  expect(hasScheme).toBe(false);
  expect(hasInterpolate).toBe(true);
  expect(nine).toBe(9); // DEFAULT_INTERPOLATE_SAMPLES
  expect(first).not.toBe(last);
});

test('palette() classes picks the sample count for an interpolate-only scheme too', async ({ page }) => {
  await page.goto(FIXTURE);
  const length = await page.evaluate(() => d3.easygraph.palette('Sequential.Turbo', { classes: 24 }).length);
  expect(length).toBe(24);
});

test('every shipped palette is an external scheme: no site-specific names, Category20* named like the rest', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    var names = Object.keys(d3.easygraph.palettes);
    return {
      siteSpecific: names.filter(function (n) { return n.indexOf('LS-') > -1; }),
      // Category20* are D3's own published schemes, hardcoded only because d3-scale-chromatic
      // dropped them in v5, so they stay named like any other external set
      category20: names.filter(function (n) { return n.indexOf('Category20') > -1; }).sort(),
      externals: ['Qualitative.Tableau10', 'Qualitative.Observable10', 'Sequential.Turbo', 'Qualitative.Set1']
        .every(function (n) { return names.indexOf(n) > -1; })
    };
  });
  expect(r.siteSpecific).toEqual([]);
  expect(r.category20).toEqual(['Qualitative.Category20', 'Qualitative.Category20b', 'Qualitative.Category20c']);
  expect(r.externals).toBe(true);
});

test('a palette you add resolves, reverses, and drives a color scale like any shipped one', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => {
    d3.easygraph.palettes['Qualitative.MyArc'] = ['#F84', '#FC4', '#B12'];
    d3.easygraph.palettes['Diverging.MyBlueRed'] = ['#00F', '#F0F', '#F00'];
    var fwd = d3.easygraph.palette('Qualitative.MyArc');
    var rev = d3.easygraph.palette('Qualitative.MyArc', { reverse: true });
    var scale = d3.easygraph.colorScale({ palette: 'Diverging.MyBlueRed', domain: [0, 100] });
    return { fwd: fwd, rev: rev, scaleEnds: [d3.rgb(scale(0)).toString(), d3.rgb(scale(100)).toString()] };
  });
  expect(r.fwd).toEqual(['#F84', '#FC4', '#B12']);
  expect(r.rev).toEqual(['#B12', '#FC4', '#F84']);
  expect(r.scaleEnds).toEqual(['rgb(0, 0, 255)', 'rgb(255, 0, 0)']);
});

test('standalone legendItems zips colors and labels, and accepts a palette name', async ({ page }) => {
  await page.goto(FIXTURE);
  const r = await page.evaluate(() => ({
    fromArray:  d3.easygraph.legendItems(['#f00', '#0f0', '#00f'], ['Not Yet', 'Visited', 'Lived']),
    fromName:   (d3.easygraph.palettes['Qualitative.MyArc'] = ['#F84', '#FC4', '#B12'],
                 d3.easygraph.legendItems('Qualitative.MyArc', ['Sunrise', 'Noon', 'Sunset'])),
    noLabels:   d3.easygraph.legendItems(['#f00', '#0f0']),
    shortLabels: d3.easygraph.legendItems(['#f00', '#0f0', '#00f'], ['only one'])
  }));
  expect(r.fromArray).toEqual([
    { index: 0, color: '#f00', label: 'Not Yet' },
    { index: 1, color: '#0f0', label: 'Visited' },
    { index: 2, color: '#00f', label: 'Lived' }
  ]);
  expect(r.fromName.map(i => i.color)).toEqual(['#F84', '#FC4', '#B12']); // resolved by name
  expect(r.fromName[2].label).toBe('Sunset');
  expect(r.noLabels.map(i => i.label)).toEqual([undefined, undefined]);
  // a colors-longer-than-labels list still yields one row per color, no generated placeholder
  expect(r.shortLabels.length).toBe(3);
  expect(r.shortLabels[1].label).toBeUndefined();
});
