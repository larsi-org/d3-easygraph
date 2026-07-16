# d3-easygraph

[![Build](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml/badge.svg)](https://github.com/larsi-org/d3-easygraph/actions/workflows/build.yml)

A small, batteries-included charting library built on [D3](https://d3js.org) v7: lines, filled
areas, zoom, a hover crosshair, stacked/grouped bars (vertical and horizontal), and heatmaps — all
through one consistent config object, with chart width that tracks its container's rendered size
(height stays fixed).

## Chart families

`d3.easygraph({...})` picks its behavior from the config flags you pass in. Exactly one family is
normally active per chart:

| Family | Flags | Notes |
| --- | --- | --- |
| Line / area | `show_lines`, `show_areas`, `show_zoom`, `show_crosshair` | Continuous (time or linear) x axis. Zoom and crosshair only make sense here, and can be synced across multiple charts via `d3.easygraph.syncZoom`/`syncCrosshair`. |
| Bars | `show_bars_stacked_v`, `show_bars_grouped_v`, `show_bars_stacked_h`, `show_bars_grouped_h` | Category axis uses a `d3.scaleBand()`. Orientation (v/h) is fixed for a chart's lifetime; stacked vs. grouped can be toggled live. |
| Heatmap | `show_heatmap` | A grid of colored cells over plain continuous x/y axes, colored via its own `graph.c` scale. |

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
var graph = d3.easygraph({
  id:     "graph",
  label:  "Temperature",
  x:      { scale: "time" },
  y:      { defaults: "temperature_c" },
  svg:    { height: 320 },
  margin: { top: 20, right: 20, bottom: 30, left: 50 },
  show_lines: true
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

`graph.update(data, x_range, y_range)` re-renders with new data (`x_range`/`y_range` optionally
pin the axis domains instead of auto-fitting to the data). Resize handling is automatic — no calls
needed on your end.

## Architecture

- `src/d3.easygraph.core.js` — container sizing/resize, SVG/margin/clip/title scaffolding,
  palette handling, number/time axis formatting, and a self-registering module dispatch that the
  other three files plug into.
- `src/d3.easygraph.line.js`, `.bars.js`, `.heatmap.js` — one file per chart family above, each
  implementing a small `init`/`domain`/`render`/`resize` hook interface.

## Building

```sh
npm install
npm run build
```

Bundles and minifies all four source files (via [terser](https://github.com/terser/terser),
concatenated in dependency order — core first) into the single `dist/d3.easygraph.min.js`.

## License

MIT — see [LICENSE](LICENSE).
