// d3.easygraph.scatter.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// The scatter chart-family constructor: colored circles at arbitrary x/y coordinates, colored
// via its own graph.color.$scale - same color-resolution shape as heatmap.js, just points
// instead of a grid. Deliberately knows nothing about geography/projections - a caller
// plotting e.g. stations on a map projects lat/lng to pixel x/y itself and passes already-
// projected coordinates in; scatter only ever sees plain numbers.
//
// voronoi: true adds a colored region behind each point (that point's own color, filling the
// area closer to it than to any other point) via d3.Delaunay/.voronoi() - already part of
// the full d3@7 bundle, no new dependency. Still pure computational geometry on the given x/y
// points, so this stays geography-agnostic too. Cells render semi-transparent (voronoi.opacity,
// default 0.6) so anything layered underneath (e.g. a base map) stays visible through the fill.
//
// arrows: true draws a directional glyph (shaft + two-line chevron head) on top of a point
// instead of/alongside its circle, for data where a second, vector-shaped quantity (e.g. wind:
// speed + direction) needs to overlay a scalar one (e.g. pressure, still driving `value`'s
// color) at the same position. Only points carrying both `bearing` (degrees) and `magnitude`
// (raw units, mapped to pixel length via arrows.minLength/maxLength) get a glyph - a point
// missing either just renders its circle with no arrow, same as any other optional field
// elsewhere in this library. `bearing` is a compass bearing, like compassPoint16() takes: 0 =
// north (up on screen), 90 = east, clockwise; the arrow points toward it. arrows.headAngle is
// degrees too.
//
// labels: true draws each point's `label` (a string) offset above-right of its circle - same
// optional-field pattern as arrows: a point missing `label` just renders without one. Meant for
// a caller with too many points to label all of them usefully at once (e.g. a full US-wide
// map) - labels.minZoom (default 1, i.e. always on) hides every label below that zoom factor
// entirely, rather than rendering an unreadable wall of overlapping text at the zoomed-out
// default view; a caller passes a higher labels.minZoom and only calls graph.rescale(k) as the
// user actually zooms in for labels to appear past that point.
//
// graph.rescale(k): for a caller layering an external SVG-transform zoom on top (e.g. a
// zoomable map background) - shrinks every on-screen size (point radius and stroke-width,
// arrow length/head/stroke-width, label font size and offset) by 1/k so they stay constant
// instead of growing with the zoom transform, and re-evaluates labels.minZoom against the new k.
// Stroke-width matters as much as radius/length here: left unscaled (e.g. a plain CSS rule), a
// high enough k inflates it past the already-shrunk radius/length, and a point or arrow
// collapses into a solid blob - exactly the same failure mode fixed sizes would have. Re-renders
// graph._lastData (already tracked by core.js's update() for the resize-reflow case) rather than
// needing the caller to keep its own copy of the current data just to pass back in.
//
// A point's own `radius` overrides the graph-level `radius` config for just that point (a
// bubble chart: point size driven by a third data dimension, independent of `value`'s color) -
// same optional-field pattern as `angle`/`magnitude`/`label` above, a point missing it just uses
// the graph's own radius. Still divided by 1/k in graph.rescale()'s zoom-compensation the same
// way the graph-level radius always was; radius transitioning smoothly on a data update is
// covered by the same rescale-synchronicity constraint as the plain graph-level radius, so it
// stays instant, not animated (see the render() comment above the points block).
//
// color.quantize: true swaps the usual continuous color gradient for paletteColors.length
// discrete, equal-width bands over the domain - for data where a handful of clearly separated
// ranges reads better than a smooth interpolation (e.g. aircraft altitude: low/climbing bands
// vs. a cruise band, rather than every altitude getting its own subtly different shade). Pair
// with color.classes to pick how many colors come out of a colorbrewer palette (which
// otherwise always resolves to its largest available class count) - e.g. color: { palette:
// "Sequential.Blues", classes: 4, quantize: true } for four bands from light to dark.

d3.easygraph.scatter = function(config) {
  // Both the config and its color sub-object are cloned rather than resolved in place - the
  // caller's own object is never written to (core.js's _build() clones again for the same
  // reason; see its comment for what went wrong when it didn't).
  config = Object.assign({}, config);
  config.color = d3.easygraph._resolveProperty(Object.assign({}, config.color));

  return d3.easygraph._build(config, {
    _chartType: 'scatter',
    _dataShape: 'points',
    points: true, voronoi: false,
    arrows: false,
    labels: false
  }, function(graph) {
    // arrows / labels are false, true, or an options object; the object's keys fall back to
    // these. Resolved on every render so assigning graph.arrows / graph.labels live still works.
    var ARROW_DEFAULTS = { color: '#000', strokeWidth: 1.5, minLength: 6, maxLength: 24,
                           headLength: 6, headAngle: 180 / 7 };
    var POINT_DEFAULTS = { radius: 4, strokeWidth: 0.5 };
    var LABEL_DEFAULTS = { size: 10, offset: 8, minZoom: 1 };
    // `name` is the config key (points, arrows, labels): these are assignable live, so a typo in
    // one is checked here on every render, not only at construction.
    function withDefaults(name, value, defaults) {
      d3.easygraph._checkOption('d3.easygraph.scatter', name, value, { kind: 'flag' }, Object.keys(defaults));
      return Object.assign({}, defaults, (value && typeof value === 'object') ? value : null);
    }

    function arrowPath(lengthScale, headLength, headAngle) {
      return function(d) {
        var cx = graph.x.$scale(d.x), cy = graph.y.$scale(d.y);
        var len  = lengthScale(d.magnitude);
        // compass bearing (0 = north, clockwise) to the screen angle SVG's y-down axis wants
        var angle = (d.bearing - 90) * Math.PI / 180;
        var tipX = cx + len * Math.cos(angle), tipY = cy + len * Math.sin(angle);
        // barbs splay backward from the tip, straddling the reverse direction by
        // +-headAngle - the classic two-stroke chevron arrowhead
        var back = angle + Math.PI;
        var b1X = tipX + headLength * Math.cos(back - headAngle);
        var b1Y = tipY + headLength * Math.sin(back - headAngle);
        var b2X = tipX + headLength * Math.cos(back + headAngle);
        var b2Y = tipY + headLength * Math.sin(back + headAngle);
        return "M" + cx + "," + cy + "L" + tipX + "," + tipY +
               "M" + b1X + "," + b1Y + "L" + tipX + "," + tipY + "L" + b2X + "," + b2Y;
      };
    }

    function render(data) {
      // Set by rescale() (default 1, i.e. no adjustment) - divides every on-screen size
      // (point radius, arrow length/head) so they stay constant when this render is reached
      // through a caller's own zoom-transform scaling, rather than growing with it.
      var k = (graph._zoomScale || 1) * (graph._viewScale || 1);
      var P = withDefaults('points', graph.points, POINT_DEFAULTS);
      d3.easygraph._checkOption('d3.easygraph.scatter', 'voronoi', graph.voronoi, { kind: 'flag' }, ['opacity']);

      // ranges.color (this render) beats color.domain (fixed at construction) beats the data's
      // own clipped extent - see _colorDomain in core.js, which both color-scale families share.
      var extent  = d3.easygraph._colorDomain(graph, data.map(function(d) { return d.value; })),
          dataMin = extent[0],
          dataMax = extent[1],
          dataDlt = dataMax - dataMin,
          n       = graph.paletteColors.length;

      // color.quantize: true (see init() below) uses a d3.scaleQuantize instead of the
      // usual continuous scaleLinear - its domain is just the two-element [min, max], not
      // n evenly-spaced stops, since it divides that range into paletteColors.length
      // equal-width bands on its own.
      if (graph.color.quantize) {
        graph.color.$scale.domain([dataMin, dataMax]);
      } else {
        graph.color.$scale.domain(d3.range(n).map(function(i) { return dataMin + i * dataDlt / (n - 1); }));
      }

      // Cells live in their own group, appended before the points' group in init() (not on
      // first render()), so z-order (cells behind points) stays correct regardless of
      // whether voronoi gets toggled on/off after points already exist.
      var cells = graph.$cellsGroup.selectAll(".easygraph-voronoi-cell").data((graph.voronoi && data.length) ? data : []);
      var cellsEnter = cells.enter().append("path").attr("class", "easygraph-voronoi-cell");
      cells.exit().remove();
      cells = cellsEnter.merge(cells);

      if (graph.voronoi && data.length) {
        var delaunay = d3.Delaunay.from(data,
          function(d) { return graph.x.$scale(d.x); },
          function(d) { return graph.y.$scale(d.y); }
        );
        var voronoiOpacity = (graph.voronoi.opacity != null) ? graph.voronoi.opacity : 0.6;
        var voronoi = delaunay.voronoi([0, 0, graph.plotWidth, graph.plotHeight]);

        cells
          .attr("d", function(d, i) { return voronoi.renderCell(i); })
          .style("fill", function(d) { return graph.color.$scale(d.value); })
          .style("fill-opacity", voronoiOpacity);
      }

      // cx/cy/fill transition on graph.duration (a point moving/recoloring on a real data
      // update, e.g. a live map redrawing the same station list, should animate smoothly);
      // r/stroke-width deliberately don't - rescale(k) re-renders on every zoom tick and
      // reads r/stroke-width back synchronously right after calling it, so those two must
      // always be instant. cx/cy/fill are unaffected by k, so they're safe to animate without
      // fighting rescale(). A freshly entered point gets cx/cy/fill set immediately (not
      // faded in) so it doesn't animate in from some arbitrary un-set DOM default.
      //
      // Keyed by `id` (falling back to index when a point has none) rather than joined
      // positionally: a caller whose point count
      // changes between updates because some entries are conditionally dropped (e.g. weather's
      // Pressure & Wind map filtering out stations with no reading that hour) would otherwise
      // have every point *after* a dropped one shift down an index, so the existing DOM circle
      // at that index - still mid-transition or about to start one - suddenly represents a
      // different station and visibly flies from the old station's position to the new one.
      // A caller that never sets `id` keeps plain index-based identity. `label` is display text only.
      var points = graph.$pointsGroup.selectAll(".easygraph-point")
        .data(data, function(d, i) { return d.id != null ? d.id : i; });
      var pointsEnter = points.enter().append("circle").attr("class", "easygraph-point")
        .attr("cx", function(d) { return graph.x.$scale(d.x); })
        .attr("cy", function(d) { return graph.y.$scale(d.y); })
        .style("fill", function(d) { return graph.color.$scale(d.value); });
      points.exit().remove();
      points = pointsEnter.merge(points);
      points
        .attr("r",  function(d) { return (d.radius != null ? d.radius : P.radius) / k; })
        .style("stroke-width", (P.strokeWidth / k) + "px");
      points.transition().duration(graph.duration).ease(d3.easeCubicInOut)
        .attr("cx", function(d) { return graph.x.$scale(d.x); })
        .attr("cy", function(d) { return graph.y.$scale(d.y); })
        .style("fill", function(d) { return graph.color.$scale(d.value); });

      // Arrows live in their own group, appended after the points' group in init() (not on
      // first render()), so they draw on top of the points regardless of whether arrows gets
      // toggled on/off after points already exist - same z-order-stability reasoning as
      // cells vs. points above, just the opposite end (arrows are the topmost layer, cells
      // the bottommost).
      var A = withDefaults('arrows', graph.arrows, ARROW_DEFAULTS);
      var L = withDefaults('labels', graph.labels, LABEL_DEFAULTS);
      var vectorData = (graph.arrows && data.length)
        ? data.filter(function(d) { return d.bearing != null && d.magnitude != null; })
        : [];
      var magnitudes = vectorData.map(function(d) { return d.magnitude; });
      var lengthScale = d3.scaleLinear()
        .domain(magnitudes.length ? d3.extent(magnitudes) : [0, 1])
        .range([A.minLength / k, A.maxLength / k])
        .clamp(true);

      var arrows = graph.$arrowsGroup.selectAll(".easygraph-arrow").data(vectorData);
      var arrowsEnter = arrows.enter().append("path").attr("class", "easygraph-arrow");
      arrows.exit().remove();
      arrows = arrowsEnter.merge(arrows);
      arrows
        .attr("d", arrowPath(lengthScale, A.headLength / k, A.headAngle * Math.PI / 180))
        .style("stroke", A.color)
        .style("stroke-width", (A.strokeWidth / k) + "px");

      // Labels live in their own group, appended after arrows in init() (not on first
      // render()), so they draw on top of everything else regardless of what else gets
      // toggled on/off after points already exist - same z-order-stability reasoning as
      // cells/points/arrows above.
      var labelData = (graph.labels && (graph._zoomScale || 1) >= L.minZoom && data.length)
        ? data.filter(function(d) { return d.label != null; })
        : [];
      var offset = L.offset / k;

      var labels = graph.$labelsGroup.selectAll(".easygraph-label").data(labelData);
      var labelsEnter = labels.enter().append("text").attr("class", "easygraph-label");
      labels.exit().remove();
      labels = labelsEnter.merge(labels);
      labels
        .attr("x", function(d) { return graph.x.$scale(d.x) + offset; })
        .attr("y", function(d) { return graph.y.$scale(d.y) - offset; })
        .style("font-size", (L.size / k) + "px")
        .text(function(d) { return d.label; });
    }

    // See this file's own header comment for what this is and why it re-renders
    // graph._lastData rather than taking data as a parameter.
    graph.rescale = function(k) {
      graph._zoomScale = k;
      if (graph._lastData) render(graph._lastData);
    };

    return {
      init: function() {
        // clamp(true): a color trim narrows the domain but the palette still has to cover
        // every point, including the ones outside it - clamp so those draw as the nearest
        // end color instead of extrapolating past the palette into an unintended hue.
        // color.quantize: true swaps this for a quantize scale - paletteColors.length
        // discrete, equal-width color bands over the domain (e.g. altitude in clearly
        // separated bands) instead of one continuous gradient between them. A quantize
        // scale has no clamp() of its own to call - values outside its domain still map
        // to the nearest end band by definition, same effect as clamp(true) above.
        graph.color.$scale = graph.color.quantize
          ? d3.scaleQuantize().range(graph.paletteColors)
          : d3.scaleLinear().range(graph.paletteColors).clamp(true);
        graph.$cellsGroup  = graph.$group.append("g").attr("class", "easygraph-voronoi-cells");
        graph.$pointsGroup = graph.$group.append("g").attr("class", "easygraph-points");
        graph.$arrowsGroup = graph.$group.append("g").attr("class", "easygraph-arrows");
        graph.$labelsGroup = graph.$group.append("g").attr("class", "easygraph-labels");
      },

      // a caller plotting pre-projected pixel coordinates (e.g. a map overlay) always passes
      // explicit xRange/yRange; this fallback only guards against one that doesn't. Unlike
      // color, x/y are never clamped - a trim here means "zoom the axis to this range", and
      // a point outside it should draw past the edge (or get clipped by the chart's own
      // clip-path), not get dragged back onto it.
      // Guards against empty data the same way bars.js already does - d3.extent on an empty
      // array returns [undefined, undefined], which would otherwise become the scale's domain.
      domain: function(data, xRange, yRange) {
        return {
          x: xRange || (data.length ? d3.easygraph._clippedExtent(data.map(function(d) { return d.x; }), graph.x.trim) : [0, 1]),
          y: yRange || (data.length ? d3.easygraph._clippedExtent(data.map(function(d) { return d.y; }), graph.y.trim) : [0, 1])
        };
      },

      legendItems: function() { return d3.easygraph._colorScaleLegendItems(graph); },

      render: render
    };
  });
};
