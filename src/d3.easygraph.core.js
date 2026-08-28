// d3.easygraph.core.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// Shared scaffolding for every chart family: container sizing/resize, SVG/margin/
// clip/title DOM, number/time formatting, x/y/color config resolution, and the
// shared _build() that d3.easygraph.line/.bars/.heatmap call into with their own hooks.
// Two standalone lookups live in their own files, loaded right after this one — unit presets
// (d3.easygraph.presets / getUnit()) in d3.easygraph.units.js, color palettes
// (colorPalettes / resolvePalette / colorScale) in d3.easygraph.colors.js — neither has
// any chart concepts of its own; this file is the only thing that folds either onto a graph's
// config.

d3.easygraph = {};

// shallow "fill in the blanks" merge — dst wins where already set
d3.easygraph._extend = function(dst, src) {
  for (var key in src) {
    if (src.hasOwnProperty(key) && dst[key] === undefined) dst[key] = src[key];
  }
  return dst;
};

// resolves a preset (via units.js's getUnit(), which always returns a complete unit
// definition) onto an x/y/color config object. label/unit are genuinely optional — if
// neither the caller nor a preset supplies one, they stay undefined, and the title text
// (see near the bottom of _build()) renders blank rather than some generic placeholder.
d3.easygraph._resolveProperty = function(prop) {
  d3.easygraph._extend(prop, d3.easygraph.getUnit(prop.preset));
  return prop;
};

// [min, max] across a flat array of numbers, optionally clipped to the given
// [loQuantile, hiQuantile] (e.g. [0.05, 0.95]) instead of the true min/max -- a single
// extreme outlier no longer stretches the whole domain so far that everything else
// compresses into one end of it. Any x/y/color config accepts a `clip` of this shape;
// omitting it (the default everywhere) keeps the exact same true-min/max behavior as
// before this existed.
d3.easygraph._clippedExtent = function(values, clip) {
  if (!clip) return d3.extent(values);
  var sorted = values.slice().sort(function(a, b) { return a - b; });
  return [d3.quantileSorted(sorted, clip[0]), d3.quantileSorted(sorted, clip[1])];
};

// Stacks layered series, accumulating y0 offsets bottom-up -- shared by bars.js's stacked
// mode and line.js's stackedArea, the same accumulation either way regardless of what shape
// gets drawn from the result. Assumes series are index-aligned (each series' j-th point
// corresponds to the same category/x position across every series) -- fine for bars'
// same-length category arrays; a stacked area caller needs its series sampled at the same x
// points for the same reason.
d3.easygraph._computeStacked = function(data) {
  var result = data.map(function(series) {
    return series.map(function(d) { return Object.assign({ y0: 0 }, d); });
  });
  var len = result[0] ? result[0].length : 0;
  for (var j = 0; j < len; j++) {
    for (var i = 1; i < result.length; i++) {
      result[i][j].y0 = result[i-1][j].y0 + result[i-1][j].y;
    }
  }
  return result;
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

  // Object.assign (not _extend) so a *partial* margin (e.g. { top: 10 }) still gets its own
  // fresh object -- _extend only fills a key when the whole thing is undefined, so a partial
  // margin would otherwise keep right/bottom/left as undefined forever, cascading into NaN
  // width math with no error (see _measureWidth() below). Cloning here also means two charts
  // constructed from the same shared margin object literal can't corrupt each other.
  graph.margin = Object.assign({}, graph.margin);
  d3.easygraph._extend(graph.margin, { top: 20, right: 20, bottom: 30, left: 50 });
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

  // kept on the instance too, not just d3.easygraph, for a caller that reads it off a live
  // chart (graphics/colorbrewer/index.php on the main site) -- the real, load-time-computed
  // copy lives in d3.easygraph.colors.js.
  graph.colorPalettes = d3.easygraph.colorPalettes;

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

  // Clone x/y onto a fresh object rather than resolving in place -- _build() (via
  // _resolveProperty below) writes $scale/$axis directly onto whatever object graph.x/graph.y
  // point to. Left un-cloned, a caller reusing the same x/y config object literal across two
  // chart instances would have the second construction silently overwrite the first chart's
  // scale on that shared object.
  graph.x = Object.assign({}, graph.x);
  graph.y = Object.assign({}, graph.y);

  d3.easygraph._extend(graph, {
    x:            {},
    y:            {},
    colorPalette: 'Qualitative.Tableau10',
    colorClasses: null, // request a specific class count (e.g. 4) from a Sequential/Diverging
                         // palette instead of the largest available -- ignored for Qualitative
                         // and the hardcoded extras, which aren't classed data
    duration:     500,
    oneYear:      false
  });

  graph.paletteColors = d3.easygraph.resolvePalette(graph.colorPalette, graph.colorClasses);

  d3.easygraph._resolveProperty(graph.x);
  d3.easygraph._resolveProperty(graph.y);
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
    return graph.paletteColors[index % graph.paletteColors.length];
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

  // ranges: { x, y } optionally pin the x/y axis domains instead of auto-fitting to data --
  // a single object rather than two positional args so a future range (e.g. color) has
  // somewhere to go without another positional param.
  graph.update = function(data, ranges) {
    ranges = ranges || {};
    graph._lastData = data;

    graph.$svg.select("#title")
      .text((graph.unit) ? graph.label + " [" + graph.unit + "]" : graph.label);

    var domains = graph._module.domain(data, ranges.x, ranges.y) || { x: [0, 1], y: [0, 1] };
    graph.x.$scale.domain(domains.x);
    graph.y.$scale.domain(domains.y);

    graph._module.render(data);

    graph.$svg.select("g.x.axis").transition().duration(graph.duration).call(graph.x.$axis);
    graph.$svg.select("g.y.axis").transition().duration(graph.duration).call(graph.y.$axis);
  };

  return graph;
};
