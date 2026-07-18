// d3.easygraph.units.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// Unit presets and x/y/color config resolution for every chart family, plus a standalone
// public API (resolveUnit/convertUnit) that needs no container or chart construction at
// all — useful for e.g. converting/labeling a raw value on a map marker or tooltip.
// Depends only on core.js's d3.easygraph._extend.

// static unit presets for x/y/color config, e.g. { preset: "temperatureF" }. `convert`
// (raw -> display) defaults to the identity function when omitted (see _resolveProperty).
d3.easygraph.presets = {
  pressureHpa:      { label: 'Pressure',         unit: 'hPa',        range: [ 950, 1050 ] },
  pressureInhg:     { label: 'Pressure',         unit: 'inHg',       convert: function(v) { return v * 0.02953; },        range: [ 28, 31 ] },
  relativeHumidity: { label: 'Relative Humidity', unit: '%',         range: [ 0, 100 ] },
  temperatureC:     { label: 'Temperature',      unit: '\xB0C',      range: [ -25, 45 ] },
  temperatureF:     { label: 'Temperature',      unit: '\xB0F',      convert: function(v) { return v * 1.8 + 32; },       range: [ -10, 110 ] },
  dewPointC:        { label: 'Dew Point',        unit: '\xB0C',      range: [ -25, 45 ] },
  dewPointF:        { label: 'Dew Point',        unit: '\xB0F',      convert: function(v) { return v * 1.8 + 32; },       range: [ -10, 110 ] },
  windSpeed:        { label: 'Wind Speed',       unit: 'm/s',        range: [ 0, 20 ] },
  windSpeedKmph:    { label: 'Wind Speed',       unit: 'kmph',       convert: function(v) { return v * 3.6; },            range: [ 0, 80 ] },
  windSpeedMph:     { label: 'Wind Speed',       unit: 'mph',        convert: function(v) { return v * 2.23694; },        range: [ 0, 50 ] },
  windDirection:    { label: 'Wind Direction',   unit: '\xB0North',  range: [ 0, 360 ] },
  rainFallMm:       { label: 'Rain Fall',        unit: 'mm',         range: [ 0, 100 ] },
  rainFallInches:   { label: 'Rain Fall',        unit: 'inches',     convert: function(v) { return v / 25.4; },           range: [ 0, 100 ] },
  clouds:           { label: 'Clouds',           unit: '\xD710th',   range: [ 0, 10 ] },
  solarRadiation:   { label: 'Solar Radiation',  unit: 'W/m\xB2',    range: [ 0, 1500 ] },
  electricVoltage:  { label: 'Voltage',          unit: 'V',          range: [ 100, 140 ] },
  electricCurrent:  { label: 'Current',          unit: 'A',          range: [ 0, 10 ] },
  electricPower:    { label: 'Power',            unit: 'W',          range: [ 0, 1500 ] }
};

function _identity(v) { return v; }

// resolves a preset (if any) and generic fallbacks onto an x/y/color config object
d3.easygraph._resolveProperty = function(prop, label) {
  if (prop.preset) d3.easygraph._extend(prop, d3.easygraph.presets[prop.preset]);
  d3.easygraph._extend(prop, { label: label, unit: '', scale: 'linear', noTick: false, convert: _identity });
  return prop;
};

// resolves a preset (and/or explicit label/unit/convert/range overrides) into a complete
// { label, unit, scale, noTick, convert, range } config — the same resolution a chart's
// x/y property goes through, without needing a graph
d3.easygraph.resolveUnit = function(config) {
  return d3.easygraph._resolveProperty(d3.easygraph._extend({}, config || {}), (config && config.label) || '');
};

// converts a raw value via a preset's (or config's) convert(v) function: raw -> display.
// presetOrConfig may be a preset name string (e.g. "temperatureF") or a config object like
// the one passed to resolveUnit()
d3.easygraph.convertUnit = function(value, presetOrConfig) {
  var config = (typeof presetOrConfig === 'string') ? { preset: presetOrConfig } : presetOrConfig;
  return d3.easygraph.resolveUnit(config).convert(value);
};
