// d3.easygraph.scatter.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
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

d3.easygraph.scatter = function(config) {
  config.color = config.color || {};
  d3.easygraph._resolveProperty(config.color);

  return d3.easygraph._build(config, {
    radius: 4, voronoi: false, voronoiOpacity: 0.6,
    arrows: false, arrowColor: '#000', arrowMinLength: 6, arrowMaxLength: 24,
    arrowHeadLength: 6, arrowHeadAngle: Math.PI / 7
  }, function(graph) {
    function arrowPath(lengthScale) {
      return function(d) {
        var cx = graph.x.$scale(d.x), cy = graph.y.$scale(d.y);
        var len  = lengthScale(d.magnitude);
        var tipX = cx + len * Math.cos(d.angle), tipY = cy + len * Math.sin(d.angle);
        // barbs splay backward from the tip, straddling the reverse direction by
        // +-arrowHeadAngle -- the classic two-stroke chevron arrowhead
        var back = d.angle + Math.PI;
        var b1X = tipX + graph.arrowHeadLength * Math.cos(back - graph.arrowHeadAngle);
        var b1Y = tipY + graph.arrowHeadLength * Math.sin(back - graph.arrowHeadAngle);
        var b2X = tipX + graph.arrowHeadLength * Math.cos(back + graph.arrowHeadAngle);
        var b2Y = tipY + graph.arrowHeadLength * Math.sin(back + graph.arrowHeadAngle);
        return "M" + cx + "," + cy + "L" + tipX + "," + tipY +
               "M" + b1X + "," + b1Y + "L" + tipX + "," + tipY + "L" + b2X + "," + b2Y;
      };
    }

    function render(data) {
      var extent  = d3.easygraph._clippedExtent(data.map(function(d) { return d.value; }), graph.color.clip),
          dataMin = extent[0],
          dataMax = extent[1],
          dataDlt = dataMax - dataMin,
          n       = graph.PALETTE_COLORS.length;

      graph.color.$scale.domain(d3.range(n).map(function(i) { return dataMin + i * dataDlt / (n - 1); }));

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

      var points = graph.$pointsGroup.selectAll(".scatter-point").data(data);
      var pointsEnter = points.enter().append("circle").attr("class", "scatter-point");
      points.exit().remove();
      points = pointsEnter.merge(points);
      points
        .attr("cx", function(d) { return graph.x.$scale(d.x); })
        .attr("cy", function(d) { return graph.y.$scale(d.y); })
        .attr("r",  graph.radius)
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
        .range([graph.arrowMinLength, graph.arrowMaxLength])
        .clamp(true);

      var arrows = graph.$arrowsGroup.selectAll(".scatter-arrow").data(vectorData);
      var arrowsEnter = arrows.enter().append("path").attr("class", "scatter-arrow");
      arrows.exit().remove();
      arrows = arrowsEnter.merge(arrows);
      arrows
        .attr("d", arrowPath(lengthScale))
        .style("stroke", graph.arrowColor);
    }

    return {
      init: function() {
        // clamp(true): a color clip narrows the domain but the palette still has to cover
        // every point, including the ones outside it -- clamp so those draw as the nearest
        // end color instead of extrapolating past the palette into an unintended hue
        graph.color.$scale = d3.scaleLinear().range(graph.PALETTE_COLORS).clamp(true);
        graph.$cellsGroup  = graph.$group.append("g").attr("class", "scatter-cells");
        graph.$pointsGroup = graph.$group.append("g").attr("class", "scatter-points");
        graph.$arrowsGroup = graph.$group.append("g").attr("class", "scatter-arrows");
      },

      // a caller plotting pre-projected pixel coordinates (e.g. a map overlay) always passes
      // explicit xRange/yRange; this fallback only guards against one that doesn't. Unlike
      // color, x/y are never clamped -- a clip here means "zoom the axis to this range", and
      // a point outside it should draw past the edge (or get clipped by the chart's own
      // clip-path), not get dragged back onto it.
      domain: function(data, xRange, yRange) {
        return {
          x: xRange || d3.easygraph._clippedExtent(data.map(function(d) { return d.x; }), graph.x.clip),
          y: yRange || d3.easygraph._clippedExtent(data.map(function(d) { return d.y; }), graph.y.clip)
        };
      },

      render: render
    };
  });
};
