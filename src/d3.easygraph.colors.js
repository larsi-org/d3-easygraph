// d3.easygraph.colors.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// A small, easygraph-agnostic palette lookup: palettes / palette() / colorScale() / legendItems()
// have no chart concepts of their own - no graph, no container, no SVG - so they're reusable well
// beyond charting (e.g. coloring a Leaflet marker or a parcoords line). Same shape as
// d3.easygraph.presets.js's preset table and preset(): a global table plus one lookup function.
// Every color here is a CSS color string.
// Chart config resolution (folding color.palette/classes/reverse onto graph.paletteColors) lives in
// core.js, the only actual chart consumer that needs it. colorScale() takes the same keys as a chart's
// `color` config, so a standalone scale and a chart's color scale are described the same way.

// Every palette name is "Kind.Name" - Sequential (a plain value gradient), Diverging (a gradient
// with a meaningful midpoint), or Qualitative (unordered, mutually distinct categories) - the
// same three groups colorbrewer.schemeGroups itself uses. The kind leads because it's what a
// caller is actually choosing on: what sort of quantity am I representing.
//
// Every palette here is an externally designed and tested scheme. A palette of your own can be
// added to d3.easygraph.palettes (see the README); give it a prefix of your own so a future
// version of this library cannot overwrite it.
//
// The three arrays below are colorbrewer's own three groups (SEQUENTIAL folds in its
// single-hue/multi-hue split, which doesn't affect lookup) plus D3's own (non-ColorBrewer)
// categorical schemes appended to QUALITATIVE, since they're the same kind and same "flat array,
// no per-class-count variant" lookup shape - sourced directly from d3-scale-chromatic's
// d3.scheme* exports (already part of the full d3@7 bundle every caller already loads) rather
// than a second copy via the standalone `colorbrewer` package. Verified byte-identical against
// colorbrewer's own data for every name/class-count here except PuOr, which d3 stores in the
// opposite color order; left as d3's native order since nothing here resolves it by name today
// (palette()'s reverse option covers whichever direction a caller wants).
var DIVERGING   = ["BrBG","PiYG","PRGn","PuOr","RdBu","RdGy","RdYlBu","RdYlGn","Spectral"];
var QUALITATIVE = ["Accent","Dark2","Paired","Pastel1","Pastel2","Set1","Set2","Set3","Tableau10","Observable10"];
var SEQUENTIAL  = ["BuGn","BuPu","GnBu","OrRd","PuBu","PuBuGn","PuRd","RdPu","YlGn","YlGnBu","YlOrBr","YlOrRd","Blues","Greens","Greys","Oranges","Purples","Reds","Turbo"];

// Some d3-scale-chromatic schemes (Turbo among them - Viridis/Inferno/Magma/Plasma/Cividis/
// Warm/Cool/CubehelixDefault/Rainbow/Sinebow are the others, none added above since nothing here
// names them yet) ship only as a continuous d3.interpolateX(t) function, no discrete d3.schemeX
// array at all - unlike colorbrewer's schemes, which come pre-split into classes 3..11. Sampled
// at DEFAULT_INTERPOLATE_SAMPLES evenly-spaced points across [0, 1] (or `classes`, taking over
// the same role it plays for a classed colorbrewer scheme: how many discrete stops to return) to
// fit the same flat-color-array shape every other palette here uses. 9 matches the largest class
// count colorbrewer's own sequential schemes stop at, so a caller that doesn't ask for a specific
// class count still gets a comparably-sized palette either way.
var DEFAULT_INTERPOLATE_SAMPLES = 9;

// Sequential/diverging schemes are d3 arrays indexed by class count (classes 3..11, with the
// leading indices unused, so the largest class's colors are the *last* element); qualitative
// schemes are a single flat array of color strings, no per-class-count variant, so the last
// element is a string rather than an array - that shape difference, not a hardcoded list of
// which names are which, is what schemeColors actually branches on, so it handles any d3.scheme*
// export correctly without needing to know about it in advance. Colorbrewer's own smaller-class
// variants are verified literal prefixes of its largest set, so slicing a flat array reproduces
// them exactly. `classes` omitted (or not available) resolves to the largest/full set. Takes the
// bare d3 scheme name ("RdYlBu", not "Diverging.RdYlBu") - palette() strips the kind prefix
// before calling this. Falls back to sampling d3.interpolateX when d3.schemeX doesn't exist -
// see DEFAULT_INTERPOLATE_SAMPLES above.
function schemeColors(name, classes) {
  var scheme = d3["scheme" + name];
  if (scheme) {
    if (!Array.isArray(scheme[scheme.length - 1])) {
      return scheme.slice(0, classes || scheme.length);
    }
    var sizes = Object.keys(scheme).map(Number);
    var n = (classes && scheme[classes]) ? classes : Math.max.apply(null, sizes);
    return scheme[n].slice(0);
  }
  var interpolate = d3["interpolate" + name];
  if (!interpolate) return undefined;
  var count = classes || DEFAULT_INTERPOLATE_SAMPLES;
  var colors = [];
  for (var i = 0; i < count; i++) {
    colors.push(interpolate(count > 1 ? i / (count - 1) : 0));
  }
  return colors;
}

// Every scheme above (see schemeColors) at its largest class count, flattened to a plain
// {"Kind.Name": [colors]} map, plus the entries d3 can't supply: Category20/20b/20c are hardcoded
// here purely because D3 dropped them from d3-scale-chromatic in v5, which is a packaging
// accident, not a property of the palette. They're as externally-designed as Set1 or Tableau10
// and are named like them.
//
// Computed once at load time (not rebuilt per chart instance) since it depends only on the `d3`
// global, not on any particular graph's config.
d3.easygraph.palettes = (function() {
  var palettes = {};
  DIVERGING.forEach(function(name) { palettes["Diverging." + name] = schemeColors(name); });
  QUALITATIVE.forEach(function(name) { palettes["Qualitative." + name] = schemeColors(name); });
  palettes["Qualitative.Category20"]      = ["#1f77b4","#aec7e8","#ff7f0e","#ffbb78","#2ca02c","#98df8a","#d62728","#ff9896","#9467bd","#c5b0d5","#8c564b","#c49c94","#e377c2","#f7b6d2","#7f7f7f","#c7c7c7","#bcbd22","#dbdb8d","#17becf","#9edae5"];
  palettes["Qualitative.Category20b"]     = ["#393b79","#5254a3","#6b6ecf","#9c9ede","#637939","#8ca252","#b5cf6b","#cedb9c","#8c6d31","#bd9e39","#e7ba52","#e7cb94","#843c39","#ad494a","#d6616b","#e7969c","#7b4173","#a55194","#ce6dbd","#de9ed6"];
  palettes["Qualitative.Category20c"]     = ["#3182bd","#6baed6","#9ecae1","#c6dbef","#e6550d","#fd8d3c","#fdae6b","#fdd0a2","#31a354","#74c476","#a1d99b","#c7e9c0","#756bb1","#9e9ac8","#bcbddc","#dadaeb","#636363","#969696","#bdbdbd","#d9d9d9"];
  SEQUENTIAL.forEach(function(name) { palettes["Sequential." + name] = schemeColors(name); });
  return palettes;
})();

// Throws for an options object with a key outside `allowed` (same message style as the chart config).
function _checkOptions(fn, options, allowed) {
  if (options == null) return {};
  if (typeof options !== 'object' || Array.isArray(options))
    throw new Error('d3.easygraph.' + fn + ': options must be an object with ' + allowed.join(', '));
  d3.easygraph._checkKeys('d3.easygraph.' + fn, 'options', options, allowed);
  return options;
}

// palette(name, { classes, reverse }): the colors of a palette name as a plain array (a fresh copy).
// classes picks a specific class count of a Sequential/Diverging palette instead of its largest
// (ignored for the Qualitative ones, which aren't classed data); reverse flips the order. This is
// what _build() uses for graph.paletteColors, exposed for a caller that isn't building a chart.
//
// palettes already has every name's *largest* size precomputed, so the common case (no class count)
// reads straight from that table - schemeColors only gets called when a specific class count is
// asked for, the one thing the table can't answer.
d3.easygraph.palette = function(name, options) {
  options = _checkOptions('palette', options, ['classes', 'reverse']);
  if (typeof name !== 'string' || !d3.easygraph.palettes[name]) {
    var hint = (typeof name === 'string' && /\.reversed$/.test(name))
      ? ' - write the name without .reversed and pass { reverse: true }'
      : ' (see Object.keys(d3.easygraph.palettes))';
    throw new Error('d3.easygraph: unrecognized palette ' + JSON.stringify(name) + hint);
  }
  var classed = /^(Sequential|Diverging)\./.test(name);   // a Qualitative palette is not classed data
  var colors = (options.classes && classed) ? schemeColors(name.slice(name.indexOf('.') + 1), options.classes) : null;
  if (!colors) colors = d3.easygraph.palettes[name].slice(0);
  if (options.reverse) colors.reverse();
  return colors;
};

// colorScale({ palette, domain, classes, reverse, quantize }): a ready color(value) scale, built the
// way heatmap and scatter build their own graph.color.$scale - the palette spread in evenly spaced
// stops across domain = [min, max] and clamped, or with quantize: true a d3.scaleQuantize of equal
// bands. For a caller with its own, already known domain.
d3.easygraph.colorScale = function(options) {
  options = _checkOptions('colorScale', options, ['palette', 'domain', 'classes', 'reverse', 'quantize']);
  var domain = options.domain;
  if (!Array.isArray(domain) || domain.length !== 2)
    throw new Error('d3.easygraph.colorScale: domain must be [min, max]');
  var colors = d3.easygraph.palette(options.palette, { classes: options.classes, reverse: options.reverse });
  if (options.quantize) return d3.scaleQuantize().range(colors).domain(domain);
  var n = colors.length;
  var stops = d3.range(n).map(function(i) { return domain[0] + i * (domain[1] - domain[0]) / (n - 1); });
  return d3.scaleLinear().range(colors).domain(stops).clamp(true);
};

// Zips colors and labels into the { index, color, label } rows a legend is drawn from - the
// data, not the DOM. Deliberately renders nothing: real legends are drawn many different ways
// (inline <span>s, a <table> with extra data columns, a separately positioned <svg>, swatches
// inside the chart's own margin), so any single built-in renderer would fit almost none of them.
// What they all have in common is the pairing-up, which is what this does.
//
// `colors` takes either an array of CSS colors or a palette name to resolve. `labels` is optional
// and may be shorter than the colors - an entry with no label just comes back with
// `label: undefined`, the same no-generic-placeholder rule the chart title follows.
//
// The chart-aware counterpart is graph.legendItems(), which fills both arguments in from the chart.
d3.easygraph.legendItems = function(colors, labels) {
  var resolved = (typeof colors === 'string') ? d3.easygraph.palette(colors) : colors;
  labels = labels || [];
  return resolved.map(function(color, i) {
    return { index: i, color: color, label: labels[i] };
  });
};
