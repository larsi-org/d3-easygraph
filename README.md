# d3-easygraph

[![Build](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml/badge.svg)](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml)

A small, batteries-included charting library built on [D3](https://d3js.org) v7: lines, filled
areas, zoom, a hover crosshair, stacked/grouped bars (vertical and horizontal), heatmaps, and
scatter plots — all through one consistent config object, with chart width that tracks its
container's rendered size (height stays fixed).

**Live examples and docs:** [larsi.org/easygraph](https://larsi.org/easygraph)

## Chart families

Each chart family has its own constructor, taking only the config that family understands:

| Family | Constructor | Config | Notes |
| --- | --- | --- | --- |
| Line / area | `d3.easygraph.line(config)` | `lines`, `areas`, `zoom`, `crosshair`, `crosshairThreshold`, `interpolate` | Continuous (time or linear) x axis. Zoom and crosshair can be synced across multiple charts via `d3.easygraph.syncZoom`/`syncCrosshair`. |
| Bars | `d3.easygraph.bars(config)` | `orientation` (`'v'`\|`'h'`), `mode` (`'stacked'`\|`'grouped'`), `colorPerData` | Category axis uses a `d3.scaleBand()`. `orientation` is fixed for a chart's lifetime; `mode` can be toggled live. |
| Heatmap | `d3.easygraph.heatmap(config)` | `color` (unit/preset config for the color scale) | A grid of colored cells over plain continuous x/y axes. |
| Scatter | `d3.easygraph.scatter(config)` | `color` (unit/preset config for the color scale), `radius`, `voronoi`, `voronoiOpacity`, `arrows`, `arrowColor`, `arrowMinLength`, `arrowMaxLength`, `arrowHeadLength`, `arrowHeadAngle` | Colored circles at arbitrary `{ x, y, value }` points over plain continuous x/y axes. No geography built in — plot pre-projected pixel coordinates (e.g. lat/lng run through your own `d3.geoProjection`) to overlay points on a map you draw yourself. `voronoi: true` fills the region closer to each point than any other with that point's own color (via `d3.Delaunay`/`.voronoi()`, already part of the full `d3@7` bundle) — semi-transparent by default (`voronoiOpacity`, `0.6`) so a layer underneath stays visible. `arrows: true` draws a directional glyph (shaft + two-line chevron head) on top of any point that also carries `angle` (radians) and `magnitude` — a second, vector-shaped quantity (e.g. wind: speed + direction) layered on a scalar one (`value`'s own color) at the same position; a point missing either field just renders its circle with no arrow. `color`'s domain (like `x`/`y`'s, when data-driven) accepts `clip` — see below. |

Shared config across all four: `container`, `label`, `x`/`y` (`scale`, `unit`, `label`, `noTick`,
`preset`, `convert`, `clip`), `height`, `margin`, `colorPalette`, `duration`, `oneYear` (also used
by heatmaps whose x-axis spans a full year, not just line charts).

Any `x`/`y`/`color` config accepts `clip: [loQuantile, hiQuantile]` (e.g. `[0.05, 0.95]`) — when
that property's domain would otherwise come straight from the data (no explicit `xRange`/`yRange`
passed to `update()`, or `color`, whose domain is always data-driven), it's built from those
quantiles instead of the true min/max, so a single extreme outlier doesn't stretch the whole scale
so far that every other value compresses into one end of it. Omitting `clip` (the default) keeps
the exact same true-min/max behavior. `color` clamps values past the clipped domain to the
nearest end color; `x`/`y` don't clamp — an out-of-clip point just draws past the axis edge.
Bars' value axis always includes zero, so `clip` has no effect there.

`container` accepts a CSS selector string, a DOM element, or a d3 selection. `height` must be a
positive number and `container` must resolve to an element — both are checked at construction time,
throwing a clear error instead of failing cryptically later. Every chart has a `graph.destroy()`
that disconnects its resize observer and tears down its DOM.

`label` is optional. A `y`/`color` `preset` supplies one automatically (e.g. `temperatureF` →
"Temperature"); with no preset and no `label` of your own, the chart's title just renders blank —
there's no generic placeholder to opt out of.

## Unit conversion (no chart required)

The same preset table a chart's `x`/`y`/`color` config resolves a `preset` name against is also
available standalone — no container, no chart construction:

```js
d3.easygraph.getUnit("temperatureF");
// => { label: "Temperature", unit: "°F", scale: "linear", convert: f(v, d) }

d3.easygraph.getUnit("temperatureF").convert(20);      // => 68        (20°C to °F)
d3.easygraph.getUnit("temperatureF").convert(20.44, 1); // => 68.8 (68.792, rounded to 1 decimal)
```

`getUnit(name)` returns the named preset — a complete, ready-to-use `{ label, unit, scale,
convert }` — or the generic `default` entry (empty unit, linear scale, identity `convert`)
for a falsy or unrecognized name. Every preset declares its own `convert(v)`; presets with no real
conversion (most of them — e.g. `relativeHumidity`, `windDirection`) just use the identity
function. Handy for e.g. converting a raw value before coloring or labeling a map marker. No
preset declares a `range` either — a sensible axis range is data-dependent (what a station or
sensor actually observes), not a fixed property of the physical quantity, so charts with no
`range` of their own auto-scale from whatever data is currently loaded.

`convert` optionally takes a second argument, `convert(v, d)`, rounding the converted result to
`d` decimal places via `d3.easygraph.round` — sugar for `round(convert(v), d)` in one call.
`convert(v)` alone stays unrounded, so a consumer that needs full precision (e.g. interpolating a
continuous color scale) isn't forced to lose it. `d3.easygraph.round(x, n)` itself is also public —
a plain explicit-precision helper.

## Usage

d3-easygraph expects `d3` (v7) and [`colorbrewer`](https://www.npmjs.com/package/colorbrewer) to
already be loaded as globals — they're peer dependencies, not bundled.

```html
<div id="graph"></div>

<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/colorbrewer@1.7.0/index.js"></script>
<link rel="stylesheet" href="dist/d3.easygraph.css">
<script src="dist/d3.easygraph.min.js"></script>

<script>
var graph = d3.easygraph.line({
  container: "#graph",
  x:         { scale: "time" },
  y:         { preset: "temperatureC" },
  height:    320,
  margin:    { top: 20, right: 20, bottom: 30, left: 50 },
  lines:     true
});

graph.update([
  [
    { x: new Date("2026-01-01"), y: 3 },
    { x: new Date("2026-01-02"), y: 5 },
    { x: new Date("2026-01-03"), y: 2 }
  ]
]);
</script>
```

`graph.update(data, xRange, yRange)` re-renders with new data (`xRange`/`yRange` optionally
pin the axis domains instead of auto-fitting to the data). Resize handling is automatic — no calls
needed on your end.

## Examples

Live, real-world examples — part of [larsi.org](https://larsi.org), where this library
originated and is still used across its weather/sensors/EnergyPlus/graphics sections (not
included in this repo):

- **Line** — [Hourly Data](https://larsi.org/easygraph/data_hourly.php) (zoom + crosshair, daily
  min/max band toggle), [Multi Hourly Data](https://larsi.org/easygraph/multi_data_hourly.php)
- **Bars** — [Monthly Data](https://larsi.org/easygraph/data_monthly.php) (live
  grouped/stacked toggle), [Multi Monthly Data](https://larsi.org/easygraph/multi_data_monthly.php),
  [Horizontal Bars](https://larsi.org/easygraph/h.php),
  [Sensitivity](https://larsi.org/easygraph/data_sensitivity.php) (`colorPerData`)
- **Heatmap** — [Hourly Data Heat Map](https://larsi.org/easygraph/data_hourly_heatmap.php)
- **Scatter** — [Weather](https://larsi.org/weather/)'s "Pressure & Wind" tab (`voronoi: true`,
  `color.clip`, `arrows: true` overlaying wind speed/direction on top of pressure, overlaid on a
  D3-drawn US map)

## Architecture

- `src/d3.easygraph.core.js` — container sizing/resize, SVG/margin/clip/title scaffolding, palette
  handling, number/time axis formatting, x/y/color config resolution, and the shared `_build()`
  that each constructor calls with its own defaults and hook set.
- `src/d3.easygraph.units.js` — just the unit preset table (`d3.easygraph.presets`) and
  `getUnit(name)`, the standalone lookup above. No config merging, no chart concepts — `core.js` is
  the only thing that folds a resolved preset onto a graph's config, via `getUnit()`.
- `src/d3.easygraph.line.js`, `.bars.js`, `.heatmap.js`, `.scatter.js` — one constructor per chart
  family above, each implementing a small `prepareScales?`/`init?`/`domain`/`render`/`resize?`/
  `destroy?` hook interface (only `domain`/`render` are required; `prepareScales` is bars-only, for
  its band scale; `destroy` is line-only, to remove its `document.body`-appended crosshair
  tooltip).

## Building

```sh
npm install
npm run build
```

Bundles and minifies all six source files (via [terser](https://github.com/terser/terser),
concatenated in dependency order — core first) into the single `dist/d3.easygraph.min.js`.

## Testing

```sh
npm run build
npx playwright install --with-deps chromium   # once per machine
npm test
```

[Playwright](https://playwright.dev) specs in `test/` run against the built `dist/` (via static
`test/fixtures/*.html` pages, loaded over `file://`), covering rendering, live resize, the
`destroy()` teardown, and a couple of hard regressions (zoom baseline staying in sync with the
container's width after a resize; resize never producing a negative bar width). CI runs the same
suite on every push.

## License

MIT — see [LICENSE](LICENSE).
