// d3.easygraph.bars.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// The bars chart-family module: vertical/horizontal, stacked/grouped. Orientation
// (v vs h) is fixed for a graph's lifetime, but stacked-vs-grouped can be toggled
// live (see data_monthly.php/h.php's dropdown) — domain()/render() always re-read
// the live flags rather than caching a choice made at construction.

// stacks layered series, accumulating y0 offsets bottom-up
function _computeStacked(data) {
  var result = data.map(function(series) {
    return series.map(function(d) { return Object.assign({ y0: 0 }, d); });
  });
  var len = result[0] ? result[0].length : 0;
  for (var j = 0; j < len; j++) {
    for (var i = 1; i < result.length; i++) {
      result[i][j].y0 = result[i-1][j].y0 + result[i-1][j].y;
    }
  }
  return result;
}

d3.easygraph.modules.push({
  test: function(graph) { return graph.show_bars_v || graph.show_bars_h; },
  factory: function(graph) {
    // enter/exit/merge bar group <g> elements
    function _bindGroups(data) {
      var sel = graph.$group.selectAll("g.bar-groups").data(data);
      var enter = sel.enter().append("g").attr("class", "bar-groups");
      sel.exit().remove();
      return enter.merge(sel);
    }

    // optional per-datum color transition
    function _colorTransition(sel) {
      if (graph.color_per_data) {
        sel.transition('color').duration(graph.animation_stage1).ease(d3.easeCubicInOut)
          .style("fill", function(d) { return d.c; });
      }
    }

    function bars_stacked_v(data) {
      var groups = _bindGroups(data);
      groups
        .attr("transform", null)
        .style("fill", function(d, i) { return graph.getPaletteColor(i); });

      var data_bars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = data_bars.enter().append("rect")
        .attr("class", "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  graph.x.$scale.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(0); })
        .attr("height", 0);
      data_bars.exit().remove();
      data_bars = entered.merge(data_bars);

      _colorTransition(data_bars);
      data_bars.transition('size').duration(graph.animation_stage1).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  graph.x.$scale.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(d.y0 + d.y); })
        .attr("height", function(d) { return graph.height - graph.y.$scale(d.y); });
    }

    function bars_grouped_v(data) {
      var x1 = d3.scaleBand()
        .domain(d3.range(data.length))
        .rangeRound([0, graph.x.$scale.bandwidth()])
        .padding((data.length > 1) ? .2 : 0);

      var groups = _bindGroups(data);
      groups
        .attr("transform", function(d, i) { return "translate(" + x1(i) + ",0)"; })
        .style("fill",     function(d, i) { return graph.getPaletteColor(i); });

      var data_bars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = data_bars.enter().append("rect")
        .attr("class", "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  x1.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(0); })
        .attr("height", 0);
      data_bars.exit().remove();
      data_bars = entered.merge(data_bars);

      _colorTransition(data_bars);
      data_bars.transition('size').duration(graph.animation_stage1).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  x1.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(d.y); })
        .attr("height", function(d) { return graph.height - graph.y.$scale(d.y); });
    }

    function bars_stacked_h(data) {
      var groups = _bindGroups(data);
      groups
        .attr("transform", null)
        .style("fill", function(d, i) { return graph.getPaletteColor(i); });

      var data_bars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = data_bars.enter().append("rect")
        .attr("class",  "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(0); })
        .attr("width",  0)
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", graph.y.$scale.bandwidth());
      data_bars.exit().remove();
      data_bars = entered.merge(data_bars);

      _colorTransition(data_bars);
      data_bars.transition('size').duration(graph.animation_stage1).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(d.y0); })
        .attr("width",  function(d) { return graph.x.$scale(d.y); })
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", graph.y.$scale.bandwidth());
    }

    function bars_grouped_h(data) {
      var y1 = d3.scaleBand()
        .domain(d3.range(data.length))
        .rangeRound([0, graph.y.$scale.bandwidth()])
        .padding((data.length > 1) ? .2 : 0);

      var groups = _bindGroups(data);
      groups
        .attr("transform", function(d, i) { return "translate(0," + y1(i) + ")"; })
        .style("fill",     function(d, i) { return graph.getPaletteColor(i); });

      var data_bars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = data_bars.enter().append("rect")
        .attr("class",  "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(0); })
        .attr("width",  0)
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", y1.bandwidth());
      data_bars.exit().remove();
      data_bars = entered.merge(data_bars);

      _colorTransition(data_bars);
      data_bars.transition('size').duration(graph.animation_stage1).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(0); })
        .attr("width",  function(d) { return graph.x.$scale(d.y); })
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", y1.bandwidth());
    }

    return {
      domain: function(data, x_range, y_range) {
        if (graph.show_bars_h) {
          var h = x_range; x_range = y_range; y_range = h;
        }
        var stacked = (graph.show_bars_stacked_v || graph.show_bars_stacked_h) ? _computeStacked(data) : undefined;

        var x_domain = [ 0, 1 ];
        if (x_range) {
          x_domain = x_range;
        } else if (graph.show_bars_v) {
          if (data.length > 0) x_domain = data[0].map(function(d) { return d.x; });
        } else if (graph.show_bars_stacked_h) {
          if (stacked.length > 0) x_domain = [ 0, d3.max(stacked[stacked.length - 1], function(d) { return d.y0 + d.y; }) ];
        } else if (graph.show_bars_grouped_h) {
          x_domain = [ 0, d3.max(data, function(a) { return d3.max(a, function(d) { return d.y; }); }) ];
        }

        var y_domain = [ 0, 1 ];
        if (y_range) {
          y_domain = y_range;
        } else if (graph.show_bars_h) {
          if (data.length > 0) y_domain = data[0].map(function(d) { return d.x; });
        } else if (graph.show_bars_stacked_v) {
          if (stacked.length > 0) y_domain = [ 0, d3.max(stacked[stacked.length - 1], function(d) { return d.y0 + d.y; }) ];
        } else if (graph.show_bars_grouped_v) {
          y_domain = [ 0, d3.max(data, function(a) { return d3.max(a, function(d) { return d.y; }); }) ];
        }

        return { x: x_domain, y: y_domain };
      },

      render: function(data) {
        var stacked = (graph.show_bars_stacked_v || graph.show_bars_stacked_h) ? _computeStacked(data) : undefined;
        if (graph.show_bars_stacked_v) bars_stacked_v(stacked);
        if (graph.show_bars_grouped_v) bars_grouped_v(data);
        if (graph.show_bars_stacked_h) bars_stacked_h(stacked);
        if (graph.show_bars_grouped_h) bars_grouped_h(data);
      }
    };
  }
});
