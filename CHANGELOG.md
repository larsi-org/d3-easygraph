# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed
- The generic fallback `_resolveProperty` used to merge when a property has no preset (or an
  unrecognized one) is now a real `default` entry at the top of `d3.easygraph.presets`, instead of
  an object literal hardcoded inside `_resolveProperty`. `{ preset: "default" }` is now equivalent
  to omitting `preset` entirely.
- `_resolveProperty`'s call-site `label` (e.g. "Property X") is now folded into that same merge —
  one `_extend` call instead of two — rather than being a separate step after `default`.
- Every real preset now declares its own `scale: 'linear'` (it genuinely affects tick formatting —
  `core.js` checks `scale === 'linear'` to decide whether to apply `numberFormat`, not just
  "anything but time"), instead of relying solely on `default`'s copy. `default` keeps its own
  `scale: 'linear'` too, as the fallback for properties with no preset at all.
- Dropped `noTick: false` from `default` — it's an axis-rendering choice, not a unit concept, and
  every read of it (`if (graph.x.noTick)`) already treats `undefined` the same as `false`.

### Removed
- `dewPointC` and `dewPointF` presets — unused across every `Public/html` page and, after a DB
  migration, the `larsi-sensors` database. Dew point readings that used `dewPointF` now use
  `temperatureF` instead (same unit/conversion/range, no dedicated preset needed).

### Changed
- `units.js` is now just the preset table plus one function, `d3.easygraph.getUnit(name)` —
  returns a preset (or `default`) as a complete, ready-to-use object. No config merging, no chart
  concepts — replaces `resolveUnit()`/`convertUnit()`, which did that folding. Config resolution
  (`_resolveProperty`, folding a preset plus the call-site label onto a graph's x/y/color config)
  moved into `core.js`, the only actual consumer of it.
- Every preset (including `default`) now declares its own `convert` function explicitly, rather
  than most relying on `default`'s identity function as a second-pass fallback — `getUnit()` always
  returns a complete unit definition in one lookup, no merge needed.

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
