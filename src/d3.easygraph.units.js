// d3.easygraph.units.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// A small, easygraph-agnostic unit-preset lookup: a static table of physical-quantity unit
// definitions (label, unit, scale, convert, range) and one function to fetch one by name. No
// config merging, no chart concepts — just data, reusable well beyond charting (e.g. converting
// a raw value for a map marker). Chart config resolution (folding a preset, plus a call-site
// label fallback, onto a graph's x/y/color config) lives in core.js, the only actual consumer
// that needs it.

function _identity(v) { return v; }

// every preset is a complete unit definition — `convert` is always present (identity when a
// quantity needs no conversion), so getUnit() never needs a second fallback merge to fill gaps
d3.easygraph.presets = {
  default:          { unit: '',                  scale: 'linear',    convert: _identity },
  pressureHpa:      { label: 'Pressure',         unit: 'hPa',        scale: 'linear',    convert: _identity,                range: [ 950, 1050 ] },
  pressureInhg:     { label: 'Pressure',         unit: 'inHg',       scale: 'linear',    convert: function(v) { return v * 0.02953; },        range: [ 28, 31 ] },
  relativeHumidity: { label: 'Relative Humidity', unit: '%',         scale: 'linear',    convert: _identity,                range: [ 0, 100 ] },
  temperatureC:     { label: 'Temperature',      unit: '\xB0C',      scale: 'linear',    convert: _identity,                range: [ -25, 45 ] },
  temperatureF:     { label: 'Temperature',      unit: '\xB0F',      scale: 'linear',    convert: function(v) { return v * 1.8 + 32; },       range: [ -10, 110 ] },
  windSpeed:        { label: 'Wind Speed',       unit: 'm/s',        scale: 'linear',    convert: _identity,                range: [ 0, 20 ] },
  windSpeedKmph:    { label: 'Wind Speed',       unit: 'kmph',       scale: 'linear',    convert: function(v) { return v * 3.6; },            range: [ 0, 80 ] },
  windSpeedMph:     { label: 'Wind Speed',       unit: 'mph',        scale: 'linear',    convert: function(v) { return v * 2.23694; },        range: [ 0, 50 ] },
  windDirection:    { label: 'Wind Direction',   unit: '\xB0North',  scale: 'linear',    convert: _identity,                range: [ 0, 360 ] },
  rainFallMm:       { label: 'Rain Fall',        unit: 'mm',         scale: 'linear',    convert: _identity,                range: [ 0, 100 ] },
  rainFallInches:   { label: 'Rain Fall',        unit: 'inches',     scale: 'linear',    convert: function(v) { return v / 25.4; },           range: [ 0, 100 ] },
  clouds:           { label: 'Clouds',           unit: '\xD710th',   scale: 'linear',    convert: _identity,                range: [ 0, 10 ] },
  solarRadiation:   { label: 'Solar Radiation',  unit: 'W/m\xB2',    scale: 'linear',    convert: _identity,                range: [ 0, 1500 ] },
  electricVoltage:  { label: 'Voltage',          unit: 'V',          scale: 'linear',    convert: _identity,                range: [ 100, 140 ] },
  electricCurrent:  { label: 'Current',          unit: 'A',          scale: 'linear',    convert: _identity,                range: [ 0, 10 ] },
  electricPower:    { label: 'Power',            unit: 'W',          scale: 'linear',    convert: _identity,                range: [ 0, 1500 ] }
};

// returns the named preset, or presets.default if name is falsy or unrecognized
d3.easygraph.getUnit = function(name) {
  return d3.easygraph.presets[name] || d3.easygraph.presets.default;
};

// rounds x to n decimal places (n omitted or 0 rounds to the nearest integer). A plain,
// explicit-precision helper for now — centralized here since every real consumer needs it
// after convert(), not because precision is derived from a preset (yet); a preset-range-based
// default precision is still undecided.
d3.easygraph.round = function(x, n) {
  return n ? Math.round(x * Math.pow(10, n)) / Math.pow(10, n) : Math.round(x);
};
