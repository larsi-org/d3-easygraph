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

d3.easygraph.scatter = function(config) {
  config.color = config.color || {};
  d3.easygraph._resolveProperty(config.color);

  return d3.easygraph._build(config, { radius: 4, voronoi: false, voronoiOpacity: 0.6 }, function(graph) {
    function render(data) {
      var dataMin = d3.min(data, function(d) { return d.value; }),
          dataMax = d3.max(data, function(d) { return d.value; }),
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
    }

    return {
      init: function() {
        graph.color.$scale = d3.scaleLinear().range(graph.PALETTE_COLORS);
        graph.$cellsGroup  = graph.$group.append("g").attr("class", "scatter-cells");
        graph.$pointsGroup = graph.$group.append("g").attr("class", "scatter-points");
      },

      // a caller plotting pre-projected pixel coordinates (e.g. a map overlay) always passes
      // explicit xRange/yRange; this fallback only guards against one that doesn't
      domain: function(data, xRange, yRange) {
        return {
          x: xRange || d3.extent(data, function(d) { return d.x; }),
          y: yRange || d3.extent(data, function(d) { return d.y; })
        };
      },

      render: render
    };
  });
};
