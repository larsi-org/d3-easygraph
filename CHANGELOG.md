# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Extending `d3.easygraph.presets` and `d3.easygraph.colorPalettes` is now a documented,
  tested extension point rather than something that merely happened to work. Adding a preset or a
  palette by name is the supported way to teach the library a unit or color set it doesn't ship.
  Both tables are global (an addition affects every chart on the page, and anything else sharing
  that `d3`) and a name you add can be silently overwritten by a future version shipping the same
  name, so the docs say to prefix your own.
- The build is now wrapped in UMD (`src/_intro.js`/`src/_outro.js`), so `require('d3-easygraph')`
  and `import 'd3-easygraph'` work alongside the existing `<script>` tag. Previously the package's
  declared `main` was a bare globals script, so any bundler/Node consumer got
  `ReferenceError: d3 is not defined` on import. Script-tag users are unaffected -- the library
  still attaches to the global `d3` as `d3.easygraph`. Module consumers instead receive the API as
  the module's own export, because d3 v7 ships as ESM and a module namespace object is sealed:
  assigning `.easygraph` onto it silently no-ops. The wrapper hands the factory an
  `Object.create(d3)` view in those branches -- reads fall through to the real d3, writes land on
  the view. `package.json` gains `exports`/`unpkg`/`jsdelivr`/`sideEffects` to match.
- Charts are now exposed to assistive technology: each `<svg>` carries `role="img"`, an
  `aria-label`, and a native `<title>` child, all mirroring the rendered chart title and kept in
  sync by `update()`. A chart with no label at all announces as e.g. "line chart" rather than as
  its axis tick numbers run together ("00.10.20.30.4..."), which is what a screen reader got
  before.
- `batteryStateOfCharge` preset (label "Battery", unit `%`) -- larsi.org's ESP32 sensor-node
  firmware started reporting an onboard MAX17048 fuel gauge's state of charge, and the closest
  existing 0-100% preset, `relativeHumidity`, would have mislabeled the axis.
- `scatter` accepts a per-point `radius`, overriding the graph-level `radius` config for just
  that point -- a bubble chart, point size driven by a third data dimension independent of
  `value`'s color. Same optional-field pattern as `angle`/`magnitude`/`label` -- a point missing
  it just uses the graph's own radius. Still divided by `1/k` in `rescale()`'s zoom
  compensation, and (like the graph-level radius) deliberately not animated on `duration` --
  `rescale()` reads it back synchronously on every zoom tick, same constraint as the plain
  radius already had.
- `line` accepts `stackedArea: true` -- a classic stacked area chart: plain `{ x, y }` points
  like `lines`, each series' filled area stacked cumulatively on top of the ones before it,
  rather than `ribbons`' independent min/max band per series. Reuses the same accumulation math
  as `bars`' stacked mode (pulled into a new shared `d3.easygraph._computeStacked()` in
  `core.js`), including the same index-alignment assumption (series need to be sampled at the
  same x positions to stack correctly) and the same "value axis always includes zero" rule
  `bars`' stacked mode already has. A `y: null` point breaks a stacked-area series into a
  separate subpath too, same as `lines`/`ribbons`.
- `heatmap` and `scatter` now honor `duration` (already shared config, already implemented by
  `line`/`bars`) -- a cell's `fill` and a point's `cx`/`cy`/`fill` now transition smoothly on a
  data update instead of swapping instantly. Deliberately *not* extended to `r`/`stroke-width`
  (points, arrows) or `font-size` (labels): `scatter`'s `rescale(k)` re-renders on every zoom
  tick and reads those back synchronously right afterward, so they have to stay instant --
  transitioning them would fight `rescale()` and lag a live zoom gesture. Voronoi cells and
  arrows are left untransitioned too -- their shape is fully geometry-derived each render, not
  a smoothly-tweenable "value" the way a point's position or color is.
- `update()` now validates the shape of `data` and throws a message naming the family and the fix
  -- the same "clear error at the boundary" the constructor already did for `container`,
  `height` and `colorPalette`, applied to the one input that had no guard. Passing a flat array
  where a family wants one series per row (or the reverse) previously either threw from deep
  inside d3 with a minified variable name, or -- for `scatter` and `heatmap` -- silently rendered
  a chart full of `NaN` with no complaint at all. An empty array stays valid.
- `graph.outerWidth`/`graph.outerHeight` (previously the internal `_outerWidth`/`_outerHeight`)
  are now public: the full `<svg>` box, alongside `width`/`height`, which are the plot area
  inside the margins. `height` going in is the outer height and is replaced by the plot-area
  height during construction, so both numbers are now reachable by name instead of one being
  silently shadowed.
- A **Public API** section in the README naming the supported surface, and stating that every
  other reachable property -- all `$`- and `_`-prefixed ones included -- is internal and may
  change in any release. Semantic versioning covers the documented set, not everything a graph
  object happens to expose.

### Changed
- The six palettes hand-picked for individual larsi.org pages now carry an `LS-` marker:
  `Diverging.LS-BuMaRd`, `Diverging.LS-BuCyGnYlRd`, `Qualitative.LS-SustainZones`,
  `Qualitative.LS-RdGnBu`, `Qualitative.LS-SunArc`, `Sequential.LS-Gy`. The distinction a caller
  actually needs when picking a palette is *how vetted is this for my data*, and that's the only
  thing now encoded in a name. Deliberately **not** marked: `Category20`/`20b`/`20c`, which are
  D3's own published schemes and appear hardcoded only because d3-scale-chromatic dropped them in
  v5 -- a packaging accident, not a property of the palette. Marking those (a `D3-` prefix was
  considered) would have drawn the line at "which file is this defined in" rather than "who
  designed it", and left the unmarked set silently meaning "ColorBrewer, or Tableau, or
  Observable, or Google". The README now groups every palette by real provenance instead.
- `interpolate` renamed to `curve`, matching d3 itself: d3 renamed this concept in v4 (2016), so
  a d3 v7 library still calling it `interpolate` read as a decade-old copy-paste. `curve` also now
  accepts a d3 curve factory directly (`d3.curveNatural`, `d3.curveCatmullRom.alpha(0.5)`, ...)
  alongside the existing shortcut names, so the shortcut list is no longer a ceiling.
- `x`/`y`'s `noTick: true` renamed to `tickLabels: false`. The old name read as a double negative
  when written out (`noTick: false`) and over-promised -- it blanks the tick *text* and keeps the
  tick marks and gridlines, which the new name says exactly.
- `bars`' `orientation` values are now `'vertical'`/`'horizontal'` instead of `'v'`/`'h'`.
- `bars`' per-datum color field (with `colorPerData: true`) is now `d.color`, not `d.c` -- the one
  single-letter name in a data format that otherwise spells everything out (`value`, `radius`,
  `label`, `angle`, `magnitude`).
- `syncZoom`/`syncCrosshair` compose with a caller's existing `onZoom`/`onCrosshair` instead of
  assigning over them. Setting your own callback and then calling sync silently dropped the
  callback, with no way to have both.
- The per-family chart name behind the accessible-name fallback is `graph._chartType`, an
  internal the family always sets -- it's assigned after the config merge rather than through
  it, so a caller passing `_chartType` can't override it. It was briefly a plain `chartType`
  entry in each family's defaults, which read like a config key a caller was meant to set.
- `oneYear` renamed to `timeFormatMulti`. The old name described one caller's use case (an
  EnergyPlus year of hourly data) rather than what the flag does: pick a per-tick time format
  from the tick's own precision instead of one fixed format across the whole axis. Breaking
  change -- any caller passing `oneYear: true` needs `timeFormatMulti: true`.
- `graph.update()` returns the graph, so calls chain (d3's own convention); it previously
  returned `undefined`.
- `heatmap`'s axes now default to the grid's own dimensions -- a 6x4 grid with no explicit
  `ranges` gets `x: [0, 6]`, `y: [0, 4]`, so ticks line up with cell boundaries. The old `[0, 1]`
  fallback drew a 0-1 axis under a grid of any size, which meant every heatmap caller had to pass
  ranges of its own or accept a meaningless axis.
- `graph.label`/`graph.unit` are resolved lazily against the `y` config rather than copied off it
  at construction. Setting `graph.y.label` after construction used to leave the title showing the
  construction-time snapshot forever; the two now have one clear precedence (`graph.label` is the
  explicit override, `y` is the live fallback) instead of being two independent copies. Read them
  via `graph.resolvedLabel()`/`graph.resolvedUnit()`.
- `heatmap`'s `.heatmap_row`/`.heatmap_cells` DOM classes are now `.heatmap-row`/`.heatmap-cells`,
  matching the kebab-case every other class in the library already used. Breaking change for any
  caller styling or selecting those directly.
- `line`'s `areas` config renamed to `ribbons` (and every internal artifact along with it --
  `graph.$area`/`$area0` -> `graph.$ribbon`/`$ribbon0`, the `.data-areas` CSS/DOM class ->
  `.data-ribbons`). "Area chart" conventionally means a stacked/cumulative filled area, which
  isn't what this draws -- a filled min/max band around a line (e.g. a daily high/low range) is
  its own established chart type, more commonly called a band/range/ribbon chart. Picked `ribbon`
  over `band` (collides with `d3.scaleBand()`, already a load-bearing concept in `bars.js`) and
  `range` (collides with `update()`'s own range args, a different concept entirely). Breaking
  change -- any caller passing `areas: true` needs to change it to `ribbons: true`.
- `graph.update(data, xRange, yRange)` is now `graph.update(data, ranges)`, with
  `ranges: { x, y }` -- same info, one object instead of two positional args, so a future third
  range (e.g. `color`, currently only settable via static `color.domain` config) has somewhere
  to go without adding yet another positional param. Breaking change -- any caller passing
  `xRange`/`yRange` needs to wrap them as `{ x: xRange, y: yRange }`.
- `graph.PALETTE_COLORS` renamed to `graph.paletteColors` -- it was the one ALL-CAPS instance
  property in an otherwise consistent camelCase (`$scale`) / underscore (`_module`) convention.
  Breaking change for any caller reading it directly (`getPaletteColor(index)`, the documented
  public accessor, is unaffected).
- `line`'s `units` (a per-series unit-string array for the crosshair tooltip, already
  implemented and in real use on larsi.org's `weather`/`epw` multi-series report pages) is now
  a declared `familyDefaults` entry (`units: null`) and documented in the README's Line/ribbon
  config column, next to `crosshairThreshold`. It was previously readable only by reading
  `line.js`'s source -- present in the code, absent from every other surface (config defaults,
  docs, tests).

### Fixed
- Constructing a chart with a `height` smaller than `margin.top + margin.bottom` produced a
  *negative* plot area and drew itself inside-out with no complaint. The width path already
  refused a container narrower than its own horizontal margins; the vertical check was simply
  missing. Now throws, naming both numbers.
- `update()` on a destroyed chart silently succeeded -- it rendered into a detached SVG and still
  recorded the new data, so a caller could keep feeding a chart that would never appear again and
  get no hint. Now throws. `destroy()` also releases its reference to the last data passed in; a
  destroyed chart was holding a full dataset the caller reasonably believed it had released.
- `bars` no longer silently falls back to a horizontal chart when `orientation` is a typo -- every
  orientation branch was written as "vertical, else horizontal", so an unrecognized value produced
  the wrong chart instead of an error.
- **The caller's config object is no longer used as the chart object.** `_build()` took the config
  by reference and wrote ~45 properties onto it, including overwriting `height` with the computed
  plot-area height. Constructing a second chart from the same config literal therefore returned
  *the same object* as the first: the first chart's height silently changed (320 -> 270 -> 220),
  both `graph` handles pointed at one chart, and calling `destroy()` on each tore the second one
  down twice while leaving the first's SVG orphaned in the DOM with its `ResizeObserver` still
  connected. The config (and its `x`/`y`/`color`/`margin` sub-objects, already cloned in 0.6.x) is
  now cloned on the way in, so one config literal can safely build any number of charts.
- **The stylesheet no longer reaches into the host page.** It shipped bare `#title`, `.tick`,
  `.axis` and `rect.pane` selectors; merely loading the file restyled a host page's own
  `<h1 id="title">` (32px -> 16px) or anything else using those generic names. Every rule is now
  scoped under `.easygraph`, a class the library puts on each chart's `<svg>`.
  `.easygraph-crosshair-tip` stays unscoped -- it's appended to `document.body`, outside the svg,
  and was already namespaced.
- The chart title is a `class="easygraph-title"` element instead of `id="title"`. An id is unique
  per document, so N charts on a page produced N duplicate ids; nothing looked it up by id anyway
  (`graph.$title` holds the selection).
- The minified bundle no longer leaks 17 internal helpers onto `window` (`schemeColors`,
  `DIVERGING`, `QUALITATIVE`, `SEQUENTIAL`, `_curveMap`, `_resolveContainer`, the unit-conversion
  formulas, and others). They're function-scoped inside the new UMD wrapper.
- `heatmap.update([])` threw `TypeError: Cannot read properties of undefined (reading 'length')`
  -- it reached `data[0].length` with no rows. It now clears the grid and returns, matching the
  empty-data handling `line`/`scatter` got in 0.6.x. "No data yet" is a normal state while a first
  fetch is in flight.
- `bars`' value axis returned `[0, undefined]` for empty data (`d3.max` over nothing); it now
  falls back to `[0, 1]` like the other families.

- Source file headers said "Creative Commons Attribution-ShareAlike 3.0" (leftover from this
  code's original home on larsi.org, pre-extraction) while `LICENSE`/`package.json` have always
  said MIT -- all 7 files now say MIT, matching the license this repo actually ships under.
- A *partial* `margin` object (e.g. `margin: { top: 10 }`) previously left `right`/`bottom`/
  `left` as `undefined` forever -- `_build()`'s "fill in the blank" merge only applied when the
  whole `margin` key was missing, not per-key. That cascaded into `NaN` width math with no
  error anywhere. `margin` is now deep-merged per-key against the default, matching the
  "omitted margin" case that already worked.
- `x`/`y` (every chart family) and `color` (`heatmap`/`scatter`) config objects are now cloned
  at construction instead of resolved in place. Previously `_build()` wrote `$scale`/`$axis`
  directly onto whatever object a caller's `x`/`y`/`color` pointed to -- reusing the same
  config object literal across two chart instances (e.g. a shared preset config) silently let
  the second construction overwrite the first chart's own scale on that shared object.
- `resolvePalette()` threw a bare `Cannot read properties of undefined (reading 'slice')` for
  an unrecognized `colorPalette` name, deep inside `colors.js` with no context. Unlike
  `getUnit()`'s deliberate silent fallback for a falsy/unrecognized preset (a preset is often
  legitimately omitted), `colorPalette` always has a value by the time this runs, so an
  unrecognized name is always a genuine typo -- it now throws a clear, named `Error` instead.
- `line`/`scatter`'s `domain()` didn't guard against empty data (`update([])`) the way
  `bars.js` already did -- `d3.extent`/`min`/`max` on an empty array return `undefined`, which
  became the scale's own domain and broke axis rendering. Both now fall back to `[0, 1]`,
  matching `bars.js`'s existing convention. "No data yet" (page loaded, first fetch hasn't
  resolved) is a common real state, not just an edge case.

## [0.6.0] - 2026-08-23

### Added
- `Qualitative.SunArc` (`#F84`/`#FC4`/`#B12` — warm orange, golden yellow, deep crimson), a
  hand-picked 3-color palette for sunrise/solar-noon/sunset style series. Replaces
  `Qualitative.RdGnBu` on larsi.org's `graphics/sunrise_sunset/index.php`, whose pure
  red/green/blue read as arbitrary "line 1/2/3" colors rather than evoking dawn/midday/dusk —
  sunrise and sunset are both physically warm-hued (low sun angle, scattered light) while solar
  noon is bright and closer to white/yellow, which is why this is a custom warm triad rather than
  a stock ColorBrewer diverging scheme (those pair one warm end with one *cool* end, which doesn't
  fit — sunset shouldn't read as "cold").
- `Sequential.Turbo`, and a general fallback in `schemeColors()` for any scheme that ships only
  as a continuous `d3.interpolateX(t)` function with no discrete `d3.schemeX` array (Turbo,
  Viridis/Inferno/Magma/Plasma/Cividis/Warm/Cool/CubehelixDefault/Rainbow/Sinebow are the ones
  d3-scale-chromatic has -- only Turbo is named in `SEQUENTIAL` so far, the rest can be added the
  same way once something actually needs them). Sampled at `DEFAULT_INTERPOLATE_SAMPLES` (9,
  matching colorbrewer's own largest sequential class count) evenly-spaced points across `[0,
  1]`, or at `classes` stops when the caller asks for a specific count -- same role `classes`
  already plays for a classed colorbrewer scheme. Added after larsi.org's Lorenz Attractor page
  wanted Turbo for its time-bucket coloring instead of hand-sampling `d3.interpolateTurbo`
  directly.
- `Qualitative.Tableau10` and `Qualitative.Observable10`, alongside `Qualitative.Category20`/
  `20b`/`20c` -- d3-scale-chromatic's other categorical schemes, free to add since they're
  already part of the same `d3@7` bundle. (`Category10` itself was later removed -- see Changed.)
- `d3.easygraph.resolvePalette(name, classes)` and `d3.easygraph.colorScale(name, domain,
  options)`, standalone counterparts to the `colorPalette`/`colorClasses` resolution a chart
  already does internally for its own `paletteColors` — usable without building a chart at all.
  Added after finding three pages on the main site each hand-rolling their own sequential/
  diverging color scale (a Leaflet marker layer, a `d3.parcoords()` line color) instead of
  reusing a palette already named here — one of them turned out to be an exact, unknowing
  reimplementation of a palette already in `colorPalettes`. `colorPalettes` itself is now
  computed once at load time (`d3.easygraph.colorPalettes`) instead of rebuilt on every chart
  construction; `graph.colorPalettes` stays around as an alias for existing callers that read it
  off a live chart instance. All three now live in their own `src/d3.easygraph.colors.js`, the
  same standalone-lookup shape as `units.js`.
- `d3.easygraph.hueWheelPalette(count)`, generating `count` evenly-spaced hues around the
  color wheel as `[r, g, b]` triples (not the CSS-string colors the rest of `colors.js` returns —
  built for consumers writing directly into a `Canvas` `ImageData` buffer). Added after finding
  larsi.org's 2D and 3D point-cloud fractal renderers (`lib/larsi.org/point-cloud-renderer-
  {2,3}d.js`) each carrying an identical hand-rolled HSL→RGB generator, kept duplicated between
  them on purpose since there was no shared, dependency-free home for it — this is that home now
  that both files already load d3-easygraph anyway. Verified byte-identical output against the
  code it replaced across every tested count.
- `scatter` accepts `color.quantize: true`, swapping the usual continuous color gradient for
  `paletteColors.length` discrete, equal-width bands over the domain — for data where a handful
  of clearly separated ranges reads better than a smooth interpolation (e.g. aircraft altitude:
  a low/climbing band vs. a distinct cruise band, rather than every altitude getting its own
  subtly different shade). Pairs with the new core `colorClasses` config (any chart family, not
  scatter-specific) to pick a specific class count out of a Sequential/Diverging palette — which
  otherwise always resolves to its largest available class count — e.g.
  `colorPalette: "Sequential.Blues", colorClasses: 4` for four bands from light to dark.
- `scatter` accepts `labels: true` to draw each point's `label` (a string) offset above-right of
  its circle — same optional-field pattern as `arrows`, a point missing `label` just renders
  without one. `labelMinZoom` (default 1, i.e. always on) hides every label below that zoom
  factor entirely, for a caller with too many points to label all of them usefully at once (e.g.
  a full US-wide map) — pass a higher `labelMinZoom` and labels appear only once `rescale(k)` is
  called with a high enough `k` as the user zooms in. `rescale(k)` shrinks label font size (and
  offset) by `1/k` too, same as point radius and arrow length below.
- `scatter` gains `graph.rescale(k)`: shrinks point radius/stroke-width and arrow
  length/head/stroke-width by `1/k` and re-renders. For a caller layering its own SVG-transform
  zoom on top of a scatter overlay (e.g. a zoomable map background) — without this, points and
  arrows would grow along with the zoom transform instead of staying a constant size on screen
  the way map markers normally do. Stroke-width matters as much as radius/length here: left
  unscaled, a high enough `k` inflates it past the already-shrunk radius/length and a point or
  arrow collapses into a solid blob. Reuses `graph._lastData` (already tracked by `update()`)
  rather than requiring the caller to keep its own copy of the current data just to pass back in.
- `scatter` accepts a fixed `color.domain: [min, max]` (e.g. altitude in feet) that beats out the
  usual per-render extent/clip computed from that render's own data. Previously a color scale was
  always data-driven (true min/max, or a percentile `clip` of it), which for something like
  altitude meant the color mapping shifted between renders as the current set of points changed —
  the same value could read as light blue in one snapshot and dark blue in the next. `clip` is
  ignored when `domain` is set, since there's no data-driven extent left to clip.
- `line`/`areas` charts now treat a data point with `y: null` (or, for areas, `min`/`max: null`) as
  a gap — the line/area breaks into a separate subpath there instead of drawing a straight segment
  through the missing value. Previously an unset `y` produced malformed (`NaN`) path data, which
  browsers generally render as a hard stop rather than a resumable gap, silently dropping the rest
  of the series past the first missing point. A series with no null points renders exactly as
  before. Lets a caller break a circular quantity (e.g. compass bearing) at its own wraparound
  points by inserting a `null`-y point there, rather than the line falsely cutting straight across
  the chart from 359° to 0°.

### Changed
- Every palette name is now `Kind.Name` — `Sequential.Blues`, `Diverging.RdYlBu`,
  `Qualitative.Set1` — instead of being prefixed by *source* (a bare colorbrewer name,
  `D3_category10`, `LS_SustainZones`). Nobody choosing a palette cares whether the data came from
  colorbrewer, d3-scale-chromatic, or was hand-picked; what matters is what kind of quantity it's
  meant to represent, which the new prefix says directly. The `LS_*` extras got sorted into the
  kind that matches how each was actually designed/used: `Gy` → `Sequential`; `BuMaRd`,
  `BuCyGnYlRd` → `Diverging` (both were tried as alternatives to `RdBu` on the same value-gradient
  heatmap); `SustainZones`, `RdGnBu` → `Qualitative` (`SustainZones` was designed to give thermal
  zones in a model visually distinct colors, not represent a gradient; `RdGnBu` colors 3 distinct
  line series, also categorical use). The `_reversed` suffix is now `.reversed`, matching the new
  dot-separated naming (`Diverging.RdYlBu.reversed`).
- `core.js`'s default `colorPalette` is now `Qualitative.Tableau10`, replacing
  `Qualitative.Category10` (removed entirely — no longer a resolvable palette name at all). Both
  are 10-color categorical schemes, but `Category10`-style palettes are a known accessibility
  weak point: their red and green land at similar saturation/lightness, a common hard-to-separate
  pair under red-green color vision deficiency. `Tableau10` was Tableau's own redesign of their
  prior Category10-like default for exactly this reason — same idea, better separated.
  `schemeColors` (`colors.js`) no longer needs a hardcoded list of which names are
  qualitative-shaped vs. classed-shaped to do this kind of swap safely; it now detects the shape
  directly from the d3 data (classed schemes' largest entry is itself an array, qualitative
  schemes' entries are plain color strings) so any `d3.scheme*` export resolves correctly without
  being special-cased first.
- `d3.easygraph.colorbrewerPalettes` (and the matching `graph.colorbrewerPalettes` instance copy)
  renamed to `colorPalettes`. "Colorbrewer" stopped accurately describing it once D3's own
  categorical schemes and the hand-picked extras were folded in alongside the actual ColorBrewer
  data.
- Palettes are now sourced directly from `d3-scale-chromatic`'s `d3.scheme*` exports (already
  part of the full `d3@7` bundle every caller already loads) instead of the standalone
  `colorbrewer` npm package. Verified byte-identical against colorbrewer's own data for every
  name/class-count except `PuOr`, which d3 stores in the opposite color order — left as-is since
  nothing resolves it by name today (`.reversed` covers whichever direction a future caller
  wants). Drops the `colorbrewer` dependency entirely — nothing else needs to change on the
  consuming side, since `d3` was already required.
- `heatmap`'s default `colorPalette` is now `Diverging.RdBu.reversed`, overriding `core.js`'s
  shared `Qualitative.Tableau10` (a set of unrelated categorical hues makes no sense spread across
  a heatmap's continuous gradient the way it does as line/bars/scatter's per-series colors). Every
  real heatmap page already passed `colorPalette: "Diverging.RdBu.reversed"` explicitly for this
  reason; removed from each now that it's the default, so a future palette change only has to
  happen once, here.

### Fixed
- `line`'s zoom pane now sets `touch-action: none`. Without it, a pinch or drag gesture starting on
  the pane could still be hijacked by iOS's native pinch-to-zoom/pan and zoom the whole page instead
  of the chart, even though `d3.zoom()` already calls `preventDefault()` internally — that alone
  isn't reliable against the OS-level gesture recognizer, on any iOS browser (Safari, Chrome-for-iOS,
  etc. — Apple requires all of them to run on the system WebKit engine). Found on an iPad testing
  charts across larsi.org's weather/sensors/epw report pages.

## [0.5.0] - 2026-07-23

### Added
- `d3.easygraph.scatter(config)` — a new chart family: colored circles at arbitrary
  `{ x, y, value }` points, colored via `color` (same preset/palette-based scale resolution as
  `heatmap`'s `color` config). Deliberately geography-agnostic — no projection or map concept
  of its own; a caller plotting e.g. stations on a map projects lat/lng to pixel x/y itself and
  overlays `scatter`'s own container on top of a base map it draws separately.
- `scatter`'s `voronoi: true` — fills the region closer to a point than any other with that
  point's own color (`d3.Delaunay`/`.voronoi()`, already part of the full `d3@7` bundle, no new
  dependency), rendered behind the points. Still pure computational geometry on the given x/y
  points, so this stays geography-agnostic too. Cells default to semi-transparent
  (`voronoiOpacity`, `0.6`) so a layer underneath (e.g. a base map) stays visible through the
  fill.
- `clip` on any `x`/`y`/`color` config (e.g. `color: { clip: [0.05, 0.95] }`) — when the domain
  for that property would otherwise come from the data itself (no explicit `xRange`/`yRange`
  passed to `update()`, or `color`'s domain, which is always data-driven), it's built from the
  given quantiles instead of the true min/max. A single extreme outlier no longer stretches the
  whole scale so far that every other value compresses into one end of it. Omitting `clip` (the
  default everywhere) keeps the exact same true-min/max behavior as before. `color` clamps
  values outside the clipped domain to the nearest end color instead of extrapolating past the
  palette; `x`/`y` don't clamp — a point outside the clip just draws past the axis edge, since
  clipping an axis is a "zoom to the dense region" choice, not a "hide/relocate this point" one.
  Bars' value axis always includes zero regardless of data, so `clip` has no effect there.
- `scatter`'s `arrows: true` — draws a directional glyph (shaft + two-line chevron head) on top
  of any point that carries both `angle` (radians, screen convention: 0 = +x/right, increasing
  clockwise since svg y grows downward) and `magnitude` (raw units, mapped to pixel length via
  `arrowMinLength`/`arrowMaxLength`, default `[6, 24]`). Lets one data series carry two
  independent quantities at the same position — a scalar via `value`'s existing color scale,
  and a vector via the new arrow — matching e.g. a synoptic map's pressure-as-color +
  wind-as-arrow look. A point missing either field just renders its circle with no arrow, same
  as any other optional field elsewhere in this library.

### Removed
- `range` from every preset (`d3.easygraph.presets`) and from `getUnit()`'s returned shape — a
  sensible axis range is data-dependent (what a station/sensor actually observes), not a fixed
  property of a physical quantity, so a generic one-size-fits-all range was never the right fit.
  A chart with no `range` of its own in its `x`/`y` config auto-scales from whatever data is
  currently loaded, same as it always did for the `default` preset (which never had one).

## [0.4.0] - 2026-07-18

### Added
- `d3.easygraph.getUnit(name)` — returns a preset (or the generic `default` fallback, for a
  falsy/unrecognized name) as a complete, ready-to-use `{ label, unit, scale, convert, range }`.
  Usable standalone, no chart or container needed — e.g. converting a raw value for a map marker.
- `d3.easygraph.round(x, n)` — rounds to `n` decimal places, moved out of `weather/report.php` and
  `sensors/report.php`, which each defined an identical local copy. Deliberately preset/range-
  agnostic — precision is always caller-specified, not derived from a preset's `range` — same
  explicit-`n` behavior as the two pages' old local helper.
- Every preset's `convert(v)` now optionally takes a second argument, `convert(v, d)`, rounding the
  converted result to `d` decimal places (sugar for `round(convert(v), d)`). `convert(v)` alone is
  unchanged and stays unrounded, so a consumer needing full precision (e.g. interpolating a
  continuous color scale) isn't forced to lose it.

### Changed
- The 5 presets with a real conversion now reference a named formula function (e.g.
  `_temperatureC2F`) instead of an inline anonymous one — reads more like a table of unit
  conversions, easier to scan than 5 separate `function(v) { return ...; }` literals.
- Presets and config resolution split out of `core.js`: `d3.easygraph.presets`/`getUnit()` live in
  `units.js` — a small, easygraph-agnostic lookup with no config merging or chart concepts of its
  own — while `_resolveProperty` (folding a preset onto a graph's x/y/color config) moved into
  `core.js`, the only actual consumer of that resolution.
- `label` (and `unit`) are now genuinely optional. `_resolveProperty` no longer falls back to a
  generic call-site placeholder ("Property X"/"Property Y"/"Property Color") when neither the
  caller nor a preset supplies one — it stays unset, and the chart title renders blank (d3's
  `.text()` treats `undefined`/`null` as empty) instead of showing that placeholder text. No page
  ever actually saw "Property X"/"Property Y"/"Property Color" live — every page either set its own
  label or a `" "` (literal space) placeholder specifically to avoid it — so that hack is gone too.
- Presets express their raw-to-display conversion as a `convert(v)` function instead of linear
  `m`/`n` coefficients — supports non-linear conversions, and reads as "how do I convert this
  value" rather than a formula the caller has to remember. Every preset (including the generic
  `default` fallback) now declares its own `convert` explicitly, so `getUnit()` always returns
  something complete in one lookup.
- Every real preset now declares its own `scale: 'linear'` (it genuinely affects tick formatting —
  `core.js` checks `scale === 'linear'` specifically, not just "anything but time"), instead of
  relying solely on `default`'s copy. `default` keeps its own copy too, as the fallback for
  properties with no preset at all.
- The generic fallback merged when a property has no preset (or an unrecognized one) is now a real
  `default` entry in `d3.easygraph.presets`, not an object literal hardcoded inside the resolver.
  `{ preset: "default" }` is equivalent to omitting `preset` entirely.

### Removed
- `dewPointC` and `dewPointF` presets — unused across every `Public/html` page and, after a DB
  migration, the `larsi-sensors` database. Dew point readings that used `dewPointF` now use
  `temperatureF` instead (same unit/conversion/range, no dedicated preset needed).
- `noTick: false` from the generic fallback — it's an axis-rendering choice, not a unit concept,
  and every read of it (`if (graph.x.noTick)`) already treats `undefined` the same as `false`.

## [0.3.0] - 2026-07-17

### Added
- `container` config accepts a CSS selector string, a DOM element, or a d3 selection (previously
  only an element `id` string).
- Constructor-time validation: an unresolvable `container` or a non-positive `height` now throws a
  clear `Error` instead of failing cryptically deeper inside `_build()`.
- `graph.destroy()` on every chart — disconnects the resize observer and removes the chart's DOM
  (including line charts' `document.body`-appended crosshair tooltip).
- A [Playwright](https://playwright.dev) test suite (`test/`), wired into CI, covering rendering,
  live resize, `destroy()`, and two regressions: the zoom baseline (`$xScaleRef`) staying in sync
  with the container's width after a resize, and resize never producing a negative bar width.

### Changed
- `id` is no longer part of the config surface — use `container` instead.

## [0.2.0] - 2026-07-17

### Changed
- Split the single `d3.easygraph(config)` entry point into three constructors —
  `d3.easygraph.line()`, `d3.easygraph.bars()`, `d3.easygraph.heatmap()` — each accepting only the
  config its chart family understands.
- Rewrote the whole config surface to camelCase.

## [0.1.0] - 2026-07-16

### Added
- Initial extraction of `d3.easygraph` from [larsi.org](https://larsi.org) into its own package:
  core scaffolding (container sizing/resize, SVG/margin/clip/title DOM, palette, number/time
  formatting, unit presets) plus line/area/zoom/crosshair, stacked/grouped bars, and heatmap chart
  families.
- GitHub Actions build workflow verifying `dist/` stays in sync with `src/`.
