// d3.easygraph.bars.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// The bars chart-family constructor: vertical/horizontal, stacked/grouped.
// `orientation` is fixed for a graph's lifetime, but `stacked` can be toggled live
// (see data_monthly.php/h.php's dropdown) - domain()/render() always re-read the
// live config rather than caching a choice made at construction. Stacking itself
// (accumulating y0 offsets) is d3.easygraph._computeStacked() in core.js, shared with
// line.js's stacked.

d3.easygraph.bars = function(config) {
  return d3.easygraph._build(config, {
    _chartType:   'bar',
    _dataShape:   'series',
    orientation:  'vertical',
    stacked:      false,
    colorPerData: false,
    series:       null // optional [{ label }, ...], one per series passed to update(): what legendItems()
                       // labels each entry with
  }, function(graph) {
    // enter/exit/merge bar group <g> elements
    function _bindGroups(data) {
      var sel = graph.$group.selectAll("g.easygraph-bar-group").data(data);
      var enter = sel.enter().append("g").attr("class", "easygraph-bar-group");
      sel.exit().remove();
      return enter.merge(sel);
    }

    // optional per-datum color transition - colorPerData: true colors each bar from its own
    // `color` field instead of the series' palette color (the field was a bare `d.c` before
    // 1.0, the one single-letter name in a data format that otherwise spells everything out:
    // value, radius, label, angle, magnitude)
    function _colorTransition(sel) {
      if (graph.colorPerData) {
        sel.transition('color').duration(graph.duration).ease(d3.easeCubicInOut)
          .style("fill", function(d) { return d.color; });
      }
    }

    function barsStackedV(data) {
      var groups = _bindGroups(data);
      groups
        .attr("transform", null)
        .style("fill", function(d, i) { return graph.paletteColor(i); });

      var dataBars = groups.selectAll(".easygraph-bar").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class", "easygraph-bar")
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
        .attr("height", function(d) { return graph.plotHeight - graph.y.$scale(d.y); });
    }

    function barsGroupedV(data) {
      var x1 = d3.scaleBand()
        .domain(d3.range(data.length))
        .rangeRound([0, graph.x.$scale.bandwidth()])
        .padding((data.length > 1) ? .2 : 0);

      var groups = _bindGroups(data);
      groups
        .attr("transform", function(d, i) { return "translate(" + x1(i) + ",0)"; })
        .style("fill",     function(d, i) { return graph.paletteColor(i); });

      var dataBars = groups.selectAll(".easygraph-bar").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class", "easygraph-bar")
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
        .attr("height", function(d) { return graph.plotHeight - graph.y.$scale(d.y); });
    }

    function barsStackedH(data) {
      var groups = _bindGroups(data);
      groups
        .attr("transform", null)
        .style("fill", function(d, i) { return graph.paletteColor(i); });

      var dataBars = groups.selectAll(".easygraph-bar").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class",  "easygraph-bar")
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
        .style("fill",     function(d, i) { return graph.paletteColor(i); });

      var dataBars = groups.selectAll(".easygraph-bar").data(function(d) { return d; }, function(d) { return d.x; });
      var entered = dataBars.enter().append("rect")
        .attr("class",  "easygraph-bar")
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
        // Both of these are checked rather than left to fall through: every test below is
        // written as "one value, else the other", so a typo used to silently produce the wrong
        // chart instead of an error.
        if (graph.orientation !== 'vertical' && graph.orientation !== 'horizontal') {
          throw new Error('d3.easygraph: orientation must be "vertical" or "horizontal", got ' +
                          JSON.stringify(graph.orientation));
        }
        if (graph.orientation === 'vertical') {
          graph.x.$scale = d3.scaleBand().rangeRound([0, graph.plotWidth]).padding(.2);
          graph.y.$scale = (graph.y.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
          graph.y.$scale.range([graph.plotHeight, 0]);
        } else {
          graph.y.$scale = d3.scaleBand().rangeRound([0, graph.plotHeight]).padding(.2);
          graph.x.$scale = (graph.x.scale === 'time') ? d3.scaleTime() : d3.scaleLinear();
          graph.x.$scale.range([0, graph.plotWidth]);
        }
      },

      domain: function(data, xRange, yRange) {
        var isH = graph.orientation === 'horizontal';
        var isStacked = graph.stacked;

        var stacked = isStacked ? d3.easygraph._computeStacked(data) : undefined;

        // d3.max over empty/all-empty data returns undefined, which would otherwise land in
        // the domain as [0, undefined] - same empty-data guard line/scatter's domain() have.
        function groupedMax() {
          var max = d3.max(data, function(a) { return d3.max(a, function(d) { return d.y; }); });
          return (max === undefined) ? 1 : max;
        }

        var xDomain = [ 0, 1 ];
        if (xRange) {
          xDomain = xRange;
        } else if (!isH) {
          if (data.length > 0) xDomain = data[0].map(function(d) { return d.x; });
        } else if (isStacked) {
          if (stacked.length > 0) xDomain = [ 0, d3.max(stacked[stacked.length - 1], function(d) { return d.y0 + d.y; }) ];
        } else {
          xDomain = [ 0, groupedMax() ];
        }

        var yDomain = [ 0, 1 ];
        if (yRange) {
          yDomain = yRange;
        } else if (isH) {
          if (data.length > 0) yDomain = data[0].map(function(d) { return d.x; });
        } else if (isStacked) {
          if (stacked.length > 0) yDomain = [ 0, d3.max(stacked[stacked.length - 1], function(d) { return d.y0 + d.y; }) ];
        } else {
          yDomain = [ 0, groupedMax() ];
        }

        return { x: xDomain, y: yDomain };
      },

      legendItems: function() { return d3.easygraph._seriesLegendItems(graph); },

      render: function(data) {
        var isStacked = graph.stacked;
        var stacked = isStacked ? d3.easygraph._computeStacked(data) : undefined;
        if (graph.orientation === 'vertical' && isStacked)  barsStackedV(stacked);
        if (graph.orientation === 'vertical' && !isStacked) barsGroupedV(data);
        if (graph.orientation === 'horizontal' && isStacked)  barsStackedH(stacked);
        if (graph.orientation === 'horizontal' && !isStacked) barsGroupedH(data);
      }
    };
  });
};
