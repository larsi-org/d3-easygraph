// d3.easygraph.heatmap.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// The heatmap chart-family constructor: a grid of colored cells over plain
// continuous x/y axes (no band scale), colored via its own graph.color.$scale.

d3.easygraph.heatmap = function(config) {
  config.color = config.color || {};
  d3.easygraph._resolveProperty(config.color);

  return d3.easygraph._build(config, {}, function(graph) {
    function render(data) {
      var heatmapCols  = data[0].length,
          heatmapRows  = data.length,
          heatmapCellW = graph.width  / heatmapCols,
          heatmapCellH = graph.height / heatmapRows;

      var extent  = d3.easygraph._clippedExtent(d3.merge(data), graph.color.clip),
          dataMin = extent[0],
          dataMax = extent[1],
          dataDlt = dataMax - dataMin,
          n       = graph.PALETTE_COLORS.length;

      graph.color.$scale.domain(d3.range(n).map(function(i) { return dataMin + i * dataDlt / (n - 1); }));

      var heatmapRow = graph.$group.selectAll(".heatmap_row").data(data);
      var heatmapRowEnter = heatmapRow.enter().append("g").attr("class", "heatmap_row");
      heatmapRow.exit().remove();
      heatmapRow = heatmapRowEnter.merge(heatmapRow);
      heatmapRow.attr("transform", function(d, i) {
        return "translate(0," + ((heatmapRows - 1 - i) * heatmapCellH) + ")";
      });

      var heatmapCells = heatmapRow.selectAll(".heatmap_cells").data(function(d) { return d; });
      var heatmapCellsEnter = heatmapCells.enter().append("rect").attr("class", "heatmap_cells");
      heatmapCells.exit().remove();
      heatmapCells = heatmapCellsEnter.merge(heatmapCells);
      heatmapCells
        .attr('x', function(d, i) { return i * heatmapCellW; })
        .attr('y', 0)
        .attr('width',  heatmapCellW)
        .attr('height', heatmapCellH)
        .style('fill',  function(d)    { return graph.color.$scale(d); });
    }

    return {
      init: function() {
        // clamp(true): a color clip narrows the domain but the palette still has to cover
        // every cell, including the ones outside it -- clamp so those draw as the nearest
        // end color instead of extrapolating past the palette into an unintended hue
        graph.color.$scale = d3.scaleLinear().range(graph.PALETTE_COLORS).clamp(true);
      },

      // both real heatmap pages always pass explicit xRange/yRange; this
      // fallback only guards against a future caller that doesn't
      domain: function(data, xRange, yRange) {
        return { x: xRange || [0, 1], y: yRange || [0, 1] };
      },

      render: render
    };
  });
};
