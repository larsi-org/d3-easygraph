// d3.easygraph.bars.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// The bars chart-family constructor: vertical/horizontal, stacked/grouped.
// `orientation` is fixed for a graph's lifetime, but `mode` can be toggled live
// (see data_monthly.php/h.php's dropdown) — domain()/render() always re-read the
// live config rather than caching a choice made at construction.

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

d3.easygraph.bars = function(config) {
  return d3.easygraph._build(config, {
    orientation:   'v',
    mode:          'grouped',
    colorPerData:  false
  }, function(graph) {
    // enter/exit/merge bar group <g> elements
    function _bindGroups(data) {
      var sel = graph.$group.selectAll("g.bar-groups").data(data);
      var enter = sel.enter().append("g").attr("class", "bar-groups");
      sel.exit().remove();
      return enter.merge(sel);
    }

    // optional per-datum color transition
    function _colorTransition(sel) {
      if (graph.colorPerData) {
        sel.transition('color').duration(graph.duration).ease(d3.easeCubicInOut)
          .style("fill", function(d) { return d.c; });
      }
    }

    function barsStackedV(data) {
      var groups = _bindGroups(data);
      groups
        .attr("transform", null)
        .style("fill", function(d, i) { return graph.getPaletteColor(i); });

      var dataBars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class", "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  graph.x.$scale.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(0); })
        .attr("height", 0);
      dataBars.exit().remove();
      dataBars = entered.merge(dataBars);

      _colorTransition(dataBars);
      dataBars.transition('size').duration(graph.duration).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  graph.x.$scale.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(d.y0 + d.y); })
        .attr("height", function(d) { return graph.height - graph.y.$scale(d.y); });
    }

    function barsGroupedV(data) {
      var x1 = d3.scaleBand()
        .domain(d3.range(data.length))
        .rangeRound([0, graph.x.$scale.bandwidth()])
        .padding((data.length > 1) ? .2 : 0);

      var groups = _bindGroups(data);
      groups
        .attr("transform", function(d, i) { return "translate(" + x1(i) + ",0)"; })
        .style("fill",     function(d, i) { return graph.getPaletteColor(i); });

      var dataBars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class", "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  x1.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(0); })
        .attr("height", 0);
      dataBars.exit().remove();
      dataBars = entered.merge(dataBars);

      _colorTransition(dataBars);
      dataBars.transition('size').duration(graph.duration).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(d.x); })
        .attr("width",  x1.bandwidth())
        .attr("y",      function(d) { return graph.y.$scale(d.y); })
        .attr("height", function(d) { return graph.height - graph.y.$scale(d.y); });
    }

    function barsStackedH(data) {
      var groups = _bindGroups(data);
      groups
        .attr("transform", null)
        .style("fill", function(d, i) { return graph.getPaletteColor(i); });

      var dataBars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class",  "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(0); })
        .attr("width",  0)
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", graph.y.$scale.bandwidth());
      dataBars.exit().remove();
      dataBars = entered.merge(dataBars);

      _colorTransition(dataBars);
      dataBars.transition('size').duration(graph.duration).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(d.y0); })
        .attr("width",  function(d) { return graph.x.$scale(d.y); })
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", graph.y.$scale.bandwidth());
    }

    function barsGroupedH(data) {
      var y1 = d3.scaleBand()
        .domain(d3.range(data.length))
        .rangeRound([0, graph.y.$scale.bandwidth()])
        .padding((data.length > 1) ? .2 : 0);

      var groups = _bindGroups(data);
      groups
        .attr("transform", function(d, i) { return "translate(0," + y1(i) + ")"; })
        .style("fill",     function(d, i) { return graph.getPaletteColor(i); });

      var dataBars = groups.selectAll(".data-bars").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class",  "data-bars")
        .attr("x",      function(d) { return graph.x.$scale(0); })
        .attr("width",  0)
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", y1.bandwidth());
      dataBars.exit().remove();
      dataBars = entered.merge(dataBars);

      _colorTransition(dataBars);
      dataBars.transition('size').duration(graph.duration).ease(d3.easeCubicInOut)
        .attr("x",      function(d) { return graph.x.$scale(0); })
        .attr("width",  function(d) { return graph.x.$scale(d.y); })
        .attr("y",      function(d) { return graph.y.$scale(d.x); })
        .attr("height", y1.bandwidth());
    }

    return {
      prepareScales: function() {
        if (graph.orientation === 'v') {
          graph.x.$scale = d3.scaleBand().rangeRound([0, graph.width]).padding(.2);
          graph.y.$scale = (graph.y.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
          graph.y.$scale.range([graph.height, 0]);
        } else {
          graph.y.$scale = d3.scaleBand().rangeRound([0, graph.height]).padding(.2);
          graph.x.$scale = (graph.x.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
          graph.x.$scale.range([0, graph.width]);
        }
      },

      domain: function(data, xRange, yRange) {
        var isH = graph.orientation === 'h';
        var isStacked = graph.mode === 'stacked';

        if (isH) {
          var h = xRange; xRange = yRange; yRange = h;
        }
        var stacked = isStacked ? _computeStacked(data) : undefined;

        var xDomain = [ 0, 1 ];
        if (xRange) {
          xDomain = xRange;
        } else if (!isH) {
          if (data.length > 0) xDomain = data[0].map(function(d) { return d.x; });
        } else if (isStacked) {
          if (stacked.length > 0) xDomain = [ 0, d3.max(stacked[stacked.length - 1], function(d) { return d.y0 + d.y; }) ];
        } else {
          xDomain = [ 0, d3.max(data, function(a) { return d3.max(a, function(d) { return d.y; }); }) ];
        }

        var yDomain = [ 0, 1 ];
        if (yRange) {
          yDomain = yRange;
        } else if (isH) {
          if (data.length > 0) yDomain = data[0].map(function(d) { return d.x; });
        } else if (isStacked) {
          if (stacked.length > 0) yDomain = [ 0, d3.max(stacked[stacked.length - 1], function(d) { return d.y0 + d.y; }) ];
        } else {
          yDomain = [ 0, d3.max(data, function(a) { return d3.max(a, function(d) { return d.y; }); }) ];
        }

        return { x: xDomain, y: yDomain };
      },

      render: function(data) {
        var isStacked = graph.mode === 'stacked';
        var stacked = isStacked ? _computeStacked(data) : undefined;
        if (graph.orientation === 'v' && isStacked)  barsStackedV(stacked);
        if (graph.orientation === 'v' && !isStacked) barsGroupedV(data);
        if (graph.orientation === 'h' && isStacked)  barsStackedH(stacked);
        if (graph.orientation === 'h' && !isStacked) barsGroupedH(data);
      }
    };
  });
};
