// d3.easygraph.units.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// A small, easygraph-agnostic unit-preset lookup: a static table of physical-quantity unit
// definitions (label, unit, scale, convert) and one function to fetch one by name. No config
// merging, no chart concepts — just data, reusable well beyond charting (e.g. converting a raw
// value for a map marker). Chart config resolution (folding a preset, plus a call-site label
// fallback, onto a graph's x/y/color config) lives in core.js, the only actual consumer that
// needs it. Deliberately no default `range` per preset (removed 2026-07) -- a sensible axis
// range is data-dependent (what a station/sensor actually observes), not a property of the
// physical quantity itself, so a generic one-size-fits-all range was never the right fit; a
// chart with no `range` in its `y` config auto-scales from whatever data is currently loaded.

// rounds x to n decimal places (n omitted or 0 rounds to the nearest integer)
d3.easygraph.round = function(x, n) {
  return n ? Math.round(x * Math.pow(10, n)) / Math.pow(10, n) : Math.round(x);
};

function _identity(v) { return v; }

// the raw conversion formulas -- named for readability, referenced by the presets table below
function _temperatureC2F(v)  { return v * 1.8 + 32; }
function _pressureHpa2Inhg(v) { return v * 0.02953; }
function _windSpeedMs2Kmph(v) { return v * 3.6; }
function _windSpeedMs2Mph(v)  { return v * 2.23694; }
function _rainFallMm2Inches(v) { return v / 25.4; }

// wraps a raw convert(v) formula so it also accepts an optional decimals arg: convert(v) stays
// the raw, unrounded value (safe for e.g. color-scale interpolation); convert(v, d) rounds it
// via d3.easygraph.round(..., d) -- sugar for round(convert(v), d) in one call
function _withRounding(rawConvert) {
  return function(v, d) {
    var converted = rawConvert(v);
    return (d === undefined) ? converted : d3.easygraph.round(converted, d);
  };
}

// shared by every preset with no real conversion -- computed once, referenced everywhere below
var _roundedIdentity = _withRounding(_identity);

// every preset is a complete unit definition — `convert` is always present (identity when a
// quantity needs no conversion), so getUnit() never needs a second fallback merge to fill gaps
d3.easygraph.presets = {
  default:          {                             unit: '',          scale: 'linear', convert: _roundedIdentity },
  clouds:           { label: 'Clouds',            unit: '\xD710th',  scale: 'linear', convert: _roundedIdentity },
  electricCurrent:  { label: 'Current',           unit: 'A',         scale: 'linear', convert: _roundedIdentity },
  electricPower:    { label: 'Power',             unit: 'W',         scale: 'linear', convert: _roundedIdentity },
  electricVoltage:  { label: 'Voltage',           unit: 'V',         scale: 'linear', convert: _roundedIdentity },
  pressureHpa:      { label: 'Pressure',          unit: 'hPa',       scale: 'linear', convert: _roundedIdentity },
  pressureInhg:     { label: 'Pressure',          unit: 'inHg',      scale: 'linear', convert: _withRounding(_pressureHpa2Inhg) },
  rainFallMm:       { label: 'Rain Fall',         unit: 'mm',        scale: 'linear', convert: _roundedIdentity },
  rainFallInches:   { label: 'Rain Fall',         unit: 'inches',    scale: 'linear', convert: _withRounding(_rainFallMm2Inches) },
  relativeHumidity: { label: 'Relative Humidity', unit: '%',         scale: 'linear', convert: _roundedIdentity },
  solarRadiation:   { label: 'Solar Radiation',   unit: 'W/m\xB2',   scale: 'linear', convert: _roundedIdentity },
  temperatureC:     { label: 'Temperature',       unit: '\xB0C',     scale: 'linear', convert: _roundedIdentity },
  temperatureF:     { label: 'Temperature',       unit: '\xB0F',     scale: 'linear', convert: _withRounding(_temperatureC2F) },
  windSpeed:        { label: 'Wind Speed',        unit: 'm/s',       scale: 'linear', convert: _roundedIdentity },
  windSpeedKmph:    { label: 'Wind Speed',        unit: 'kmph',      scale: 'linear', convert: _withRounding(_windSpeedMs2Kmph) },
  windSpeedMph:     { label: 'Wind Speed',        unit: 'mph',       scale: 'linear', convert: _withRounding(_windSpeedMs2Mph) },
  windDirection:    { label: 'Wind Direction',    unit: '\xB0North', scale: 'linear', convert: _roundedIdentity },
};

// returns the named preset, or presets.default if name is falsy or unrecognized
d3.easygraph.getUnit = function(name) {
  return d3.easygraph.presets[name] || d3.easygraph.presets.default;
};
