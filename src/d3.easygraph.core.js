// d3.easygraph.core.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// Shared scaffolding for every chart family: container sizing/resize, SVG/margin/
// clip/title DOM, palette, number/time formatting, unit presets, and the shared
// _build() that d3.easygraph.line/.bars/.heatmap call into with their own hooks.

d3.easygraph = {};

// shallow "fill in the blanks" merge — dst wins where already set
d3.easygraph._extend = function(dst, src) {
  for (var key in src) {
    if (src.hasOwnProperty(key) && dst[key] === undefined) dst[key] = src[key];
  }
  return dst;
};

// static unit presets for x/y/color config, e.g. { preset: "temperatureF" }
d3.easygraph.presets = {
  pressureHpa:      { label: 'Pressure',         unit: 'hPa',        range: [ 950, 1050 ] },
  pressureInhg:     { label: 'Pressure',         unit: 'inHg',       m: 0.02953,  range: [ 28, 31 ] },
  relativeHumidity: { label: 'Relative Humidity', unit: '%',         range: [ 0, 100 ] },
  temperatureC:     { label: 'Temperature',      unit: '\xB0C',      range: [ -25, 45 ] },
  temperatureF:     { label: 'Temperature',      unit: '\xB0F',      m: 1.8, n: 32.0, range: [ -10, 110 ] },
  dewPointC:        { label: 'Dew Point',        unit: '\xB0C',      range: [ -25, 45 ] },
  dewPointF:        { label: 'Dew Point',        unit: '\xB0F',      m: 1.8, n: 32.0, range: [ -10, 110 ] },
  windSpeed:        { label: 'Wind Speed',       unit: 'm/s',        range: [ 0, 20 ] },
  windSpeedKmph:    { label: 'Wind Speed',       unit: 'kmph',       m: 3.6, range: [ 0, 80 ] },
  windSpeedMph:     { label: 'Wind Speed',       unit: 'mph',        m: 2.23694, range: [ 0, 50 ] },
  windDirection:    { label: 'Wind Direction',   unit: '\xB0North',  range: [ 0, 360 ] },
  rainFallMm:       { label: 'Rain Fall',        unit: 'mm',         range: [ 0, 100 ] },
  rainFallInches:   { label: 'Rain Fall',        unit: 'inches',     m: 1 / 25.4, range: [ 0, 100 ] },
  clouds:           { label: 'Clouds',           unit: '\xD710th',   range: [ 0, 10 ] },
  solarRadiation:   { label: 'Solar Radiation',  unit: 'W/m\xB2',    range: [ 0, 1500 ] },
  electricVoltage:  { label: 'Voltage',          unit: 'V',          range: [ 100, 140 ] },
  electricCurrent:  { label: 'Current',          unit: 'A',          range: [ 0, 10 ] },
  electricPower:    { label: 'Power',            unit: 'W',          range: [ 0, 1500 ] }
};

// resolves a preset (if any) and generic fallbacks onto an x/y/color config object
d3.easygraph._resolveProperty = function(prop, label) {
  if (prop.preset) d3.easygraph._extend(prop, d3.easygraph.presets[prop.preset]);
  d3.easygraph._extend(prop, { label: label, unit: '', scale: 'linear', noTick: false, m: 1.0, n: 0.0 });
  return prop;
};

// accepts a CSS selector string, a DOM element, or a d3 selection; returns an
// Element or null
function _resolveContainer(container) {
  if (container == null) return null;
  if (typeof container === 'string') return document.querySelector(container);
  if (container.nodeType === 1) return container;
  if (typeof container.node === 'function') return container.node();
  return null;
}

// internal <clipPath> ids only need to be unique per page, not tied to the
// caller's container reference
var _nextClipId = 0;

// shared constructor body — each family (line/bars/heatmap) calls this with its own
// defaults and a moduleFactory(graph) returning { prepareScales?, init?, domain, render, resize? }
d3.easygraph._build = function(config, familyDefaults, moduleFactory) {
  var graph = config || {};

  var containerEl = _resolveContainer(graph.container);
  if (!containerEl) {
    throw new Error('d3.easygraph: container not found (' + JSON.stringify(graph.container) + ')');
  }

  d3.easygraph._extend(graph, { margin: { top: 20, right: 20, bottom: 30, left: 50 } });
  if (!(graph.height > 0)) {
    throw new Error('d3.easygraph: height must be a positive number');
  }

  // measures the container's current rendered width; returns false if unchanged
  // (within 1px) so callers can skip redundant layout/redraw work
  function _measureWidth() {
    var w = containerEl.getBoundingClientRect().width;
    // ignore transient/degenerate layout passes (e.g. mid-reflow during a live
    // resize) that would otherwise drive graph.width negative
    if (w <= graph.margin.left + graph.margin.right) return false;
    var changed = graph.width === undefined || Math.abs(w - graph._outerWidth) >= 1;
    graph._outerWidth = w;
    graph.width = graph._outerWidth - graph.margin.left - graph.margin.right;
    return changed;
  }

  graph.colorbrewerPalettes = (function() {
    var palettes = {};
    for (var name in colorbrewer) {
      if (colorbrewer.hasOwnProperty(name)) {
        var sizes = Object.keys(colorbrewer[name]).map(Number);
        palettes[name] = colorbrewer[name][Math.max.apply(null, sizes)];
      }
    }
    palettes.D3_category10   = ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd","#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf"];
    palettes.D3_category20   = ["#1f77b4","#aec7e8","#ff7f0e","#ffbb78","#2ca02c","#98df8a","#d62728","#ff9896","#9467bd","#c5b0d5","#8c564b","#c49c94","#e377c2","#f7b6d2","#7f7f7f","#c7c7c7","#bcbd22","#dbdb8d","#17becf","#9edae5"];
    palettes.D3_category20b  = ["#393b79","#5254a3","#6b6ecf","#9c9ede","#637939","#8ca252","#b5cf6b","#cedb9c","#8c6d31","#bd9e39","#e7ba52","#e7cb94","#843c39","#ad494a","#d6616b","#e7969c","#7b4173","#a55194","#ce6dbd","#de9ed6"];
    palettes.D3_category20c  = ["#3182bd","#6baed6","#9ecae1","#c6dbef","#e6550d","#fd8d3c","#fdae6b","#fdd0a2","#31a354","#74c476","#a1d99b","#c7e9c0","#756bb1","#9e9ac8","#bcbddc","#dadaeb","#636363","#969696","#bdbdbd","#d9d9d9"];
    palettes.LS_SustainZones = ["#F66","#6F6","#66F","#EE6","#6FF","#F6F","#B22","#2B2","#22B","#AA2","#2BB","#B2B","#D44","#4D4","#44D","#CC4","#4DD","#D4D","#900","#090","#009","#880","#099","#909"];
    palettes.LS_RdGnBu       = ["#F00","#0F0","#00F"];
    palettes.LS_BuMaRd       = ["#00F","#F0F","#F00"];
    palettes.LS_BuRdYl       = ["#00F","#F00","#FF0"];
    palettes.LS_BuCyGnYlRd   = ["#00F","#0FF","#0F0","#FF0","#F00"];
    palettes.LS_Gy           = ["#000","#FFF"];
    return palettes;
  })();

  // multi-format tick labels for one-year time axes
  var _timeFormats = [
    [d3.timeFormat("%I:%M"), function(d) { return d.getMinutes(); }],
    [d3.timeFormat("%I %p"), function(d) { return d.getHours(); }],
    [d3.timeFormat("%a %d"), function(d) { return d.getDay() && d.getDate() != 1; }],
    [d3.timeFormat("%b %d"), function(d) { return d.getDate() != 1; }],
    [d3.timeFormat("%b"),    function(d) { return true; }]
  ];
  graph.timeFormatShort = function(date) {
    for (var i = 0; i < _timeFormats.length; i++) {
      if (_timeFormats[i][1](date)) return _timeFormats[i][0](date);
    }
  };

  graph.numberFormat = function(d) {
    var d_abs = Math.abs(d);
    if (d_abs === 0) return '0';
    if (d_abs >= 0.01 && d_abs < 1000) return String(parseFloat(d.toPrecision(6)));
    return d3.format('.3s')(d);
  };

  // overridden by d3.easygraph.line.js's init() when that module is active;
  // a harmless no-op otherwise (bars/heatmap reposition via render(), not draw())
  graph.draw = function() {};

  graph._clipId = "d3-easygraph-clip-" + (_nextClipId++);

  d3.easygraph._extend(graph, familyDefaults);
  d3.easygraph._extend(graph, {
    x:            {},
    y:            {},
    colorPalette: 'D3_category10',
    duration:     500,
    oneYear:      false
  });

  var REVERSE_SUFFIX = "_reversed";
  if (graph.colorPalette.endsWith(REVERSE_SUFFIX)) {
    graph.PALETTE_COLORS = graph.colorbrewerPalettes[graph.colorPalette.slice(0, -REVERSE_SUFFIX.length)].slice(0);
    graph.PALETTE_COLORS.reverse();
  } else {
    graph.PALETTE_COLORS = graph.colorbrewerPalettes[graph.colorPalette].slice(0);
  }

  d3.easygraph._resolveProperty(graph.x, 'Property X');
  d3.easygraph._resolveProperty(graph.y, 'Property Y');
  d3.easygraph._extend(graph, { label: graph.y.label, unit: graph.y.unit });

  graph._outerHeight = graph.height;
  graph.height = graph._outerHeight - graph.margin.top - graph.margin.bottom;
  _measureWidth();

  graph._module = moduleFactory(graph);

  if (graph._module.prepareScales) {
    graph._module.prepareScales();
  } else {
    graph.x.$scale = (graph.x.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.x.$scale.range([0, graph.width]);
    graph.y.$scale = (graph.y.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.y.$scale.range([graph.height, 0]);
  }

  graph.x.$axis = d3.axisBottom(graph.x.$scale).tickSize(-graph.height).tickPadding(12);
  if (graph.x.scale === 'linear' && !graph.x.$scale.bandwidth) graph.x.$axis.tickFormat(graph.numberFormat);
  if (graph.x.scale === 'time'   && graph.oneYear)             graph.x.$axis.tickFormat(graph.timeFormatShort);
  if (graph.x.noTick)                                          graph.x.$axis.tickFormat(function() { return ''; });

  graph.y.$axis = d3.axisLeft(graph.y.$scale).tickSize(-graph.width).tickPadding(6);
  if (graph.y.scale === 'linear' && !graph.y.$scale.bandwidth) graph.y.$axis.tickFormat(graph.numberFormat);
  if (graph.y.noTick)                                          graph.y.$axis.tickFormat(function() { return ''; });

  graph.$svgRoot = d3.select(containerEl)
    .append("svg")
      .attr("width", graph._outerWidth)
      .attr("height", graph._outerHeight);
  graph.$svg = graph.$svgRoot
    .append("g")
      .attr("transform", "translate(" + graph.margin.left + "," + graph.margin.top + ")");

  graph.$svg
    .append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + graph.height + ")")
      .call(graph.x.$axis);

  graph.$title = graph.$svg
    .append("g")
      .attr("class", "y axis")
      .call(graph.y.$axis)
    .append("text")
      .attr("id", "title")
      .attr("x", graph.width / 2)
      .attr("y", -6);

  graph.$clipRect = graph.$svg
    .append("clipPath")
      .attr("id", graph._clipId)
    .append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", graph.width).attr("height", graph.height);

  graph.$group = graph.$svg.append("g");

  graph.getPaletteColor = function(index) {
    return graph.PALETTE_COLORS[index % graph.PALETTE_COLORS.length];
  };

  // module init() runs after core scaffolding above (scales/axes/svg/margin/clip/
  // group all exist) so e.g. line.js's zoom pane can be appended right after
  // graph.$group, and crosshair after that — same DOM order as before
  if (graph._module.init) graph._module.init();

  // re-applies everything that depends on the container's rendered width;
  // returns false (no-op) if the width hasn't actually changed
  graph._layout = function() {
    if (!_measureWidth()) return false;

    if (graph.x.$scale.bandwidth) {
      graph.x.$scale.rangeRound([0, graph.width]);
    } else {
      graph.x.$scale.range([0, graph.width]);
    }
    graph.y.$axis.tickSize(-graph.width);

    graph.$svgRoot.attr("width", graph._outerWidth);
    graph.$clipRect.attr("width", graph.width);
    graph.$title.attr("x", graph.width / 2);

    if (graph._module.resize) graph._module.resize();

    return true;
  };

  var resizeObserver = new ResizeObserver(function() {
    if (graph._layout() && graph._lastData) graph._reflow();
  });
  resizeObserver.observe(containerEl);

  // disconnects the resize observer and tears down anything a module created
  // outside graph.$svgRoot (e.g. line.js's crosshair tooltip); removing
  // $svgRoot takes care of everything inside it (paths, listeners, the pane)
  graph.destroy = function() {
    resizeObserver.disconnect();
    if (graph._module.destroy) graph._module.destroy();
    graph.$svgRoot.remove();
  };

  // re-renders in place after a resize, using the last data passed to update();
  // domains don't change here, only the pixel ranges _layout() just updated
  graph._reflow = function() {
    var savedDuration = graph.duration;
    graph.duration = 0;

    graph.draw();
    graph._module.render(graph._lastData);

    graph.duration = savedDuration;
  };

  graph.update = function(data, xRange, yRange) {
    graph._lastData = data;

    graph.$svg.select("#title")
      .text((graph.unit) ? graph.label + " [" + graph.unit + "]" : graph.label);

    var domains = graph._module.domain(data, xRange, yRange) || { x: [0, 1], y: [0, 1] };
    graph.x.$scale.domain(domains.x);
    graph.y.$scale.domain(domains.y);

    graph._module.render(data);

    graph.$svg.select("g.x.axis").transition().duration(graph.duration).call(graph.x.$axis);
    graph.$svg.select("g.y.axis").transition().duration(graph.duration).call(graph.y.$axis);
  };

  return graph;
};
