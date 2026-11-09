// d3.easygraph.presets.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// A small, easygraph-agnostic unit-preset lookup: a static table of physical-quantity unit
// definitions (label, unit, convert) and one function to fetch one by name. No config
// merging, no chart concepts - just data, reusable well beyond charting (e.g. converting a raw
// value for a map marker). Chart config resolution (folding a preset, plus a call-site label
// fallback, onto a graph's x or y config) lives in core.js, the only actual consumer that
// needs it. Deliberately no default `range` per preset (removed 2026-07) - a sensible axis
// range is data-dependent (what a station/sensor actually observes), not a property of the
// physical quantity itself, so a generic one-size-fits-all range was never the right fit; a
// chart that pins no y domain auto-scales from whatever data is currently loaded.

// rounds x to n decimal places (n omitted or 0 rounds to the nearest integer)
d3.easygraph.round = function(x, n) {
  return n ? Math.round(x * Math.pow(10, n)) / Math.pow(10, n) : Math.round(x);
};

// compassPoint(direction, points): the nearest 16-, 8- or 4-point compass label (points defaults
// to 16) for a raw bearing in degrees (0 = north, clockwise) - a plain string lookup, not a
// `convert`: every preset's convert() feeds a numeric axis, so a label-returning function isn't
// usable as one and doesn't belong in `presets` below. No FROM/TO wind-direction semantic either -
// purely "which label is this angle closest to," so a caller distinguishing wind blowing from vs.
// toward a bearing applies that adjustment before calling this.
//
// The direction is bucketed into 32 raw, uncentered 11.25-degree segments (segment 0 = [0, 11.25)),
// adding 360 first so a slightly negative input (e.g. -1) reads as just before N. 11.25 evenly
// divides 22.5/45/90 (the 16-/8-/4-point sector widths), so every centered compass sector's edges
// land on a segment edge, and the label index follows from the segment number by a shift and a mask:
// 16 points pair up 2 segments per sector, 8 group 4, 4 group 8, each into an index on the shared
// 16-entry label list (verified exhaustively at 0.01-degree resolution, -720 to 720).
var _compassPoints = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
];
var _compassMask = { 16: 0x0f, 8: 0x0e, 4: 0x0c };
d3.easygraph.compassPoint = function(direction, points) {
  points = (points == null) ? 16 : points;
  var mask = _compassMask[points];
  if (!mask) throw new Error('d3.easygraph.compassPoint: points must be 16, 8 or 4, got ' + JSON.stringify(points));
  var segment = Math.floor((direction + 360) / 11.25) & 0x1f;
  return _compassPoints[((segment + 16 / points) >> 1) & mask];
};

function _identity(v) { return v; }

// convert(v) is the raw, unrounded value (safe for color-scale interpolation); the rounded form
// is its own function, convertRounded(v, d) = round(convert(v), d).
function _roundedFrom(convert) {
  return function(v, d) { return d3.easygraph.round(convert(v), d); };
}

// Each preset's `convert` takes the value in the base unit of its quantity and returns it in the
// preset's unit: temperature from °C, pressure from hPa, rainfall from mm, wind speed from m/s. A
// preset is { label, unit, convert }; convert may be left out (no conversion), and preset() fills in
// convert and convertRounded on an entry that lacks them, so an entry you add needs only label and unit.
// Names are quantity + unit, the unit spelled as in the unit string (C, F, Hpa, InHg, Mm, In, Ms, Kmh, Mph).
d3.easygraph.presets = {
  batteryStateOfCharge: { label: 'Battery',           unit: '%' },
  clouds:               { label: 'Clouds',            unit: 'tenths' },
  electricCurrent:      { label: 'Current',           unit: 'A' },
  electricPower:        { label: 'Power',             unit: 'W' },
  electricVoltage:      { label: 'Voltage',           unit: 'V' },
  pressureHpa:          { label: 'Pressure',          unit: 'hPa' },
  pressureInHg:         { label: 'Pressure',          unit: 'inHg',   convert: function(v) { return v * 0.02953; } },
  rainfallMm:           { label: 'Rainfall',          unit: 'mm' },
  rainfallIn:           { label: 'Rainfall',          unit: 'in',     convert: function(v) { return v / 25.4; } },
  relativeHumidity:     { label: 'Relative Humidity', unit: '%' },
  solarRadiation:       { label: 'Solar Radiation',   unit: 'W/m\xB2' },
  temperatureC:         { label: 'Temperature',       unit: '\xB0C' },
  temperatureF:         { label: 'Temperature',       unit: '\xB0F',  convert: function(v) { return v * 1.8 + 32; } },
  windSpeedMs:          { label: 'Wind Speed',        unit: 'm/s' },
  windSpeedKmh:         { label: 'Wind Speed',        unit: 'km/h',   convert: function(v) { return v * 3.6; } },
  windSpeedMph:         { label: 'Wind Speed',        unit: 'mph',    convert: function(v) { return v * 2.23694; } },
  windDirection:        { label: 'Wind Direction',    unit: '\xB0' }
};

function _complete(p) {
  if (typeof p.convert !== 'function') p.convert = _identity;
  if (typeof p.convertRounded !== 'function') p.convertRounded = _roundedFrom(p.convert);
  return p;
}
Object.keys(d3.easygraph.presets).forEach(function(name) { _complete(d3.easygraph.presets[name]); });

// What a chart axis with no preset resolves to: no label, no unit, no conversion. Not in the table,
// so Object.keys(d3.easygraph.presets) lists only real quantities.
var _NO_PRESET = _complete({ unit: '' });

// Returns the named preset, or the no-preset entry above when name is falsy (no preset asked for).
// An unrecognized non-empty name throws: a typo like 'temprature' would otherwise give a chart with
// no label, unit or conversion and no hint why.
d3.easygraph.preset = function(name) {
  if (!name) return _NO_PRESET;
  var preset = Object.prototype.hasOwnProperty.call(d3.easygraph.presets, name) && d3.easygraph.presets[name];
  if (!preset) {
    throw new Error('d3.easygraph: unrecognized preset ' + JSON.stringify(name) +
                    ' (see Object.keys(d3.easygraph.presets))');
  }
  return _complete(preset);
};
