// x.timeZone / y.timeZone and d3.easygraph.timeFormat: ticks and text in a zone's wall clock, whatever
// zone the viewer is in. The browser runs in Europe/Berlin here, so nothing passes by accident of the
// test machine's own zone; New York switches on 2026-03-08 (02:00 -> 03:00) and 2026-11-01 (02:00 -> 01:00).
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE = 'file://' + path.join(__dirname, 'fixtures/core.html');
test.use({ timezoneId: 'Europe/Berlin' });

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.evaluate(() => {
    window.mk = function (width) {
      var d = document.createElement('div');
      d.style.width = (width || 800) + 'px';
      document.body.appendChild(d);
      return d;
    };
    // a zoned line chart over [from, to] (ISO strings with their offsets), its tick labels and instants
    // (async: the ticks of the chart's first, empty domain leave one animation frame later)
    window.ticksOf = async function (from, to, axisConfig, width) {
      var g = d3.easygraph.line({ container: mk(width), height: 200, duration: 0, x: Object.assign({ type: 'time' }, axisConfig) });
      var a = new Date(from), b = new Date(to);
      g.update([[{ x: a, y: 0 }, { x: b, y: 1 }]], { x: [a, b] });
      await new Promise(function (done) { setTimeout(done, 50); });
      var ticks = g.$plot.selectAll('.easygraph-axis-x .tick');
      var r = { text: ticks.nodes().map(function (n) { return n.textContent; }),
                at: ticks.data().map(function (d) { return d.toISOString(); }) };
      g.destroy();
      return r;
    };
  });
});

test('timeFormat prints a zone\'s wall clock, daylight saving time included, and the viewer\'s zone without one', async ({ page }) => {
  const r = await page.evaluate(() => {
    var winter = new Date(Date.UTC(2026, 10, 18, 19, 0)), summer = new Date(Date.UTC(2026, 6, 15, 19, 0));
    var f = function (zone) { return d3.easygraph.timeFormat('%Y-%m-%d %H:%M', zone); };
    return {
      nyWinter: f('America/New_York')(winter), nySummer: f('America/New_York')(summer),
      phoenixSummer: f('America/Phoenix')(summer), utc: f('UTC')(summer),
      viewer: f()(summer), plainD3: d3.timeFormat('%Y-%m-%d %H:%M')(summer),
      dateName: d3.easygraph.timeFormat('date', 'America/New_York')(new Date(Date.UTC(2026, 10, 19, 3, 0))),
      defaultName: d3.easygraph.timeFormat(null, 'America/New_York')(winter)
    };
  });
  expect(r.nyWinter).toBe('2026-11-18 14:00');        // EST, UTC-5
  expect(r.nySummer).toBe('2026-07-15 15:00');        // EDT, UTC-4
  expect(r.phoenixSummer).toBe('2026-07-15 12:00');   // no daylight saving time, UTC-7 all year
  expect(r.utc).toBe('2026-07-15 19:00');
  expect(r.viewer).toBe('2026-07-15 21:00');          // Berlin summer time
  expect(r.viewer).toBe(r.plainD3);
  expect(r.dateName).toBe('2026-11-18');              // still the 18th in New York
  expect(r.defaultName).toBe('2026-11-18 14:00');     // 'datetime' when no format is named
});

test('day ticks fall on the zone\'s midnights, not the viewer\'s', async ({ page }) => {
  const r = await page.evaluate(async () => ({
    ny:     await ticksOf('2026-11-10T00:00:00-05:00', '2026-11-20T00:00:00-05:00', { timeZone: 'America/New_York' }),
    viewer: await ticksOf('2026-11-10T00:00:00-05:00', '2026-11-20T00:00:00-05:00', {})
  }));
  expect(r.ny.at.length).toBeGreaterThan(4);
  r.ny.at.forEach((iso) => expect(iso).toMatch(/T05:00:00\.000Z$/));     // midnight EST
  r.viewer.at.forEach((iso) => expect(iso).toMatch(/T23:00:00\.000Z$/)); // midnight in Berlin (CET)
  expect(r.ny.text).toContain('Wed 11');   // labels name New York's days
});

test('the fall-back day: ticks every 3 hours of the wall clock, the repeated hour making one gap 4 hours long', async ({ page }) => {
  const r = await page.evaluate(() =>
    ticksOf('2026-11-01T00:00:00-04:00', '2026-11-02T00:00:00-05:00', { timeZone: 'America/New_York' }));
  // the 1st of a month is named by its month, as d3's own ticks do
  expect(r.text).toEqual(['Nov', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', 'Mon 02']);
  const hours = r.at.map((iso) => Date.parse(iso) / 3600000);
  expect(hours[1] - hours[0]).toBe(4);   // 00:00 EDT to 03:00 EST: the clock went 01:00 twice
  expect(hours[2] - hours[1]).toBe(3);
});

test('the spring-forward day: the skipped hour making one gap 2 hours long', async ({ page }) => {
  const r = await page.evaluate(() =>
    ticksOf('2026-03-08T00:00:00-05:00', '2026-03-09T00:00:00-04:00', { timeZone: 'America/New_York' }));
  // a Sunday starts a week, so the 8th is named 'Mar 08', as d3's own ticks do
  expect(r.text).toEqual(['Mar 08', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', 'Mon 09']);
  const hours = r.at.map((iso) => Date.parse(iso) / 3600000);
  expect(hours[1] - hours[0]).toBe(2);   // 00:00 EST to 03:00 EDT
});

test('hourly ticks across the repeated hour: each label once, no tick twice', async ({ page }) => {
  const r = await page.evaluate(() =>
    ticksOf('2026-11-01T00:00:00-04:00', '2026-11-01T03:00:00-05:00', { timeZone: 'America/New_York', tickFormat: '%H:%M' }, 1200));
  expect(new Set(r.at).size).toBe(r.at.length);
  expect(r.text[0]).toBe('00:00');
  expect(r.text[r.text.length - 1]).toBe('03:00');
});

test('a format string, a format name and the shipped ticks follow the zone; a function of your own gets the real Date', async ({ page }) => {
  const r = await page.evaluate(async () => {
    var got = [];
    var own = function (d) { got.push(d instanceof Date ? d.toISOString() : String(d)); return 'x'; };
    var str = await ticksOf('2026-11-10T00:00:00-05:00', '2026-11-12T00:00:00-05:00', { timeZone: 'America/New_York', tickFormat: '%d %H' });
    var name = await ticksOf('2026-11-10T00:00:00-05:00', '2026-11-20T00:00:00-05:00', { timeZone: 'America/New_York', tickFormat: 'date' });
    await ticksOf('2026-11-10T00:00:00-05:00', '2026-11-20T00:00:00-05:00', { timeZone: 'America/New_York', tickFormat: own });
    return { str: str.text, name: name.text, got: got };
  });
  expect(r.str[0]).toBe('10 00');
  expect(r.name).toContain('Wed 11');
  expect(r.got).toContain('2026-11-10T05:00:00.000Z');   // the instant, not a wall-clock Date
});

test('the crosshair tooltip shows the zone\'s time and its short name, EDT or EST', async ({ page }) => {
  const r = await page.evaluate(() => {
    var g = d3.easygraph.line({ container: mk(), height: 200, duration: 0, crosshair: true,
                                x: { type: 'time', timeZone: 'America/New_York' } });
    var summer = new Date('2026-07-15T15:00:00-04:00'), winter = new Date('2026-11-18T14:00:00-05:00');
    g.update([[{ x: summer, y: 1 }, { x: winter, y: 2 }]]);
    g._.moveCrosshair(g.x.$scale(summer));
    var a = g._.$crosshairTip.html();
    g._.moveCrosshair(g.x.$scale(winter));
    var b = g._.$crosshairTip.html();
    g.destroy();
    return { a: a, b: b };
  });
  expect(r.a).toContain('2026-07-15 15:00 EDT');
  expect(r.b).toContain('2026-11-18 14:00 EST');
});

test('zooming keeps the zone\'s ticks', async ({ page }) => {
  const r = await page.evaluate(async () => {
    var g = d3.easygraph.line({ container: mk(), height: 200, duration: 0, zoom: true,
                                x: { type: 'time', timeZone: 'America/New_York' } });
    var a = new Date('2026-11-01T00:00:00-04:00'), b = new Date('2026-12-01T00:00:00-05:00');
    g.update([[{ x: a, y: 0 }, { x: b, y: 1 }]]);
    g._.$pane.call(g._.$zoom.transform, d3.zoomIdentity.scale(8));
    await new Promise(function (done) { setTimeout(done, 50); });
    var wall = d3.easygraph.timeFormat('%H:%M', 'America/New_York');
    var at = g.$plot.selectAll('.easygraph-axis-x .tick').data().map(wall);
    g.destroy();
    return at;
  });
  expect(r.length).toBeGreaterThan(2);
  r.forEach((hm) => expect(hm).toMatch(/^(00|03|06|09|12|15|18|21):00$/));   // whole 3-hour steps of New York's clock
});

test('d3.easygraph.timeZone gives a page the zone\'s month starts, days and short names; left out, the viewer\'s zone', async ({ page }) => {
  const r = await page.evaluate(() => {
    var ny = d3.easygraph.timeZone('America/New_York'), viewer = d3.easygraph.timeZone();
    var t = new Date('2026-11-01T03:30:00Z');   // still Oct 31 in New York (23:30 EDT)
    return {
      nov: ny.instant(new Date(Date.UTC(2026, 10, 1))).toISOString(),
      jul: ny.instant(new Date(Date.UTC(2026, 6, 1))).toISOString(),
      day: ny.wall(t).getUTCDate(), abbr: ny.abbr(t), winter: ny.abbr(new Date('2026-12-01T12:00:00Z')),
      viewerNov: viewer.instant(new Date(Date.UTC(2026, 10, 1))).toISOString(),
      viewerSame: +viewer.instant(new Date(Date.UTC(2026, 10, 1))) === +new Date(2026, 10, 1),
      offset: d3.easygraph.timeZone('+05:45').wall(new Date('2026-01-01T00:00:00Z')).toISOString(),
      offsetAbbr: d3.easygraph.timeZone('-05:00').abbr(new Date('2026-07-01T00:00:00Z'))
    };
  });
  expect(r.nov).toBe('2026-11-01T04:00:00.000Z');   // midnight EDT: the switch is at 02:00
  expect(r.jul).toBe('2026-07-01T04:00:00.000Z');
  expect(r.day).toBe(31);
  expect(r.abbr).toBe('EDT');
  expect(r.winter).toBe('EST');
  expect(r.viewerNov).toBe('2026-10-31T23:00:00.000Z');   // Berlin, CET
  expect(r.viewerSame).toBe(true);
  expect(r.offset).toBe('2026-01-01T05:45:00.000Z');      // a fixed offset: no daylight saving time
  expect(r.offsetAbbr).toBe('GMT-5');
});

test('a fixed offset works as an axis\'s timeZone: ticks on its midnights all year', async ({ page }) => {
  const r = await page.evaluate(() =>
    ticksOf('2026-07-10T00:00:00-05:00', '2026-07-20T00:00:00-05:00', { timeZone: '-05:00' }));
  r.at.forEach((iso) => expect(iso).toMatch(/T05:00:00\.000Z$/));   // midnight at UTC-5 in July too
});

test('timeZone is checked: time axes only, a name the browser knows, and fixed for the chart\'s life', async ({ page }) => {
  const r = await page.evaluate(() => {
    function err(fn) { try { fn(); return null; } catch (e) { return e.message; } }
    var g = d3.easygraph.line({ container: mk(), height: 200, x: { type: 'time', timeZone: 'UTC' } });
    return {
      linear: err(() => d3.easygraph.line({ container: mk(), height: 200, x: { timeZone: 'UTC' } })),
      unknown: err(() => d3.easygraph.line({ container: mk(), height: 200, x: { type: 'time', timeZone: 'America/Rochester' } })),
      number: err(() => d3.easygraph.line({ container: mk(), height: 200, x: { type: 'time', timeZone: -5 } })),
      helper: err(() => d3.easygraph.timeFormat('%H', 'Mars/Olympus')),
      zoneHelper: err(() => d3.easygraph.timeZone('Mars/Olympus')),
      set: err(() => g.set({ x: { timeZone: 'America/New_York' } })),
      typo: err(() => d3.easygraph.line({ container: mk(), height: 200, x: { type: 'time', timezone: 'UTC' } }))
    };
  });
  expect(r.linear).toContain("x.timeZone needs a time axis");
  expect(r.unknown).toContain('is not a time zone this browser knows');
  expect(r.number).toContain('must be an IANA time zone name');
  expect(r.helper).toContain('is not a time zone this browser knows');
  expect(r.zoneHelper).toContain('d3.easygraph.timeZone: name "Mars/Olympus" is not a time zone');
  expect(r.set).toContain('x.timeZone');
  expect(r.typo).toContain("did you mean 'x.timeZone'");
});
