// d3.easygraph.core.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// Shared scaffolding for every chart family: container sizing/resize, SVG/margin/
// clip-path/title DOM, number/time formatting, x/y/color config resolution, and the
// shared _build() that d3.easygraph.line/.bar/.heatmap/.scatter call into with their own hooks.
// Two standalone lookups live in their own files, loaded right after this one - unit presets
// (d3.easygraph.presets / preset()) in d3.easygraph.presets.js, color palettes
// (palettes / palette() / colorScale) in d3.easygraph.colors.js - neither has
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

// resolves a preset (via presets.js's preset(), which always returns a complete unit
// definition) onto an x or y config object. label/unit are genuinely optional - if
// neither the caller nor a preset supplies one, they stay undefined, and the title text
// (see near the bottom of _build()) renders blank rather than some generic placeholder.
d3.easygraph._resolveProperty = function(prop) {
  d3.easygraph._extend(prop, d3.easygraph.preset(prop.preset));
  return prop;
};

// [min, max] across a flat array of numbers, optionally clipped to the given
// [loQuantile, hiQuantile] (e.g. [0.05, 0.95]) instead of the true min/max - a single
// extreme outlier no longer stretches the whole domain so far that everything else
// compresses into one end of it. Any x/y/color config accepts a `trim` of this shape;
// omitting it (the default everywhere) keeps the exact same true-min/max behavior as
// before this existed.
d3.easygraph._clippedExtent = function(values, trim) {
  if (!trim) return d3.extent(values);   // d3.extent skips null and undefined itself
  var sorted = values.filter(function(v) { return v != null; }).sort(function(a, b) { return a - b; });
  return [d3.quantileSorted(sorted, trim[0]), d3.quantileSorted(sorted, trim[1])];
};

// The number format the linear axes and the legend labels use: plain digits (at most 6 significant)
// between 0.01 and 1000, SI-prefixed ('12.3k', '4.56m') outside that. It depends on no chart, so it is
// module-level: a tooltip or a table can use it to read like the axes.
d3.easygraph.formatNumber = function(d) {
  var d_abs = Math.abs(d);
  if (d_abs === 0) return '0';
  if (d_abs >= 0.01 && d_abs < 1000) return String(parseFloat(d.toPrecision(6)));
  return d3.format('.3s')(d);
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

// Stacks layered series, accumulating y0 offsets bottom-up - shared by bar.js's stacked mode and
// line.js's stackedArea.
//   signed (bars, points { category, value }): points are matched by category, so a series may
//     leave a category out or list them in another order. Values of either sign: positive values
//     stack upward from zero and negative ones downward from zero, each on its own pile, so a bar
//     spans [base, base + value] either way.
//   unsigned (stacked area, points { x, y }): points are matched by index, so every series must be
//     sampled at the same x positions; each point gets y0, where it starts.
d3.easygraph._computeStacked = function(data, signed) {
  if (signed) {
    var up = new d3.InternMap(), down = new d3.InternMap();
    return data.map(function(series) {
      return series.map(function(p) {
        var d = Object.assign({ base: 0 }, p);
        if (d.value == null) return d;
        var pile = (d.value >= 0) ? up : down, base = pile.get(d.category) || 0;
        d.base = base;
        pile.set(d.category, base + d.value);
        return d;
      });
    });
  }
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
// `container` and `height`, so a wrong shape throws here with the fix in the message instead of
// deep inside d3 (or rendering a chart full of NaN). Each family declares its shape (_dataShape):
//   'series' - an array of series, each an array of points   (line)
//   'bars'   - the same, each point { category, value }      (bar)
//   'points' - one flat array of point objects               (scatter)
//   'grid'   - an array of rows, each an array of numbers    (heatmap; null/undefined = no data)
// An empty array is always allowed: "no data yet" is a normal state while a fetch is in flight.
var _shapeHelp = {
  series: "an array of series, each an array of points - e.g. [[{x, y}, {x, y}]]",
  bars:   "an array of series, each an array of bars - e.g. [[{category, value}, {category, value}]]",
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
  // a bar is { category, value }; the first point that is an object decides, and one written the
  // line way ({ x, y }) is told so
  if (shape === 'bars') {
    var bar;
    data.some(function(series) { bar = series.find(function(d) { return d != null; }); return bar !== undefined; });
    if (bar !== undefined && (typeof bar !== 'object' || !('category' in bar) || !('value' in bar))) {
      throw new Error(prefix + JSON.stringify(bar) + '. A bar is { category, value } (whichever way the bars ' +
                      'run; x and y are the screen axes, as in the config and in domains)');
    }
  }
  // the first cell that holds a value decides: a missing (null/undefined) cell is allowed anywhere
  var cell = (shape === 'grid') ? first.find(function(v) { return v != null; }) : undefined;
  if (cell !== undefined && typeof cell !== 'number') {
    throw new Error(prefix + 'rows of ' + typeof cell + '. Heatmap cells are plain numbers ' +
                    '(null or undefined for a cell with no data).');
  }
};

// The color scale's domain, in precedence order: a per-render `domains.color`, then a static
// `color.domain` config, then the data's own (optionally trimmed) extent. That's the same idea as
// domains.x/domains.y beating an auto-fitted axis, one step further - a value passed to *this*
// render beats one fixed at construction, which beats whatever the data happens to span.
// `trim` applies only to the last of the three: once a domain is given outright there's no
// data-driven extent left to trim. Shared by heatmap and scatter so the precedence is defined
// once rather than drifting between them (scatter honored color.domain and heatmap didn't).
d3.easygraph._colorDomain = function(graph, values) {
  var perRender = graph._.lastDomains && graph._.lastDomains.color;
  return perRender || graph.color.domain || d3.easygraph._clippedExtent(values, graph.color.trim);
};

// One legend row per series - color from the palette, label from the graph's `series` config.
// Shared by line and bars, the two families whose data is an array of series. Falls back to the
// length of `series` when nothing has been rendered yet, so a legend can be drawn before the first
// update() resolves. A series with no name comes back with `label: undefined` rather than a
// generated "Series 3", the same no-generic-placeholder rule the chart title follows.
d3.easygraph._seriesLegendItems = function(graph) {
  var series = graph.series || [];
  var count = graph._.lastData ? graph._.lastData.length : series.length;
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
// Labels use d3.easygraph.formatNumber, so a legend reads in the same notation as the axis ticks.
// Returns [] before the first update(): the scale's domain is only meaningful once data has
// been through it.
d3.easygraph._colorScaleLegendItems = function(graph) {
  var scale = graph.color && graph.color.$scale;
  if (!scale || !graph._.lastData) return [];
  var colors = scale.range(), fmt = d3.easygraph.formatNumber;

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

// Config keys each constructor understands. A key outside this list throws: a misspelled option
// used to do nothing and say nothing. Keys inside the nested option objects (x, y, color, margin,
// points, arrows, ...) are checked too, against _NESTED below.
var _SHARED_KEYS = ['container', 'sizing', 'width', 'height', 'margin', 'x', 'y', 'color', 'title', 'duration', 'meta'];
var _FAMILY_KEYS = {
  line:    ['lines', 'bands', 'stacked', 'zoom', 'crosshair', 'curve', 'series'],
  bar:     ['orientation', 'stacked', 'series'],
  heatmap: [],
  scatter: ['points', 'voronoi', 'arrows', 'labels']
};
var _FAMILY_CTOR = { line: 'line', bar: 'bar', heatmap: 'heatmap', scatter: 'scatter' };

// The keys each nested option object accepts. 'object' options must be an object; 'flag' options
// may also be true/false (true = all defaults). An axis's convert/convertRounded are not config: they
// come from its preset and are only read back (graph.y.convert), since the chart never applies them.
var _AXIS_KEYS = ['type', 'unit', 'label', 'tickLabels', 'tickFormat', 'preset', 'trim'];
var _NESTED = {
  margin: { kind: 'object', keys: ['top', 'right', 'bottom', 'left'] },
  x:      { kind: 'object', keys: _AXIS_KEYS },
  y:      { kind: 'object', keys: _AXIS_KEYS },
  bands:  { kind: 'object', keys: ['minmax', 'sigma'] },
  zoom:   { kind: 'flag',   keys: ['min', 'max'] },
  crosshair: { kind: 'flag', keys: ['threshold'] },
  points: { kind: 'flag',   keys: ['radius', 'strokeWidth'] },
  voronoi: { kind: 'flag',  keys: ['opacity'] },
  arrows: { kind: 'flag',   keys: ['color', 'strokeWidth', 'minLength', 'maxLength', 'headLength', 'headAngle'] },
  labels: { kind: 'flag',   keys: ['size', 'offset', 'minZoom'] }
};
var _COLOR_KEYS = {
  line:    ['palette', 'classes', 'reverse'],
  bar:     ['palette', 'classes', 'reverse'],
  heatmap: ['palette', 'classes', 'reverse', 'domain', 'trim'],
  scatter: ['palette', 'classes', 'reverse', 'domain', 'trim', 'quantize']
};
var _SERIES_KEYS = { line: ['label', 'unit'], bar: ['label'] };

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

function _nearest(key, known) {
  // within 2 edits, and for a very short key within 1 ('mn' -> 'min')
  var best = null, bestDistance = Math.min(3, key.length);
  if (key.length >= 2) known.forEach(function(k) {
    var d = _editDistance(key.toLowerCase(), k.toLowerCase());
    if (d < bestDistance) { best = k; bestDistance = d; }
  });
  return best;
}

// Throws for any key of `obj` that is not in `allowed`. `path` names the object ('x', 'points'),
// so the message can say 'x.lable' and suggest 'x.label'.
d3.easygraph._checkKeys = function(ctor, path, obj, allowed) {
  Object.keys(obj).forEach(function(key) {
    if (allowed.indexOf(key) >= 0) return;
    var best = _nearest(key, allowed);
    throw new Error(ctor + ": unknown option '" + path + "." + key + "'" +
                    (best ? " - did you mean '" + path + "." + best + "'?" : "") +
                    " (" + path + " takes: " + allowed.join(', ') + ")");
  });
};

// Checks one nested option's value: an object (any kind) with known keys, or - for a 'flag' option -
// also true/false/null/undefined. An array or a number is always a mistake (zoom: [1, 10]).
d3.easygraph._checkOption = function(ctor, path, value, spec, keys) {
  if (value === undefined || value === null) return;
  if (typeof value === 'boolean') {
    if (spec.kind === 'flag') return;
    throw new Error(ctor + ": '" + path + "' must be an object like { " + keys.join(': ..., ') + ": ... }, not " + value);
  }
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error(ctor + ": '" + path + "' must be " + (spec.kind === 'flag' ? "true or " : "") +
                    "an object with " + keys.join(', ') + " (got " + (Array.isArray(value) ? "an array" : typeof value) + ")");
  d3.easygraph._checkKeys(ctor, path, value, keys);
};

// Unknown top-level keys throw, then every nested option object is checked the same way. A page's
// own fields go under `meta` (copied to graph.meta), which is the one open-ended key.
d3.easygraph._checkConfig = function(config, chartType) {
  var ctor = 'd3.easygraph.' + _FAMILY_CTOR[chartType];
  var own = _SHARED_KEYS.concat(_FAMILY_KEYS[chartType]);
  var everything = _SHARED_KEYS.slice();
  Object.keys(_FAMILY_KEYS).forEach(function(f) {
    _FAMILY_KEYS[f].forEach(function(k) { if (everything.indexOf(k) < 0) everything.push(k); });
  });
  Object.keys(config).forEach(function(key) {
    if (own.indexOf(key) >= 0) return;
    var families = Object.keys(_FAMILY_KEYS).filter(function(f) { return _FAMILY_KEYS[f].indexOf(key) >= 0; });
    if (families.length)
      throw new Error(ctor + ": '" + key + "' is a " + families.map(function(f) { return _FAMILY_CTOR[f]; }).join('/') +
                      " option and does not apply here");
    var best = _nearest(key, everything);
    throw new Error(ctor + ": unknown option '" + key + "'" + (best ? " - did you mean '" + best + "'?" : "") +
                    " (your own fields go under meta: { ... })");
  });

  ['margin', 'x', 'y', 'bands', 'zoom', 'crosshair', 'points', 'voronoi', 'arrows', 'labels'].forEach(function(name) {
    if (own.indexOf(name) >= 0) d3.easygraph._checkOption(ctor, name, config[name], _NESTED[name], _NESTED[name].keys);
  });
  d3.easygraph._checkOption(ctor, 'color', config.color, { kind: 'object' }, _COLOR_KEYS[chartType]);

  if (config.series != null) {
    if (!Array.isArray(config.series))
      throw new Error(ctor + ": series must be an array like [{ label, unit }, ...], one entry per series");
    config.series.forEach(function(entry, i) {
      if (entry != null) d3.easygraph._checkOption(ctor, 'series[' + i + ']', entry, { kind: 'object' }, _SERIES_KEYS[chartType]);
    });
  }
};

// update()'s second argument, domains, pins them for that render: { x, y } on every chart, plus
// { color } on the two charts that have a color scale.
d3.easygraph._checkDomains = function(domains, chartType) {
  var ctor = 'd3.easygraph.' + _FAMILY_CTOR[chartType];
  if (domains === null || typeof domains !== 'object' || Array.isArray(domains))
    throw new Error(ctor + ".update(): the second argument, domains, is an object like { x: [min, max], y: [min, max] }");
  var allowed = (chartType === 'heatmap' || chartType === 'scatter') ? ['x', 'y', 'color'] : ['x', 'y'];
  Object.keys(domains).forEach(function(key) {
    if (allowed.indexOf(key) >= 0) return;
    throw new Error(ctor + ".update(): unknown domain '" + key + "' (" + ctor.replace('d3.easygraph.', '') +
                    " takes: " + allowed.join(', ') + ")" + (key === 'color' ? " - only heatmap and scatter have a color scale" : ""));
  });
};

// A value the chart computes and owns (width, plotWidth, ...): readable, and assigning it throws.
function _defineOwned(obj, key, get, hint) {
  Object.defineProperty(obj, key, {
    enumerable: true, configurable: false, get: get,
    set: function() { throw new Error(_assignMessage(key, 'owned') + (hint ? ' ' + hint : '')); }
  });
}

// What assigning a key of the graph says, by the key's kind (see the end of _build()).
function _assignMessage(path, kind) {
  var dot = path.indexOf('.');
  var example = (dot < 0) ? '{ ' + path + ': ... }' : '{ ' + path.slice(0, dot) + ': { ' + path.slice(dot + 1) + ': ... } }';
  if (kind === 'live')
    return "d3.easygraph: '" + path + "' is changed with graph.set(" + example + "), which checks it - then call update()";
  if (kind === 'fixed')
    return "d3.easygraph: '" + path + "' is fixed when the chart is built - destroy() it and build a new chart to change it";
  if (kind === 'object')
    return "d3.easygraph: '" + path + "' holds the chart's scales and cannot be replaced - " +
           "change its keys instead, e.g. graph.set({ " + path + ": { ... } })";
  return "d3.easygraph: '" + path + "' is set by the chart and cannot be assigned";
}

d3.easygraph._build = function(config, familyDefaults, moduleFactory) {
  // The caller's config is copied, never kept (and so are its x/y/color/margin objects, further
  // down): one literal can build several charts, and nothing the chart writes reaches the caller.
  d3.easygraph._checkConfig(config, familyDefaults._chartType);

  var graph = Object.assign({}, config);

  // Everything the chart keeps for itself - internal state, private d3 objects ($-named inside it),
  // module hooks - lives on graph._, which is not enumerable and not API. The graph object itself
  // holds only the config keys, the public handles and the methods, and is sealed once built.
  Object.defineProperty(graph, '_', { value: {} });

  // Values the chart computes and owns: readable, never assignable.
  _defineOwned(graph, 'plotWidth',     function() { return graph._.plotWidth; });
  _defineOwned(graph, 'plotHeight',    function() { return graph._.plotHeight; });
  _defineOwned(graph, 'paletteColors', function() { return graph._.paletteColors; });

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
  // Sizing modes, named by `sizing`. 'fluid' (the default, for charts): width follows the container,
  // height is fixed in px, and there is no width option. 'scaled' (for maps and other drawings with
  // an intrinsic aspect ratio): the chart is drawn once at a logical width x height and the browser
  // scales the whole svg uniformly through a viewBox to the container's width, so its shape never
  // changes. graph.width is then the logical width; graph._.viewScale is the current on-screen scale
  // (container width / logical width). A bare `width` used to switch modes on its own, and
  // `width: 600` read as 600 px.
  if (graph.sizing === undefined) graph.sizing = 'fluid';
  if (graph.sizing !== 'fluid' && graph.sizing !== 'scaled') {
    throw new Error('d3.easygraph: sizing must be "fluid" or "scaled", got ' + JSON.stringify(graph.sizing));
  }
  var _fixedW = graph.width;
  if (graph.sizing === 'fluid' && _fixedW !== undefined) {
    throw new Error("d3.easygraph: width is only for sizing: 'scaled' (a logical width x height the browser " +
                    "scales to the container); a fluid chart takes its container's width - size the container instead");
  }
  if (graph.sizing === 'scaled' && !(_fixedW > 0)) {
    throw new Error("d3.easygraph: sizing: 'scaled' needs width, a positive number (the logical width, with height)");
  }
  // graph.width is the svg box's width: the logical width in fixed-size mode, else measured from the
  // container. Either way it is the library's to set, so assigning it throws.
  var _widthValue = _fixedW;
  _defineOwned(graph, 'width', function() { return _widthValue; },
               "(the container's width, or the logical width of a sizing: 'scaled' chart) - destroy() it and build a new chart to change it");
  graph._.viewScale = 1;
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
    var w = _fixedW || containerEl.getBoundingClientRect().width;
    // ignore transient/degenerate layout passes (e.g. mid-reflow during a live
    // resize) that would otherwise drive graph.plotWidth negative
    if (w <= graph._.margin.left + graph._.margin.right) return false;
    var changed = graph._.plotWidth === undefined || Math.abs(w - graph.width) >= 1;
    _widthValue = w;
    graph._.plotWidth = graph.width - graph._.margin.left - graph._.margin.right;
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
  graph._.timeFormatShort = function(date) {
    for (var i = 0; i < _timeFormats.length; i++) {
      if (_timeFormats[i][1](date)) return _timeFormats[i][0](date);
    }
  };

  // Re-applies both axes to whatever the scales currently say, with no transition. Every family
  // needs this after a resize, because _layout() changes the scales' pixel ranges but doesn't
  // re-render the tick DOM. It used to live inside line.js's draw() - so line charts got correct
  // axes on resize and bars/heatmap/scatter silently kept their ticks frozen at pre-resize
  // positions, ending up outside the plot area entirely on a shrink.
  graph._.drawAxes = function() {
    graph.$plot.select("g.easygraph-axis-x").call(graph.x.$axis);
    graph.$plot.select("g.easygraph-axis-y").call(graph.y.$axis);
  };

  graph._.clipId = "d3-easygraph-clip-" + (_nextClipId++);

  // The family's defaults fill the config keys the caller left unset. Its _-named entries are not
  // config: the family's name (the accessible-name fallback in update()), its data shape (see
  // _checkData), its events and default palette go to graph._.
  Object.keys(familyDefaults).forEach(function(key) {
    if (key.charAt(0) === '_') graph._[key.slice(1)] = familyDefaults[key];
    else if (graph[key] === undefined) graph[key] = familyDefaults[key];
  });
  graph._.eventTypes = graph._.eventTypes || [];

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
    duration:        500
  });

  // color: { palette, classes, reverse } on every family (heatmap and scatter keep their scale options
  // in the same object). palette is a "Kind.Name" name; classes asks a Sequential/Diverging palette for
  // a specific class count instead of its largest (ignored for Qualitative); reverse flips the order.
  // The family's default palette (Tableau10, or the heatmap's reversed RdBu) brings its own reverse,
  // which a caller's reverse overrides; a palette the caller names is reversed only when asked.
  graph.color = Object.assign({}, graph.color);
  var _defaultPalette = graph._.palette || { palette: 'Qualitative.Tableau10', reverse: false };
  graph._.paletteColors = d3.easygraph.palette(graph.color.palette || _defaultPalette.palette, {
    classes: graph.color.classes,
    reverse: (graph.color.reverse != null) ? graph.color.reverse : (!graph.color.palette && _defaultPalette.reverse)
  });
  graph.meta = graph.meta || {};

  d3.easygraph._resolveProperty(graph.x);
  d3.easygraph._resolveProperty(graph.y);

  // An axis's `type` is 'linear' (the default) or 'time'; anything else throws rather than falling
  // through to a linear axis that plots Dates as numbers.
  ['x', 'y'].forEach(function(axis) {
    if (graph[axis].type === undefined) graph[axis].type = 'linear';
    var type = graph[axis].type;
    if (type !== 'linear' && type !== 'time') {
      throw new Error('d3.easygraph: ' + axis + '.type must be "linear" or "time", got ' +
                      JSON.stringify(type));
    }
  });

  // The text of an axis title: the axis's label plus its unit, "Temperature [°F]". A preset
  // supplies both for a known quantity; with neither there is no title at all. Re-read on every
  // update(), so graph.set({ y: { label } }) (or unit) later changes the text.
  function _axisTitleText(prop) {
    var label = prop.label, unit = prop.unit;
    if (label && unit) return label + ' [' + unit + ']';
    return label || (unit ? '[' + unit + ']' : '');
  }

  // Room for an axis title is added to the margin you gave, not taken out of it: 20px more on
  // the left for a y title, on the bottom for an x title. Decided at construction (a label
  // set later is still drawn, in the same spot, but no space was set aside for it).
  // graph.margin stays exactly what you passed; graph._.margin is what the layout uses.
  var _TITLE_PAD = 20;
  graph._.margin = {
    top:    graph.margin.top,
    right:  graph.margin.right,
    bottom: graph.margin.bottom + (_axisTitleText(graph.x) ? _TITLE_PAD : 0),
    left:   graph.margin.left   + (_axisTitleText(graph.y) ? _TITLE_PAD : 0)
  };
  var _vMargin2 = graph._.margin.top + graph._.margin.bottom;
  if (!(graph.height > _vMargin2)) {
    throw new Error('d3.easygraph: height (' + graph.height + ') must be greater than the vertical ' +
                    'margins (' + _vMargin2 + ', including room for an axis title), or there is no room to plot in');
  }

  graph._.plotHeight = graph.height - graph._.margin.top - graph._.margin.bottom;
  _measureWidth();

  // Events: graph.on('zoom', fn) adds a listener; 'zoom.name' replaces the listener with that name
  // (so calling a setup twice does not stack it); graph.on('zoom.name', null) or graph.off('zoom'[, fn])
  // removes. Several listeners per event, called in the order added. Which events exist is up to the
  // family (graph._.eventTypes: line has 'zoom' and 'crosshair'); an unknown one throws.
  var _listeners = [];
  function _parseEvent(spec) {
    var dot = spec.indexOf('.'), type = dot < 0 ? spec : spec.slice(0, dot);
    if ((graph._.eventTypes || []).indexOf(type) < 0)
      throw new Error("d3.easygraph: this chart has no '" + type + "' event" +
                      ((graph._.eventTypes || []).length ? " (available: " + graph._.eventTypes.join(', ') + ")" : " (it emits no events)"));
    return { type: type, name: dot < 0 ? '' : spec.slice(dot + 1) };
  }
  graph.on = function(spec, fn) {
    var ev = _parseEvent(spec);
    if (fn == null) return graph.off(spec);
    if (typeof fn !== 'function') throw new Error("d3.easygraph: on(" + JSON.stringify(spec) + ", fn) needs a function");
    if (ev.name) _listeners = _listeners.filter(function(l) { return !(l.type === ev.type && l.name === ev.name); });
    _listeners.push({ type: ev.type, name: ev.name, fn: fn });
    return graph;
  };
  graph.off = function(spec, fn) {
    var ev = _parseEvent(spec);
    _listeners = _listeners.filter(function(l) {
      if (l.type !== ev.type) return true;
      if (ev.name && l.name !== ev.name) return true;
      if (fn && l.fn !== fn) return true;
      return false;
    });
    return graph;
  };
  graph._.emit = function(type) {
    var args = Array.prototype.slice.call(arguments, 1);
    _listeners.slice().forEach(function(l) { if (l.type === type) l.fn.apply(graph, args); });
  };

  graph._.module = moduleFactory(graph);

  if (graph._.module.prepareScales) {
    graph._.module.prepareScales();
  } else {
    graph.x.$scale = (graph.x.type === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.x.$scale.range([0, graph.plotWidth]);
    graph.y.$scale = (graph.y.type === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.y.$scale.range([graph.plotHeight, 0]);
  }

  // x.tickFormat / y.tickFormat: 'multi' (a time axis: minute, hour, day or month format picked per
  // tick), a function (value => text), or a format string (d3.timeFormat on a time axis, d3.format on
  // a linear one). Left out, a linear axis uses formatNumber and a time axis d3's own multi-format.
  // tickLabels: false blanks the tick *text* and keeps the tick marks and gridlines, and wins over
  // tickFormat.
  function _applyTickFormat(name, axis) {
    var prop = graph[name], fmt = prop.tickFormat, band = !!prop.$scale.bandwidth;
    if (prop.tickLabels === false) { axis.tickFormat(function() { return ''; }); return; }
    if (fmt === undefined) {
      if (prop.type === 'linear' && !band) axis.tickFormat(d3.easygraph.formatNumber);
      return;
    }
    if (fmt === 'multi') {
      if (prop.type !== 'time' || band)
        throw new Error("d3.easygraph: " + name + ".tickFormat 'multi' is for a time axis (set " + name + ".type: 'time')");
      axis.tickFormat(graph._.timeFormatShort);
    } else if (typeof fmt === 'function') {
      axis.tickFormat(fmt);
    } else if (typeof fmt === 'string') {
      if (band) throw new Error("d3.easygraph: " + name + ".tickFormat as a format string needs a number or time axis; pass a function for a category axis");
      axis.tickFormat(prop.type === 'time' ? d3.timeFormat(fmt) : d3.format(fmt));
    } else {
      throw new Error("d3.easygraph: " + name + ".tickFormat must be 'multi', a format string or a function, got " + JSON.stringify(fmt));
    }
  }

  graph.x.$axis = d3.axisBottom(graph.x.$scale).tickSize(-graph.plotHeight).tickPadding(12);
  _applyTickFormat('x', graph.x.$axis);

  graph.y.$axis = d3.axisLeft(graph.y.$scale).tickSize(-graph.plotWidth).tickPadding(6);
  _applyTickFormat('y', graph.y.$axis);

  // The "easygraph" class is what every rule in d3.easygraph.css is scoped under - without it
  // the stylesheet's generic selectors (a bare #title, .tick, .axis) would restyle any host
  // page element that happened to share those names. role/aria-label give assistive tech
  // something better than the axis tick numbers read out as one run-on string; the <title>
  // child is the SVG-native equivalent, kept in sync by update().
  graph.$svg = d3.select(containerEl)
    .append("svg")
      .attr("class", "easygraph")
      .attr("role", "img")
      .attr("width", _fixedW ? "100%" : graph.width)
      .attr("height", _fixedW ? null : graph.height);
  if (_fixedW) {
    graph.$svg.attr("viewBox", "0 0 " + graph.width + " " + graph.height)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("display", "block").style("height", "auto");
    graph._.viewScale = (containerEl.getBoundingClientRect().width / _fixedW) || 1;
  }
  graph._.$a11yTitle = graph.$svg.append("title");
  graph.$plot = graph.$svg
    .append("g")
      .attr("transform", "translate(" + graph._.margin.left + "," + graph._.margin.top + ")");

  graph.$plot
    .append("g")
      .attr("class", "easygraph-axis easygraph-axis-x")
      .attr("transform", "translate(0," + graph.plotHeight + ")")
      .call(graph.x.$axis);

  // A class, not id="title": an id is unique per *document*, so N charts on one page produced
  // N duplicate ids, and the stylesheet's matching bare #title rule reached into the host page
  // and restyled its own #title element (an <h1 id="title"> visibly shrank to the chart
  // title's 16px). Nothing needs to look this up by id - graph._.$title holds the selection.
  graph._.$title = graph.$plot
    .append("g")
      .attr("class", "easygraph-axis easygraph-axis-y")
      .call(graph.y.$axis)
    .append("text")
      .attr("class", "easygraph-title")
      .attr("x", graph.plotWidth / 2)
      .attr("y", -6);

  // Axis titles follow the screen axes: x is the bottom one, y the left one, in every chart
  // (a horizontal bar chart's values are on x).
  graph._.$xTitle = graph.$plot.append("text")
    .attr("class", "easygraph-axis-title easygraph-axis-title-x")
    .attr("text-anchor", "middle");
  graph._.$yTitle = graph.$plot.append("text")
    .attr("class", "easygraph-axis-title easygraph-axis-title-y")
    .attr("text-anchor", "middle")
    .attr("transform", "rotate(-90)");
  graph._.placeAxisTitles = function() {
    graph._.$xTitle.attr("x", graph.plotWidth / 2).attr("y", graph.plotHeight + graph._.margin.bottom - 6);
    graph._.$yTitle.attr("x", -graph.plotHeight / 2).attr("y", -(graph._.margin.left - 14));
  };
  graph._.placeAxisTitles();

  graph._.$clipRect = graph.$plot
    .append("clipPath")
      .attr("id", graph._.clipId)
    .append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", graph.plotWidth).attr("height", graph.plotHeight);

  // The three public handles: $svg is the chart's <svg>; $plot is the <g> shifted by the margins, holding
  // the axes, titles and everything else, its (0, 0) the plot area's top left; $marks is the <g> inside
  // $plot that the chart's marks are drawn into, and the place for marks of your own. $marks itself is
  // not clipped (a caller may transform it, as a zoomable map does, and a clip would move along): the
  // line chart clips its paths one by one, heatmap and scatter marks are not clipped.
  graph.$marks = graph.$plot.append("g").attr("class", "easygraph-marks");

  graph.paletteColor = function(index) {
    return graph.paletteColors[index % graph.paletteColors.length];
  };

  // The { index, color, label } rows a legend is drawn from - data, never DOM. Each family
  // answers it differently (line/bars have series; heatmap/scatter have a color scale), so the
  // work is a module hook; see d3.easygraph.legendItems in colors.js for the chart-free form and
  // for why this stops at the data rather than rendering anything.
  graph.legendItems = function() {
    return graph._.module.legendItems ? graph._.module.legendItems() : [];
  };

  // module init() runs after core scaffolding above (scales/axes/svg/margin/clip/
  // group all exist) so e.g. line.js's zoom pane can be appended right after
  // graph.$marks, and crosshair after that - same DOM order as before
  if (graph._.module.init) graph._.module.init();

  // re-applies everything that depends on the container's rendered width;
  // returns false (no-op) if the width hasn't actually changed
  graph._.layout = function() {
    if (_fixedW) return false;
    if (!_measureWidth()) return false;

    if (graph.x.$scale.bandwidth) {
      graph.x.$scale.rangeRound([0, graph.plotWidth]);
    } else {
      graph.x.$scale.range([0, graph.plotWidth]);
    }
    graph.y.$axis.tickSize(-graph.plotWidth);

    graph.$svg.attr("width", graph.width);
    graph._.$clipRect.attr("width", graph.plotWidth);
    graph._.$title.attr("x", graph.plotWidth / 2);
    graph._.placeAxisTitles();

    if (graph._.module.resize) graph._.module.resize();

    return true;
  };

  var resizeObserver = new ResizeObserver(function() {
    if (_fixedW) {
      // Nothing is laid out again; only the on-screen scale changed. A chart whose marks keep a
      // constant screen size (scatter) redraws them at the new scale.
      var s = (containerEl.getBoundingClientRect().width / _fixedW) || 1;
      if (Math.abs(s - graph._.viewScale) < 0.001) return;
      graph._.viewScale = s;
      if (graph.zoomScale && graph._.lastData) graph._.reflow();
      return;
    }
    if (graph._.layout() && graph._.lastData) graph._.reflow();
  });
  resizeObserver.observe(containerEl);

  // disconnects the resize observer and tears down anything a module created
  // outside graph.$svg (e.g. line.js's crosshair tooltip); removing
  // $svg takes care of everything inside it (paths, listeners, the pane)
  graph.destroy = function() {
    resizeObserver.disconnect();
    if (graph._.module.destroy) graph._.module.destroy();
    graph.$svg.remove();
    graph._.destroyed = true;
    // Drop the reference to the caller's data. A destroyed chart holding a year of hourly
    // readings is memory the caller reasonably believes it just released.
    graph._.lastData = null;
    graph._.lastDomains = null;
  };


  // domains: { x, y } (and { color } on heatmap and scatter) pin those domains for this render
  // instead of fitting them to the data - one object, so a new one has somewhere to go.
  graph.update = function(data, domains) {
    // A destroyed chart used to accept update() silently: it rendered into a detached SVG and
    // still recorded the new data, so a caller could keep feeding a chart that would never
    // appear again and get no hint anything was wrong.
    if (graph._.destroyed) {
      throw new Error('d3.easygraph: update() called on a destroyed chart');
    }
    d3.easygraph._checkData(data, graph._.dataShape, graph._.chartType);
    domains = (domains === undefined) ? {} : domains;
    d3.easygraph._checkDomains(domains, graph._.chartType);
    graph._.lastData = data;
    // Kept alongside lastData so a resize reflow or a scatter zoomScale(k) - both of which
    // re-render from stored state rather than a fresh update() - keep the pinned domains.
    graph._.lastDomains = domains;

    var titleText = (graph.title == null) ? '' : String(graph.title);
    var xTitleText = _axisTitleText(graph.x), yTitleText = _axisTitleText(graph.y);
    graph._.$title.text(titleText);
    graph._.$xTitle.text(xTitleText);
    graph._.$yTitle.text(yTitleText);
    // Mirrored onto the SVG's own accessible name: the title, else the y then x axis title,
    // else the family name, so a chart with no text at all still announces as something rather
    // than as its axis tick numbers.
    var accessibleName = titleText || yTitleText || xTitleText || graph._.chartType + " chart";
    graph._.$a11yTitle.text(accessibleName);
    graph.$svg.attr("aria-label", accessibleName);

    var fitted = graph._.module.domain(data, domains.x, domains.y) || { x: [0, 1], y: [0, 1] };
    graph.x.$scale.domain(fitted.x);
    graph.y.$scale.domain(fitted.y);

    graph._.module.render(data);

    graph.$plot.select("g.easygraph-axis-x").transition().duration(graph.duration).call(graph.x.$axis);
    graph.$plot.select("g.easygraph-axis-y").transition().duration(graph.duration).call(graph.y.$axis);

    return graph; // chainable, matching d3's own convention
  };

  // re-renders in place after a resize, using the last data passed to update(); domains don't
  // change here, only the pixel ranges _layout() just updated. No transition.
  graph._.reflow = function() {
    var savedDuration = graph.duration;
    _write(graph, 'duration', 0);
    try {
      graph._.drawAxes();
      graph._.module.render(graph._.lastData);
    } finally {
      _write(graph, 'duration', savedDuration);
    }
  };

  // set(options): the one way to change live keys. options is checked exactly like the config (an
  // unknown key throws with a did-you-mean), any key that is not live throws before anything is
  // changed, and x/y/color are merged key by key. Draws nothing: call update() next.
  // graph.set({ stacked: true, y: { label: 'Load' } }).update(data)
  graph.set = function(options) {
    var ctor = 'd3.easygraph.' + _FAMILY_CTOR[graph._.chartType];
    if (graph._.destroyed) throw new Error('d3.easygraph: set() called on a destroyed chart');
    if (options === null || typeof options !== 'object' || Array.isArray(options))
      throw new Error(ctor + ".set() takes an object of options, like { stacked: true }");
    d3.easygraph._checkConfig(options, graph._.chartType);
    var writes = [];
    Object.keys(options).forEach(function(key) {
      if (_kinds[key] === 'object') {
        if (options[key] == null) return;
        Object.keys(options[key]).forEach(function(sub) {
          writes.push([graph[key], sub, key + '.' + sub, options[key][sub]]);
        });
      } else {
        writes.push([graph, key, key, options[key]]);
      }
    });
    writes.forEach(function(w) {
      if (_kinds[w[2]] !== 'live') throw new Error(_assignMessage(w[2], _kinds[w[2]]));
    });
    writes.forEach(function(w) { _write(w[0], w[1], w[3]); });
    return graph;
  };

  // Every key of the graph object gets one of three kinds, and assigning any of them throws:
  //   live  - re-read on every update(); written only through set(), which checks the value
  //   fixed - the chart is built around it (scales, axes, DOM); destroy() and build a new chart
  //   owned - computed by the chart (width, plotWidth, the $ handles, the methods)
  // Then the graph and its x/y/color objects are sealed, so a misspelled key cannot be added
  // either (an error in strict-mode code; ignored, not stored, in sloppy-mode code).
  var _kinds = {};
  var _writing = false;
  function _write(obj, key, value) {
    _writing = true;
    try { obj[key] = value; } finally { _writing = false; }
  }
  function _defineKey(obj, key, path, kind) {
    var desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && desc.get) { _kinds[path] = 'owned'; return; }   // already owned (width, plotWidth, ...)
    _kinds[path] = kind;
    var value = obj[key];
    Object.defineProperty(obj, key, {
      enumerable: true, configurable: false,
      get: function() { return value; },
      set: function(v) {
        if (kind === 'live' && _writing) { value = v; return; }
        throw new Error(_assignMessage(path, kind));
      }
    });
  }

  var _FIXED_TOP  = ['container', 'sizing', 'height', 'margin', 'orientation', 'curve', 'zoom', 'crosshair'];
  var _FIXED_SUB  = { x: ['type', 'preset', 'tickFormat', 'tickLabels'], y: ['type', 'preset', 'tickFormat', 'tickLabels'],
                      color: ['palette', 'classes', 'reverse', 'quantize'] };
  var _OWNED_SUB  = { x: ['convert', 'convertRounded', '$scale', '$axis'], y: ['convert', 'convertRounded', '$scale', '$axis'],
                      color: ['$scale'] };
  var _SUB_KEYS   = { x: _AXIS_KEYS, y: _AXIS_KEYS, color: _COLOR_KEYS[graph._.chartType] };

  ['x', 'y', 'color'].forEach(function(name) {
    var obj = graph[name];
    _SUB_KEYS[name].concat(_OWNED_SUB[name]).forEach(function(key) {
      var kind = _FIXED_SUB[name].indexOf(key) >= 0 ? 'fixed' : _OWNED_SUB[name].indexOf(key) >= 0 ? 'owned' : 'live';
      _defineKey(obj, key, name + '.' + key, kind);
    });
    Object.seal(obj);
  });
  Object.freeze(graph.margin);

  _SHARED_KEYS.concat(_FAMILY_KEYS[graph._.chartType]).forEach(function(key) {
    var kind = (key === 'x' || key === 'y' || key === 'color') ? 'object'
             : (_FIXED_TOP.indexOf(key) >= 0) ? 'fixed' : 'live';
    _defineKey(graph, key, key, kind);
  });
  Object.keys(graph).forEach(function(key) {
    if (!_kinds.hasOwnProperty(key)) _defineKey(graph, key, key, 'owned');
  });
  Object.seal(graph);

  return graph;
};
