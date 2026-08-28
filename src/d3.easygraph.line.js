// d3.easygraph.line.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// The continuous chart-family constructor: lines, ribbons, stacked areas, zoom, and
// crosshair — these always travel together in practice and share a continuous
// (time/linear) x scale.

// Friendly aliases for the d3 curves this library ships shortcuts for; defined once at module
// level, never changes. `curve` also accepts a d3 curve factory directly (d3.curveNatural,
// d3.curveCatmullRom.alpha(0.5), ...) so the shortcut list isn't a ceiling -- see _resolveCurve.
var _curveMap = {
  'linear':      d3.curveLinear,
  'monotone':    d3.curveMonotoneX,
  'step-after':  d3.curveStepAfter,
  'step-before': d3.curveStepBefore,
  'basis':       d3.curveBasis,
  'cardinal':    d3.curveCardinal
};

function _resolveCurve(curve) {
  if (typeof curve === 'function') return curve; // a d3 curve factory, passed straight through
  return _curveMap[curve] || d3.curveLinear;
}

// flattens a nested array (one series per row) into a single flat array of values via acc
function _nestedValues(data, acc) {
  var values = [];
  data.forEach(function(series) { series.forEach(function(d) { values.push(acc(d)); }); });
  return values;
}

d3.easygraph.line = function(config) {
  return d3.easygraph._build(config, {
    _chartType:         'line',
    _dataShape:         'series',
    lines:              false,
    ribbons:            false,
    stackedArea:        false,
    zoom:               false,
    crosshair:          false,
    crosshairThreshold: 10,
    curve:              'linear',
    names:              null, // optional per-series names, index-matched to the series arrays
                              // passed to update() -- what legendItems() labels each entry with,
                              // and what the crosshair tooltip names each row by. Same shape as
                              // `units` below.
    units:              null // optional per-series unit strings for the crosshair tooltip --
                             // see _moveCrosshair() below; graph.unit (singular, from the
                             // shared y preset) is the fallback when a series has no entry
  }, function(graph) {
    var _cx, _cy, _bisect;

    return {
      init: function() {
        _cx = function(d) { return graph.x.$scale(d.x); };
        _cy = function(d) { return graph.y.$scale(d.y); };

        var _curve = _resolveCurve(graph.curve);
        var _definedLine = function(d) { return d.y != null; };
        var _definedRibbon = function(d) { return d.min != null && d.max != null; };
        graph.$ribbon0 = d3.area().curve(_curve).defined(_definedRibbon).x(_cx)
          .y0(function(d) { return graph.y.$scale(0); })
          .y1(function(d) { return graph.y.$scale(0); });
        graph.$ribbon  = d3.area().curve(_curve).defined(_definedRibbon).x(_cx)
          .y0(function(d) { return graph.y.$scale(d.min); })
          .y1(function(d) { return graph.y.$scale(d.max); });
        graph.$line0 = d3.line().curve(_curve).defined(_definedLine).x(_cx).y(function(d) { return graph.y.$scale(0); });
        graph.$line  = d3.line().curve(_curve).defined(_definedLine).x(_cx).y(_cy);
        // stackedArea's points are d3.easygraph._computeStacked()'s output -- same shape as a
        // plain {x,y} point plus a precomputed y0 offset, so _definedLine (checks d.y != null)
        // is exactly the same check a stacked point needs too, no separate function.
        graph.$stack0 = d3.area().curve(_curve).defined(_definedLine).x(_cx)
          .y0(function(d) { return graph.y.$scale(0); })
          .y1(function(d) { return graph.y.$scale(0); });
        graph.$stack  = d3.area().curve(_curve).defined(_definedLine).x(_cx)
          .y0(function(d) { return graph.y.$scale(d.y0); })
          .y1(function(d) { return graph.y.$scale(d.y0 + d.y); });

        // Zoom's per-frame fast path: re-apply the current scales to the paths and axes that
        // already exist, skipping the data re-binding, domain recomputation and transition a
        // full render() would do -- at 60fps during a drag, that difference matters. Line is
        // the only family with built-in zoom, so it's the only one that needs this; it's
        // internal for the same reason prepareScales (bars-only) and destroy (line-only) are
        // optional module hooks rather than promises every family has to keep.
        graph._redraw = function() {
          graph._drawAxes();
          graph.$group.selectAll("path.data-ribbons").attr("d", graph.$ribbon);
          graph.$group.selectAll("path.data-stack").attr("d", graph.$stack);
          graph.$group.selectAll("path.data-lines").attr("d", graph.$line);
        };

        if (graph.zoom) {
          graph.$zoom = d3.zoom().scaleExtent(graph.zoom).on("zoom", function(event) {
            graph.x.$scale.domain(event.transform.rescaleX(graph.$xScaleRef).domain());
            graph._redraw();
            if (graph.onZoom) graph.onZoom(event.transform);
          });

          graph.$pane = graph.$svg
            .append("rect")
              .attr("class", "pane")
              .attr("width", graph.width)
              .attr("height", graph.height)
              // Without this, iOS's native pinch-to-zoom/pan can still hijack a touch gesture
              // on this pane and zoom the whole page instead of the chart, even though d3.zoom()
              // already calls preventDefault() internally -- that alone isn't reliable against
              // the OS-level gesture recognizer, on any iOS browser (all of them run on the
              // system WebKit engine, so this isn't Safari-specific).
              .style("touch-action", "none")
              .call(graph.$zoom);
        }

        if (graph.crosshair) {
          // Binary search for the point nearest the cursor, which means each series has to be
          // sorted ascending by x. Unsorted input doesn't throw here -- it just reports the
          // wrong point -- so this is a documented precondition rather than a checked one:
          // verifying it would cost a full scan of every series on every construction.
          _bisect = d3.bisector(function(d) { return d.x; }).left;

          graph.$crosshairLine = graph.$svg
            .append("line")
            .attr("class", "crosshair-line")
            .attr("clip-path", "url(#" + graph._clipId + ")")
            .attr("y1", 0)
            .attr("y2", graph.height)
            .style("display", "none");

          graph.$crosshairTip = d3.select("body")
            .append("div")
            .attr("class", "easygraph-crosshair-tip")
            .style("display", "none");

          graph._moveCrosshair = function(mouseX) {
            if (!graph._crosshairData) return;
            graph.$crosshairLine.attr("x1", mouseX).attr("x2", mouseX).style("display", null);

            var x0 = graph.x.$scale.invert(mouseX);
            var xLabel = (graph.x.scale === 'time')
              ? d3.timeFormat('%Y-%m-%d %H:%M')(x0)
              : (graph.numberFormat(x0) + (graph.x.unit || ''));

            var html = '<strong>' + xLabel + '</strong>';
            graph._crosshairData.forEach(function(series, i) {
              if (!series.length) return;
              var idx = _bisect(series, x0, 1);
              var d0 = series[Math.max(idx - 1, 0)], d1 = series[idx];
              var d = (d1 && Math.abs(x0 - d1.x) < Math.abs(x0 - d0.x)) ? d1 : d0;
              if (!d) return;
              var near = Math.abs(graph.x.$scale(d.x) - mouseX) <= graph.crosshairThreshold;
              var unit = (graph.units && graph.units[i] != null) ? graph.units[i] : (graph.resolvedUnit() || '');
              // the series' own name, when `names` supplies one -- otherwise the row is just the
              // swatch and the value, exactly as before
              var name = (graph.names && graph.names[i] != null) ? graph.names[i] + ' ' : '';
              html += '<br><span style="color:' + graph.getPaletteColor(i) + '">&#9632;</span> ' +
                      name + (near ? d.y : '?') + unit;
            });

            graph.$crosshairTip.html(html).style("display", null);

            var svgRect = graph.$svg.node().ownerSVGElement.getBoundingClientRect();
            var tipX = svgRect.left + window.scrollX + graph.margin.left + mouseX + 12;
            var tipY = svgRect.top  + window.scrollY + graph.margin.top;
            var tipW = graph.$crosshairTip.node().offsetWidth;
            if (tipX + tipW > window.scrollX + window.innerWidth) {
              tipX = svgRect.left + window.scrollX + graph.margin.left + mouseX - 12 - tipW;
            }
            graph.$crosshairTip.style("left", tipX + "px").style("top", tipY + "px");
          };

          graph._hideCrosshair = function() {
            graph.$crosshairLine.style("display", "none");
            graph.$crosshairTip.style("display", "none");
          };

          graph.$svg.on("mousemove.crosshair", function(event) {
            var mouseX = d3.pointer(event, graph.$svg.node())[0];
            if (mouseX >= 0 && mouseX <= graph.width) {
              graph._moveCrosshair(mouseX);
              if (graph.onCrosshair) graph.onCrosshair(mouseX);
            } else {
              graph._hideCrosshair();
              if (graph.onCrosshair) graph.onCrosshair(null);
            }
          }).on("mouseleave.crosshair", function() {
            graph._hideCrosshair();
            if (graph.onCrosshair) graph.onCrosshair(null);
          });
        }
      },

      domain: function(data, xRange, yRange) {
        // Guards against empty data (no series, or every series empty) the same way bars.js
        // already does -- d3.extent/min/max on an empty array return undefined, which would
        // otherwise become the scale's domain and break axis rendering. "No data yet" (e.g.
        // page loaded, first fetch hasn't resolved) is a common real state, not an edge case.
        var xValues = _nestedValues(data, function(d) { return d.x; });
        var xDomain = xRange || (xValues.length ? d3.easygraph._clippedExtent(xValues, graph.x.clip) : [0, 1]);

        var yDomain;
        if (yRange) {
          yDomain = yRange;
        } else if (graph.stackedArea) {
          // a stacked area's own top edge is a cumulative sum across series, not a single
          // series' own values -- clip doesn't have a single value array to work from here
          // either, and (like bars' stacked mode) the axis always includes zero regardless of
          // graph.y.clip, since a stack's height is only meaningful measured from the bottom.
          var stacked = d3.easygraph._computeStacked(data);
          var stackedMax = d3.max(stacked, function(series) {
            return d3.max(series, function(d) { return d.y0 + d.y; });
          });
          yDomain = [0, (stackedMax === undefined) ? 1 : stackedMax];
        } else if (graph.ribbons) {
          // a ribbon's band comes from each point's own precomputed min/max, not a plain value
          // per point -- clip doesn't have a single value array to work from here, so this
          // path always uses the true extent regardless of graph.y.clip
          var ribbonMin = d3.min(data, function(a) { return d3.min(a, function(d) { return d.min; }); });
          var ribbonMax = d3.max(data, function(a) { return d3.max(a, function(d) { return d.max; }); });
          yDomain = (ribbonMin === undefined) ? [0, 1] : [ribbonMin, ribbonMax];
        } else {
          var yValues = _nestedValues(data, function(d) { return d.y; });
          yDomain = yValues.length ? d3.easygraph._clippedExtent(yValues, graph.y.clip) : [0, 1];
        }

        return { x: xDomain, y: yDomain };
      },

      render: function(data) {
        // A line chart with none of the three mark types enabled draws axes and nothing else --
        // the likeliest first-run mistake, and previously a silent one. A warning rather than an
        // error on purpose: the flags are meant to be toggled on a live chart (larsi.org's own
        // pages do `graph.ribbons = !hourly` between renders), so a caller can legitimately be
        // mid-flight with all three off, and throwing would break that. Only warns when there's
        // actually data being asked for, so an empty first render stays quiet.
        if (data.length && !graph.lines && !graph.ribbons && !graph.stackedArea) {
          console.warn('d3.easygraph: line chart has data but none of lines/ribbons/stackedArea ' +
                       'enabled, so nothing will be drawn');
        }

        if (graph.zoom) {
          // baseline for zoom rescaling; reset transform so new domain is "home"
          graph.$xScaleRef = graph.x.$scale.copy();
          graph.$svg.select("rect.pane").call(graph.$zoom.transform, d3.zoomIdentity);
        }

        if (graph.crosshair) graph._crosshairData = data;

        if (graph.ribbons) {
          var dataRibbons = graph.$group.selectAll(".data-ribbons").data(data);
          var ribbonsEntered = dataRibbons.enter().append("path")
            .attr("class",      "data-ribbons")
            .attr("clip-path",  "url(#" + graph._clipId + ")")
            .attr("d",          graph.$ribbon0)
            .style("fill",      function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity",   1e-6);
          dataRibbons.exit().remove();
          dataRibbons = ribbonsEntered.merge(dataRibbons);
          dataRibbons.transition().duration(graph.duration).ease(d3.easeCubicInOut)
            .attr("d",        graph.$ribbon)
            .style("fill",    function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity", 0.4);
        } else {
          graph.$group.selectAll(".data-ribbons").remove();
        }

        if (graph.stackedArea) {
          var stackedData = d3.easygraph._computeStacked(data);
          var dataStack = graph.$group.selectAll(".data-stack").data(stackedData);
          var stackEntered = dataStack.enter().append("path")
            .attr("class",      "data-stack")
            .attr("clip-path",  "url(#" + graph._clipId + ")")
            .attr("d",          graph.$stack0)
            .style("fill",      function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity",   1e-6);
          dataStack.exit().remove();
          dataStack = stackEntered.merge(dataStack);
          dataStack.transition().duration(graph.duration).ease(d3.easeCubicInOut)
            .attr("d",        graph.$stack)
            .style("fill",    function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity", 1);
        } else {
          graph.$group.selectAll(".data-stack").remove();
        }

        if (graph.lines) {
          var dataLines = graph.$group.selectAll(".data-lines").data(data);
          var linesEntered = dataLines.enter().append("path")
            .attr("class",     "data-lines")
            .attr("clip-path", "url(#" + graph._clipId + ")")
            .attr("d",         graph.$line0)
            .style("stroke",   function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity",  1e-6);
          dataLines.exit().remove();
          dataLines = linesEntered.merge(dataLines);
          dataLines.transition().duration(graph.duration).ease(d3.easeCubicInOut)
            .attr("d",        graph.$line)
            .style("stroke",  function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity", 1);
        } else {
          graph.$group.selectAll(".data-lines").remove();
        }
      },

      legendItems: function() { return d3.easygraph._seriesLegendItems(graph); },

      resize: function() {
        if (graph.$pane) graph.$pane.attr("width", graph.width);
        if (graph.$xScaleRef) graph.$xScaleRef.range([0, graph.width]);
      },

      destroy: function() {
        if (graph.$crosshairTip) graph.$crosshairTip.remove();
      }
    };
  });
};

// onZoom/onCrosshair are the caller's own hooks, so sync composes with whatever is already
// there rather than replacing it -- assigning over the top (which is what these used to do)
// silently dropped a callback the caller had set, with no way to have both.
d3.easygraph.syncZoom = function(graphs) {
  graphs.forEach(function(g) {
    if (!g.$pane) return;
    var callerOnZoom = g.onZoom;
    g.onZoom = function(transform) {
      if (callerOnZoom) callerOnZoom.call(g, transform);
      graphs.forEach(function(other) {
        if (other === g || !other.$pane || !other.$xScaleRef) return;
        other.x.$scale.domain(transform.rescaleX(other.$xScaleRef).domain());
        other._redraw();
        other.$pane.node().__zoom = transform;
      });
    };
  });
};

d3.easygraph.syncCrosshair = function(graphs) {
  graphs.forEach(function(g) {
    if (!g._moveCrosshair) return;
    var callerOnCrosshair = g.onCrosshair;
    g.onCrosshair = function(mouseX) {
      if (callerOnCrosshair) callerOnCrosshair.call(g, mouseX);
      graphs.forEach(function(other) {
        if (other === g || !other._moveCrosshair || !other.$xScaleRef) return;
        if (mouseX === null) {
          other._hideCrosshair();
        } else {
          var xValue = g.x.$scale.invert(mouseX);
          other._moveCrosshair(other.x.$scale(xValue));
        }
      });
    };
  });
};
