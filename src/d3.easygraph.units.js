// d3.easygraph.units.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// Standalone unit-conversion helpers, built on the same preset table (d3.easygraph.presets)
// the chart families resolve their x/y/color config against — no container, no chart
// construction. Useful for e.g. converting/labeling a raw value on a map marker or tooltip.

// resolves a preset (and/or explicit label/unit/m/n/range overrides) into a complete
// { label, unit, scale, noTick, m, n, range } config — the same resolution a chart's x/y
// property goes through, without needing a graph
d3.easygraph.resolveUnit = function(config) {
  return d3.easygraph._resolveProperty(d3.easygraph._extend({}, config || {}), (config && config.label) || '');
};

// converts a raw value via a preset's (or config's) linear m/n coefficients:
// display = m * value + n. presetOrConfig may be a preset name string (e.g.
// "temperatureF") or a config object like the one passed to resolveUnit()
d3.easygraph.convertUnit = function(value, presetOrConfig) {
  var config = (typeof presetOrConfig === 'string') ? { preset: presetOrConfig } : presetOrConfig;
  var resolved = d3.easygraph.resolveUnit(config);
  return resolved.m * value + resolved.n;
};
