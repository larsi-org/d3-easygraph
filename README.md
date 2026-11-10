# d3-easygraph

[![Build](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml/badge.svg)](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml)

A small, batteries-included charting library built on [D3](https://d3js.org) v7: lines, min/max and
mean ±1σ bands, stacked areas, zoom, a hover crosshair, stacked/grouped bars (vertical and
horizontal, values of either sign), heatmaps, and scatter and bubble plots - all through one
consistent config object, with chart width that tracks its container's rendered size (height stays
fixed, or give `width` and `height` for a fixed-shape drawing such as a map). Unit presets, color
palettes and legend rows are also available with no chart at all.

**Live examples and docs:** [larsi.org/easygraph](https://larsi.org/easygraph)

## Contents

- [Quick start](#quick-start)
- [Patterns](#patterns) - how the API is shaped; read this first
- [Chart families](#chart-families): [Line](#line), [Bars](#bars), [Heatmap](#heatmap), [Scatter](#scatter)
- [Shared config](#shared-config)
- [Data conventions](#data-conventions)
- [Standalone helpers](#standalone-helpers): [units](#unit-conversion), [compass labels](#compass-labels), [palettes](#color-palettes), [legends](#legends), [your own presets and palettes](#adding-your-own-presets-and-palettes)
- [Public API](#public-api) - what 1.0 freezes
- [Class names](#class-names), [Examples](#examples), [Architecture](#architecture), [Building](#building), [Testing](#testing)

## Quick start

`d3` (v7) is a peer dependency, not bundled - install or load it yourself. The named color palettes
come from `d3`'s own bundled `d3-scale-chromatic` schemes, so nothing else is needed.

```html
<div id="graph"></div>

<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<link rel="stylesheet" href="dist/d3.easygraph.css">
<script src="dist/d3.easygraph.min.js"></script>

<script>
var graph = d3.easygraph.line({
  container: "#graph",
  x:         { type: "time" },
  y:         { preset: "temperatureC" },
  height:    320,
  margin:    { top: 20, right: 20, bottom: 30, left: 50 }
});

graph.update([                              // one array per series
  [
    { x: new Date("2026-01-01"), y: 3 },
    { x: new Date("2026-01-02"), y: 5 },
    { x: new Date("2026-01-03"), y: 2 }
  ]
]);
</script>
```

The build is UMD. Under a `<script>` tag the library attaches itself to the global `d3` as
`d3.easygraph`, the classic d3-plugin convention. Under a bundler it cannot (d3 v7 is ESM and its
namespace is frozen), so the API comes back as the module's own export; everything on it is identical:

```js
import easygraph from 'd3-easygraph';          // ES modules / bundler
import 'd3-easygraph/dist/d3.easygraph.css';
const easygraph = require('d3-easygraph');     // CommonJS

easygraph.line({ /* ... */ });
```

## Patterns

The same handful of ideas hold for every chart family. Learn them once.

**1. Build once, update many.** A constructor takes one config object and returns the chart;
`graph.update(data, domains)` draws (and redraws) and returns the graph, so calls chain. Your config
object is never modified - it is cloned on the way in, along with its `x`/`y`/`color`/`margin`
sub-objects, so one literal can safely construct several charts. Read state back off the returned
graph, not off the literal. `graph.destroy()` disconnects the resize observer, removes the DOM and
drops the last data; `update()` afterwards throws.

**2. Live keys and build-time keys.** Flags that choose what is drawn are re-read on every
`update()`: change them with `graph.set(options)`, then update again. `set()` is the only way to
change anything: assigning a key of the graph (`graph.stacked = true`, `graph.y.label = 'T'`) throws
with a message naming the `set()` call to use.

```js
graph.set({ bands: hourly ? {} : { minmax: true, sigma: true }, stacked: true }).update(data);
graph.set({ y: { label: 'Load' } });    // x, y and color are merged key by key
```

`set()` checks its object exactly like the config (a typo throws with a did-you-mean) and draws
nothing itself. Keys the chart is *built around* (scales, axes, DOM) are fixed at construction:
naming one in `set()` throws with a message saying so, before anything is changed;
to change it, `destroy()` the chart and build a new one. The `x`, `y` and `color` objects hold the
chart's scales, so they are never replaced, only their keys changed. The split is part of the API
([table below](#public-api)).

**3. Options are `false`, `true`, or an object.** A feature is off, on with defaults, or on with
options: `zoom: { min, max }`, `crosshair: { threshold }`, `voronoi: { opacity }`,
`arrows: { color, ... }`, `labels: { size, offset, minZoom }`, `points: { radius, strokeWidth }`.
`bands` is the one object-only option (`{ minmax, sigma }`, each `true` or `false`).

**4. The config is strict.** An unknown key throws, at any depth: `titel`, `x: { lable }`,
`points: { radus }`, `zoom: { mn }`, an entry of `series`, a key of `update()`'s `domains`. The message
names the closest real key (`did you mean 'x.label'?`) or says the option belongs to another family
(`zoom` on a bar chart). `set()` checks the same way. Your own fields go under **`meta`**, an open-ended object copied to
`graph.meta` untouched (`meta: { sensors: [0, 1] }`) - the place to hang page state off a chart. The graph
object itself is sealed: no property can be added to it (in strict-mode code that throws; in sloppy-mode
code the assignment is ignored).

**5. `x` and `y` are the screen axes everywhere** - in the `x`/`y` config, in `domains`, in axis titles.
A bar chart's *data* keeps `x` = category and `y` = value in either orientation, so in a horizontal
chart the values run across on the `x` axis: that is where you pin and title them.

```js
var g = d3.easygraph.bar({ container: '#chart', orientation: 'horizontal',
                           x: { label: 'Count' }, y: { label: 'Day' } });
g.update([[{ x: 'Mon', y: 3 }, { x: 'Tue', y: 7 }]], { x: [0, 10] });   // pins the value axis
```

**6. Data comes in one of three shapes**, checked at the boundary (a wrong shape throws a message
naming the family and the fix; an empty array is always valid, "no data yet" being a normal state):

| Family | `update()` takes |
| --- | --- |
| `line`, `bar` | an array of series, each an array of points: `[[{x, y}, ...], ...]` |
| `scatter` | one flat array of points: `[{x, y, value}, ...]` |
| `heatmap` | an array of rows, each an array of numbers: `[[1, 2], [3, 4]]` |

**7. Optional fields mean "used when present".** A point carries what it has and the chart uses it:
`min`/`max`/`sigmaMin`/`sigmaMax` (line bands), `color` (a bar), `radius`, `bearing` + `magnitude`,
`label`, `id` (scatter). A point missing a field renders without that feature; nothing is switched
on by a flag you must also remember.

**8. The chart draws numbers; you compute them.** Band edges, unit conversions, aggregation and legends
are yours. The library offers optional helpers that return plain data (`bandStats`, `convert`,
`legendItems`) and never calls them behind your back.

**9. Pinning a domain.** `update(data, domains)` with `domains = { x, y }` pins the axis domains for
that render instead of fitting the data (`{ color }` on heatmap and scatter pins the color scale). These
are domains in d3's sense, data values; the ranges (pixels) are the chart's. Precedence for the color
scale, most specific first: `domains.color` (this render), then `color.domain` (fixed at construction),
then the data's own extent. `trim: [lo, hi]` (quantiles) shapes only that last, data-driven extent.
A pinned domain survives a resize and `rescale()`, which re-render from stored state.

**10. Events are listeners.** `graph.on('zoom', fn)` / `graph.on('crosshair', fn)` (line charts),
several per event, called in the order added, each with one object (`{ transform, x }` for zoom,
`{ x, pixel }` for crosshair), so a payload can grow without breaking a listener. `on('zoom.name', fn)` names a listener so adding it
again replaces it; `on('zoom.name', null)` or `off('zoom'[, fn])` removes. Asking for an event the
chart does not emit throws. `syncZoom(graphs)` / `syncCrosshair(graphs)` link charts and are
themselves listeners named `sync`:

```js
graphs = graphs.map(function (config) { return d3.easygraph.line(config); });   // keep the returned charts
d3.easygraph.syncZoom(graphs);
d3.easygraph.syncCrosshair(graphs);
```

**11. Identity across updates.** Whenever the set of points can change between `update()` calls,
give every scatter point a stable `id` ([details](#update-to-update-identity)).

**12. Escape hatches into D3 are named and few.** `x.$scale`, `x.$axis` (and `y`, and `color.$scale` on
heatmap and scatter), `graph.$svg` (the chart's `<svg>`), `graph.$plot` (the `<g>` shifted by the
margins, holding the axes and titles; its origin is the plot area's top left) and `graph.$marks` (the
`<g>` inside `$plot` the chart draws its marks into, and the place for marks of your own) are stable.
`$marks` is not clipped, so a caller may transform it (a zoomable map); the line chart clips each of
its paths, heatmap and scatter marks are not clipped. A `$` name on the graph is always one of these
public handles. Everything the chart keeps for itself is on `graph._`, which is not enumerable and not
API.

**13. Lookup tables are global and extensible.** `d3.easygraph.presets` and `d3.easygraph.palettes`
are plain objects you add to ([below](#adding-your-own-presets-and-palettes)).

**14. Resize is automatic, errors are early.** Width follows the container with no calls on your end.
Bad `container`, `height`, `orientation`, axis `type`, `tickFormat`, `series`, palette, preset or data shapes throw at the
boundary with a message that says how to fix it, rather than rendering the wrong chart.

## Chart families

Each family has its own constructor, taking only the config that family understands:

| Family | Constructor | Config |
| --- | --- | --- |
| Line / band / stacked area | `d3.easygraph.line(config)` | `lines` (default on, off on a stacked chart), `bands`, `stacked`, `zoom`, `crosshair`, `curve`, `series` |
| Bars | `d3.easygraph.bar(config)` | `orientation` (`'vertical'`\|`'horizontal'`), `stacked`, `series` |
| Heatmap | `d3.easygraph.heatmap(config)` | `color` (adds `domain`, `trim`) |
| Scatter / bubble | `d3.easygraph.scatter(config)` | `color` (adds `domain`, `trim`, `quantize`), `points`, `voronoi`, `arrows`, `labels` |

### Line

A continuous (time or linear) x axis. Three drawing modes, each a flag you can toggle on a live chart:

- **`lines`** - one line per series. Left out it is on, so a plain chart shows something; on a
  `stacked` chart it is off, because the stacked areas are the picture. Set `true` or `false` to
  decide (a bands-only chart wants `lines: false`). A chart with data but nothing enabled draws only
  axes and warns on the console; that is a warning, not an error, because the flags are meant to be
  toggled live and being briefly in that state is legitimate.
- **`bands`** - shaded bands around each series, nested widest first. `{ minmax: true }` fills from
  each point's `min`/`max` (a daily high/low around a mean line); `{ sigma: true }` is a second, more
  opaque band from `sigmaMin`/`sigmaMax` (typically the mean ±1 standard deviation). Either key works
  alone; `{}` or omitted draws none. If you convert a point's `y` (°C to °F), convert `min`, `max`,
  `sigmaMin` and `sigmaMax` too. `d3.easygraph.bandStats(values, k)` and
  `bandStatsFromSums(totals, k)` compute the four numbers (mean ± `k` population standard deviations,
  default 1, clamped into `[min, max]`) from an array or from running totals; supply percentiles or
  anything else instead if you prefer.
- **`stacked: true`** - a classic stacked area: plain `{ x, y }` points, each series stacked on the
  ones before it. The y axis always includes zero, regardless of `trim`. Series are stacked by array
  index, so they must be sampled at the same x positions.

`zoom: { min, max }` (scale extent, defaults 1 and 10) enables scroll-to-zoom and drag-to-pan.
`crosshair: true` (or `{ threshold }`, how close in pixels the cursor must be to a point to show it,
default 10) adds a hover crosshair with a tooltip, its values in the axes' number format
(`formatNumber`; `?` for a series with no point near the cursor or a gap there); it finds the nearest point per series with a binary
search, so **each series must be sorted ascending by `x`** (unsorted input reports the wrong point and
does not error; every other feature is order-independent). `curve` is `'linear'`, `'monotone'`,
`'step-after'`, `'step-before'`, `'basis'`, `'cardinal'`, or any d3 curve factory
(`d3.curveNatural`, `d3.curveCatmullRom.alpha(0.5)`).

`series: [{ label, unit }, ...]` describes each series passed to `update()`, in the same order:
`label` names it in the legend and the crosshair tooltip, `unit` gives the tooltip a different unit
string for a chart mixing quantities. A series with no entry, or no `label`/`unit`, uses the defaults
(no name, the shared `y.unit`).

**Events.** `'zoom'` receives `{ transform, x }`: the d3 zoom transform and the x domain now in view
(`[from, to]`, `Date`s on a time axis). `'crosshair'` receives `{ x, pixel }` - the data value under the
pointer (a `Date` on a time axis) and its x in plot pixels - or `null` when the pointer leaves.

### Bars

A category axis (`d3.scaleBand()`). `orientation` is fixed for a chart's lifetime; `stacked` (default
`false`, i.e. grouped) can be toggled live. A datum with its own `color` field is drawn in it instead
of its series' palette color.

The categories are every series' `x` values, in the order they first appear (series 0 first, then
whatever a later series adds). A series may leave a category out or list them in another order: bars
are matched by category, not by position, both side by side and when stacked. To fix the order or show
an empty category, pin the category axis (`update(data, { x: ['Mon', 'Tue', ...] })`).

Values may be negative. The value axis always includes zero and reaches every bar: grouped bars hang
from the zero line, and stacked bars pile positive values up from zero and negative values down from
it, each on its own pile. Because the value axis always includes zero, `trim` has no effect there.

### Heatmap

A grid of colored cells over plain continuous x/y axes. `update()` takes an array of rows of numbers,
and row 0 is drawn at the **bottom** (the y axis runs upward). A `null` or `undefined` cell has no data: it gets
no fill and the class `easygraph-heatmap-cell-missing` (`fill: none` in the stylesheet, so the background
shows; restyle that class for a "no data" color), and it is left out of the color domain. With no domains given the axes span the
grid's own size (`x: [0, columns]`, `y: [0, rows]`), so ticks line up with cell edges. `color` takes a
fixed `domain: [min, max]` or a `trim`. The default palette is `Diverging.RdBu` reversed (blue low, red
high), since a qualitative palette makes no sense spread across a gradient; `color: { reverse: false }`
keeps that palette the other way round, and a palette you name is reversed only with `reverse: true`.

### Scatter

Colored circles at arbitrary `{ x, y, value }` points over plain continuous x/y axes. No geography is
built in - plot pre-projected pixel coordinates (lat/lng run through your own `d3.geoProjection`) to
overlay points on a map you draw yourself.

- **`points`** draws a circle per point (`points: { radius, strokeWidth }`); `points: false` draws none,
  for a picture of only arrows, labels or voronoi cells.
- **Bubble chart:** a point's own `radius` overrides `points.radius` for just that point.
- **`voronoi: true`** fills the region closer to each point than to any other with that point's color
  (via `d3.Delaunay`/`.voronoi()`, part of the full `d3@7` bundle). Semi-transparent by default
  (`voronoi: { opacity }`, `0.6`) so a layer underneath stays visible.
- **`arrows: true`** draws a directional glyph (shaft plus a two-line chevron head) on any point that
  also carries `bearing` and `magnitude` - a vector quantity (wind speed and direction) layered on a
  scalar one (`value`'s color). `bearing` is a compass bearing in degrees, the convention
  `compassPoint()` takes: 0 = north (up the screen), 90 = east, clockwise; the arrow points toward
  it. `magnitude` maps to pixel length between `arrows.minLength` and `maxLength`; `arrows.headAngle`
  is in degrees.
- **`labels: true`** draws each point's `label` (a string). Labels stay hidden below `labels.minZoom`
  (default 1, i.e. always on), for a map with too many points to label at once.
- **`color`** takes `trim` or a fixed `domain: [min, max]`, so a value maps to the same color from
  snapshot to snapshot instead of shifting with the data's spread. `color.quantize: true` swaps the
  gradient for `paletteColors.length` discrete, equal-width bands over the domain - better for data
  with a few clearly separated ranges (aircraft altitude), especially with `color.classes` to control
  how many bands a ColorBrewer palette yields.
- **`graph.rescale(k)`** divides point and arrow radius, length and stroke width, and label size, by
  `k` and re-renders - for a caller layering its own SVG-transform zoom on top (a zoomable map) so
  markers keep a constant on-screen size.

## Shared config

| Key | Meaning |
| --- | --- |
| `container` | a CSS selector, a DOM element or a d3 selection; must resolve to an element |
| `height` | positive, and greater than `margin.top + margin.bottom` (otherwise there is no room to plot) |
| `width` | only together with `height`, for a [fixed-size chart](#sizing) |
| `margin` | `{ top, right, bottom, left }`, defaults `20, 20, 30, 50`; a partial object is filled in |
| `title` | the chart heading drawn above the plot; blank unless set |
| `x`, `y` | per-axis config, below |
| `color` | `{ palette, classes, reverse }` on every family; heatmap and scatter add `domain` and `trim` (scatter also `quantize`) |
| `duration` | transition length in ms, default 500; live |
| `meta` | your own fields, copied to `graph.meta` |

**`x` / `y`:** `type` (`'linear'`, the default, or `'time'`), `label`, `unit`, `preset`, `tickFormat`,
`tickLabels`, `trim`.

- `label` and `unit` title the axis: `x.label` goes under the horizontal axis, `y.label` rotated beside
  the vertical one, each followed by its unit in brackets (`Temperature [°F]`). A `preset` supplies
  both, and `label`/`unit` set directly override it. Room for an axis title (20px on the left for a y
  title, on the bottom for an x title) is added to your margin, reserved at construction; `graph.margin`
  still reads what you passed. Change a label's text whenever you like, but an axis with no label at
  construction has no room set aside if you add one later.
- `tickFormat` is `'multi'` (time axis only: minute, hour, day or month format picked per tick from
  its precision), a format string (`'.1f'` on a linear axis, `'%b %d'` on a time axis) or a function
  `value => text`. A category axis takes a function only. `tickLabels: false` blanks the tick text
  while keeping the tick marks and gridlines, and wins over `tickFormat`.
- `trim: [loQuantile, hiQuantile]` (e.g. `[0.05, 0.95]`) builds a data-driven domain from those
  quantiles instead of the true min/max, so one extreme outlier does not compress everything else.
  `color` clamps values past the trimmed domain to the nearest end color; `x`/`y` do not clamp - an
  out-of-trim point draws past the axis edge.
- A `preset` also puts its `convert` and `convertRounded` on the axis. The chart **never applies
  them**: they are carried on the graph (`graph.y.convert(v)`) so the code that prepares your data and
  tooltips converts with the same function the axis is labeled for. They are not config keys of their
  own, since a function the chart does not use would look like it converts.

**`color.palette`** is a `Kind.Name` palette name (default `Qualitative.Tableau10`; heatmaps default to
`Diverging.RdBu`, reversed). **`color.classes`** (e.g. `4`) picks that class count from a
`Sequential.*`/`Diverging.*` palette instead of its largest (3-9 shades); it is ignored for
`Qualitative.*` palettes, which are not classed data. **`color.reverse: true`** flips the palette's order.

### Sizing

With `height` alone (the default, right for charts) the width follows the container and the height
stays fixed, so a wider window shows more detail. With `width` **and** `height` the chart has a fixed
logical size: it is drawn once at `width` x `height` and the browser scales the whole `<svg>`
uniformly through a `viewBox`, so the shape never changes. Use that for a map or any drawing with a
shape of its own; give the container just a width (the svg is `width: 100%; height: auto`). In this
mode nothing is laid out again on resize, and scatter marks (radius, arrows, labels) keep a constant
on-screen size, the way `rescale(k)` keeps them through a zoom. `graph.width`/`graph.height` are the
whole `<svg>` box (the logical size in fixed mode); `plotWidth`/`plotHeight` are the plot area inside
the margins.

Each chart's `<svg>` carries `class="easygraph"` (every rule in the stylesheet is scoped under it),
`role="img"`, and an `aria-label` that is the `title`, else the y then x axis title, else the chart
type.

## Data conventions

**Gaps.** `null`, `undefined` and an absent key all mark a gap: the line, band or stacked area breaks
into a separate subpath there rather than drawing a straight segment through the hole (for the bands,
`min`/`max: null` or `sigmaMin`/`sigmaMax: null`). That is also how to chart a circular quantity such
as compass bearing: insert a `null`-y point at each wraparound so the chart does not draw a false
diagonal from 359° to 0°. In a heatmap a `null` or `undefined` cell is drawn empty.

```js
graph.update([[ { x: 0, y: 1 }, { x: 1, y: null }, { x: 2, y: 3 } ]]);   // one gap, two subpaths
```

**`NaN` and `Infinity` are not gaps, and are not validated.** They flow into the scale, so one `NaN`
puts a literal `NaN` into the path's `d` attribute, which browsers refuse to render (usually blanking
the whole series), and one `Infinity` also stretches the axis and flattens every valid point. Values are
deliberately not checked per point - that would cost a test on every value of every render, on charts
that carry tens of thousands of points, to catch what is a bug in the calling code. **Filter
non-finite values out, or convert them to `null`, before passing them in.**

### Update-to-update identity

`scatter` joins each `update()`'s points to existing circles by `id`, falling back to array position
for a point without one. That matters whenever the number of points can change between calls (a live
map dropping stations with no reading this hour): without a stable identity, a point removed from the
middle shifts every later point down an index, and an existing circle gets rebound to a different point
and visibly flies to its new position instead of just recoloring in place. Give every point an `id`
whenever the point set can grow, shrink or reorder; a fixed set is safe either way. A `label` is
display text only.

`line` skips the path transition for any series whose point count changed since the last render
(toggling hourly to daily aggregation): d3 pairs the old and new path's numbers positionally, so a
sharply different vertex count would warp into a "melting" shape. That series snaps straight to its new
shape. It is automatic; a brand-new series still grows in from the flat baseline, and an unchanged
count transitions normally. Likewise do not drop a zero-data series from the array - keep `[]` in its
place - since line's per-series joins (color, crosshair name) are by index.

## Standalone helpers

These need no container and no chart, and are fine to use on their own.

### Unit conversion

The preset table a chart's `x`/`y` config resolves a `preset` name against is also available directly:

```js
d3.easygraph.preset("temperatureF");
// => { label: "Temperature", unit: "°F", convert: f(v), convertRounded: f(v, d) }

d3.easygraph.preset("temperatureF").convert(20);                       // => 68    (20°C to °F)
d3.easygraph.preset("temperatureF").convertRounded(20.44, 1);          // => 68.8  (68.792 to 1 decimal)
```

`preset(name)` returns the named preset - `{ label, unit, convert, convertRounded }` - or an empty one
(no label, empty unit, identity `convert`) for a falsy name. An unrecognized name throws, so a typo
such as `"temprature"` cannot quietly produce a chart with no label, unit or conversion.

The shipped presets, named quantity + unit:

| Quantity | Presets | `convert` takes |
| --- | --- | --- |
| temperature | `temperatureC`, `temperatureF` | °C |
| pressure | `pressureHpa`, `pressureInHg` | hPa |
| rainfall | `rainfallMm`, `rainfallIn` | mm |
| wind speed | `windSpeedMs`, `windSpeedKmh`, `windSpeedMph` | m/s |
| others (no conversion) | `windDirection` (°), `relativeHumidity` (%), `solarRadiation` (W/m²), `clouds` (tenths), `batteryStateOfCharge` (%), `electricCurrent` (A), `electricPower` (W), `electricVoltage` (V) | the unit shown |

A preset says nothing about the axis type (time or linear) and declares no range: a sensible axis
range depends on what a station or sensor actually observes, so a chart that pins none auto-scales
from the data loaded.

`convert(v)` stays unrounded, so a consumer that needs full precision (a continuous color scale) is not
forced to lose it. `convertRounded(v, d)` rounds the result to `d` decimals (`round(convert(v), d)`).
`d3.easygraph.round(x, n)` is public too, and so is `d3.easygraph.formatNumber(v)`, the axes' number
format (plain digits between 0.01 and 1000, SI prefixes outside: `12.3k`), for a tooltip or table that
should read like the axes.

### Compass labels

`compassPoint(direction, points)` returns the nearest 16-, 8- or 4-point label (`points` defaults to
16) for a bearing in degrees (0 = north, clockwise; a slightly negative or over-360 value wraps):

```js
d3.easygraph.compassPoint(22.4);      // => "NNE"
d3.easygraph.compassPoint(22.4, 8);   // => "NE"
d3.easygraph.compassPoint(22.4, 4);   // => "N"
```

It is a plain utility, not a preset: a preset's `convert()` returns a number for a numeric axis, and
a compass label is a string.

### Color palettes

The palette resolution a chart uses is also available standalone, for coloring something that is not
an easygraph chart (a Leaflet marker layer, a `d3.parcoords()` line). `palette(name, options)` sits
beside the `palettes` table the way `preset(name)` sits beside `presets`, and `colorScale()` takes the
same keys as a chart's `color` config:

```js
d3.easygraph.palette("Diverging.RdYlBu");                       // => ["#a50026", "#d73027", ..., "#313695"]
d3.easygraph.palette("Diverging.RdYlBu", { reverse: true });    // same colors, reversed
d3.easygraph.palette("Sequential.Blues", { classes: 4 });       // the 4-class Blues, not its largest

d3.easygraph.colorScale({ palette: "Diverging.RdYlBu", reverse: true, domain: [dataMin, dataMax] });
// => a ready d3.scaleLinear, clamped, with the palette spread evenly across the domain
d3.easygraph.colorScale({ palette: "Sequential.Blues", domain: [dataMin, dataMax], classes: 4, quantize: true });
// => a d3.scaleQuantize instead - discrete, equal-width bands
```

`d3.easygraph.palettes` is the full `{ name: [colors] }` table `palette()` reads from, public so you can
list every palette name (the [live palette picker](https://larsi.org/easygraph/#colors) is built from
exactly this table). Every color is a CSS color string. A scheme that ships only as a continuous
`d3.interpolateX` (Turbo) is sampled at `classes` points (default 9). Both functions check their
options like the chart config does.

**Where the palettes come from.** Every shipped name is an externally designed and tested scheme:

| source | names |
| --- | --- |
| [ColorBrewer](https://colorbrewer2.org) | the sequential, diverging and qualitative sets - `Blues`, `RdYlBu`, `Set1`, … |
| Tableau | `Tableau10` (the library default) |
| Observable | `Observable10` |
| Google | `Turbo` |
| D3 | `Category20`, `Category20b`, `Category20c` (carried in the library, since `d3-scale-chromatic` does not include them) |

Nothing in a name says "mine"; a palette of your own goes in `palettes` under a prefix of your own.

### Legends

The library computes what a legend needs and stops there - it never renders one. `graph.legendItems()`
returns plain rows you draw however your page wants:

```js
graph.legendItems()
// line / bar    → [ { index: 0, color: "#4e79a7", label: "HVAC" }, … ]
// quantized     → [ { index: 0, color: "#eff3ff", from: 0, to: 10000, label: "0–10.0k" }, … ]
// continuous    → [ { index: 0, color: "#eff3ff", value: 0, label: "0" }, … ]

d3.select("#legend").selectAll("span").data(graph.legendItems()).join("span")
  .html(d => `<span style="color:${d.color}">■</span> ${d.label}`);
```

For `line` and `bar` there is one row per series, labeled from the `series` config. A series with no
label comes back with `label: undefined`, never an invented "Series 3" (the same rule the chart title
follows). For `heatmap` and `scatter` the rows come from the color scale: a `color.quantize` scale
yields one row per band with its own `from`/`to` edges (rebuilt from the scale's interior thresholds
plus the domain's ends, the fiddly part), a continuous scale one row per palette stop with its `value`.
Labels use `d3.easygraph.formatNumber`, the axes' own number format, so a legend reads in the same
notation as the ticks.

A legend with no chart behind it: `d3.easygraph.legendItems(["#666", "#369"], ["Not Yet", "Visited"])`,
or `legendItems("Qualitative.Set1", ["North", "South"])` to resolve a palette by name.

*Why no renderer:* real legends are drawn many ways (inline `<span>`s, a `<table>` with extra data
columns, a separately positioned `<svg>`, swatches inside the chart's margin) and no single built-in
renderer would fit most of them. The pairing-up of colors and labels is what they share, so that is
what the library provides.

### Adding your own presets and palettes

Both lookup tables are plain objects and are **meant to be extended**:

```js
d3.easygraph.presets.soilMoisture = { label: "Soil Moisture", unit: "%" };
d3.easygraph.presets.soilMoistureFraction =
  { label: "Soil Moisture", unit: "", convert: function (v) { return v / 100; } };

d3.easygraph.palettes["Sequential.MyBrand"] = ["#eef", "#88a", "#114"];

d3.easygraph.line({ container: "#g", height: 320, y: { preset: "soilMoisture" },
                    color: { palette: "Sequential.MyBrand" } });
```

A preset needs `label` and `unit`; `convert` is optional (no conversion), and `preset()` fills in
`convert` and `convertRounded` on an entry that lacks them. A palette is an array of CSS colors, used
as it is (`classes` only picks from the shipped classed schemes). **These tables are global:** an addition affects every
chart on the page and every other library sharing that `d3`, and a name you add can be overwritten by a
future version of this library that ships the same name - so prefix your own (`MyBrand.*`).

## Public API

This is the supported surface - what semantic versioning covers. **`graph._`, where the chart keeps
its internals, may change in any release.** Your own state goes in `graph.meta`; the graph object is
sealed, so a property of your own cannot be added to it.

**Module-level:**

| | |
| --- | --- |
| `line`, `bar`, `heatmap`, `scatter` | the four chart constructors |
| `syncZoom(graphs)`, `syncCrosshair(graphs)` | link zoom / crosshair across line charts |
| `preset(name)`, `presets` | preset lookup (throws on an unrecognized name) and the table behind it |
| `round(x, n)` | round to `n` decimal places |
| `formatNumber(v)` | the number format the axes and legends use |
| `compassPoint(deg, points)` | nearest 16-, 8- or 4-point compass label for a bearing |
| `palette(name, { classes, reverse })`, `palettes` | palette lookup (throws on an unrecognized name) and the table behind it |
| `colorScale({ palette, domain, classes, reverse, quantize })` | a ready `color(value)` scale |
| `legendItems(colors, labels)` | zip colors and labels into legend rows, with no chart involved |
| `bandStats(values, k)`, `bandStatsFromSums(totals, k)` | `{ count, mean, min, max, sigmaMin, sigmaMax }` for a band, from an array or from running `{ sum, sumSq, count, min, max }` totals |

**On a graph - methods:**

| | |
| --- | --- |
| `update(data, domains)` | re-render, `domains` pinning `{ x, y }` (and `color`) for this render; returns the graph, so calls chain |
| `set(options)` | change live keys, checked like the config; returns the graph |
| `destroy()` | disconnect the resize observer and tear down the DOM |
| `on(event, fn)`, `off(event[, fn])` | listeners, chainable ([Patterns](#patterns) 10) |
| `paletteColor(i)` | the i-th palette color, wrapping past the end |
| `legendItems()` | the `{ index, color, label }` rows a legend is drawn from |
| `rescale(k)` | scatter only: divide on-screen marker sizes by `k` |

**On a graph - properties:**

| | |
| --- | --- |
| every config key of the family | readable (`undefined` when not given and without a default); the live ones are re-read on every `update()` and change through `set()` |
| `x`, `y`, `color` | the resolved per-property configs, with `$scale` and `$axis` on `x`/`y` and `$scale` on a heatmap's or scatter's `color`; `x.convert`/`convertRounded` (and `y`) from a preset |
| `$svg`, `$plot`, `$marks` | the chart's `<svg>`; the margin-shifted `<g>` with the axes; the `<g>` the marks are drawn into |
| `width`, `height` | the full `<svg>` box |
| `plotWidth`, `plotHeight` | the plot area inside the margins |
| `paletteColors` | the resolved color array |
| `meta` | your own fields |

**Which keys can change after construction.** `graph.set({ ... })`, then call `update()`. Assigning
any property of the graph or of its `x`, `y` and `color` objects throws, whichever column it is in;
the properties the chart computes (`width`, `plotWidth`, `paletteColors`, `x.$scale`, `x.convert`, the
handles and methods) are read-only too.

| Re-read on every `update()` (live, through `set()`) | Fixed when the chart is built |
|---|---|
| `lines`, `bands`, `stacked`, `voronoi`, `arrows`, `labels`, `points`, `duration`, `series`, `title`, `meta`; on `x`/`y`: `label`, `unit`, `trim`; on `color`: `domain`, `trim` | `container`, `height`, `width`, `margin`, `orientation`, `curve`, `zoom`, `crosshair`; on `x`/`y`: `type`, `preset`, `tickFormat`, `tickLabels`; on `color`: `palette`, `classes`, `reverse`, `quantize`; the `x`, `y` and `color` objects themselves |

The right-hand column is what a chart is built around. This split, plus the names in this README, is
the API that 1.0.0 freezes.

## Class names

Every class the library adds starts with `easygraph-` and names the mark (singular for one element,
plural for the `<g>` holding them), so a page's own CSS and selectors cannot collide with them. They
are stable API for styling and for tests:

| Chart | Classes |
| --- | --- |
| all | `easygraph` (the svg), `easygraph-marks` (the marks layer, `$marks`), `easygraph-title`, `easygraph-axis` with `easygraph-axis-x` / `easygraph-axis-y`, `easygraph-axis-title` with `easygraph-axis-title-x` / `easygraph-axis-title-y` |
| line | `easygraph-line`, `easygraph-minmax`, `easygraph-sigma`, `easygraph-stack` (one `<path>` per series), `easygraph-pane` (the zoom/pointer rect), `easygraph-crosshair-line`, `easygraph-crosshair-tip` (the tooltip, a child of `<body>`) |
| bar | `easygraph-bar`, `easygraph-bar-group` |
| heatmap | `easygraph-heatmap-row`, `easygraph-heatmap-cell`, `easygraph-heatmap-cell-missing` (a cell with no data) |
| scatter | `easygraph-point`, `easygraph-arrow`, `easygraph-label`, `easygraph-voronoi-cell`, and their `<g>` groups `easygraph-points`, `easygraph-arrows`, `easygraph-labels`, `easygraph-voronoi-cells` |

Anything else in the DOM (the clip path, the `.tick` classes d3 puts on axis ticks) is an
implementation detail.

## Examples

Live examples are part of [larsi.org](https://larsi.org), where this library originated and is used
across its weather, sensors, EnergyPlus and graphics sections (not included in this repo). The
[index page](https://larsi.org/easygraph/) documents each family with code; these are the working pages:

- **Line** - [Hourly Data](https://larsi.org/easygraph/data_hourly.php) (zoom + crosshair, an
  hourly/daily toggle that adds the min/max and ±1σ bands),
  [Multi Hourly Data](https://larsi.org/easygraph/multi_data_hourly.php) (several simulations, same
  toggle), [Stacked Area](https://larsi.org/easygraph/stacked_area.php)
- **Bars** - [Monthly Data](https://larsi.org/easygraph/data_monthly.php) (live grouped/stacked
  toggle), [Multi Monthly Data](https://larsi.org/easygraph/multi_data_monthly.php),
  [Horizontal Bars](https://larsi.org/easygraph/horizontal_bars.php),
  [Sensitivity](https://larsi.org/easygraph/data_sensitivity.php) (a bar's own `color`)
- **Heatmap** - [Hourly Data Heat Map](https://larsi.org/easygraph/data_hourly_heatmap.php)
- **Scatter** - [Scatter & Voronoi](https://larsi.org/easygraph/scatter_voronoi.php),
  [Bubble Chart](https://larsi.org/easygraph/bubble_chart.php) (per-point `radius`),
  [Arrows & Labels](https://larsi.org/easygraph/scatter_arrows.php) (`arrows`, `labels`, `id` identity,
  `voronoi: { opacity }`; drop a point and the others stay put), and two real map overlays:
  [Weather](https://larsi.org/weather/)'s "Pressure & Wind" tab (`voronoi: true`, `color.trim`,
  `arrows: true` for wind over pressure) and [Air Traffic](https://larsi.org/air-traffic/)
  (`color.domain` + `color.quantize`/`color.classes` for four altitude bands, `labels: { minZoom }` for
  callsigns once zoomed in). Both draw over a D3 US map through a shared pan/zoom helper (not part of
  this repo) that drives `graph.rescale(k)`
- **Palettes** - the [palette picker](https://larsi.org/easygraph/#colors)

## Architecture

- `src/_intro.js` / `src/_outro.js` - the UMD wrapper the build is concatenated inside. It keeps every
  internal helper function-scoped (nothing leaks onto `window`) and picks how the API is handed over:
  the real global `d3` under a `<script>` tag, a mutable `Object.create(d3)` view under CommonJS/AMD
  (d3 v7's ESM namespace is frozen and cannot take a `.easygraph` property).
- `src/d3.easygraph.core.js` - container sizing and resize, the SVG/margin/clip-path/title
  scaffolding, axis formatting and `formatNumber`, x/y/color config resolution, config and `domains`
  validation, `set()`, events, `bandStats`, and the shared `_build()` that each constructor calls with
  its own defaults and hooks.
- `src/d3.easygraph.presets.js` - the preset table and `preset(name)`, plus `round` and `compassPoint`.
  No config merging, no chart concepts: `core.js` is the only thing that folds a preset onto a graph's
  config.
- `src/d3.easygraph.colors.js` - `palettes`, `palette`, `colorScale` and `legendItems`. Same division of
  labor as presets: `core.js` is the only thing that folds a palette onto `graph.paletteColors`.
- `src/d3.easygraph.line.js`, `.bar.js`, `.heatmap.js`, `.scatter.js` - one constructor per family,
  each handing `_build()` a small hook object: `domain` and `render` are required; `prepareScales`
  (bar, for its band scale), `init`, `resize`, `legendItems` and `destroy` (line, to remove its
  `document.body` crosshair tooltip) are optional. A module keeps its own state and d3 objects on
  `graph._`, never on the graph object itself (which is sealed once built).

**Adding an option** follows the same path every time: add the key to `_FAMILY_KEYS` (or `_SHARED_KEYS`)
and, if it is an object, to `_NESTED` in `core.js` so it is validated (by the constructor and by
`set()`); read it live in `render()`, or, if the chart is built around it, add it to `_FIXED_TOP` (or
`_FIXED_SUB` for a key of `x`, `y` or `color`) at the bottom of `_build()`; a key is live unless listed
there. Document it here; add a spec.

## Building

```sh
npm install
npm run build
```

Concatenates the UMD wrapper around all seven source files (core first) and minifies the result with
[terser](https://github.com/terser/terser) into the single `dist/d3.easygraph.min.js`. The files are
joined *before* terser runs, since the wrapper's two halves are only balanced once the sources sit
between them.

## Testing

```sh
npm run build
npx playwright install --with-deps chromium   # once per machine
npm test
```

[Playwright](https://playwright.dev) specs in `test/` (one per source module - core, line, bar,
heatmap, scatter, presets, colors - plus `api.spec.js` and `api-1.0.spec.js` for cross-cutting checks;
179 tests) run against the built `dist/` via static `test/fixtures/*.html` pages loaded over `file://`. They cover rendering,
live resize, `destroy()` teardown, config and `domains` validation, the live/build-time key split,
legends, the standalone unit and palette functions, and behavior that needs real interaction to
verify: `set()`, zoom and crosshair events, pinned color domains surviving a resize, `id`-keyed point identity,
and line paths not warping when a series' point count changes. CI runs the same suite on every push.
**Run `npm run build` first** - the tests exercise `dist/`, not `src/`.

## License

MIT - see [LICENSE](LICENSE).
