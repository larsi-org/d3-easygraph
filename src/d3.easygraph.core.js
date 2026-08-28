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

// Validates update()'s `data` at the boundary, the same way the constructor already validates
// `container` and `height` -- this was the one input with no guard, and the one newcomers get
// wrong first. Each family declares its expected shape (_dataShape):
//   'series' -- an array of series, each an array of points   (line, bars)
//   'points' -- one flat array of point objects               (scatter)
//   'grid'   -- an array of rows, each an array of numbers    (heatmap)
// Getting it wrong used to either throw from deep inside d3 with a minified variable name, or
// -- worse, for scatter and heatmap -- silently render a chart full of NaN with no complaint.
// An empty array is always allowed: "no data yet" is a normal state while a fetch is in flight.
var _shapeHelp = {
  series: "an array of series, each an array of points -- e.g. [[{x, y}, {x, y}]]",
  points: "a flat array of point objects -- e.g. [{x, y, value}, {x, y, value}]",
  grid:   "an array of rows, each an array of numbers -- e.g. [[1, 2], [3, 4]]"
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
// `color.domain` config, then the data's own (optionally clipped) extent. That's the same idea as
// ranges.x/ranges.y beating an auto-fitted axis, one step further -- a value passed to *this*
// render beats one fixed at construction, which beats whatever the data happens to span.
// `clip` applies only to the last of the three: once a domain is given outright there's no
// data-driven extent left to clip. Shared by heatmap and scatter so the precedence is defined
// once rather than drifting between them (scatter honoured color.domain and heatmap didn't).
d3.easygraph._colorDomain = function(graph, values) {
  var perRender = graph._lastRanges && graph._lastRanges.color;
  return perRender || graph.color.domain || d3.easygraph._clippedExtent(values, graph.color.clip);
};

// One legend row per series -- color from the palette, label from the graph's `names` config.
// Shared by line and bars, the two families whose data is an array of series. Falls back to the
// length of `names` when nothing has been rendered yet, so a legend can be drawn before the first
// update() resolves. A series with no name comes back with `label: undefined` rather than a
// generated "Series 3", the same no-generic-placeholder rule the chart title follows.
d3.easygraph._seriesLegendItems = function(graph) {
  var names = graph.names || [];
  var count = graph._lastData ? graph._lastData.length : names.length;
  var items = [];
  for (var i = 0; i < count; i++) {
    items.push({ index: i, color: graph.getPaletteColor(i), label: names[i] });
  }
  return items;
};

// Legend rows for the families whose color comes from a scale rather than a series index
// (heatmap, scatter). A quantize scale has discrete bands, so each row carries its own from/to
// edges -- rebuilt from the scale's interior thresholds() plus the domain's two ends, which is
// exactly the fiddly reconstruction callers were hand-rolling. A continuous scale has no bands,
// so its rows are the evenly spaced stops the gradient is built from, each with its own value.
// Labels use graph.numberFormat, so a legend reads in the same notation as the axis ticks.
// Returns [] before the first update(): the scale's domain is only meaningful once data has
// been through it.
d3.easygraph._colorScaleLegendItems = function(graph) {
  var scale = graph.color && graph.color.$scale;
  if (!scale || !graph._lastData) return [];
  var colors = scale.range(), fmt = graph.numberFormat;

  if (scale.thresholds) { // d3.scaleQuantize -- discrete bands
    var domain = scale.domain();
    var edges = [domain[0]].concat(scale.thresholds()).concat([domain[domain.length - 1]]);
    return colors.map(function(color, i) {
      return { index: i, color: color, from: edges[i], to: edges[i + 1],
               label: fmt(edges[i]) + '–' + fmt(edges[i + 1]) };
    });
  }

  var stops = scale.domain(); // d3.scaleLinear -- one stop per palette color
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

// shared constructor body — each family (line/bars/heatmap) calls this with its own
// defaults and a moduleFactory(graph) returning { prepareScales?, init?, domain, render, resize? }
d3.easygraph._build = function(config, familyDefaults, moduleFactory) {
  // Shallow-cloned, never used by reference. _build() writes ~45 properties onto this object
  // (scales, axes, SVG selections, internal state) and overwrites `height` with the plot-area
  // height, so using the caller's own config object as the graph -- which is what this did
  // before -- meant constructing a second chart from the same config literal silently
  // corrupted the first one: they were literally the same object, so the first chart's
  // height/DOM/observer references were overwritten and it became unreachable and
  // un-destroyable (its SVG orphaned, its ResizeObserver never disconnected). The nested
  // x/y/color/margin objects get their own clones further down for the same reason.
  var graph = Object.assign({}, config);

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
    // resize) that would otherwise drive graph.width negative
    if (w <= graph.margin.left + graph.margin.right) return false;
    var changed = graph.width === undefined || Math.abs(w - graph.outerWidth) >= 1;
    graph.outerWidth = w;
    graph.width = graph.outerWidth - graph.margin.left - graph.margin.right;
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

  // Re-applies both axes to whatever the scales currently say, with no transition. Every family
  // needs this after a resize, because _layout() changes the scales' pixel ranges but doesn't
  // re-render the tick DOM. It used to live inside line.js's draw() -- so line charts got correct
  // axes on resize and bars/heatmap/scatter silently kept their ticks frozen at pre-resize
  // positions, ending up outside the plot area entirely on a shrink.
  graph._drawAxes = function() {
    graph.$svg.select("g.x.axis").call(graph.x.$axis);
    graph.$svg.select("g.y.axis").call(graph.y.$axis);
  };

  graph._clipId = "d3-easygraph-clip-" + (_nextClipId++);

  d3.easygraph._extend(graph, familyDefaults);

  // Assigned after the merge, not through it: _extend only fills keys the caller left unset, so
  // routing these through familyDefaults would let a caller's own value win. Neither is config --
  // one is the family's own name (the accessible-name fallback in update()), the other its
  // expected data shape (see _checkData) -- so the family always wins.
  graph._chartType = familyDefaults._chartType;
  graph._dataShape = familyDefaults._dataShape;

  // Clone x/y onto a fresh object rather than resolving in place -- _build() (via
  // _resolveProperty below) writes $scale/$axis directly onto whatever object graph.x/graph.y
  // point to. Left un-cloned, a caller reusing the same x/y config object literal across two
  // chart instances would have the second construction silently overwrite the first chart's
  // scale on that shared object.
  graph.x = Object.assign({}, graph.x);
  graph.y = Object.assign({}, graph.y);

  // x/y are already guaranteed to be objects by the clone above, so they're deliberately not
  // listed here -- _extend only fills a key that's still undefined.
  d3.easygraph._extend(graph, {
    colorPalette:    'Qualitative.Tableau10',
    colorClasses:    null, // request a specific class count (e.g. 4) from a Sequential/Diverging
                            // palette instead of the largest available -- ignored for Qualitative
                            // and the hardcoded extras, which aren't classed data
    duration:        500,
    timeFormatMulti: false
  });

  graph.paletteColors = d3.easygraph.resolvePalette(graph.colorPalette, graph.colorClasses);

  d3.easygraph._resolveProperty(graph.x);
  d3.easygraph._resolveProperty(graph.y);

  // Every read of `scale` is written as "time, else linear", so an unrecognized value used to
  // fall through to a linear scale silently -- a mistyped 'time' produced a chart that looked
  // plausible and plotted Dates as numbers. Undefined is fine and means linear.
  ['x', 'y'].forEach(function(axis) {
    var scale = graph[axis].scale;
    if (scale !== undefined && scale !== 'linear' && scale !== 'time') {
      throw new Error('d3.easygraph: ' + axis + '.scale must be "linear" or "time", got ' +
                      JSON.stringify(scale));
    }
  });

  // Resolved lazily rather than copied onto graph.label/graph.unit at construction: the copy
  // meant a caller who set graph.y.label afterwards saw nothing change (the title only ever
  // read the construction-time snapshot), and left two competing sources of truth for the same
  // string. graph.label/graph.unit still win when set -- they're the explicit override -- but
  // the y config is now the live fallback rather than a one-time seed.
  graph.resolvedLabel = function() {
    return (graph.label !== undefined) ? graph.label : graph.y.label;
  };
  graph.resolvedUnit = function() {
    return (graph.unit !== undefined) ? graph.unit : graph.y.unit;
  };

  graph.outerHeight = graph.height;
  graph.height = graph.outerHeight - graph.margin.top - graph.margin.bottom;
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
  if (graph.x.scale === 'time'   && graph.timeFormatMulti)     graph.x.$axis.tickFormat(graph.timeFormatShort);
  // tickLabels: false blanks the tick *text* and keeps the tick marks and gridlines, which is
  // exactly what this does -- the old name for it, noTick, both read as a double negative when
  // written out (noTick: false) and over-promised, since the ticks themselves stay.
  if (graph.x.tickLabels === false)                            graph.x.$axis.tickFormat(function() { return ''; });

  graph.y.$axis = d3.axisLeft(graph.y.$scale).tickSize(-graph.width).tickPadding(6);
  if (graph.y.scale === 'linear' && !graph.y.$scale.bandwidth) graph.y.$axis.tickFormat(graph.numberFormat);
  if (graph.y.tickLabels === false)                            graph.y.$axis.tickFormat(function() { return ''; });

  // The "easygraph" class is what every rule in d3.easygraph.css is scoped under -- without it
  // the stylesheet's generic selectors (a bare #title, .tick, .axis) would restyle any host
  // page element that happened to share those names. role/aria-label give assistive tech
  // something better than the axis tick numbers read out as one run-on string; the <title>
  // child is the SVG-native equivalent, kept in sync by update().
  graph.$svgRoot = d3.select(containerEl)
    .append("svg")
      .attr("class", "easygraph")
      .attr("role", "img")
      .attr("width", graph.outerWidth)
      .attr("height", graph.outerHeight);
  graph.$a11yTitle = graph.$svgRoot.append("title");
  graph.$svg = graph.$svgRoot
    .append("g")
      .attr("transform", "translate(" + graph.margin.left + "," + graph.margin.top + ")");

  graph.$svg
    .append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + graph.height + ")")
      .call(graph.x.$axis);

  // A class, not id="title": an id is unique per *document*, so N charts on one page produced
  // N duplicate ids, and the stylesheet's matching bare #title rule reached into the host page
  // and restyled its own #title element (an <h1 id="title"> visibly shrank to the chart
  // title's 16px). Nothing needs to look this up by id -- graph.$title holds the selection.
  graph.$title = graph.$svg
    .append("g")
      .attr("class", "y axis")
      .call(graph.y.$axis)
    .append("text")
      .attr("class", "easygraph-title")
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

  // The { index, color, label } rows a legend is drawn from -- data, never DOM. Each family
  // answers it differently (line/bars have series; heatmap/scatter have a color scale), so the
  // work is a module hook; see d3.easygraph.legendItems in colors.js for the chart-free form and
  // for why this stops at the data rather than rendering anything.
  graph.legendItems = function() {
    return graph._module.legendItems ? graph._module.legendItems() : [];
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

    graph.$svgRoot.attr("width", graph.outerWidth);
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

  // ranges: { x, y } optionally pin the x/y axis domains instead of auto-fitting to data --
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
    // Kept alongside _lastData so a resize reflow or a scatter rescale() -- both of which
    // re-render from stored state rather than a fresh update() -- don't silently drop back to a
    // data-driven color domain.
    graph._lastRanges = ranges;

    var label = graph.resolvedLabel(), unit = graph.resolvedUnit();
    var titleText = (unit) ? label + " [" + unit + "]" : label;
    graph.$title.text(titleText);
    // Mirrored onto the SVG's own accessible name. Falls back to the family name so a chart
    // with no label at all still announces as something rather than as its axis tick numbers.
    graph.$a11yTitle.text(titleText || graph._chartType + " chart");
    graph.$svgRoot.attr("aria-label", titleText || graph._chartType + " chart");

    var domains = graph._module.domain(data, ranges.x, ranges.y) || { x: [0, 1], y: [0, 1] };
    graph.x.$scale.domain(domains.x);
    graph.y.$scale.domain(domains.y);

    graph._module.render(data);

    graph.$svg.select("g.x.axis").transition().duration(graph.duration).call(graph.x.$axis);
    graph.$svg.select("g.y.axis").transition().duration(graph.duration).call(graph.y.$axis);

    return graph; // chainable, matching d3's own convention
  };

  return graph;
};
