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
| Line / area | `d3.easygraph.line(config)` | `lines`, `areas`, `zoom`, `crosshair`, `crosshairThreshold`, `interpolate` | Continuous (time or linear) x axis. Zoom and crosshair can be synced across multiple charts via `d3.easygraph.syncZoom`/`syncCrosshair`. A point with `y: null` (or, for areas, `min`/`max: null`) breaks the line/area into a separate subpath there instead of drawing a straight segment through the gap — handy for a circular quantity like compass bearing, where a caller can insert a `null`-y point at each wraparound so the chart doesn't draw a false diagonal from 359° to 0°. |
| Bars | `d3.easygraph.bars(config)` | `orientation` (`'v'`\|`'h'`), `mode` (`'stacked'`\|`'grouped'`), `colorPerData` | Category axis uses a `d3.scaleBand()`. `orientation` is fixed for a chart's lifetime; `mode` can be toggled live. |
| Heatmap | `d3.easygraph.heatmap(config)` | `color` (unit/preset config for the color scale) | A grid of colored cells over plain continuous x/y axes. |
| Scatter | `d3.easygraph.scatter(config)` | `color` (unit/preset config for the color scale, or a fixed `domain: [min, max]`), `radius`, `pointStrokeWidth`, `voronoi`, `voronoiOpacity`, `arrows`, `arrowColor`, `arrowStrokeWidth`, `arrowMinLength`, `arrowMaxLength`, `arrowHeadLength`, `arrowHeadAngle`, `labels`, `labelSize`, `labelOffset`, `labelMinZoom` | Colored circles at arbitrary `{ x, y, value }` points over plain continuous x/y axes. No geography built in — plot pre-projected pixel coordinates (e.g. lat/lng run through your own `d3.geoProjection`) to overlay points on a map you draw yourself. `voronoi: true` fills the region closer to each point than any other with that point's own color (via `d3.Delaunay`/`.voronoi()`, already part of the full `d3@7` bundle) — semi-transparent by default (`voronoiOpacity`, `0.6`) so a layer underneath stays visible. `arrows: true` draws a directional glyph (shaft + two-line chevron head) on top of any point that also carries `angle` (radians) and `magnitude` — a second, vector-shaped quantity (e.g. wind: speed + direction) layered on a scalar one (`value`'s own color) at the same position; a point missing either field just renders its circle with no arrow. `labels: true` draws each point's `label` (a string); a point missing it renders without one, and every label stays hidden below `labelMinZoom` (default 1, i.e. always on) for a caller with too many points to label all of them at once. `color`'s domain (like `x`/`y`'s, when data-driven) accepts `clip` — see below — or can be fixed outright via `color.domain: [min, max]`, so a value maps to the same color snapshot to snapshot instead of shifting as the current data's own spread changes (e.g. altitude). `graph.rescale(k)` shrinks point/arrow radius, length, and stroke-width, and label size, by `1/k` and re-renders — for a caller layering its own SVG-transform zoom on top (e.g. a zoomable map background) so markers stay a constant on-screen size instead of growing with the zoom. `color.quantize: true` swaps the usual continuous gradient for `PALETTE_COLORS.length` discrete, equal-width color bands over the domain — better than a smooth interpolation for data with a few clearly separated ranges (e.g. aircraft altitude: a low/climbing band vs. a distinct cruise band), especially paired with `colorClasses` (below) to control how many bands come out of a colorbrewer palette. |

Shared config across all four: `container`, `label`, `x`/`y` (`scale`, `unit`, `label`, `noTick`,
`preset`, `convert`, `clip`), `height`, `margin`, `colorPalette`, `colorClasses`, `duration`,
`oneYear` (also used by heatmaps whose x-axis spans a full year, not just line charts).
`colorClasses` (e.g. `4`) picks that specific class count from a colorbrewer palette instead of
its largest available one (colorbrewer ships 3–9 shades per named palette); ignored for the
`D3_category*`/`LS_*` palettes, which aren't classed data.

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

## Color palettes (no chart required)

The same `colorPalette`/`colorClasses` resolution a chart's `PALETTE_COLORS` goes through
internally is also available standalone — no container, no chart construction:

```js
d3.easygraph.resolvePalette("RdYlBu");            // => ["#a50026", "#d73027", ..., "#313695"]
d3.easygraph.resolvePalette("RdYlBu_reversed");    // same colors, reversed order
d3.easygraph.resolvePalette("Blues", 4);           // the 4-class Blues, not its largest class count

d3.easygraph.colorScale("RdYlBu_reversed", [dataMin, dataMax]);
// => a ready d3.scaleLinear, clamped, with RdYlBu_reversed's colors spread evenly across the domain
d3.easygraph.colorScale("Blues", [dataMin, dataMax], { classes: 4, quantize: true });
// => a d3.scaleQuantize instead — PALETTE_COLORS.length discrete, equal-width bands
```

Handy for coloring something that isn't a d3-easygraph chart at all — a Leaflet marker layer, a
`d3.parcoords()` line — without hand-rolling a separate color scale or duplicating a palette
you've already named here. `d3.easygraph.colorbrewerPalettes` (the full resolved `{name:
[colors]}` map `resolvePalette` reads from) is public too, for a caller that wants to list every
available palette name (see the [Colorbrewer demo page](https://larsi.org/graphics/colorbrewer/)).

`resolvePalette`/`colorScale` are both name-based lookups — for a caller that instead needs an
arbitrary, caller-chosen *count* of colors with no natural name (a polygon's side count, an IFS's
transform count), `categoricalPalette(count)` generates one instead of looking one up:

```js
d3.easygraph.categoricalPalette(5);
// => [[217,38,38], [181,217,38], [38,217,110], [38,110,217], [181,38,217]] -- 5 evenly-spaced hues
```

Evenly spaced hues around the color wheel, for unordered categorical data (a vertex id, a
transform id) — not the right fit for *ordered* data, where two adjacent categories landing on
similar hues near the wheel's wraparound would misleadingly suggest they're related; use
`colorScale` with a sequential scheme for that instead. Returns `[r, g, b]` number triples rather
than the CSS-string colors everywhere else on this page — built for consumers that write colors
directly into a `Canvas` `ImageData` buffer (larsi.org's point-cloud fractal renderers) and need
the numbers as-is, not a string to re-parse.

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
  `color.clip`, `arrows: true` overlaying wind speed/direction on top of pressure) and
  [Air Traffic](https://larsi.org/air-traffic/) (`color.domain` + `color.quantize`/`colorClasses`
  for four discrete altitude bands instead of a continuous gradient, `labels`/`labelMinZoom` for
  callsigns once zoomed in) — both overlaid on a D3-drawn US map via a shared pan/zoom helper (not
  part of this repo) that drives `graph.rescale(k)` to keep points and arrows a constant size
  through the zoom

## Architecture

- `src/d3.easygraph.core.js` — container sizing/resize, SVG/margin/clip/title scaffolding,
  number/time axis formatting, x/y/color config resolution, and the shared `_build()` that each
  constructor calls with its own defaults and hook set.
- `src/d3.easygraph.units.js` — just the unit preset table (`d3.easygraph.presets`) and
  `getUnit(name)`, the standalone lookup above. No config merging, no chart concepts — `core.js` is
  the only thing that folds a resolved preset onto a graph's config, via `getUnit()`.
- `src/d3.easygraph.colors.js` — `colorbrewerPalettes`/`resolvePalette`/`colorScale` (named lookup)
  and `categoricalPalette` (generated), the standalone palette functions above. Same division of
  labor as units.js: no chart concepts here, `core.js` is the only thing that folds a resolved
  palette onto `graph.PALETTE_COLORS`.
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
