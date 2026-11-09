# d3-easygraph

[![Build](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml/badge.svg)](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml)

A small, batteries-included charting library built on [D3](https://d3js.org) v7: lines, min/max
and min/max and mean ±1σ bands, stacked areas, zoom, a hover crosshair, stacked/grouped bars (vertical
and horizontal), heatmaps, and scatter and bubble plots - all through one consistent config
object, with chart width that tracks its container's rendered size (height stays fixed). Unit
presets, color palettes and legend rows are also available with no chart at all.

**Live examples and docs:** [larsi.org/easygraph](https://larsi.org/easygraph)

## Chart families

Each chart family has its own constructor, taking only the config that family understands:

| Family | Constructor | Config |
| --- | --- | --- |
| Line / band / stacked area | `d3.easygraph.line(config)` | `lines`, `bands` (`{ minmax, sigma }`, each `true` or `false`), `stackedArea`, `zoom`, `crosshair` (`true` or `{ threshold }`, pixels, default 10), `curve`, `series` |
| Bars | `d3.easygraph.bars(config)` | `orientation` (`'vertical'`\|`'horizontal'`), `mode` (`'stacked'`\|`'grouped'`), `colorPerData`, `series` |
| Heatmap | `d3.easygraph.heatmap(config)` | `color` |
| Scatter / bubble | `d3.easygraph.scatter(config)` | `color`, `radius`, `pointStrokeWidth`, `voronoi` (`true` or `{ opacity }`), `arrows` (`true` or `{ color, strokeWidth, minLength, maxLength, headLength, headAngle }`), `labels` (`true` or `{ size, offset, minZoom }`) |

### Line

A continuous (time or linear) x axis. Four drawing modes, each a flag you can toggle on a live
chart (assign it, then call `update()`):

- **`lines`** - one line per series.
- **`bands`** - which shaded bands to draw around each series, nested widest first: `{ minmax: true }`
  is a filled band from each point's `min`/`max` (e.g. a daily high/low around a mean line);
  `{ sigma: true }` is a second, more opaque band from each point's `sigmaMin`/`sigmaMax`
  (typically the mean ±1 standard deviation): a faint band for the extreme range and a darker one
  for the typical spread. Either key works alone, a missing key is off, and `{}` or omitted draws
  none. It is re-read on every `update()`, so one assignment toggles both:
  `graph.bands = hourly ? {} : { minmax: true, sigma: true }`. The chart only draws the numbers you
  give it; it never computes a band. `d3.easygraph.bandStats(values)` is an optional helper that
  does (see the Public API table), and you're free to supply percentiles or anything else instead.
  If you convert a
  point's `y` (e.g. °C to °F), convert `min`, `max`, `sigmaMin` and `sigmaMax` too.
- **`stackedArea`** - a classic stacked area chart: plain `{ x, y }` points like `lines`, each
  series stacked cumulatively on the ones before it. The y axis always includes zero, regardless of
  `trim`, as in bars' stacked mode. Series are stacked by array index, so (like bars' stacked mode)
  they must be sampled at the same x positions to align.

`zoom: { min, max }` (scale extent, defaults 1 and 10) enables scroll-to-zoom and drag-to-pan; `crosshair: true` (or `{ threshold }`, how close in pixels the cursor must be to show a point) adds a hover
crosshair with a tooltip. `d3.easygraph.syncZoom(graphs)` and `syncCrosshair(graphs)` link several
line charts together. `series: [{ label, unit }, ...]` describes each series passed to `update()`, in
the same order: `label` names it in the legend and the crosshair tooltip, and `unit` gives the
tooltip a different unit string for a chart mixing quantities where the single shared `y` preset's
unit isn't right for all of them. A series with no entry, or with no `label` or `unit`, uses the
defaults (no name, the shared `y.unit`).

A point with `y: null` (or, for the bands, `min`/`max: null` or
`sigmaMin`/`sigmaMax: null`) breaks the line, band or stacked area into a separate
subpath there instead of drawing a straight segment through the gap. That is also how to chart a
circular quantity such as compass bearing: insert a `null`-y point at each wraparound so the chart
doesn't draw a false diagonal from 359° to 0°.

### Bars

A category axis (`d3.scaleBand()`). `orientation` is fixed for a chart's lifetime; `mode` can be
toggled live. `colorPerData: true` colors each bar from its own `color` field instead of the
series' palette color.

### Heatmap

A grid of colored cells over plain continuous x/y axes. `color` is a unit/preset config for the
color scale, or a fixed `domain: [min, max]`. The default palette is `Diverging.RdBu.reversed`,
since a qualitative palette makes no sense spread across a continuous gradient.

### Scatter

Colored circles at arbitrary `{ x, y, value }` points over plain continuous x/y axes. No geography
is built in - plot pre-projected pixel coordinates (e.g. lat/lng run through your own
`d3.geoProjection`) to overlay points on a map you draw yourself.

- **Bubble chart:** a point's own `radius` overrides the graph-level `radius` for just that point
  (point size driven by a third data dimension, independent of `value`'s color).
- **`voronoi: true`** fills the region closer to each point than to any other with that point's own
  color (via `d3.Delaunay`/`.voronoi()`, part of the full `d3@7` bundle). Semi-transparent by
  default (`voronoi: { opacity }`, `0.6`) so a layer underneath stays visible.
- **`arrows: true`** draws a directional glyph (shaft plus a two-line chevron head) on any point
  that also carries `angle` (radians) and `magnitude` - a vector-shaped quantity (e.g. wind speed
  and direction) layered on a scalar one (`value`'s color) at the same position. A point missing
  either field renders its circle with no arrow. `angle` is plain trigonometric convention (0 = +x,
  increasing counter-clockwise; SVG's y grows downward, so an unrotated glyph points right on screen
  and sweeps clockwise as `angle` increases), not compass bearing. Convert bearing data (0 = north,
  clockwise) with `angle = (bearingDegrees - 90) * Math.PI / 180`.
- **`labels: true`** (or an options object) draws each point's `label` (a string); a point without one renders without a
  label. Labels stay hidden below `labels.minZoom` (default 1, i.e. always on), for a caller with too
  many points to label all of them at once.
- **`color`** takes `trim` (below) or a fixed `domain: [min, max]`, so a value maps to the same
  color snapshot to snapshot instead of shifting with the current data's spread (e.g. altitude).
  `color.quantize: true` swaps the continuous gradient for `paletteColors.length` discrete,
  equal-width bands over the domain - better for data with a few clearly separated ranges (aircraft
  altitude: a low/climbing band and a distinct cruise band), especially with `colorClasses` to
  control how many bands a ColorBrewer palette yields.
- **`graph.rescale(k)`** shrinks point and arrow radius, length and stroke width, and label size, by
  `1/k` and re-renders - for a caller layering its own SVG-transform zoom on top (e.g. a zoomable
  map background) so markers keep a constant on-screen size.
- **Identity:** points are joined to existing circles by `id`, else `label` - see *Update-to-update identity*
  below.

### Shared config

These are shared by all four families: `container`, `title`, `x`/`y` (`scale`, `unit`, `label`,
`tickLabels`, `preset`, `convert`, `trim`), `height`, `margin`, `colorPalette`, `colorClasses`,
`duration`,
`x.timeFormat: 'multi'` (multi-scale time tick labels - minute/hour/day/month formats picked per tick
from the tick's own precision, rather than one fixed format for the whole axis; useful on any
time axis spanning enough range for one format to read badly at both ends).
`colorClasses` (e.g. `4`) picks that specific class count from a `Sequential.*`/`Diverging.*`
palette instead of its largest available one (3–9 shades per named palette); ignored for
`Qualitative.*` and the hardcoded extras, none of which are classed data.

Any `x`/`y`/`color` config accepts `trim: [loQuantile, hiQuantile]` (e.g. `[0.05, 0.95]`) - when
that property's domain would otherwise come straight from the data (nothing pinned it - no
`ranges.x`/`ranges.y`/`ranges.color` passed to `update()`, and no `color.domain` config), it's built from those
quantiles instead of the true min/max, so a single extreme outlier doesn't stretch the whole scale
so far that every other value compresses into one end of it. Omitting `trim` (the default) keeps
the exact same true-min/max behavior. `color` clamps values past the trimmed domain to the
nearest end color; `x`/`y` don't clamp - an out-of-trim point just draws past the axis edge.
Bars' value axis always includes zero, so `trim` has no effect there.

`tickLabels: false` blanks an axis's tick text while keeping its tick marks and gridlines.

`crosshair: true` finds the nearest point per series with a binary search, so **each series must
be sorted ascending by `x`**. Unsorted input doesn't error - it just reports the wrong point.
Every other feature is order-independent; this is the one that isn't.

`x`/`y`'s `scale` must be `'linear'` (the default) or `'time'`; bars' `orientation` must be
`'vertical'` or `'horizontal'` and its `mode` `'stacked'` or `'grouped'`. Each is checked rather
than left to fall through, since every internal test on them reads as "one value, else the other"
- a typo would otherwise render the wrong chart with no complaint. `mode` is re-checked on every
`update()`, so a bad value assigned to a live chart is caught too.

A `line` chart with data but none of `lines`/`bands`/`stackedArea` enabled draws axes and
nothing else, and warns on the console saying so. That's a warning rather than an error because
the flags are meant to be toggled on a live chart, so being briefly in that state is legitimate.

Config keys a family doesn't understand are ignored without complaint - `zoom` on a bar chart, a
misspelled `colorPallete`. That's the deliberate cost of letting you hang your own properties on a
config (see **Public API**), which the library can't tell apart from a typo.

`container` accepts a CSS selector string, a DOM element, or a d3 selection. `container` must
resolve to an element, and `height` must be a positive number *greater than
`margin.top + margin.bottom`* - otherwise there's no room left to plot in. Both are checked at
construction time, throwing a clear error instead of failing cryptically later.

Every chart has a `graph.destroy()` that disconnects its resize observer, tears down its DOM, and
releases its reference to the last data you passed. Calling `update()` afterwards throws rather
than quietly rendering into a detached SVG.

`title` is optional. A `y`/`color` `preset` supplies a label automatically (e.g. `temperatureF` →
"Temperature"); with no preset and no `title` of your own, the chart's title just renders blank -
there's no generic placeholder to opt out of.

## Unit conversion (no chart required)

The same preset table a chart's `x`/`y`/`color` config resolves a `preset` name against is also
available standalone - no container, no chart construction:

```js
d3.easygraph.resolvePreset("temperatureF");
// => { label: "Temperature", unit: "°F", scale: "linear", convert: f(v, d) }

d3.easygraph.resolvePreset("temperatureF").convert(20);      // => 68        (20°C to °F)
d3.easygraph.resolvePreset("temperatureF").convert(20.44, 1); // => 68.8 (68.792, rounded to 1 decimal)
```

`resolvePreset(name)` returns the named preset - a complete, ready-to-use `{ label, unit, scale,
convert }` - or the generic `default` entry (empty unit, linear scale, identity `convert`)
for a falsy name. An unrecognized name throws, so a typo such as `"temprature"` can't quietly
produce a chart with no label, unit or conversion. Every preset declares its own `convert(v)`; presets with no real
conversion (most of them - e.g. `relativeHumidity`, `windDirection`) just use the identity
function. Handy for e.g. converting a raw value before coloring or labeling a map marker. No
preset declares a `range` either - a sensible axis range is data-dependent (what a station or
sensor actually observes), not a fixed property of the physical quantity, so charts with no
`range` of their own auto-scale from whatever data is currently loaded.

`convert` optionally takes a second argument, `convert(v, d)`, rounding the converted result to
`d` decimal places via `d3.easygraph.round` - sugar for `round(convert(v), d)` in one call.
`convert(v)` alone stays unrounded, so a consumer that needs full precision (e.g. interpolating a
continuous color scale) isn't forced to lose it. `d3.easygraph.round(x, n)` itself is also public -
a plain explicit-precision helper.

### Compass labels

`d3.easygraph.compassPoint16(direction)`, `compassPoint8(direction)` and `compassPoint4(direction)`
return the nearest 16-, 8- or 4-point compass label for a bearing in degrees (0 = north,
clockwise; a slightly negative or over-360 value wraps):

```js
d3.easygraph.compassPoint16(22.4);   // => "NNE"
d3.easygraph.compassPoint8(22.4);    // => "NE"
d3.easygraph.compassPoint4(22.4);    // => "N"
```

They are plain utilities, not presets: a preset's `convert()` feeds a numeric linear axis, so a
function returning a label can't be one.

## Color palettes (no chart required)

The same `colorPalette`/`colorClasses` resolution a chart's `paletteColors` goes through
internally is also available standalone - no container, no chart construction:

```js
d3.easygraph.resolvePalette("Diverging.RdYlBu");            // => ["#a50026", "#d73027", ..., "#313695"]
d3.easygraph.resolvePalette("Diverging.RdYlBu.reversed");   // same colors, reversed order
d3.easygraph.resolvePalette("Sequential.Blues", 4);         // the 4-class Blues, not its largest class count

d3.easygraph.colorScale("Diverging.RdYlBu.reversed", [dataMin, dataMax]);
// => a ready d3.scaleLinear, clamped, with RdYlBu's colors (reversed) spread evenly across the domain
d3.easygraph.colorScale("Sequential.Blues", [dataMin, dataMax], { classes: 4, quantize: true });
// => a d3.scaleQuantize instead - paletteColors.length discrete, equal-width bands
```

Handy for coloring something that isn't a d3-easygraph chart at all - a Leaflet marker layer, a
`d3.parcoords()` line - without hand-rolling a separate color scale or duplicating a palette
you've already named here. `d3.easygraph.colorPalettes` (the full resolved `{name:
[colors]}` map `resolvePalette` reads from) is public too, for a caller that wants to list every
available palette name (the [live palette picker](https://larsi.org/easygraph/#colors) is built from exactly this map).

### Where the palettes come from

Almost all of them are externally designed and tested schemes, and are named plainly:

| source | names |
| --- | --- |
| [ColorBrewer](https://colorbrewer2.org) | the sequential, diverging and qualitative sets - `Blues`, `RdYlBu`, `Set1`, … |
| Tableau | `Tableau10` (the library default) |
| Observable | `Observable10` |
| Google | `Turbo` |
| D3 | `Category20`, `Category20b`, `Category20c` - written out by hand here only because D3 dropped them from `d3-scale-chromatic` in v5, not because they're any less standard |

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

## Legends

The library computes what a legend needs and stops there - it never renders one. `graph.legendItems()`
returns plain rows you draw however your page wants:

```js
graph.legendItems()
// line / bars   → [ { index: 0, color: "#4e79a7", label: "HVAC" }, … ]
// quantized     → [ { index: 0, color: "#eff3ff", from: 0, to: 10000, label: "0–10.0k" }, … ]
// continuous    → [ { index: 0, color: "#eff3ff", value: 0, label: "0" }, … ]

d3.select("#legend").selectAll("span").data(graph.legendItems()).join("span")
  .html(d => `<span style="color:${d.color}">■</span> ${d.label}`);
```

For `line` and `bars` there's one row per series, labelled from the **`series`** config - one
`{ label, unit }` entry per series, in the order you pass them to `update()`:

```js
d3.easygraph.line({ container: "#g", height: 320, lines: true,
                    series: [{ label: "HVAC" }, { label: "Lighting" }, { label: "Electronics" }] });
```

`series[i].label` also labels each row of the crosshair tooltip. A series with no label comes back with
`label: undefined` rather than an invented "Series 3" - the same rule the chart title follows.

For `heatmap` and `scatter` the rows come from the color scale instead. A `color.quantize` scale
yields one row per band with its own `from`/`to` edges - rebuilt from the scale's interior
thresholds plus the domain's ends, which is the part that's genuinely fiddly to do by hand. A
continuous scale yields one row per palette stop, each with the `value` it represents. Either way
labels are formatted with `graph.numberFormat`, so a legend reads in the same notation as the axis
ticks.

There's also a standalone form for a legend with no chart behind it at all:

```js
d3.easygraph.legendItems(["#666", "#369", "#933"], ["Not Yet", "Visited", "Lived"]);
d3.easygraph.legendItems("Qualitative.Set1", ["North", "South"]);   // or resolve a palette by name
```

**Why no renderer:** real legends are drawn many ways - inline `<span>`s, a `<table>` with extra
data columns, a separately positioned `<svg>`, swatches inside the chart's own margin - and some are
HTML rather than SVG, so no single built-in renderer would fit most of them. The pairing-up of
colors and labels is the part they all share, so that's the part the library provides.

## Adding your own presets and palettes

Both lookup tables are plain objects and are **meant to be extended** - this is the supported way
to teach the library a unit or a palette it doesn't ship:

```js
d3.easygraph.presets.soilMoisture =
  { label: "Soil Moisture", unit: "%", scale: "linear", convert: function (v) { return v; } };

d3.easygraph.colorPalettes["Sequential.MyBrand"] = ["#eef", "#88a", "#114"];

d3.easygraph.line({ container: "#g", height: 320, y: { preset: "soilMoisture" },
                    colorPalette: "Sequential.MyBrand" });
```

A preset needs all four of `label`, `unit`, `scale`, and `convert` - `resolvePreset()` returns whatever
you put there directly, with no second merge to fill gaps. A palette is just an array of CSS
colors; the `Kind.` prefix is a naming convention, not something the resolver parses, so any
string works as a key (`.reversed` is the one suffix it does interpret).

Two things to know before you rely on it. **These tables are global**, not per-chart: an addition
affects every chart on the page and every other library sharing that `d3`. And **a name you add
can be silently overwritten** by a future version of this library that ships the same name - so
prefix your own (`MyBrand.*`, or the `LS-` style used above) rather than picking a name a general
scheme might plausibly take.

`resolvePalette`/`colorScale` are both name-based lookups - for a caller that instead needs an
arbitrary, caller-chosen *count* of colors with no natural name (a polygon's side count, an IFS's
transform count), `hueWheelPalette(count)` generates one instead of looking one up:

```js
d3.easygraph.hueWheelPalette(5);
// => [[217,38,38], [181,217,38], [38,217,110], [38,110,217], [181,38,217]] - 5 evenly-spaced hues
```

Evenly spaced hues around the color wheel, for unordered categorical data (a vertex id, a
transform id) - not the right fit for *ordered* data, where two adjacent categories landing on
similar hues near the wheel's wraparound would misleadingly suggest they're related; use
`colorScale` with a sequential scheme for that instead. Returns `[r, g, b]` number triples rather
than the CSS-string colors everywhere else on this page - built for consumers that write colors
directly into a `Canvas` `ImageData` buffer (larsi.org's point-cloud fractal renderers) and need
the numbers as-is, not a string to re-parse.

## Usage

`d3` (v7) is a peer dependency, not bundled - install or load it yourself. The named color
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
classic d3-plugin convention. (Under a bundler it can't - d3 v7 is ESM and its module namespace
is frozen - so there the API comes back as the module's own export instead, as above. Everything
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
domains instead of auto-fitting to the data) and returns the graph, so calls chain. `ranges.x`
and `ranges.y` name your **data's** `x` and `y` fields, not the screen axes - which is the same
thing for every family except horizontal bars, where `d.x` is the category (drawn up the
vertical axis) and `d.y` is the value (drawn across). So a horizontal bar chart pins its value
axis with `ranges.y`, matching the field the values live in. This is deliberate: `orientation`
is only how the chart is drawn, so the same data, `x`/`y` config and `ranges` work unchanged when
you flip it.

```js
// horizontal bars: x = category (up the side), y = value (across the bottom)
var g = d3.easygraph.bars({ container: '#chart', orientation: 'horizontal', y: { label: 'Count' } });
g.update([[{ x: 'Mon', y: 3 }, { x: 'Tue', y: 7 }]], { y: [0, 10] });  // pins the value axis
```

`heatmap` and `scatter` also take **`ranges.color`**, pinning the color scale's domain for that
render. Three levels of precedence, most specific first: `ranges.color` (this render) beats
`color.domain` (fixed at construction) beats the data's own extent. A pinned domain sticks
through a resize and through `scatter`'s `rescale()`, both of which re-render from stored
state rather than a fresh `update()`. `trim` applies only when nothing is pinned - there's no
data-driven extent left to trim once a domain is given outright. Resize
handling is automatic - no calls needed on your end.

Your config object is never modified - it's cloned on the way in (as are its `x`/`y`/`color`/
`margin` sub-objects), so one config literal can safely construct several charts. Read state back
off the returned graph, not off the object you passed in.

Each chart's `<svg>` carries `class="easygraph"`, which every rule in the stylesheet is scoped
under, plus `role="img"` and an `aria-label` mirroring the chart title.

`update()` checks the shape of `data` and throws a message naming the family and the fix if it's
wrong (for example a flat array where a chart wants one series per row, or the reverse). An empty
array is always valid: "no data yet" is a normal state while a first fetch is in flight.

### Update-to-update identity and animation

`scatter` joins each `update()`'s points to existing circles by `id` first, then `label`, falling
back to array position only for a point with neither. This matters whenever the number of
points can change between calls - e.g. a live map filtering out stations with no reading this
hour. Without a stable identity, a point dropped from the middle of the array shifts every point
after it down an index, so an existing circle - mid-transition or about to start one - gets
rebound to a different point and visibly flies to its new position instead of just recoloring in
place. Give every point an `id` (or a `label`, which still works as the join key with `labels: false` -
it just isn't drawn) whenever the point set can grow, shrink, or reorder between updates; a fixed point
set (same stations/entities every render) is safe either way.

`line`'s band/stack/lines paths skip the `d`-attribute transition entirely for any series
whose point count changed since the last render - e.g. toggling between hourly and daily
aggregation - rather than animating it. d3's default string interpolator for `d` pairs the old
and new path's numeric tokens positionally, so a sharply different vertex count produces a
warped, "melting" intermediate shape instead of a clean morph; that series' path snaps straight
to its new shape instead. This is automatic, nothing to configure - a brand-new series (no
previous entry at that index at all) still grows in smoothly from the flat baseline as before,
and a series whose point count is unchanged still transitions normally.

### Missing and non-finite values

**`null`, `undefined`, and an absent key all mark a gap** - the series breaks into a separate
subpath there rather than drawing a straight line across the hole. That's the supported way to
say "no reading here":

```js
graph.update([[ { x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 } ]]);  // one gap, two subpaths
```

**`NaN` and `Infinity` are not gaps, and are not validated.** They pass the gap check and flow
into the scale, so a single one puts a literal `NaN` into the path's `d` attribute - which
browsers refuse to render, usually blanking the whole series:

```
finite    →  M0,150L215,75L430,0
NaN       →  M0,150L215,NaN L430,0        ← invalid path data
Infinity  →  M0,150L215,NaN L430,150      ← and every other point has moved
```

`Infinity` is the worse of the two: it also enters the domain calculation, so one bad value
stretches the axis to infinity and flattens every *valid* point along with it (note the third
point above shifting from `0` to `150`).

Values are deliberately not checked per-point - that would cost a test on every value of every
render, on charts that routinely carry tens of thousands of points, to catch what is a bug in the
calling code. **Filter non-finite values out, or convert them to `null`, before passing them in.**

## Public API

This is the supported surface - what semantic versioning covers. **Everything else reachable on a
graph object, including all `$`-prefixed (D3 selections, scales, shape generators) and
`_`-prefixed properties, is internal and may change in any release.** Attaching your own
properties to a graph is fine and supported; the library only ever writes the names below.

**Module-level** - usable with no chart at all:

| | |
| --- | --- |
| `line`, `bars`, `heatmap`, `scatter` | the four chart constructors |
| `syncZoom(graphs)`, `syncCrosshair(graphs)` | link zoom / crosshair across line charts |
| `resolvePreset(name)`, `presets` | preset lookup (throws on an unrecognized name) and the table behind it |
| `round(x, n)` | round to `n` decimal places |
| `compassPoint16(deg)`, `compassPoint8(deg)`, `compassPoint4(deg)` | nearest compass label for a bearing |
| `colorPalettes`, `resolvePalette(name, classes)` | named palette map and lookup |
| `colorScale(name, domain, options)` | a ready `color(value)` scale |
| `hueWheelPalette(count)` | `count` evenly spaced hues as `[r, g, b]` triples |
| `legendItems(colors, labels)` | zip colors and labels into legend rows, with no chart involved |
| `bandStats(values, k)`, `bandStatsFromSums(totals, k)` | optional: `{ count, mean, min, max, sigmaMin, sigmaMax }` for a band, from an array or from running `{ sum, sumSq, count, min, max }` totals (mean ± `k` population standard deviations, default 1, clamped into `[min, max]`) |

**On a graph** - methods:

| | |
| --- | --- |
| `update(data, ranges)` | re-render; returns the graph, so calls chain |
| `destroy()` | disconnect the resize observer and tear down the DOM |
| `paletteColor(i)` | the i-th palette color, wrapping past the end |
| `legendItems()` | the `{ index, color, label }` rows a legend is drawn from - see below |
| `rescale(k)` | scatter only - divide on-screen marker sizes by `k` (see the table above) |
| `numberFormat(v)`, `timeFormatShort(date)` | the formatters the axes use, exposed so a tooltip or legend can match them |

**Which keys can change after construction.** Assign to the graph, then call `update()` again.

| Re-read on every `update()` (toggle live) | Fixed when the chart is built |
|---|---|
| `lines`, `bands`, `stackedArea` (line), `mode` (bars), `voronoi`, `arrows`, `labels` (scatter), `duration`, `series`, `title`, `radius`, `pointStrokeWidth` | `container`, `height`, `margin`, `orientation`, `curve`, `zoom`, `crosshair`, `colorPalette`, `colorClasses`, `x.scale`, `y.scale`, and the `x`/`y`/`color` presets |

The right-hand column is what a chart is built around; to change one, `destroy()` it and build a
new chart. This split, plus the names in this README, is the API that 1.0.0 freezes.

The `curve` config takes one of `'linear'`, `'monotone'`, `'step-after'`, `'step-before'`,
`'basis'`, `'cardinal'` - or any d3 curve factory directly (`d3.curveNatural`,
`d3.curveCatmullRom.alpha(0.5)`, …), so the shortcut list isn't a ceiling.

**On a graph** - properties:

| | |
| --- | --- |
| every config key you passed | `container`, `height`, `margin`, `duration`, `colorPalette`, `colorClasses`, and the family's own flags - readable, and the family flags (`lines`, `bands`, `stackedArea`, `mode`, `voronoi`, `arrows`, `labels`, `units`, …) are re-read on every `update()`, so assigning one and re-rendering is the supported way to toggle a chart live |
| `x`, `y`, and (heatmap/scatter) `color` | the resolved per-property configs; `$scale` and `$axis` on each are the intended escape hatch into D3. `graph.$svg` (the margin-translated group the axes live in) and `graph.$group` (the clipped plot area) are stable too, for drawing your own marks. Every other `$`- or `_`-prefixed name is private and may change |
| `width`, `height` | the full `<svg>` box. `height` is exactly what you configured and is never replaced; `width` follows the container |
| `plotWidth`, `plotHeight` | the plot area, inside the margins |
| `title` | the effective chart title: what you set, else `y.label` (a preset supplies one). Assign to override; assign `undefined` to fall back |
| `paletteColors` | the resolved color array |
| `onZoom`, `onCrosshair` | optional callbacks; `syncZoom`/`syncCrosshair` compose with yours rather than replacing it |

## Examples

Live, real-world examples - part of [larsi.org](https://larsi.org), where this library
originated and is still used across its weather/sensors/EnergyPlus/graphics sections (not
included in this repo). The [index page](https://larsi.org/easygraph/) documents each family with
code; these pages are the working examples:

- **Line** - [Hourly Data](https://larsi.org/easygraph/data_hourly.php) (zoom + crosshair, an
  hourly/daily toggle that adds the min/max and ±1σ bands),
  [Multi Hourly Data](https://larsi.org/easygraph/multi_data_hourly.php) (several simulations,
  same toggle), [Stacked Area](https://larsi.org/easygraph/stacked_area.php)
- **Bars** - [Monthly Data](https://larsi.org/easygraph/data_monthly.php) (live
  grouped/stacked toggle), [Multi Monthly Data](https://larsi.org/easygraph/multi_data_monthly.php),
  [Horizontal Bars](https://larsi.org/easygraph/horizontal_bars.php),
  [Sensitivity](https://larsi.org/easygraph/data_sensitivity.php) (`colorPerData`)
- **Heatmap** - [Hourly Data Heat Map](https://larsi.org/easygraph/data_hourly_heatmap.php)
- **Scatter** - [Scatter & Voronoi](https://larsi.org/easygraph/scatter_voronoi.php),
  [Bubble Chart](https://larsi.org/easygraph/bubble_chart.php) (per-point `radius`),
  [Arrows & Labels](https://larsi.org/easygraph/scatter_arrows.php) (`arrows`, `labels`, `id` identity,
  `voronoi: { opacity }`; drop a point and the others stay put), and two real
  map overlays: [Weather](https://larsi.org/weather/)'s "Pressure & Wind" tab (`voronoi: true`,
  `color.trim`, `arrows: true` overlaying wind speed/direction on top of pressure) and
  [Air Traffic](https://larsi.org/air-traffic/) (`color.domain` + `color.quantize`/`colorClasses`
  for four discrete altitude bands instead of a continuous gradient, `labels: { minZoom }` for
  callsigns once zoomed in). Both are drawn over a D3 US map through a shared pan/zoom helper (not
  part of this repo) that drives `graph.rescale(k)` to keep points and arrows a constant size
  through the zoom
- **Palettes** - the [palette picker](https://larsi.org/easygraph/#colors), built from
  `d3.easygraph.colorPalettes`

## Architecture

- `src/_intro.js` / `src/_outro.js` - the UMD wrapper the build is concatenated inside. Keeps
  every internal helper function-scoped (nothing leaks onto `window`) and picks how the API is
  handed over: the real global `d3` under a `<script>` tag, a mutable `Object.create(d3)` view
  under CommonJS/AMD, since d3 v7's ESM namespace is frozen and can't take a `.easygraph`
  property.
- `src/d3.easygraph.core.js` - container sizing/resize, SVG/margin/clip-path/title scaffolding,
  number/time axis formatting, x/y/color config resolution, `bandStats`, and the shared `_build()` that each
  constructor calls with its own defaults and hook set.
- `src/d3.easygraph.presets.js` - just the preset table (`d3.easygraph.presets`) and
  `resolvePreset(name)`, the standalone lookup above. No config merging, no chart concepts - `core.js` is
  the only thing that folds a resolved preset onto a graph's config, via `resolvePreset()`.
- `src/d3.easygraph.colors.js` - `colorPalettes`/`resolvePalette`/`colorScale` (named lookup)
  and `hueWheelPalette` (generated), the standalone palette functions above. Same division of
  labor as presets.js: no chart concepts here, `core.js` is the only thing that folds a resolved
  palette onto `graph.paletteColors`.
- `src/d3.easygraph.line.js`, `.bars.js`, `.heatmap.js`, `.scatter.js` - one constructor per chart
  family above, each implementing a small `prepareScales?`/`init?`/`domain`/`render`/`resize?`/
  `destroy?` hook interface (only `domain`/`render` are required; `prepareScales` is bars-only, for
  its band scale; `destroy` is line-only, to remove its `document.body`-appended crosshair
  tooltip).

## Building

```sh
npm install
npm run build
```

Concatenates the UMD wrapper around all seven source files (in dependency order - core first) and
minifies the result with [terser](https://github.com/terser/terser) into the single
`dist/d3.easygraph.min.js`. The files are joined *before* terser runs, since the wrapper's two
halves are only balanced once the sources sit between them.

## Testing

```sh
npm run build
npx playwright install --with-deps chromium   # once per machine
npm test
```

[Playwright](https://playwright.dev) specs in `test/` (one per source module: core, line, bars,
heatmap, scatter, presets, colors; 150 tests) run against the built `dist/` via static
`test/fixtures/*.html` pages loaded over `file://`. They cover rendering, live resize, `destroy()`
teardown, legends, the standalone unit and palette functions, and the regressions that needed real
interaction to find: the zoom baseline staying in sync with the container's width after a resize,
resize never producing a negative bar width, one config literal building several charts, a pinned
color domain surviving a resize, scatter's `id`/`label`-keyed point identity, the build-time-key
assignment errors, the band helpers, and line paths not warping
when a series' point count changes. CI runs the same suite on every push. **Run `npm run build`
first** - the tests exercise `dist/`, not `src/`.

## License

MIT - see [LICENSE](LICENSE).
