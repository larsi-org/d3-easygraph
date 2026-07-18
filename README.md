# d3-easygraph

[![Build](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml/badge.svg)](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml)

A small, batteries-included charting library built on [D3](https://d3js.org) v7: lines, filled
areas, zoom, a hover crosshair, stacked/grouped bars (vertical and horizontal), and heatmaps — all
through one consistent config object, with chart width that tracks its container's rendered size
(height stays fixed).

**Live examples and docs:** [larsi.org/easygraph](https://larsi.org/easygraph)

## Chart families

Each chart family has its own constructor, taking only the config that family understands:

| Family | Constructor | Config | Notes |
| --- | --- | --- | --- |
| Line / area | `d3.easygraph.line(config)` | `lines`, `areas`, `zoom`, `crosshair`, `crosshairThreshold`, `interpolate` | Continuous (time or linear) x axis. Zoom and crosshair can be synced across multiple charts via `d3.easygraph.syncZoom`/`syncCrosshair`. |
| Bars | `d3.easygraph.bars(config)` | `orientation` (`'v'`\|`'h'`), `mode` (`'stacked'`\|`'grouped'`), `colorPerData` | Category axis uses a `d3.scaleBand()`. `orientation` is fixed for a chart's lifetime; `mode` can be toggled live. |
| Heatmap | `d3.easygraph.heatmap(config)` | `color` (unit/preset config for the color scale) | A grid of colored cells over plain continuous x/y axes. |

Shared config across all three: `container`, `label`, `x`/`y` (`scale`, `unit`, `label`, `noTick`,
`preset`, `m`/`n`), `height`, `margin`, `colorPalette`, `duration`, `oneYear` (also used by heatmaps
whose x-axis spans a full year, not just line charts).

`container` accepts a CSS selector string, a DOM element, or a d3 selection. `height` must be a
positive number and `container` must resolve to an element — both are checked at construction time,
throwing a clear error instead of failing cryptically later. Every chart has a `graph.destroy()`
that disconnects its resize observer and tears down its DOM.

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
  label:     "Temperature",
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

## Architecture

- `src/d3.easygraph.core.js` — container sizing/resize, SVG/margin/clip/title scaffolding, palette
  handling, number/time axis formatting, unit presets (`d3.easygraph.presets`), and the shared
  `_build()` that each constructor calls with its own defaults and hook set.
- `src/d3.easygraph.line.js`, `.bars.js`, `.heatmap.js` — one constructor per chart family above,
  each implementing a small `prepareScales?`/`init?`/`domain`/`render`/`resize?`/`destroy?` hook
  interface (only `domain`/`render` are required; `prepareScales` is bars-only, for its band scale;
  `destroy` is line-only, to remove its `document.body`-appended crosshair tooltip).

## Building

```sh
npm install
npm run build
```

Bundles and minifies all four source files (via [terser](https://github.com/terser/terser),
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
