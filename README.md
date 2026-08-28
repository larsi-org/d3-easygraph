# d3-easygraph

[![Build](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml/badge.svg)](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml)

A small, batteries-included charting library built on [D3](https://d3js.org) v7: lines, min/max
ribbon bands, zoom, a hover crosshair, stacked/grouped bars (vertical and horizontal), heatmaps,
and scatter plots — all through one consistent config object, with chart width that tracks its
container's rendered size (height stays fixed).

**Live examples and docs:** [larsi.org/easygraph](https://larsi.org/easygraph)

## Chart families

Each chart family has its own constructor, taking only the config that family understands:

| Family | Constructor | Config | Notes |
| --- | --- | --- | --- |
| Line / ribbon | `d3.easygraph.line(config)` | `lines`, `ribbons`, `stackedArea`, `zoom`, `crosshair`, `crosshairThreshold`, `curve`, `units` | Continuous (time or linear) x axis. Zoom and crosshair can be synced across multiple charts via `d3.easygraph.syncZoom`/`syncCrosshair`. `ribbons` draws a filled min/max band per series (e.g. a daily high/low range around a mean line) — not a stacked/cumulative area chart; `stackedArea` is that — plain `{ x, y }` points like `lines`, each series' area stacked cumulatively on top of the ones before it (a classic stacked area chart), y axis always including zero regardless of `clip`, same as bars' stacked mode. Series are stacked by array index, so (like bars' stacked mode) they need to be sampled at the same x positions to align correctly. A point with `y: null` (or, for ribbons, `min`/`max: null`) breaks the line/ribbon/stacked-area into a separate subpath there instead of drawing a straight segment through the gap — handy for a circular quantity like compass bearing, where a caller can insert a `null`-y point at each wraparound so the chart doesn't draw a false diagonal from 359° to 0°. `units: ["°F", "%"]` gives the crosshair tooltip a different unit string per series (index-matched to the series arrays passed to `update()`) — for a multi-series chart mixing quantities, where the single shared `y` preset's `unit` isn't right for all of them; a series past the end of `units`, or with a falsy entry, falls back to the shared `graph.unit`. |
| Bars | `d3.easygraph.bars(config)` | `orientation` (`'vertical'`\|`'horizontal'`), `mode` (`'stacked'`\|`'grouped'`), `colorPerData` | Category axis uses a `d3.scaleBand()`. `orientation` is fixed for a chart's lifetime; `mode` can be toggled live. `colorPerData: true` colors each bar from its own `color` field instead of the series' palette color. |
| Heatmap | `d3.easygraph.heatmap(config)` | `color` (unit/preset config for the color scale) | A grid of colored cells over plain continuous x/y axes. |
| Scatter | `d3.easygraph.scatter(config)` | `color` (unit/preset config for the color scale, or a fixed `domain: [min, max]`), `radius`, `pointStrokeWidth`, `voronoi`, `voronoiOpacity`, `arrows`, `arrowColor`, `arrowStrokeWidth`, `arrowMinLength`, `arrowMaxLength`, `arrowHeadLength`, `arrowHeadAngle`, `labels`, `labelSize`, `labelOffset`, `labelMinZoom` | Colored circles at arbitrary `{ x, y, value }` points over plain continuous x/y axes. No geography built in — plot pre-projected pixel coordinates (e.g. lat/lng run through your own `d3.geoProjection`) to overlay points on a map you draw yourself. A point's own `radius` overrides the graph-level `radius` config for just that point (a bubble chart: point size driven by a third data dimension, independent of `value`'s color) — a point missing it just uses the graph's own radius. `voronoi: true` fills the region closer to each point than any other with that point's own color (via `d3.Delaunay`/`.voronoi()`, already part of the full `d3@7` bundle) — semi-transparent by default (`voronoiOpacity`, `0.6`) so a layer underneath stays visible. `arrows: true` draws a directional glyph (shaft + two-line chevron head) on top of any point that also carries `angle` (radians) and `magnitude` — a second, vector-shaped quantity (e.g. wind: speed + direction) layered on a scalar one (`value`'s own color) at the same position; a point missing either field just renders its circle with no arrow. `labels: true` draws each point's `label` (a string); a point missing it renders without one, and every label stays hidden below `labelMinZoom` (default 1, i.e. always on) for a caller with too many points to label all of them at once. `color`'s domain (like `x`/`y`'s, when data-driven) accepts `clip` — see below — or can be fixed outright via `color.domain: [min, max]`, so a value maps to the same color snapshot to snapshot instead of shifting as the current data's own spread changes (e.g. altitude). `graph.rescale(k)` shrinks point/arrow radius, length, and stroke-width, and label size, by `1/k` and re-renders — for a caller layering its own SVG-transform zoom on top (e.g. a zoomable map background) so markers stay a constant on-screen size instead of growing with the zoom. `color.quantize: true` swaps the usual continuous gradient for `paletteColors.length` discrete, equal-width color bands over the domain — better than a smooth interpolation for data with a few clearly separated ranges (e.g. aircraft altitude: a low/climbing band vs. a distinct cruise band), especially paired with `colorClasses` (below) to control how many bands come out of a colorbrewer palette. |

Shared config across all four: `container`, `label`, `x`/`y` (`scale`, `unit`, `label`,
`tickLabels`, `preset`, `convert`, `clip`), `height`, `margin`, `colorPalette`, `colorClasses`,
`duration`,
`timeFormatMulti` (multi-scale time tick labels — minute/hour/day/month formats picked per tick
from the tick's own precision, rather than one fixed format for the whole axis; useful on any
time axis spanning enough range for one format to read badly at both ends).
`colorClasses` (e.g. `4`) picks that specific class count from a `Sequential.*`/`Diverging.*`
palette instead of its largest available one (3–9 shades per named palette); ignored for
`Qualitative.*` and the hardcoded extras, none of which are classed data.

Any `x`/`y`/`color` config accepts `clip: [loQuantile, hiQuantile]` (e.g. `[0.05, 0.95]`) — when
that property's domain would otherwise come straight from the data (no explicit `ranges.x`/
`ranges.y` passed to `update()`, or `color`, whose domain is always data-driven), it's built from those
quantiles instead of the true min/max, so a single extreme outlier doesn't stretch the whole scale
so far that every other value compresses into one end of it. Omitting `clip` (the default) keeps
the exact same true-min/max behavior. `color` clamps values past the clipped domain to the
nearest end color; `x`/`y` don't clamp — an out-of-clip point just draws past the axis edge.
Bars' value axis always includes zero, so `clip` has no effect there.

`tickLabels: false` blanks an axis's tick text while keeping its tick marks and gridlines.

`container` accepts a CSS selector string, a DOM element, or a d3 selection. `container` must
resolve to an element, and `height` must be a positive number *greater than
`margin.top + margin.bottom`* — otherwise there's no room left to plot in. Both are checked at
construction time, throwing a clear error instead of failing cryptically later.

Every chart has a `graph.destroy()` that disconnects its resize observer, tears down its DOM, and
releases its reference to the last data you passed. Calling `update()` afterwards throws rather
than quietly rendering into a detached SVG.

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

The same `colorPalette`/`colorClasses` resolution a chart's `paletteColors` goes through
internally is also available standalone — no container, no chart construction:

```js
d3.easygraph.resolvePalette("Diverging.RdYlBu");            // => ["#a50026", "#d73027", ..., "#313695"]
d3.easygraph.resolvePalette("Diverging.RdYlBu.reversed");   // same colors, reversed order
d3.easygraph.resolvePalette("Sequential.Blues", 4);         // the 4-class Blues, not its largest class count

d3.easygraph.colorScale("Diverging.RdYlBu.reversed", [dataMin, dataMax]);
// => a ready d3.scaleLinear, clamped, with RdYlBu's colors (reversed) spread evenly across the domain
d3.easygraph.colorScale("Sequential.Blues", [dataMin, dataMax], { classes: 4, quantize: true });
// => a d3.scaleQuantize instead — paletteColors.length discrete, equal-width bands
```

Handy for coloring something that isn't a d3-easygraph chart at all — a Leaflet marker layer, a
`d3.parcoords()` line — without hand-rolling a separate color scale or duplicating a palette
you've already named here. `d3.easygraph.colorPalettes` (the full resolved `{name:
[colors]}` map `resolvePalette` reads from) is public too, for a caller that wants to list every
available palette name (the [live palette picker](https://larsi.org/easygraph/#colors) is built from exactly this map).

### Where the palettes come from

Almost all of them are externally designed and tested schemes, and are named plainly:

| source | names |
| --- | --- |
| [ColorBrewer](https://colorbrewer2.org) | the sequential, diverging and qualitative sets — `Blues`, `RdYlBu`, `Set1`, … |
| Tableau | `Tableau10` (the library default) |
| Observable | `Observable10` |
| Google | `Turbo` |
| D3 | `Category20`, `Category20b`, `Category20c` — written out by hand here only because D3 dropped them from `d3-scale-chromatic` in v5, not because they're any less standard |

The six names carrying an **`LS-`** marker are the exception: hand-picked for one specific page on
[larsi.org](https://larsi.org) rather than researched for general use. Pick them knowing that.

| name | picked for |
| --- | --- |
| `Qualitative.LS-RdGnBu`, `Qualitative.LS-SunArc` | a few visually distinct line series (`SunArc` is a warm sunrise/noon/sunset triad) |
| `Qualitative.LS-SustainZones` | coloring named thermal zones in a building model |
| `Diverging.LS-BuMaRd`, `Diverging.LS-BuCyGnYlRd` | alternatives tried against `RdBu` on one heatmap |
| `Sequential.LS-Gy` | a plain black-to-white ramp |

That marker is the only provenance encoded in a name, because it's the only distinction that
changes how you'd use one: *is this vetted for general data, or one person's pick for one chart.*
Which upstream package a standard scheme happens to ship in isn't a property of the palette.

## Adding your own presets and palettes

Both lookup tables are plain objects and are **meant to be extended** — this is the supported way
to teach the library a unit or a palette it doesn't ship:

```js
d3.easygraph.presets.soilMoisture =
  { label: "Soil Moisture", unit: "%", scale: "linear", convert: function (v) { return v; } };

d3.easygraph.colorPalettes["Sequential.MyBrand"] = ["#eef", "#88a", "#114"];

d3.easygraph.line({ container: "#g", height: 320, y: { preset: "soilMoisture" },
                    colorPalette: "Sequential.MyBrand" });
```

A preset needs all four of `label`, `unit`, `scale`, and `convert` — `getUnit()` returns whatever
you put there directly, with no second merge to fill gaps. A palette is just an array of CSS
colors; the `Kind.` prefix is a naming convention, not something the resolver parses, so any
string works as a key (`.reversed` is the one suffix it does interpret).

Two things to know before you rely on it. **These tables are global**, not per-chart: an addition
affects every chart on the page and every other library sharing that `d3`. And **a name you add
can be silently overwritten** by a future version of this library that ships the same name — so
prefix your own (`MyBrand.*`, or the `LS-` style used above) rather than picking a name a general
scheme might plausibly take.

`resolvePalette`/`colorScale` are both name-based lookups — for a caller that instead needs an
arbitrary, caller-chosen *count* of colors with no natural name (a polygon's side count, an IFS's
transform count), `hueWheelPalette(count)` generates one instead of looking one up:

```js
d3.easygraph.hueWheelPalette(5);
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

`d3` (v7) is a peer dependency, not bundled — install or load it yourself. The named color
palettes are sourced from `d3`'s own bundled `d3-scale-chromatic` schemes, so nothing else is
needed for those.

The build is UMD, so all three ways of loading it work:

```js
// ES modules / bundler
import easygraph from 'd3-easygraph';
import 'd3-easygraph/dist/d3.easygraph.css';

// CommonJS
const easygraph = require('d3-easygraph');

easygraph.line({ /* ... */ });
```

Under a `<script>` tag the library attaches itself to the global `d3` as `d3.easygraph`, the
classic d3-plugin convention. (Under a bundler it can't — d3 v7 is ESM and its module namespace
is frozen — so there the API comes back as the module's own export instead, as above. Everything
on it is identical either way.)

```html
<div id="graph"></div>

<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
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

`graph.update(data, ranges)` re-renders with new data (`ranges: { x, y }` optionally pin the axis
domains instead of auto-fitting to the data) and returns the graph, so calls chain. Resize
handling is automatic — no calls needed on your end.

Your config object is never modified — it's cloned on the way in (as are its `x`/`y`/`color`/
`margin` sub-objects), so one config literal can safely construct several charts. Read state back
off the returned graph, not off the object you passed in.

Each chart's `<svg>` carries `class="easygraph"`, which every rule in the stylesheet is scoped
under, plus `role="img"` and an `aria-label` mirroring the chart title.

`update()` checks the shape of `data` and throws a message naming the family and the fix if it's
wrong — passing a flat array where a chart wants one series per row (or the reverse) used to
either throw from deep inside D3 or, worse, silently render a chart full of `NaN`. An empty array
is always valid: "no data yet" is a normal state while a first fetch is in flight.

### Missing and non-finite values

**`null`, `undefined`, and an absent key all mark a gap** — the series breaks into a separate
subpath there rather than drawing a straight line across the hole. That's the supported way to
say "no reading here":

```js
graph.update([[ { x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 } ]]);  // one gap, two subpaths
```

**`NaN` and `Infinity` are not gaps, and are not validated.** They pass the gap check and flow
into the scale, so a single one puts a literal `NaN` into the path's `d` attribute — which
browsers refuse to render, usually blanking the whole series:

```
finite    →  M0,150L215,75L430,0
NaN       →  M0,150L215,NaN L430,0        ← invalid path data
Infinity  →  M0,150L215,NaN L430,150      ← and every other point has moved
```

`Infinity` is the worse of the two: it also enters the domain calculation, so one bad value
stretches the axis to infinity and flattens every *valid* point along with it (note the third
point above shifting from `0` to `150`).

Values are deliberately not checked per-point — that would cost a test on every value of every
render, on charts that routinely carry tens of thousands of points, to catch what is a bug in the
calling code. **Filter non-finite values out, or convert them to `null`, before passing them in.**

## Public API

This is the supported surface — what semantic versioning covers. **Everything else reachable on a
graph object, including all `$`-prefixed (D3 selections, scales, shape generators) and
`_`-prefixed properties, is internal and may change in any release.** Attaching your own
properties to a graph is fine and supported; the library only ever writes the names below.

**Module-level** — usable with no chart at all:

| | |
| --- | --- |
| `line`, `bars`, `heatmap`, `scatter` | the four chart constructors |
| `syncZoom(graphs)`, `syncCrosshair(graphs)` | link zoom / crosshair across line charts |
| `getUnit(name)`, `presets` | unit-preset lookup and the table behind it |
| `round(x, n)` | round to `n` decimal places |
| `colorPalettes`, `resolvePalette(name, classes)` | named palette map and lookup |
| `colorScale(name, domain, options)` | a ready `color(value)` scale |
| `hueWheelPalette(count)` | `count` evenly spaced hues as `[r, g, b]` triples |

**On a graph** — methods:

| | |
| --- | --- |
| `update(data, ranges)` | re-render; returns the graph, so calls chain |
| `destroy()` | disconnect the resize observer and tear down the DOM |
| `getPaletteColor(i)` | the i-th palette color, wrapping past the end |
| `rescale(k)` | scatter only — divide on-screen marker sizes by `k` (see the table above) |
| `resolvedLabel()`, `resolvedUnit()` | the effective title text: your `label`/`unit` if set, else the `y` config's |
| `numberFormat(v)`, `timeFormatShort(date)` | the formatters the axes use, exposed so a tooltip or legend can match them |

The `curve` config takes one of `'linear'`, `'monotone'`, `'step-after'`, `'step-before'`,
`'basis'`, `'cardinal'` — or any d3 curve factory directly (`d3.curveNatural`,
`d3.curveCatmullRom.alpha(0.5)`, …), so the shortcut list isn't a ceiling.

**On a graph** — properties:

| | |
| --- | --- |
| every config key you passed | `container`, `height`, `margin`, `duration`, `colorPalette`, `colorClasses`, `timeFormatMulti`, and the family's own flags — readable, and the family flags (`lines`, `ribbons`, `stackedArea`, `mode`, `voronoi`, `arrows`, `labels`, `units`, …) are re-read on every `update()`, so assigning one and re-rendering is the supported way to toggle a chart live |
| `x`, `y`, and (heatmap/scatter) `color` | the resolved per-property configs; `$scale` and `$axis` on each are the intended escape hatch into D3 |
| `width`, `height` | the **plot area**, inside the margins |
| `outerWidth`, `outerHeight` | the full `<svg>` box — `height` going in is the outer height, and is replaced by the plot-area height during construction |
| `paletteColors` | the resolved color array |
| `onZoom`, `onCrosshair` | optional callbacks; `syncZoom`/`syncCrosshair` compose with yours rather than replacing it |

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

- `src/_intro.js` / `src/_outro.js` — the UMD wrapper the build is concatenated inside. Keeps
  every internal helper function-scoped (nothing leaks onto `window`) and picks how the API is
  handed over: the real global `d3` under a `<script>` tag, a mutable `Object.create(d3)` view
  under CommonJS/AMD, since d3 v7's ESM namespace is frozen and can't take a `.easygraph`
  property.
- `src/d3.easygraph.core.js` — container sizing/resize, SVG/margin/clip/title scaffolding,
  number/time axis formatting, x/y/color config resolution, and the shared `_build()` that each
  constructor calls with its own defaults and hook set.
- `src/d3.easygraph.units.js` — just the unit preset table (`d3.easygraph.presets`) and
  `getUnit(name)`, the standalone lookup above. No config merging, no chart concepts — `core.js` is
  the only thing that folds a resolved preset onto a graph's config, via `getUnit()`.
- `src/d3.easygraph.colors.js` — `colorPalettes`/`resolvePalette`/`colorScale` (named lookup)
  and `hueWheelPalette` (generated), the standalone palette functions above. Same division of
  labor as units.js: no chart concepts here, `core.js` is the only thing that folds a resolved
  palette onto `graph.paletteColors`.
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

Concatenates the UMD wrapper around all seven source files (in dependency order — core first) and
minifies the result with [terser](https://github.com/terser/terser) into the single
`dist/d3.easygraph.min.js`. The files are joined *before* terser runs, since the wrapper's two
halves are only balanced once the sources sit between them.

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
