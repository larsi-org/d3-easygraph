// d3.easygraph.heatmap.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// The heatmap chart-family module: a grid of colored cells over plain continuous
// x/y axes (no band scale), colored via its own graph.c.$scale.

d3.easygraph.modules.push({
  test: function(graph) { return graph.show_heatmap; },
  factory: function(graph) {
    function render(data) {
      var heatmap_cols   = data[0].length,
          heatmap_rows   = data.length,
          heatmap_cell_w = graph.width  / heatmap_cols,
          heatmap_cell_h = graph.height / heatmap_rows;

      var dataMin = d3.min(data, function(a) { return d3.min(a); }),
          dataMax = d3.max(data, function(a) { return d3.max(a); }),
          dataDlt = dataMax - dataMin,
          n       = graph.PALETTE_COLORS.length;

      graph.c.$scale.domain(d3.range(n).map(function(i) { return dataMin + i * dataDlt / (n - 1); }));

      var heatmap_row = graph.$group.selectAll(".heatmap_row").data(data);
      var heatmap_row_enter = heatmap_row.enter().append("g").attr("class", "heatmap_row");
      heatmap_row.exit().remove();
      heatmap_row = heatmap_row_enter.merge(heatmap_row);
      heatmap_row.attr("transform", function(d, i) {
        return "translate(0," + ((heatmap_rows - 1 - i) * heatmap_cell_h) + ")";
      });

      var heatmap_cells = heatmap_row.selectAll(".heatmap_cells").data(function(d) { return d; });
      var heatmap_cells_enter = heatmap_cells.enter().append("rect").attr("class", "heatmap_cells");
      heatmap_cells.exit().remove();
      heatmap_cells = heatmap_cells_enter.merge(heatmap_cells);
      heatmap_cells
        .attr('x', function(d, i) { return i * heatmap_cell_w; })
        .attr('y', 0)
        .attr('width',  heatmap_cell_w)
        .attr('height', heatmap_cell_h)
        .style('fill',  function(d)    { return graph.c.$scale(d); });
    }

    return {
      init: function() {
        graph.c.$scale = d3.scaleLinear().range(graph.PALETTE_COLORS);
      },

      // both real heatmap pages always pass explicit x_range/y_range; this
      // fallback only guards against a future caller that doesn't
      domain: function(data, x_range, y_range) {
        return { x: x_range || [0, 1], y: y_range || [0, 1] };
      },

      render: render
    };
  }
});
