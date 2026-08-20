// d3.easygraph.colors.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// A small, easygraph-agnostic palette lookup: colorbrewerPalettes/resolvePalette/colorScale/
// categoricalPalette have no chart concepts of their own — no graph, no container, no SVG — so
// they're reusable well beyond charting (e.g. coloring a Leaflet marker, a parcoords line, or a
// canvas point cloud). Same shape as d3.easygraph.units.js's standalone preset table, just not
// quite as dependency-free: units.js needs nothing but its own data, while this file expects `d3`
// (scaleLinear/scaleQuantize/range/hsl/rgb) and the `colorbrewer` global, same as core.js does.
// Chart config resolution (folding colorPalette/colorClasses onto graph.PALETTE_COLORS) lives in
// core.js, the only actual chart consumer that needs it — same division of labor as units.js's
// getUnit() vs. core.js's _resolveProperty().

// Every colorbrewer palette resolved to its largest class count, flattened to a plain
// {name: [colors]} map, plus D3's own categorical schemes and a handful of hand-picked
// extras (LS_*) for cases colorbrewer doesn't cover. Computed once at load time (not
// rebuilt per chart instance) since it depends only on the colorbrewer global, not on any
// particular graph's config.
d3.easygraph.colorbrewerPalettes = (function() {
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

// Resolves a colorPalette name (optionally suffixed "_reversed") + optional colorClasses (a
// specific colorbrewer class count instead of the largest, ignored for the D3_category*/LS_*
// extras above, which aren't classed data) to a plain color array. This is what _build() uses
// internally for graph.PALETTE_COLORS, exposed standalone so a caller that isn't building a
// whole chart (a Leaflet marker layer, a parcoords line color) can still resolve a named
// palette without one.
d3.easygraph.resolvePalette = function(paletteName, colorClasses) {
  var REVERSE_SUFFIX = "_reversed";
  var reversed = paletteName.endsWith(REVERSE_SUFFIX);
  var name = reversed ? paletteName.slice(0, -REVERSE_SUFFIX.length) : paletteName;
  var colors = (colorClasses && colorbrewer[name] && colorbrewer[name][colorClasses])
    ? colorbrewer[name][colorClasses].slice(0)
    : d3.easygraph.colorbrewerPalettes[name].slice(0);
  if (reversed) colors.reverse();
  return colors;
};

// Builds a ready color(value) scale from a palette name + [min, max] domain -- the same
// n-evenly-spaced-stops + clamp()/quantize() construction .heatmap()/.scatter() build for
// their own graph.color.$scale, exposed standalone for a non-chart caller with its own
// already-known domain (heatmap/scatter instead recompute their domain from live data on
// every render, via their own extent/clip handling, so they don't call this directly).
// options: { classes, quantize }.
d3.easygraph.colorScale = function(paletteName, domain, options) {
  options = options || {};
  var colors = d3.easygraph.resolvePalette(paletteName, options.classes);
  if (options.quantize) return d3.scaleQuantize().range(colors).domain(domain);
  var n = colors.length;
  var stops = d3.range(n).map(function(i) { return domain[0] + i * (domain[1] - domain[0]) / (n - 1); });
  return d3.scaleLinear().range(colors).domain(stops).clamp(true);
};

// Evenly spaced hues around the color wheel, one per index -- for unordered categorical data (a
// vertex id, a transform id) with no inherent ordering to respect, unlike colorScale's sequential/
// diverging schemes above (which is why a sequential scheme, not this, is the right fit for
// ordered data -- see larsi.org's Lorenz Attractor page, which samples colorScale('YlGnBu', ...)
// instead of this for exactly that reason). Generated rather than looked up by name, since the
// count needed is caller-specific and unbounded (a polygon's side count, an IFS's transform
// count) rather than one of a fixed set of named schemes. Returns [r, g, b] number triples,
// unlike the CSS-string colors everywhere else in this file: its consumers
// (lib/larsi.org/point-cloud-renderer-{2,3}d.js on larsi.org) write per-point colors directly
// into a Canvas ImageData byte buffer and need the numbers as-is, not a string to re-parse.
// Built via d3.hsl()/d3.rgb() since this file already depends on d3.
d3.easygraph.categoricalPalette = function(count) {
  var palette = [];
  for (var i = 0; i < count; i++) {
    var c = d3.rgb(d3.hsl((i * 360 / count) % 360, 0.7, 0.5));
    palette.push([Math.round(c.r), Math.round(c.g), Math.round(c.b)]);
  }
  return palette;
};
