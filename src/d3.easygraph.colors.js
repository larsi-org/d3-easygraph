// d3.easygraph.colors.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// A small, easygraph-agnostic palette lookup: colorPalettes/resolvePalette/colorScale/
// hueWheelPalette have no chart concepts of their own — no graph, no container, no SVG — so
// they're reusable well beyond charting (e.g. coloring a Leaflet marker, a parcoords line, or a
// canvas point cloud). Same shape as d3.easygraph.units.js's standalone preset table, just not
// quite as dependency-free: units.js needs nothing but its own data, while this file expects `d3`
// (scaleLinear/scaleQuantize/range/hsl/rgb, and — as of 2026-08 — its bundled d3-scale-chromatic
// schemes), same as core.js does.
// Chart config resolution (folding colorPalette/colorClasses onto graph.PALETTE_COLORS) lives in
// core.js, the only actual chart consumer that needs it — same division of labor as units.js's
// getUnit() vs. core.js's _resolveProperty().

// Every palette name is now "Kind.Name" -- Sequential (a plain value gradient), Diverging (a
// gradient with a meaningful midpoint), or Qualitative (unordered, mutually distinct categories)
// -- the same three groups colorbrewer.schemeGroups itself uses. This replaced an earlier scheme
// keyed by *source* (a bare colorbrewer name, "D3_"-prefixed for d3's own categorical schemes,
// "LS_"-prefixed for the hand-picked extras below): nobody choosing a palette actually cares
// whether the data came from colorbrewer, d3-scale-chromatic, or was hand-picked -- what matters
// is what kind of quantity it's meant to represent, which the new prefix says directly.
//
// The three arrays below are colorbrewer's own three groups (SEQUENTIAL folds in its
// single-hue/multi-hue split, which doesn't affect lookup) plus D3's own (non-ColorBrewer)
// categorical schemes appended to QUALITATIVE, since they're the same kind and same "flat array,
// no per-class-count variant" lookup shape -- sourced directly from d3-scale-chromatic's
// d3.scheme* exports (already part of the full d3@7 bundle every caller already loads) rather
// than a second copy via the standalone `colorbrewer` package. Verified byte-identical against
// colorbrewer's own data for every name/class-count here except PuOr, which d3 stores in the
// opposite color order; left as d3's native order since nothing here resolves it by name today
// (the .reversed suffix below covers whichever direction a future caller wants).
var DIVERGING   = ["BrBG","PiYG","PRGn","PuOr","RdBu","RdGy","RdYlBu","RdYlGn","Spectral"];
var QUALITATIVE = ["Accent","Dark2","Paired","Pastel1","Pastel2","Set1","Set2","Set3","Tableau10","Observable10"];
var SEQUENTIAL  = ["BuGn","BuPu","GnBu","OrRd","PuBu","PuBuGn","PuRd","RdPu","YlGn","YlGnBu","YlOrBr","YlOrRd","Blues","Greens","Greys","Oranges","Purples","Reds","Turbo"];

// Some d3-scale-chromatic schemes (Turbo among them -- Viridis/Inferno/Magma/Plasma/Cividis/
// Warm/Cool/CubehelixDefault/Rainbow/Sinebow are the others, none added above since nothing here
// names them yet) ship only as a continuous d3.interpolateX(t) function, no discrete d3.schemeX
// array at all -- unlike colorbrewer's schemes, which come pre-split into classes 3..11. Sampled
// at DEFAULT_INTERPOLATE_SAMPLES evenly-spaced points across [0, 1] (or `classes`, taking over
// the same role it plays for a classed colorbrewer scheme: how many discrete stops to return) to
// fit the same flat-color-array shape every other palette here uses. 9 matches the largest class
// count colorbrewer's own sequential schemes stop at, so a caller that doesn't ask for a specific
// class count still gets a comparably-sized palette either way.
var DEFAULT_INTERPOLATE_SAMPLES = 9;

// Sequential/diverging schemes are d3 arrays indexed by class count (classes 3..11, with the
// leading indices unused, so the largest class's colors are the *last* element); qualitative
// schemes are a single flat array of color strings, no per-class-count variant, so the last
// element is a string rather than an array -- that shape difference, not a hardcoded list of
// which names are which, is what schemeColors actually branches on, so it handles any d3.scheme*
// export correctly without needing to know about it in advance. Colorbrewer's own smaller-class
// variants are verified literal prefixes of its largest set, so slicing a flat array reproduces
// them exactly. `classes` omitted (or not available) resolves to the largest/full set. Takes the
// bare d3 scheme name ("RdYlBu", not "Diverging.RdYlBu") -- resolvePalette strips the kind prefix
// before calling this. Falls back to sampling d3.interpolateX when d3.schemeX doesn't exist --
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
// {"Kind.Name": [colors]} map, plus a handful of hand-picked extras for cases nothing above
// covers: Category20/20b/20c (removed from d3-scale-chromatic itself as of D3 v5, no scheme*
// export to source from) and the Sequential/Diverging/Qualitative-classified LS originals (see
// CHANGELOG for how each was classified). Computed once at load time (not rebuilt per chart
// instance) since it depends only on the `d3` global, not on any particular graph's config.
d3.easygraph.colorPalettes = (function() {
  var palettes = {};
  DIVERGING.forEach(function(name) { palettes["Diverging." + name] = schemeColors(name); });
  palettes["Diverging.BuMaRd"]         = ["#00F","#F0F","#F00"];
  palettes["Diverging.BuCyGnYlRd"]     = ["#00F","#0FF","#0F0","#FF0","#F00"];
  QUALITATIVE.forEach(function(name) { palettes["Qualitative." + name] = schemeColors(name); });
  palettes["Qualitative.Category20"]   = ["#1f77b4","#aec7e8","#ff7f0e","#ffbb78","#2ca02c","#98df8a","#d62728","#ff9896","#9467bd","#c5b0d5","#8c564b","#c49c94","#e377c2","#f7b6d2","#7f7f7f","#c7c7c7","#bcbd22","#dbdb8d","#17becf","#9edae5"];
  palettes["Qualitative.Category20b"]  = ["#393b79","#5254a3","#6b6ecf","#9c9ede","#637939","#8ca252","#b5cf6b","#cedb9c","#8c6d31","#bd9e39","#e7ba52","#e7cb94","#843c39","#ad494a","#d6616b","#e7969c","#7b4173","#a55194","#ce6dbd","#de9ed6"];
  palettes["Qualitative.Category20c"]  = ["#3182bd","#6baed6","#9ecae1","#c6dbef","#e6550d","#fd8d3c","#fdae6b","#fdd0a2","#31a354","#74c476","#a1d99b","#c7e9c0","#756bb1","#9e9ac8","#bcbddc","#dadaeb","#636363","#969696","#bdbdbd","#d9d9d9"];
  palettes["Qualitative.SustainZones"] = ["#F66","#6F6","#66F","#EE6","#6FF","#F6F","#B22","#2B2","#22B","#AA2","#2BB","#B2B","#D44","#4D4","#44D","#CC4","#4DD","#D4D","#900","#090","#009","#880","#099","#909"];
  palettes["Qualitative.RdGnBu"]       = ["#F00","#0F0","#00F"];
  palettes["Qualitative.SunArc"]       = ["#FF8C42","#FFD23F","#C1121F"];
  SEQUENTIAL.forEach(function(name) { palettes["Sequential." + name] = schemeColors(name); });
  palettes["Sequential.Gy"]            = ["#000","#FFF"];
  return palettes;
})();

// Resolves a colorPalette name (optionally suffixed ".reversed") + optional colorClasses (a
// specific colorbrewer class count instead of the largest, ignored for the hardcoded extras
// above, which aren't classed data) to a plain color array. This is what _build() uses
// internally for graph.PALETTE_COLORS, exposed standalone so a caller that isn't building a
// whole chart (a Leaflet marker layer, a parcoords line color) can still resolve a named
// palette without one.
//
// colorPalettes already has every name's *largest* size precomputed, so the common case (no
// colorClasses) reads straight from that cache -- schemeColors only gets called when a specific,
// possibly-non-largest class count is actually requested, the one thing the cache can't answer.
d3.easygraph.resolvePalette = function(paletteName, colorClasses) {
  var REVERSE_SUFFIX = ".reversed";
  var reversed = paletteName.endsWith(REVERSE_SUFFIX);
  var name = reversed ? paletteName.slice(0, -REVERSE_SUFFIX.length) : paletteName;
  var baseName = name.slice(name.indexOf(".") + 1); // "Diverging.RdYlBu" -> "RdYlBu", for schemeColors
  var colors = colorClasses ? schemeColors(baseName, colorClasses) : null;
  if (!colors) colors = d3.easygraph.colorPalettes[name].slice(0);
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
// ordered data -- see larsi.org's Lorenz Attractor page, which samples
// colorScale('Sequential.YlGnBu', ...) instead of this for exactly that reason). Generated rather
// than looked up by name, since the count needed is caller-specific and unbounded (a polygon's
// side count, an IFS's transform count) rather than one of a fixed set of named schemes. Returns
// [r, g, b] number triples, unlike the CSS-string colors everywhere else in this file: its
// consumers (lib/larsi.org/point-cloud-renderer-{2,3}d.js on larsi.org) write per-point colors
// directly into a Canvas ImageData byte buffer and need the numbers as-is, not a string to
// re-parse. Built via d3.hsl()/d3.rgb() since this file already depends on d3.
d3.easygraph.hueWheelPalette = function(count) {
  var palette = [];
  for (var i = 0; i < count; i++) {
    var c = d3.rgb(d3.hsl((i * 360 / count) % 360, 0.7, 0.5));
    palette.push([Math.round(c.r), Math.round(c.g), Math.round(c.b)]);
  }
  return palette;
};
