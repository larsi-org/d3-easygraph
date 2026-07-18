# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- `d3.easygraph.getUnit(name)` — returns a preset (or the generic `default` fallback, for a
  falsy/unrecognized name) as a complete, ready-to-use `{ label, unit, scale, convert, range }`.
  Usable standalone, no chart or container needed — e.g. converting a raw value for a map marker.
- `d3.easygraph.round(x, n)` — rounds to `n` decimal places, moved out of `weather/report.php` and
  `sensors/report.php`, which each defined an identical local copy. Deliberately not yet
  preset/range-aware (a sensible default precision derived from a preset's `range` is still being
  decided) — same explicit-`n` behavior as the two pages' old local helper.
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
