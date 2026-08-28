// d3.easygraph.heatmap.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// The heatmap chart-family constructor: a grid of colored cells over plain
// continuous x/y axes (no band scale), colored via its own graph.color.$scale.

d3.easygraph.heatmap = function(config) {
  // Both the config and its color sub-object are cloned rather than resolved in place -- the
  // caller's own object is never written to (core.js's _build() clones again for the same
  // reason; see its comment for what went wrong when it didn't).
  config = Object.assign({}, config);
  config.color = d3.easygraph._resolveProperty(Object.assign({}, config.color));

  // Overrides _build()'s shared Qualitative.Tableau10 default -- a set of unrelated categorical
  // hues makes no sense spread across a heatmap's continuous scaleLinear gradient the way it
  // does as line/bars/scatter's per-series colors. A caller's own colorPalette in config still
  // wins (config is folded onto graph before familyDefaults is even consulted).
  return d3.easygraph._build(config, {
    _chartType:   'heatmap',
    colorPalette: 'Diverging.RdBu.reversed'
  }, function(graph) {
    function render(data) {
      // Empty data (a page whose first fetch hasn't resolved yet) used to reach data[0].length
      // and throw; there's simply nothing to draw, so clear any previous grid and stop.
      if (!data.length || !data[0].length) {
        graph.$group.selectAll(".heatmap-row").remove();
        return;
      }

      var heatmapCols  = data[0].length,
          heatmapRows  = data.length,
          heatmapCellW = graph.width  / heatmapCols,
          heatmapCellH = graph.height / heatmapRows;

      var extent  = d3.easygraph._clippedExtent(d3.merge(data), graph.color.clip),
          dataMin = extent[0],
          dataMax = extent[1],
          dataDlt = dataMax - dataMin,
          n       = graph.paletteColors.length;

      graph.color.$scale.domain(d3.range(n).map(function(i) { return dataMin + i * dataDlt / (n - 1); }));

      var heatmapRow = graph.$group.selectAll(".heatmap-row").data(data);
      var heatmapRowEnter = heatmapRow.enter().append("g").attr("class", "heatmap-row");
      heatmapRow.exit().remove();
      heatmapRow = heatmapRowEnter.merge(heatmapRow);
      heatmapRow.attr("transform", function(d, i) {
        return "translate(0," + ((heatmapRows - 1 - i) * heatmapCellH) + ")";
      });

      var heatmapCells = heatmapRow.selectAll(".heatmap-cells").data(function(d) { return d; });
      // fill set immediately at enter -- a freshly entered cell should show its real color
      // right away, not fade in from nothing; the transition below only matters for a cell
      // that already existed and is changing color on a data update.
      var heatmapCellsEnter = heatmapCells.enter().append("rect").attr("class", "heatmap-cells")
        .style('fill', function(d) { return graph.color.$scale(d); });
      heatmapCells.exit().remove();
      heatmapCells = heatmapCellsEnter.merge(heatmapCells);
      // x/y/width/height are pure layout (a function of the grid's row/col count, not of any
      // cell's own value), so they're set immediately, never animated -- only fill (the
      // actual value-driven attribute) transitions, same "structural now, animate the
      // value" split bars.js's colorPerData transition already uses.
      heatmapCells
        .attr('x', function(d, i) { return i * heatmapCellW; })
        .attr('y', 0)
        .attr('width',  heatmapCellW)
        .attr('height', heatmapCellH);
      heatmapCells.transition().duration(graph.duration).ease(d3.easeCubicInOut)
        .style('fill', function(d) { return graph.color.$scale(d); });
    }

    return {
      init: function() {
        // clamp(true): a color clip narrows the domain but the palette still has to cover
        // every cell, including the ones outside it -- clamp so those draw as the nearest
        // end color instead of extrapolating past the palette into an unintended hue
        graph.color.$scale = d3.scaleLinear().range(graph.paletteColors).clamp(true);
      },

      // With no explicit range, the axes span the grid's own dimensions -- a 6x4 grid gets
      // x: [0, 6], y: [0, 4], so the tick values line up with cell boundaries. The previous
      // [0, 1] fallback drew a 0-1 axis underneath a grid of any size, which was meaningless
      // for every caller that didn't pass ranges of its own.
      domain: function(data, xRange, yRange) {
        var cols = (data.length && data[0].length) ? data[0].length : 1;
        var rows = data.length || 1;
        return { x: xRange || [0, cols], y: yRange || [0, rows] };
      },

      render: render
    };
  });
};
