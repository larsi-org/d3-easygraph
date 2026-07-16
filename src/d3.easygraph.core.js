// d3.easygraph.core.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// Shared scaffolding for every chart family: container sizing/resize, SVG/margin/
// clip/title DOM, palette, number/time formatting, unit-preset defaults, and the
// module registry that d3.easygraph.line.js / .bars.js / .heatmap.js plug into.

// d3.round was removed in v4; shim it for consumer pages
d3.round = d3.round || function(x, n) {
  return n ? Math.round(x * (n = Math.pow(10, n))) / n : Math.round(x);
};

d3.easygraph = function(graph) {
  function defaults(dst, src) {
    for (var key in src) {
      if (src.hasOwnProperty(key) && dst[key] === undefined) dst[key] = src[key];
    }
    return dst;
  }

  // measures the container's current rendered width; returns false if unchanged
  // (within 1px) so callers can skip redundant layout/redraw work
  function _measureWidth() {
    var w = document.getElementById(graph.id).getBoundingClientRect().width;
    // ignore transient/degenerate layout passes (e.g. mid-reflow during a live
    // resize) that would otherwise drive graph.width negative
    if (w <= graph.margin.left + graph.margin.right) return false;
    var changed = graph.width === undefined || Math.abs(w - graph.svg.width) >= 1;
    graph.svg.width = w;
    graph.width = graph.svg.width - graph.margin.left - graph.margin.right;
    return changed;
  }

  graph.defaults = {
    'pressure_hpa': {
      'label': 'Pressure',
      'unit':  'hPa',
      'range': [ 950, 1050 ]
    },
    'pressure_inhg': {
      'label': 'Pressure',
      'unit':  'inHg',
      'm':     0.02953,
      'range': [ 28, 31 ]
    },
    'relative_humidity': {
      'label': 'Relative Humidity',
      'unit':  '%',
      'range': [ 0, 100 ]
    },
    'temperature_c': {
      'label': 'Temperature',
      'unit':  '\xB0C',
      'range': [ -25, 45 ]
    },
    'temperature_f': {
      'label': 'Temperature',
      'unit':  '\xB0F',
      'm':     1.8,
      'n':     32.0,
      'range': [ -10, 110 ]
    },
    'dew_point_c': {
      'label': 'Dew Point',
      'unit':  '\xB0C',
      'range': [ -25, 45 ]
    },
    'dew_point_f': {
      'label': 'Dew Point',
      'unit':  '\xB0F',
      'm':     1.8,
      'n':     32.0,
      'range': [ -10, 110 ]
    },
    'wind_speed': {
      'label': 'Wind Speed',
      'unit':  'm/s',
      'range': [ 0, 20 ]
    },
    'wind_speed_kmph': {
      'label': 'Wind Speed',
      'unit':  'kmph',
      'm':     3.6,
      'range': [ 0, 80 ]
    },
    'wind_speed_mph': {
      'label': 'Wind Speed',
      'unit':  'mph',
      'm':     2.23694,
      'range': [ 0, 50 ]
    },
    'wind_direction': {
      'label': 'Wind Direction',
      'unit':  '\xB0North',
      'range': [ 0, 360 ]
    },
    'rain_fall_mm': {
      'label': 'Rain Fall',
      'unit':  'mm',
      'range': [ 0, 100 ]
    },
    'rain_fall_inches': {
      'label': 'Rain Fall',
      'unit':  'inches',
      'm':     1 / 25.4,
      'range': [ 0, 100 ]
    },
    'clouds': {
      'label': 'Clouds',
      'unit':  '\xD710th',
      'range': [ 0, 10 ]
    },
    'solar_radiation': {
      'label': 'Solar Radiation',
      'unit':  'W/m\xB2',
      'range': [ 0, 1500 ]
    },
    'electric_voltage': {
      'label': 'Voltage',
      'unit':  'V',
      'range': [ 100, 140 ]
    },
    'electric_current': {
      'label': 'Current',
      'unit':  'A',
      'range': [ 0, 10 ]
    },
    'electric_power': {
      'label': 'Power',
      'unit':  'W',
      'range': [ 0, 1500 ]
    }
  };


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

  var clipId = "clip-" + graph.id;

  defaults(graph, {
    x:                   {},
    y:                   {},
    c:                   {},
    interpolate:         'linear',
    color_palette:       'D3_category10',
    one_year:            false,
    show_zoom:           false,
    show_areas:          false,
    show_lines:          false,
    show_bars_stacked_v: false,
    show_bars_grouped_v: false,
    show_bars_stacked_h: false,
    show_bars_grouped_h: false,
    show_heatmap:        false,
    color_per_data:      false,
    animation_stage1:      500,
    show_crosshair:        false,
    crosshair_threshold:   10
  });

  graph.show_bars_v = graph.show_bars_stacked_v || graph.show_bars_grouped_v;
  graph.show_bars_h = graph.show_bars_stacked_h || graph.show_bars_grouped_h;

  var REVERSE_SUFFIX = "_reversed";
  if (graph.color_palette.endsWith(REVERSE_SUFFIX)) {
    graph.PALETTE_COLORS = graph.colorbrewerPalettes[graph.color_palette.slice(0, -REVERSE_SUFFIX.length)].slice(0);
    graph.PALETTE_COLORS.reverse();
  } else {
    graph.PALETTE_COLORS = graph.colorbrewerPalettes[graph.color_palette].slice(0);
  }

  if (graph.x.defaults) defaults(graph.x, graph.defaults[graph.x.defaults]);
  defaults(graph.x, { label: 'Property X', unit: '', scale: 'linear', no_tick: false, m: 1.0, n: 0.0 });

  if (graph.y.defaults) defaults(graph.y, graph.defaults[graph.y.defaults]);
  defaults(graph.y, { label: 'Property Y', unit: '', scale: 'linear', no_tick: false, m: 1.0, n: 0.0 });

  if (graph.c.defaults) defaults(graph.c, graph.defaults[graph.c.defaults]);
  defaults(graph.c, { label: 'Property C', unit: '', scale: 'linear', m: 1.0, n: 0.0 });

  defaults(graph, { label: graph.y.label, unit: graph.y.unit });

  graph.height = graph.svg.height - graph.margin.top  - graph.margin.bottom;
  _measureWidth();

  if (graph.show_bars_v) {
    graph.x.$scale = d3.scaleBand().rangeRound([0, graph.width]).padding(.2);
  } else {
    graph.x.$scale = (graph.x.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.x.$scale.range([0, graph.width]);
  }

  if (graph.show_bars_h) {
    graph.y.$scale = d3.scaleBand().rangeRound([0, graph.height]).padding(.2);
  } else {
    graph.y.$scale = (graph.y.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
    graph.y.$scale.range([graph.height, 0]);
  }

  graph.x.$axis = d3.axisBottom(graph.x.$scale).tickSize(-graph.height).tickPadding(12);
  if (graph.x.scale === 'linear' && !graph.show_bars_v) graph.x.$axis.tickFormat(graph.numberFormat);
  if (graph.x.scale === 'time'   && graph.one_year)     graph.x.$axis.tickFormat(graph.timeFormatShort);
  if (graph.x.no_tick)                                  graph.x.$axis.tickFormat(function() { return ''; });

  graph.y.$axis = d3.axisLeft(graph.y.$scale).tickSize(-graph.width).tickPadding(6);
  if (graph.y.scale === 'linear' && !graph.show_bars_h) graph.y.$axis.tickFormat(graph.numberFormat);
  if (graph.y.no_tick)                                  graph.y.$axis.tickFormat(function() { return ''; });

  graph.$svgRoot = d3.select("#" + graph.id)
    .append("svg")
      .attr("width", graph.svg.width)
      .attr("height", graph.svg.height);
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
      .attr("id", clipId)
    .append("rect")
      .attr("x", 0).attr("y", 0)
      .attr("width", graph.width).attr("height", graph.height);

  graph.$group = graph.$svg.append("g");

  graph.getPaletteColor = function(index) {
    return graph.PALETTE_COLORS[index % graph.PALETTE_COLORS.length];
  };

  // the one chart-family module whose test(graph) matches; exactly one in
  // every real page today, but the dispatch below tolerates 0 or many
  graph._modules = d3.easygraph.modules
    .filter(function(m) { return m.test(graph); })
    .map(function(m) { return m.factory(graph); });
  // module init() runs after core scaffolding above (scales/axes/svg/margin/
  // clip/group all exist) so e.g. line.js's zoom pane can be appended right
  // after graph.$group, and crosshair after that — same DOM order as before
  graph._modules.forEach(function(m) { if (m.init) m.init(); });

  // re-applies everything that depends on the container's rendered width;
  // returns false (no-op) if the width hasn't actually changed
  graph._layout = function() {
    if (!_measureWidth()) return false;

    if (graph.show_bars_v) {
      graph.x.$scale.rangeRound([0, graph.width]);
    } else {
      graph.x.$scale.range([0, graph.width]);
    }
    graph.y.$axis.tickSize(-graph.width);

    graph.$svgRoot.attr("width", graph.svg.width);
    graph.$clipRect.attr("width", graph.width);
    graph.$title.attr("x", graph.width / 2);

    graph._modules.forEach(function(m) { if (m.resize) m.resize(); });

    return true;
  };

  new ResizeObserver(function() {
    if (graph._layout() && graph._lastData) graph._reflow();
  }).observe(document.getElementById(graph.id));

  // re-renders in place after a resize, using the last data passed to update();
  // domains don't change here, only the pixel ranges _layout() just updated
  graph._reflow = function() {
    var savedDuration = graph.animation_stage1;
    graph.animation_stage1 = 0;

    graph.draw();
    graph._modules.forEach(function(m) { m.render(graph._lastData); });

    graph.animation_stage1 = savedDuration;
  };

  graph.update = function(data, x_range, y_range) {
    graph._lastData = data;

    graph.$svg.select("#title")
      .text((graph.unit) ? graph.label + " [" + graph.unit + "]" : graph.label);

    var domains = { x: [0, 1], y: [0, 1] };
    graph._modules.forEach(function(m) {
      var d = m.domain && m.domain(data, x_range, y_range);
      if (d) domains = d;
    });
    graph.x.$scale.domain(domains.x);
    graph.y.$scale.domain(domains.y);

    graph._modules.forEach(function(m) { m.render(data); });

    graph.$svg.select("g.x.axis").transition().duration(graph.animation_stage1).call(graph.x.$axis);
    graph.$svg.select("g.y.axis").transition().duration(graph.animation_stage1).call(graph.y.$axis);
  };

  return graph;
};

// chart-family modules self-register here: { test(graph), factory(graph) }
d3.easygraph.modules = [];
