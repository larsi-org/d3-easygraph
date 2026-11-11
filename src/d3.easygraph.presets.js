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

// rounds x to n decimal places (n omitted or 0 rounds to the nearest integer); internal, behind
// convertRounded. round and compassPoint used to be public; a charting API is not the place for a
// rounding helper or wind-direction labels, and compassPoint lives on as code to copy on
// https://larsi.org/graphics/earth-and-sky/compass/.
function _round(x, n) {
  return n ? Math.round(x * Math.pow(10, n)) / Math.pow(10, n) : Math.round(x);
}

function _identity(v) { return v; }

// convert(v) is the raw, unrounded value (safe for color-scale interpolation); the rounded form
// is its own function, convertRounded(v, d) = round(convert(v), d).
function _roundedFrom(convert) {
  return function(v, d) { return _round(convert(v), d); };
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
  windSpeedKnots:       { label: 'Wind Speed',        unit: 'kn',     convert: function(v) { return v * 1.943844; } },
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
