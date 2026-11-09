// d3.easygraph.core.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// Shared scaffolding for every chart family: container sizing/resize, SVG/margin/
// clip-path/title DOM, number/time formatting, x/y/color config resolution, and the
// shared _build() that d3.easygraph.line/.bars/.heatmap call into with their own hooks.
// Two standalone lookups live in their own files, loaded right after this one - unit presets
// (d3.easygraph.presets / resolvePreset()) in d3.easygraph.presets.js, color palettes
// (colorPalettes / resolvePalette / colorScale) in d3.easygraph.colors.js - neither has
// any chart concepts of its own; this file is the only thing that folds either onto a graph's
// config.

d3.easygraph = {};

// shallow "fill in the blanks" merge - dst wins where already set
d3.easygraph._extend = function(dst, src) {
  for (var key in src) {
    if (src.hasOwnProperty(key) && dst[key] === undefined) dst[key] = src[key];
  }
  return dst;
};

// resolves a preset (via presets.js's resolvePreset(), which always returns a complete unit
// definition) onto an x/y/color config object. label/unit are genuinely optional - if
// neither the caller nor a preset supplies one, they stay undefined, and the title text
// (see near the bottom of _build()) renders blank rather than some generic placeholder.
d3.easygraph._resolveProperty = function(prop) {
  if (prop.clip !== undefined)
    throw new Error("d3.easygraph: 'clip' is now 'trim' (same [loQuantile, hiQuantile] value)");
  d3.easygraph._extend(prop, d3.easygraph.resolvePreset(prop.preset));
  return prop;
};

// [min, max] across a flat array of numbers, optionally clipped to the given
// [loQuantile, hiQuantile] (e.g. [0.05, 0.95]) instead of the true min/max - a single
// extreme outlier no longer stretches the whole domain so far that everything else
// compresses into one end of it. Any x/y/color config accepts a `trim` of this shape;
// omitting it (the default everywhere) keeps the exact same true-min/max behavior as
// before this existed.
d3.easygraph._clippedExtent = function(values, trim) {
  if (!trim) return d3.extent(values);
  var sorted = values.slice().sort(function(a, b) { return a - b; });
  return [d3.quantileSorted(sorted, trim[0]), d3.quantileSorted(sorted, trim[1])];
};

// Optional helpers for the numbers a line chart's bands are drawn from. The chart never calls
// these: it draws whatever `min`/`max` and `sigmaMin`/`sigmaMax` you put on each point, so a
// caller is free to use percentiles, confidence intervals or anything else instead.
//
// bandStatsFromSums({ sum, sumSq, count, min, max }, k) is for a caller that streams through
// raw readings and keeps only running totals. Returns { count, mean, min, max, sigmaMin,
// sigmaMax }: mean +- k population standard deviations (k defaults to 1), clamped into
// [min, max] - a skewed sample can otherwise push mean +- sigma past the true extreme on the
// far side, which would look broken for a band meant to nest inside min/max. An empty input
// (no count) returns count 0 and nulls.
d3.easygraph.bandStatsFromSums = function(totals, k) {
  if (!totals || !(totals.count > 0)) {
    return { count: 0, mean: null, min: null, max: null, sigmaMin: null, sigmaMax: null };
  }
  k = (k == null) ? 1 : k;
  var mean  = totals.sum / totals.count;
  // max(0, ...) guards float error on a near-zero variance (sumSq/n - mean^2 can go slightly negative)
  var sigma = Math.sqrt(Math.max(0, totals.sumSq / totals.count - mean * mean));
  return {
    count: totals.count, mean: mean, min: totals.min, max: totals.max,
    sigmaMin: Math.max(totals.min, mean - k * sigma),
    sigmaMax: Math.min(totals.max, mean + k * sigma)
  };
};

// bandStats(values, k): the same, from an array of numbers. null, undefined and non-finite
// entries are skipped. Use this when you already hold every value (a day's 24 hourly readings).
d3.easygraph.bandStats = function(values, k) {
  var totals = { sum: 0, sumSq: 0, count: 0, min: Infinity, max: -Infinity };
  (values || []).forEach(function(raw) {
    if (raw == null) return;
    var v = +raw;
    if (!isFinite(v)) return;
    totals.sum += v; totals.sumSq += v * v; totals.count++;
    if (v < totals.min) totals.min = v;
    if (v > totals.max) totals.max = v;
  });
  return d3.easygraph.bandStatsFromSums(totals, k);
};

// Stacks layered series, accumulating y0 offsets bottom-up - shared by bars.js's stacked
// mode and line.js's stackedArea, the same accumulation either way regardless of what shape
// gets drawn from the result. Assumes series are index-aligned (each series' j-th point
// corresponds to the same category/x position across every series) - fine for bars'
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

// Validates update()'s `data` at the boundary, the same way the constructor already validates
// `container` and `height` - this was the one input with no guard, and the one newcomers get
// wrong first. Each family declares its expected shape (_dataShape):
//   'series' - an array of series, each an array of points   (line, bars)
//   'points' - one flat array of point objects               (scatter)
//   'grid'   - an array of rows, each an array of numbers    (heatmap)
// Getting it wrong used to either throw from deep inside d3 with a minified variable name, or
// - worse, for scatter and heatmap - silently render a chart full of NaN with no complaint.
// An empty array is always allowed: "no data yet" is a normal state while a fetch is in flight.
var _shapeHelp = {
  series: "an array of series, each an array of points - e.g. [[{x, y}, {x, y}]]",
  points: "a flat array of point objects - e.g. [{x, y, value}, {x, y, value}]",
  grid:   "an array of rows, each an array of numbers - e.g. [[1, 2], [3, 4]]"
};
d3.easygraph._checkData = function(data, shape, family) {
  var prefix = 'd3.easygraph: ' + family + '.update() expects ' + _shapeHelp[shape] + ', but got ';
  if (!Array.isArray(data)) {
    throw new Error(prefix + (data === undefined ? 'no argument at all' : typeof data));
  }
  if (!data.length) return;

  var first = data[0], firstIsArray = Array.isArray(first);
  if (shape === 'points' && firstIsArray) {
    throw new Error(prefix + 'a nested array. Flatten it, or did you mean d3.easygraph.line()?');
  }
  if (shape !== 'points' && !firstIsArray) {
    throw new Error(prefix + 'a flat array. Wrap a single series as [yourArray].');
  }
  if (shape === 'grid' && first.length && typeof first[0] !== 'number') {
    throw new Error(prefix + 'rows of ' + typeof first[0] + '. Heatmap cells are plain numbers.');
  }
};

// The color scale's domain, in precedence order: a per-render `ranges.color`, then a static
// `color.domain` config, then the data's own (optionally trimmed) extent. That's the same idea as
// ranges.x/ranges.y beating an auto-fitted axis, one step further - a value passed to *this*
// render beats one fixed at construction, which beats whatever the data happens to span.
// `trim` applies only to the last of the three: once a domain is given outright there's no
// data-driven extent left to trim. Shared by heatmap and scatter so the precedence is defined
// once rather than drifting between them (scatter honoured color.domain and heatmap didn't).
d3.easygraph._colorDomain = function(graph, values) {
  var perRender = graph._lastRanges && graph._lastRanges.color;
  return perRender || graph.color.domain || d3.easygraph._clippedExtent(values, graph.color.trim);
};

// One legend row per series - color from the palette, label from the graph's `series` config.
// Shared by line and bars, the two families whose data is an array of series. Falls back to the
// length of `series` when nothing has been rendered yet, so a legend can be drawn before the first
// update() resolves. A series with no name comes back with `label: undefined` rather than a
// generated "Series 3", the same no-generic-placeholder rule the chart title follows.
d3.easygraph._seriesLegendItems = function(graph) {
  var series = graph.series || [];
  var count = graph._lastData ? graph._lastData.length : series.length;
  var items = [];
  for (var i = 0; i < count; i++) {
    items.push({ index: i, color: graph.paletteColor(i), label: series[i] ? series[i].label : undefined });
  }
  return items;
};

// Legend rows for the families whose color comes from a scale rather than a series index
// (heatmap, scatter). A quantize scale has discrete bands, so each row carries its own from/to
// edges - rebuilt from the scale's interior thresholds() plus the domain's two ends, which is
// exactly the fiddly reconstruction callers were hand-rolling. A continuous scale has no bands,
// so its rows are the evenly spaced stops the gradient is built from, each with its own value.
// Labels use graph.numberFormat, so a legend reads in the same notation as the axis ticks.
// Returns [] before the first update(): the scale's domain is only meaningful once data has
// been through it.
d3.easygraph._colorScaleLegendItems = function(graph) {
  var scale = graph.color && graph.color.$scale;
  if (!scale || !graph._lastData) return [];
  var colors = scale.range(), fmt = graph.numberFormat;

  if (scale.thresholds) { // d3.scaleQuantize - discrete bands
    var domain = scale.domain();
    var edges = [domain[0]].concat(scale.thresholds()).concat([domain[domain.length - 1]]);
    return colors.map(function(color, i) {
      return { index: i, color: color, from: edges[i], to: edges[i + 1],
               label: fmt(edges[i]) + '–' + fmt(edges[i + 1]) };
    });
  }

  var stops = scale.domain(); // d3.scaleLinear - one stop per palette color
  return colors.map(function(color, i) {
    return { index: i, color: color, value: stops[i], label: fmt(stops[i]) };
  });
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

// shared constructor body - each family (line/bars/heatmap) calls this with its own
// defaults and a moduleFactory(graph) returning { prepareScales?, init?, domain, render, resize? }
// Config keys each constructor understands. Used only to warn: a key outside this list is still
// accepted and left on the graph (a caller may hang its own fields on a config), but one that is
// a near-miss of a real key (colorPallete) or belongs to another family (zoom on bars) is
// almost always a mistake that would otherwise do nothing and say nothing.
var _SHARED_KEYS = ['container', 'height', 'margin', 'x', 'y', 'title', 'duration',
                    'colorPalette', 'colorClasses'];
var _FAMILY_KEYS = {
  line:    ['lines', 'bands', 'stackedArea', 'zoom', 'crosshair', 'curve', 'series', 'onZoom', 'onCrosshair'],
  bar:     ['orientation', 'mode', 'colorPerData', 'series'],
  heatmap: ['color'],
  scatter: ['color', 'radius', 'pointStrokeWidth', 'voronoi', 'arrows', 'labels']
};
var _FAMILY_CTOR = { line: 'line', bar: 'bars', heatmap: 'heatmap', scatter: 'scatter' };
var _warned = {};

function _editDistance(a, b) {
  var prev = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    var cur = [i];
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function _warnOnce(message) {
  if (_warned[message]) return;
  _warned[message] = true;
  if (typeof console !== 'undefined' && console.warn) console.warn(message);
}

d3.easygraph._warnConfig = function(config, chartType) {
  var ctor = 'd3.easygraph.' + _FAMILY_CTOR[chartType];
  var own = _SHARED_KEYS.concat(_FAMILY_KEYS[chartType]);
  var everything = _SHARED_KEYS.slice();
  Object.keys(_FAMILY_KEYS).forEach(function(f) {
    _FAMILY_KEYS[f].forEach(function(k) { if (everything.indexOf(k) < 0) everything.push(k); });
  });
  Object.keys(config).forEach(function(key) {
    if (own.indexOf(key) >= 0 || key.charAt(0) === '_' || key.charAt(0) === '$') return;
    var families = Object.keys(_FAMILY_KEYS).filter(function(f) { return _FAMILY_KEYS[f].indexOf(key) >= 0; });
    if (families.length) {
      _warnOnce(ctor + ": '" + key + "' is a " + families.map(function(f) { return _FAMILY_CTOR[f]; }).join('/') +
                " option and is ignored here");
      return;
    }
    if (key.length < 4) return;
    var best = null, bestDistance = 3;
    everything.forEach(function(known) {
      var d = _editDistance(key.toLowerCase(), known.toLowerCase());
      if (d < bestDistance) { best = known; bestDistance = d; }
    });
    if (best) _warnOnce(ctor + ": unknown option '" + key + "' - did you mean '" + best + "'?");
  });
};

d3.easygraph._build = function(config, familyDefaults, moduleFactory) {
  // Shallow-cloned, never used by reference. _build() writes ~45 properties onto this object
  // (scales, axes, SVG selections, internal state) and overwrites `height` with the plot-area
  // height, so using the caller's own config object as the graph - which is what this did
  // before - meant constructing a second chart from the same config literal silently
  // corrupted the first one: they were literally the same object, so the first chart's
  // height/DOM/observer references were overwritten and it became unreachable and
  // un-destroyable (its SVG orphaned, its ResizeObserver never disconnected). The nested
  // x/y/color/margin objects get their own clones further down for the same reason.
  d3.easygraph._warnConfig(config, familyDefaults._chartType);

  var graph = Object.assign({}, config);

  ['names', 'units'].forEach(function(old) {
    if (config[old] !== undefined)
      throw new Error("d3.easygraph: '" + old + "' is gone - use series: [{ label, unit }, ...], one entry per series");
  });
  if (config.series != null && !Array.isArray(config.series))
    throw new Error("d3.easygraph: series must be an array like [{ label, unit }, ...]");

  ['label', 'unit'].forEach(function(old) {
    if (config[old] !== undefined)
      throw new Error("d3.easygraph: '" + old + "' at the top level is gone - the chart title is 'title'; " +
                      "axis names are x.label / y.label and the unit is x.unit / y.unit");
  });

  var containerEl = _resolveContainer(graph.container);
  if (!containerEl) {
    throw new Error('d3.easygraph: container not found (' + JSON.stringify(graph.container) + ')');
  }

  // Object.assign (not _extend) so a *partial* margin (e.g. { top: 10 }) still gets its own
  // fresh object - _extend only fills a key when the whole thing is undefined, so a partial
  // margin would otherwise keep right/bottom/left as undefined forever, cascading into NaN
  // width math with no error (see _measureWidth() below). Cloning here also means two charts
  // constructed from the same shared margin object literal can't corrupt each other.
  graph.margin = Object.assign({}, graph.margin);
  d3.easygraph._extend(graph.margin, { top: 20, right: 20, bottom: 30, left: 50 });
  if (!(graph.height > 0)) {
    throw new Error('d3.easygraph: height must be a positive number');
  }
  // The width path already refuses a container narrower than its own horizontal margins (see
  // _measureWidth below); without the matching vertical check, a height smaller than
  // margin.top + margin.bottom silently produced a *negative* plot area and a chart that drew
  // itself inside-out with no complaint.
  var _vMargin = graph.margin.top + graph.margin.bottom;
  if (!(graph.height > _vMargin)) {
    throw new Error('d3.easygraph: height (' + graph.height + ') must be greater than ' +
                    'margin.top + margin.bottom (' + _vMargin + '), or there is no room to plot in');
  }

  // measures the container's current rendered width; returns false if unchanged
  // (within 1px) so callers can skip redundant layout/redraw work
  function _measureWidth() {
    var w = containerEl.getBoundingClientRect().width;
    // ignore transient/degenerate layout passes (e.g. mid-reflow during a live
    // resize) that would otherwise drive graph.plotWidth negative
    if (w <= graph._margin.left + graph._margin.right) return false;
    var changed = graph.plotWidth === undefined || Math.abs(w - graph.width) >= 1;
    graph.width = w;
    graph.plotWidth = graph.width - graph._margin.left - graph._margin.right;
    return changed;
  }


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

  // Re-applies both axes to whatever the scales currently say, with no transition. Every family
  // needs this after a resize, because _layout() changes the scales' pixel ranges but doesn't
  // re-render the tick DOM. It used to live inside line.js's draw() - so line charts got correct
  // axes on resize and bars/heatmap/scatter silently kept their ticks frozen at pre-resize
  // positions, ending up outside the plot area entirely on a shrink.
  graph._drawAxes = function() {
    graph.$svg.select("g.easygraph-axis-x").call(graph.x.$axis);
    graph.$svg.select("g.easygraph-axis-y").call(graph.y.$axis);
  };

  graph._clipId = "d3-easygraph-clip-" + (_nextClipId++);

  d3.easygraph._extend(graph, familyDefaults);

  // Assigned after the merge, not through it: _extend only fills keys the caller left unset, so
  // routing these through familyDefaults would let a caller's own value win. Neither is config -
  // one is the family's own name (the accessible-name fallback in update()), the other its
  // expected data shape (see _checkData) - so the family always wins.
  graph._chartType = familyDefaults._chartType;
  graph._dataShape = familyDefaults._dataShape;

  // Clone x/y onto a fresh object rather than resolving in place - _build() (via
  // _resolveProperty below) writes $scale/$axis directly onto whatever object graph.x/graph.y
  // point to. Left un-cloned, a caller reusing the same x/y config object literal across two
  // chart instances would have the second construction silently overwrite the first chart's
  // scale on that shared object.
  graph.x = Object.assign({}, graph.x);
  graph.y = Object.assign({}, graph.y);

  // x/y are already guaranteed to be objects by the clone above, so they're deliberately not
  // listed here - _extend only fills a key that's still undefined.
  d3.easygraph._extend(graph, {
    colorPalette:    'Qualitative.Tableau10',
    colorClasses:    null, // request a specific class count (e.g. 4) from a Sequential/Diverging
                            // palette instead of the largest available - ignored for Qualitative
                            // and the hardcoded extras, which aren't classed data
    duration:        500
  });

  graph.paletteColors = d3.easygraph.resolvePalette(graph.colorPalette, graph.colorClasses);

  d3.easygraph._resolveProperty(graph.x);
  d3.easygraph._resolveProperty(graph.y);

  // Every read of `scale` is written as "time, else linear", so an unrecognized value used to
  // fall through to a linear scale silently - a mistyped 'time' produced a chart that looked
  // plausible and plotted Dates as numbers. Undefined is fine and means linear.
  ['x', 'y'].forEach(function(axis) {
    var scale = graph[axis].scale;
    if (scale !== undefined && scale !== 'linear' && scale !== 'time') {
      throw new Error('d3.easygraph: ' + axis + '.scale must be "linear" or "time", got ' +
                      JSON.stringify(scale));
    }
  });

  // The text of an axis title: the axis's label plus its unit, "Temperature [°F]". A preset
  // supplies both for a known quantity; with neither there is no title at all. Re-read on every
  // update(), so assigning graph.y.label (or .unit) later changes the text.
  function _axisTitleText(prop) {
    var label = prop.label, unit = prop.unit;
    if (label && unit) return label + ' [' + unit + ']';
    return label || (unit ? '[' + unit + ']' : '');
  }

  // Room for an axis title is added to the margin you gave, not taken out of it: 20px more on
  // the left for a y title, on the bottom for an x title. Decided at construction (a label
  // assigned later is still drawn, in the same spot, but no space was set aside for it).
  // graph.margin stays exactly what you passed; graph._margin is what the layout uses.
  var _TITLE_PAD = 20;
  graph._margin = {
    top:    graph.margin.top,
    right:  graph.margin.right,
    bottom: graph.margin.bottom + (_axisTitleText(graph.x) ? _TITLE_PAD : 0),
    left:   graph.margin.left   + (_axisTitleText(graph.y) ? _TITLE_PAD : 0)
  };
  var _vMargin2 = graph._margin.top + graph._margin.bottom;
  if (!(graph.height > _vMargin2)) {
    throw new Error('d3.easygraph: height (' + graph.height + ') must be greater than the vertical ' +
                    'margins (' + _vMargin2 + ', including room for an axis title), or there is no room to plot in');
  }

  graph.plotHeight = graph.height - graph._margin.top - graph._margin.bottom;
  _measureWidth();

  graph._module = moduleFactory(graph);

  if (graph._module.prepareScales) {
    graph._module.prepareScales();
  } else {
    graph.x.$scale = (graph.x.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.x.$scale.range([0, graph.plotWidth]);
    graph.y.$scale = (graph.y.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.y.$scale.range([graph.plotHeight, 0]);
  }

  graph.x.$axis = d3.axisBottom(graph.x.$scale).tickSize(-graph.plotHeight).tickPadding(12);
  if (graph.x.scale === 'linear' && !graph.x.$scale.bandwidth) graph.x.$axis.tickFormat(graph.numberFormat);
  if (graph.x.timeFormat !== undefined && graph.x.timeFormat !== 'multi')
    throw new Error("d3.easygraph: x.timeFormat must be 'multi' (or omitted), got " + JSON.stringify(graph.x.timeFormat));
  if (graph.x.scale === 'time'   && graph.x.timeFormat === 'multi') graph.x.$axis.tickFormat(graph.timeFormatShort);
  // tickLabels: false blanks the tick *text* and keeps the tick marks and gridlines, which is
  // exactly what this does - the old name for it, noTick, both read as a double negative when
  // written out (noTick: false) and over-promised, since the ticks themselves stay.
  if (graph.x.tickLabels === false)                            graph.x.$axis.tickFormat(function() { return ''; });

  graph.y.$axis = d3.axisLeft(graph.y.$scale).tickSize(-graph.plotWidth).tickPadding(6);
  if (graph.y.scale === 'linear' && !graph.y.$scale.bandwidth) graph.y.$axis.tickFormat(graph.numberFormat);
  if (graph.y.tickLabels === false)                            graph.y.$axis.tickFormat(function() { return ''; });

  // The "easygraph" class is what every rule in d3.easygraph.css is scoped under - without it
  // the stylesheet's generic selectors (a bare #title, .tick, .axis) would restyle any host
  // page element that happened to share those names. role/aria-label give assistive tech
  // something better than the axis tick numbers read out as one run-on string; the <title>
  // child is the SVG-native equivalent, kept in sync by update().
  graph.$svgRoot = d3.select(containerEl)
    .append("svg")
      .attr("class", "easygraph")
      .attr("role", "img")
      .attr("width", graph.width)
      .attr("height", graph.height);
  graph.$a11yTitle = graph.$svgRoot.append("title");
  graph.$svg = graph.$svgRoot
    .append("g")
      .attr("transform", "translate(" + graph._margin.left + "," + graph._margin.top + ")");

  graph.$svg
    .append("g")
      .attr("class", "easygraph-axis easygraph-axis-x")
      .attr("transform", "translate(0," + graph.plotHeight + ")")
      .call(graph.x.$axis);

  // A class, not id="title": an id is unique per *document*, so N charts on one page produced
  // N duplicate ids, and the stylesheet's matching bare #title rule reached into the host page
  // and restyled its own #title element (an <h1 id="title"> visibly shrank to the chart
  // title's 16px). Nothing needs to look this up by id - graph.$title holds the selection.
  graph.$title = graph.$svg
    .append("g")
      .attr("class", "easygraph-axis easygraph-axis-y")
      .call(graph.y.$axis)
    .append("text")
      .attr("class", "easygraph-title")
      .attr("x", graph.plotWidth / 2)
      .attr("y", -6);

  // Axis titles follow the screen axes: x is the bottom one, y the left one, in every chart
  // (a horizontal bar chart's values are on x).
  graph.$xTitle = graph.$svg.append("text")
    .attr("class", "easygraph-axis-title easygraph-axis-title-x")
    .attr("text-anchor", "middle");
  graph.$yTitle = graph.$svg.append("text")
    .attr("class", "easygraph-axis-title easygraph-axis-title-y")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)");
  graph._placeAxisTitles = function() {
    graph.$xTitle.attr("x", graph.plotWidth / 2).attr("y", graph.plotHeight + graph._margin.bottom - 6);
    graph.$yTitle.attr("x", -graph.plotHeight / 2).attr("y", -(graph._margin.left - 14));
  };
  graph._placeAxisTitles();

  graph.$clipRect = graph.$svg
    .append("clipPath")
      .attr("id", graph._clipId)
    .append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", graph.plotWidth).attr("height", graph.plotHeight);

  graph.$group = graph.$svg.append("g");

  graph.paletteColor = function(index) {
    return graph.paletteColors[index % graph.paletteColors.length];
  };

  // The { index, color, label } rows a legend is drawn from - data, never DOM. Each family
  // answers it differently (line/bars have series; heatmap/scatter have a color scale), so the
  // work is a module hook; see d3.easygraph.legendItems in colors.js for the chart-free form and
  // for why this stops at the data rather than rendering anything.
  graph.legendItems = function() {
    return graph._module.legendItems ? graph._module.legendItems() : [];
  };

  // module init() runs after core scaffolding above (scales/axes/svg/margin/clip/
  // group all exist) so e.g. line.js's zoom pane can be appended right after
  // graph.$group, and crosshair after that - same DOM order as before
  if (graph._module.init) graph._module.init();

  // re-applies everything that depends on the container's rendered width;
  // returns false (no-op) if the width hasn't actually changed
  graph._layout = function() {
    if (!_measureWidth()) return false;

    if (graph.x.$scale.bandwidth) {
      graph.x.$scale.rangeRound([0, graph.plotWidth]);
    } else {
      graph.x.$scale.range([0, graph.plotWidth]);
    }
    graph.y.$axis.tickSize(-graph.plotWidth);

    graph.$svgRoot.attr("width", graph.width);
    graph.$clipRect.attr("width", graph.plotWidth);
    graph.$title.attr("x", graph.plotWidth / 2);
    graph._placeAxisTitles();

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
    graph._destroyed = true;
    // Drop the reference to the caller's data. A destroyed chart holding a year of hourly
    // readings is memory the caller reasonably believes it just released.
    graph._lastData = null;
    graph._lastRanges = null;
  };

  // re-renders in place after a resize, using the last data passed to update();
  // domains don't change here, only the pixel ranges _layout() just updated
  graph._reflow = function() {
    var savedDuration = graph.duration;
    graph.duration = 0;

    graph._drawAxes();
    graph._module.render(graph._lastData);

    graph.duration = savedDuration;
  };

  // ranges: { x, y } optionally pin the x/y axis domains instead of auto-fitting to data -
  // a single object rather than two positional args so a future range (e.g. color) has
  // somewhere to go without another positional param.
  graph.update = function(data, ranges) {
    // A destroyed chart used to accept update() silently: it rendered into a detached SVG and
    // still recorded the new data, so a caller could keep feeding a chart that would never
    // appear again and get no hint anything was wrong.
    if (graph._destroyed) {
      throw new Error('d3.easygraph: update() called on a destroyed chart');
    }
    d3.easygraph._checkData(data, graph._dataShape, graph._chartType);
    ranges = ranges || {};
    graph._lastData = data;
    // Kept alongside _lastData so a resize reflow or a scatter rescale() - both of which
    // re-render from stored state rather than a fresh update() - don't silently drop back to a
    // data-driven color domain.
    graph._lastRanges = ranges;

    var titleText = (graph.title == null) ? '' : String(graph.title);
    var xTitleText = _axisTitleText(graph.x), yTitleText = _axisTitleText(graph.y);
    graph.$title.text(titleText);
    graph.$xTitle.text(xTitleText);
    graph.$yTitle.text(yTitleText);
    // Mirrored onto the SVG's own accessible name: the title, else the y then x axis title,
    // else the family name, so a chart with no text at all still announces as something rather
    // than as its axis tick numbers.
    var accessibleName = titleText || yTitleText || xTitleText || graph._chartType + " chart";
    graph.$a11yTitle.text(accessibleName);
    graph.$svgRoot.attr("aria-label", accessibleName);

    var domains = graph._module.domain(data, ranges.x, ranges.y) || { x: [0, 1], y: [0, 1] };
    graph.x.$scale.domain(domains.x);
    graph.y.$scale.domain(domains.y);

    graph._module.render(data);

    graph.$svg.select("g.easygraph-axis-x").transition().duration(graph.duration).call(graph.x.$axis);
    graph.$svg.select("g.easygraph-axis-y").transition().duration(graph.duration).call(graph.y.$axis);

    return graph; // chainable, matching d3's own convention
  };

  // Keys the chart is built around (scales, axes, DOM) can't change after construction, so
  // assigning one throws instead of silently doing nothing. Everything else is re-read on
  // every update().
  ['container', 'height', 'margin', 'orientation', 'curve', 'zoom', 'crosshair',
   'colorPalette', 'colorClasses'].forEach(function(key) {
    if (!Object.prototype.hasOwnProperty.call(graph, key)) return;
    var fixed = graph[key];
    Object.defineProperty(graph, key, {
      enumerable: true, configurable: true,
      get: function() { return fixed; },
      set: function() {
        throw new Error("d3.easygraph: '" + key + "' is fixed when the chart is built - " +
                        "destroy() it and build a new chart to change it");
      }
    });
  });

  // The axis/color `scale` is part of what the chart is built around too, one level down.
  ['x', 'y', 'color'].forEach(function(axis) {
    var prop = graph[axis];
    if (!prop || typeof prop !== 'object') return;
    var fixedScale = prop.scale;
    Object.defineProperty(prop, 'scale', {
      enumerable: true, configurable: true,
      get: function() { return fixedScale; },
      set: function() {
        throw new Error("d3.easygraph: " + axis + ".scale is fixed when the chart is built - " +
                        "destroy() it and build a new chart to change it");
      }
    });
  });

  return graph;
};
