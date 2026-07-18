# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.0] - 2026-07-18

### Changed
- Presets (`d3.easygraph.presets`) and x/y/color config resolution (`_resolveProperty`) moved from
  `core.js` into `units.js`, which now owns everything unit-related; `core.js` is pure chart
  scaffolding.
- Presets express their raw-to-display conversion as a `convert(v)` function instead of linear
  `m`/`n` coefficients (`m * v + n`) — supports non-linear conversions, and reads as "how do I
  convert this value" rather than a formula the caller has to remember. A preset with no
  conversion of its own now gets the identity function (previously `m: 1, n: 0`).

## [0.4.0] - 2026-07-18

### Added
- `d3.easygraph.resolveUnit(config)` and `d3.easygraph.convertUnit(value, presetOrConfig)` —
  standalone unit-conversion helpers built on the existing preset table, usable without
  constructing any chart (e.g. for converting/labeling a raw value on a map marker). New
  `src/d3.easygraph.units.js` module, depending only on `core.js`.

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
