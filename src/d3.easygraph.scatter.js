// d3.easygraph.scatter.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// The scatter chart-family constructor: colored circles at arbitrary x/y coordinates, colored
// via its own graph.color.$scale -- same color-resolution shape as heatmap.js, just points
// instead of a grid. Deliberately knows nothing about geography/projections -- a caller
// plotting e.g. stations on a map projects lat/lng to pixel x/y itself and passes already-
// projected coordinates in; scatter only ever sees plain numbers.
//
// voronoi: true adds a colored region behind each point (that point's own color, filling the
// area closer to it than to any other point) via d3.Delaunay/.voronoi() -- already part of
// the full d3@7 bundle, no new dependency. Still pure computational geometry on the given x/y
// points, so this stays geography-agnostic too. Cells render semi-transparent (voronoiOpacity,
// default 0.6) so anything layered underneath (e.g. a base map) stays visible through the fill.
//
// arrows: true draws a directional glyph (shaft + two-line chevron head) on top of a point
// instead of/alongside its circle, for data where a second, vector-shaped quantity (e.g. wind:
// speed + direction) needs to overlay a scalar one (e.g. pressure, still driving `value`'s
// color) at the same position. Only points carrying both `angle` (radians) and `magnitude`
// (raw units, mapped to pixel length via arrowMinLength/arrowMaxLength) get a glyph -- a point
// missing either just renders its circle with no arrow, same as any other optional field
// elsewhere in this library. `angle` is plain trigonometric convention (0 = +x/right,
// increasing counter-clockwise... but SVG y grows downward, so an unrotated glyph in *screen*
// terms points right and sweeps clockwise as angle increases) -- a caller with compass-bearing
// data (0 = north, clockwise) converts via `angle = (bearingDegrees - 90) * Math.PI / 180`.
//
// labels: true draws each point's `label` (a string) offset above-right of its circle -- same
// optional-field pattern as arrows: a point missing `label` just renders without one. Meant for
// a caller with too many points to label all of them usefully at once (e.g. a full US-wide
// map) -- labelMinZoom (default 1, i.e. always on) hides every label below that zoom factor
// entirely, rather than rendering an unreadable wall of overlapping text at the zoomed-out
// default view; a caller passes a higher labelMinZoom and only calls graph.rescale(k) as the
// user actually zooms in for labels to appear past that point.
//
// graph.rescale(k): for a caller layering an external SVG-transform zoom on top (e.g. a
// zoomable map background) -- shrinks every on-screen size (point radius and stroke-width,
// arrow length/head/stroke-width, label font size and offset) by 1/k so they stay constant
// instead of growing with the zoom transform, and re-evaluates labelMinZoom against the new k.
// Stroke-width matters as much as radius/length here: left unscaled (e.g. a plain CSS rule), a
// high enough k inflates it past the already-shrunk radius/length, and a point or arrow
// collapses into a solid blob -- exactly the same failure mode fixed sizes would have. Re-renders
// graph._lastData (already tracked by core.js's update() for the resize-reflow case) rather than
// needing the caller to keep its own copy of the current data just to pass back in.
//
// A point's own `radius` overrides the graph-level `radius` config for just that point (a
// bubble chart: point size driven by a third data dimension, independent of `value`'s color) --
// same optional-field pattern as `angle`/`magnitude`/`label` above, a point missing it just uses
// the graph's own radius. Still divided by 1/k in graph.rescale()'s zoom-compensation the same
// way the graph-level radius always was; radius transitioning smoothly on a data update is
// covered by the same rescale-synchronicity constraint as the plain graph-level radius, so it
// stays instant, not animated (see the render() comment above the points block).
//
// color.quantize: true swaps the usual continuous color gradient for paletteColors.length
// discrete, equal-width bands over the domain -- for data where a handful of clearly separated
// ranges reads better than a smooth interpolation (e.g. aircraft altitude: low/climbing bands
// vs. a cruise band, rather than every altitude getting its own subtly different shade). Pair
// with core.js's colorClasses to pick how many colors come out of a colorbrewer palette (which
// otherwise always resolves to its largest available class count) -- e.g. colorPalette: "Blues",
// colorClasses: 4 for four bands from light to dark.

d3.easygraph.scatter = function(config) {
  // Both the config and its color sub-object are cloned rather than resolved in place -- the
  // caller's own object is never written to (core.js's _build() clones again for the same
  // reason; see its comment for what went wrong when it didn't).
  config = Object.assign({}, config);
  config.color = d3.easygraph._resolveProperty(Object.assign({}, config.color));

  return d3.easygraph._build(config, {
    _chartType: 'scatter',
    radius: 4, pointStrokeWidth: 0.5, voronoi: false, voronoiOpacity: 0.6,
    arrows: false, arrowColor: '#000', arrowStrokeWidth: 1.5,
    arrowMinLength: 6, arrowMaxLength: 24, arrowHeadLength: 6, arrowHeadAngle: Math.PI / 7,
    labels: false, labelSize: 10, labelOffset: 8, labelMinZoom: 1
  }, function(graph) {
    function arrowPath(lengthScale, headLength) {
      return function(d) {
        var cx = graph.x.$scale(d.x), cy = graph.y.$scale(d.y);
        var len  = lengthScale(d.magnitude);
        var tipX = cx + len * Math.cos(d.angle), tipY = cy + len * Math.sin(d.angle);
        // barbs splay backward from the tip, straddling the reverse direction by
        // +-arrowHeadAngle -- the classic two-stroke chevron arrowhead
        var back = d.angle + Math.PI;
        var b1X = tipX + headLength * Math.cos(back - graph.arrowHeadAngle);
        var b1Y = tipY + headLength * Math.sin(back - graph.arrowHeadAngle);
        var b2X = tipX + headLength * Math.cos(back + graph.arrowHeadAngle);
        var b2Y = tipY + headLength * Math.sin(back + graph.arrowHeadAngle);
        return "M" + cx + "," + cy + "L" + tipX + "," + tipY +
               "M" + b1X + "," + b1Y + "L" + tipX + "," + tipY + "L" + b2X + "," + b2Y;
      };
    }

    function render(data) {
      // Set by rescale() (default 1, i.e. no adjustment) -- divides every on-screen size
      // (point radius, arrow length/head) so they stay constant when this render is reached
      // through a caller's own zoom-transform scaling, rather than growing with it.
      var k = graph._zoomScale || 1;

      // color.domain: true, [min, max] (e.g. altitude in feet) beats out this call's own
      // data -- clip is meaningless alongside it and ignored, since there's no data-driven
      // extent left to clip. Omit domain (the default) for the usual per-render extent/clip
      // behavior.
      var extent  = graph.color.domain || d3.easygraph._clippedExtent(data.map(function(d) { return d.value; }), graph.color.clip),
          dataMin = extent[0],
          dataMax = extent[1],
          dataDlt = dataMax - dataMin,
          n       = graph.paletteColors.length;

      // color.quantize: true (see init() below) uses a d3.scaleQuantize instead of the
      // usual continuous scaleLinear -- its domain is just the two-element [min, max], not
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
      var cells = graph.$cellsGroup.selectAll(".scatter-cell").data((graph.voronoi && data.length) ? data : []);
      var cellsEnter = cells.enter().append("path").attr("class", "scatter-cell");
      cells.exit().remove();
      cells = cellsEnter.merge(cells);

      if (graph.voronoi && data.length) {
        var delaunay = d3.Delaunay.from(data,
          function(d) { return graph.x.$scale(d.x); },
          function(d) { return graph.y.$scale(d.y); }
        );
        var voronoi = delaunay.voronoi([0, 0, graph.width, graph.height]);

        cells
          .attr("d", function(d, i) { return voronoi.renderCell(i); })
          .style("fill", function(d) { return graph.color.$scale(d.value); })
          .style("fill-opacity", graph.voronoiOpacity);
      }

      // cx/cy/fill transition on graph.duration (a point moving/recoloring on a real data
      // update, e.g. a live map redrawing the same station list, should animate smoothly);
      // r/stroke-width deliberately don't -- rescale(k) re-renders on every zoom tick and
      // reads r/stroke-width back synchronously right after calling it, so those two must
      // always be instant. cx/cy/fill are unaffected by k, so they're safe to animate without
      // fighting rescale(). A freshly entered point gets cx/cy/fill set immediately (not
      // faded in) so it doesn't animate in from some arbitrary un-set DOM default.
      var points = graph.$pointsGroup.selectAll(".scatter-point").data(data);
      var pointsEnter = points.enter().append("circle").attr("class", "scatter-point")
        .attr("cx", function(d) { return graph.x.$scale(d.x); })
        .attr("cy", function(d) { return graph.y.$scale(d.y); })
        .style("fill", function(d) { return graph.color.$scale(d.value); });
      points.exit().remove();
      points = pointsEnter.merge(points);
      points
        .attr("r",  function(d) { return (d.radius != null ? d.radius : graph.radius) / k; })
        .style("stroke-width", (graph.pointStrokeWidth / k) + "px");
      points.transition().duration(graph.duration).ease(d3.easeCubicInOut)
        .attr("cx", function(d) { return graph.x.$scale(d.x); })
        .attr("cy", function(d) { return graph.y.$scale(d.y); })
        .style("fill", function(d) { return graph.color.$scale(d.value); });

      // Arrows live in their own group, appended after the points' group in init() (not on
      // first render()), so they draw on top of the points regardless of whether arrows gets
      // toggled on/off after points already exist -- same z-order-stability reasoning as
      // cells vs. points above, just the opposite end (arrows are the topmost layer, cells
      // the bottommost).
      var vectorData = (graph.arrows && data.length)
        ? data.filter(function(d) { return d.angle != null && d.magnitude != null; })
        : [];
      var magnitudes = vectorData.map(function(d) { return d.magnitude; });
      var lengthScale = d3.scaleLinear()
        .domain(magnitudes.length ? d3.extent(magnitudes) : [0, 1])
        .range([graph.arrowMinLength / k, graph.arrowMaxLength / k])
        .clamp(true);

      var arrows = graph.$arrowsGroup.selectAll(".scatter-arrow").data(vectorData);
      var arrowsEnter = arrows.enter().append("path").attr("class", "scatter-arrow");
      arrows.exit().remove();
      arrows = arrowsEnter.merge(arrows);
      arrows
        .attr("d", arrowPath(lengthScale, graph.arrowHeadLength / k))
        .style("stroke", graph.arrowColor)
        .style("stroke-width", (graph.arrowStrokeWidth / k) + "px");

      // Labels live in their own group, appended after arrows in init() (not on first
      // render()), so they draw on top of everything else regardless of what else gets
      // toggled on/off after points already exist -- same z-order-stability reasoning as
      // cells/points/arrows above.
      var labelData = (graph.labels && k >= graph.labelMinZoom && data.length)
        ? data.filter(function(d) { return d.label != null; })
        : [];
      var offset = graph.labelOffset / k;

      var labels = graph.$labelsGroup.selectAll(".scatter-label").data(labelData);
      var labelsEnter = labels.enter().append("text").attr("class", "scatter-label");
      labels.exit().remove();
      labels = labelsEnter.merge(labels);
      labels
        .attr("x", function(d) { return graph.x.$scale(d.x) + offset; })
        .attr("y", function(d) { return graph.y.$scale(d.y) - offset; })
        .style("font-size", (graph.labelSize / k) + "px")
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
        // clamp(true): a color clip narrows the domain but the palette still has to cover
        // every point, including the ones outside it -- clamp so those draw as the nearest
        // end color instead of extrapolating past the palette into an unintended hue.
        // color.quantize: true swaps this for a quantize scale -- paletteColors.length
        // discrete, equal-width color bands over the domain (e.g. altitude in clearly
        // separated bands) instead of one continuous gradient between them. A quantize
        // scale has no clamp() of its own to call -- values outside its domain still map
        // to the nearest end band by definition, same effect as clamp(true) above.
        graph.color.$scale = graph.color.quantize
          ? d3.scaleQuantize().range(graph.paletteColors)
          : d3.scaleLinear().range(graph.paletteColors).clamp(true);
        graph.$cellsGroup  = graph.$group.append("g").attr("class", "scatter-cells");
        graph.$pointsGroup = graph.$group.append("g").attr("class", "scatter-points");
        graph.$arrowsGroup = graph.$group.append("g").attr("class", "scatter-arrows");
        graph.$labelsGroup = graph.$group.append("g").attr("class", "scatter-labels");
      },

      // a caller plotting pre-projected pixel coordinates (e.g. a map overlay) always passes
      // explicit xRange/yRange; this fallback only guards against one that doesn't. Unlike
      // color, x/y are never clamped -- a clip here means "zoom the axis to this range", and
      // a point outside it should draw past the edge (or get clipped by the chart's own
      // clip-path), not get dragged back onto it.
      // Guards against empty data the same way bars.js already does -- d3.extent on an empty
      // array returns [undefined, undefined], which would otherwise become the scale's domain.
      domain: function(data, xRange, yRange) {
        return {
          x: xRange || (data.length ? d3.easygraph._clippedExtent(data.map(function(d) { return d.x; }), graph.x.clip) : [0, 1]),
          y: yRange || (data.length ? d3.easygraph._clippedExtent(data.map(function(d) { return d.y; }), graph.y.clip) : [0, 1])
        };
      },

      render: render
    };
  });
};
