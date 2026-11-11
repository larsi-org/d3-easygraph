// d3.easygraph.bar.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// The bar chart-family constructor: vertical/horizontal, stacked/grouped, values of either sign.
// `orientation` is fixed for a graph's lifetime, but `stacked` can be toggled live
// (see data_monthly.php/h.php's dropdown) - domain()/render() always re-read the
// live config rather than caching a choice made at construction. Stacking itself
// (accumulating each bar's base) is d3.easygraph._computeStacked() in core.js, shared with
// line.js's stacked area; bars ask for its signed form, where positive values pile up from zero
// and negative ones down from it.
//
// A bar is { category, value } (plus an optional `color`, which colors that bar instead of its series'
// palette color), whichever way the bars run: x and y name the screen axes, in the config and in
// update()'s domains, and a horizontal chart puts its values on x. Bar data used to be { x, y } too,
// which meant y was the value even on a horizontal chart whose value axis is x.

d3.easygraph.bar = function(config) {
  return d3.easygraph._build(config, {
    _chartType:   'bar',
    _dataShape:   'bars',
    orientation:  'vertical',
    stacked:      false,
    series:       null // optional [{ label }, ...], one per series passed to update(): what legendItems()
                       // labels each entry with
  }, function(graph) {
    function _horizontal() { return graph.orientation === 'horizontal'; }

    // The bars' value axis: y for vertical bars, x for horizontal ones.
    function _valueScale() { return _horizontal() ? graph.x.$scale : graph.y.$scale; }
    function _categoryScale() { return _horizontal() ? graph.y.$scale : graph.x.$scale; }

    // The two values a bar spans on the value axis: from its base (0 unless stacked) to base + value.
    // Order does not matter, a negative bar just runs the other way.
    function _spanStart(d) { return Math.min(_valueScale()(d.base || 0), _valueScale()((d.base || 0) + d.value)); }
    function _spanSize(d)  { return Math.abs(_valueScale()((d.base || 0) + d.value) - _valueScale()(d.base || 0)); }

    // enter/exit/merge bar group <g> elements
    function _bindGroups(data) {
      var sel = graph.$marks.selectAll("g.easygraph-bar-group").data(data);
      var enter = sel.enter().append("g").attr("class", "easygraph-bar-group");
      sel.exit().remove();
      return enter.merge(sel);
    }

    // a datum with its own `color` is drawn in it; one without keeps the series' color from its group
    function _colorTransition(sel) {
      sel.transition('color').duration(graph.duration).ease(d3.easeCubicInOut)
        .style("fill", function(d) { return d.color != null ? d.color : null; });
    }

    // One bar layout for all four modes. Stacked: every series' bar sits on the same band, on top of
    // the ones before it. Grouped: each series gets its own slot inside the band, all based at zero.
    function drawBars(data, stacked) {
      var horizontal = _horizontal(), band = _categoryScale();
      var slots = stacked ? null : d3.scaleBand()
        .domain(d3.range(data.length))
        .rangeRound([0, band.bandwidth()])
        .padding((data.length > 1) ? .2 : 0);
      var thickness = stacked ? band.bandwidth() : slots.bandwidth();

      var groups = _bindGroups(data);
      groups
        .attr("transform", stacked ? null : function(d, i) {
          return horizontal ? "translate(0," + slots(i) + ")" : "translate(" + slots(i) + ",0)";
        })
        .style("fill", function(d, i) { return graph.paletteColor(i); });

      var dataBars = groups.selectAll(".easygraph-bar").data(function(d) { return d; }, function(d) { return d.category; });
      var zero = _valueScale()(0);
      var entered = dataBars.enter().append("rect").attr("class", "easygraph-bar");
      if (horizontal) {
        entered.attr("x", zero).attr("width", 0).attr("y", function(d) { return band(d.category); }).attr("height", thickness);
      } else {
        entered.attr("x", function(d) { return band(d.category); }).attr("width", thickness).attr("y", zero).attr("height", 0);
      }
      dataBars.exit().remove();
      dataBars = entered.merge(dataBars);

      _colorTransition(dataBars);
      var t = dataBars.transition('size').duration(graph.duration).ease(d3.easeCubicInOut);
      if (horizontal) {
        t.attr("x", _spanStart).attr("width", _spanSize)
         .attr("y", function(d) { return band(d.category); }).attr("height", thickness);
      } else {
        t.attr("x", function(d) { return band(d.category); }).attr("width", thickness)
         .attr("y", _spanStart).attr("height", _spanSize);
      }
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
          graph.y.$scale = (graph.y.type === 'time') ? d3.scaleTime() : d3.scaleLinear();
          graph.y.$scale.range([graph.plotHeight, 0]);
        } else {
          graph.y.$scale = d3.scaleBand().rangeRound([0, graph.plotHeight]).padding(.2);
          graph.x.$scale = (graph.x.type === 'time') ? d3.scaleTime() : d3.scaleLinear();
          graph.x.$scale.range([0, graph.plotWidth]);
        }
      },

      domain: function(data, xRange, yRange) {
        var isH = graph.orientation === 'horizontal';

        // The value axis always includes zero and reaches every bar's far end, negative ones
        // included. d3.min/max skip null and return undefined for no data at all, which falls back
        // to [0, 1] - "no data yet" is a normal state.
        var valueDomain;
        if (graph.stacked) {
          var stacked = d3.easygraph._computeStacked(data, true);
          var lo = d3.min(stacked, function(a) { return d3.min(a, function(d) { return d.value == null ? undefined : Math.min(d.base, d.base + d.value); }); });
          var hi = d3.max(stacked, function(a) { return d3.max(a, function(d) { return d.value == null ? undefined : Math.max(d.base, d.base + d.value); }); });
          valueDomain = [Math.min(0, lo === undefined ? 0 : lo), Math.max(0, hi === undefined ? 1 : hi)];
        } else {
          var min = d3.min(data, function(a) { return d3.min(a, function(d) { return d.value; }); });
          var max = d3.max(data, function(a) { return d3.max(a, function(d) { return d.value; }); });
          valueDomain = [Math.min(0, min === undefined ? 0 : min), Math.max(0, max === undefined ? 1 : max)];
        }
        if (valueDomain[0] === valueDomain[1]) valueDomain[1] = valueDomain[0] + 1;

        // The categories are every series' categories, in the order they first appear (series 0 first),
        // so a category that only a later series has still gets its place on the axis.
        var seen = new d3.InternSet();
        data.forEach(function(series) { series.forEach(function(d) { seen.add(d.category); }); });
        var categories = Array.from(seen);
        var xDomain = xRange || (isH ? valueDomain : (categories.length ? categories : [0, 1]));
        var yDomain = yRange || (isH ? (categories.length ? categories : [0, 1]) : valueDomain);

        return { x: xDomain, y: yDomain };
      },

      legendItems: function() { return d3.easygraph._seriesLegendItems(graph); },

      render: function(data) {
        if (graph.stacked) drawBars(d3.easygraph._computeStacked(data, true), true);
        else               drawBars(data, false);
      }
    };
  });
};
