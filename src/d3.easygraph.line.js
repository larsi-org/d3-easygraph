// d3.easygraph.line.js
// MIT License
// https://opensource.org/licenses/MIT
// Copyright (c) 2026, Lars Schumann, larsi.org@gmail.com
//
// The continuous chart-family constructor: lines, min/max and sigma bands, stacked areas, zoom, and
// crosshair - these always travel together in practice and share a continuous
// (time/linear) x scale.

// Friendly aliases for the d3 curves this library ships shortcuts for; defined once at module
// level, never changes. `curve` also accepts a d3 curve factory directly (d3.curveNatural,
// d3.curveCatmullRom.alpha(0.5), ...) so the shortcut list isn't a ceiling - see _resolveCurve.
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
    _eventTypes:        ['zoom', 'crosshair'],
    _dataShape:         'series',
    lines:              null, // null = on, except on a stacked chart (see _linesOn() below); true/false decides
    bands:              null, // false / null / {} = none, true = both; { minmax, sigma } booleans - see _bandSet() below
    stacked:            false,
    zoom:               false,
    crosshair:          false,
    curve:              'linear',
    series:             null  // optional [{ label, unit }, ...], one per series passed to update(), in the
                              // same order: label is what legendItems() and the crosshair tooltip call
                              // each series, unit replaces the shared y.unit in the tooltip. A series
                              // with no entry, or no label/unit, just uses the defaults.
  }, function(graph) {
    var _cx, _cy, _bisect;

    // bands says which shaded bands to draw around each series, nested widest first:
    // { minmax: true } (each point's min/max), { sigma: true } (sigmaMin/sigmaMax, typically
    // mean +-1 sd), or both. true is both, false / null / {} is none, and a missing key is off, like
    // every other false/true/object option. Re-read on every update(), so a page toggles both with
    // one call: graph.set({ bands: !hourly }).
    // lines left unset draws the lines, so a plain { container, height } chart shows something - except
    // on a stacked chart, where the stacked areas are the picture. Set true or false to decide.
    // Re-read on every update(), like the other flags.
    function _linesOn() {
      return (graph.lines == null) ? !graph.stacked : !!graph.lines;
    }

    // bands is checked by the config and by set(), its only ways in
    function _bandSet() {
      var b = graph.bands;
      if (b === true) return { minmax: true, sigma: true };
      b = b || {};
      return { minmax: !!b.minmax, sigma: !!b.sigma };
    }

    return {
      init: function() {
        _cx = function(d) { return graph.x.$scale(d.x); };
        _cy = function(d) { return graph.y.$scale(d.y); };

        var _curve = _resolveCurve(graph.curve);
        var _definedLine = function(d) { return d.y != null; };
        var _definedRibbon = function(d) { return d.min != null && d.max != null; };
        graph._.$ribbon0 = d3.area().curve(_curve).defined(_definedRibbon).x(_cx)
          .y0(function(d) { return graph.y.$scale(0); })
          .y1(function(d) { return graph.y.$scale(0); });
        graph._.$ribbon  = d3.area().curve(_curve).defined(_definedRibbon).x(_cx)
          .y0(function(d) { return graph.y.$scale(d.min); })
          .y1(function(d) { return graph.y.$scale(d.max); });
        // bands: { sigma: true } - a second, narrower band (typically mean +-1 standard deviation) nested
        // inside the wider 'minmax' one - same shape/gap convention (a point
        // missing sigmaMin/sigmaMax just isn't drawn there), a separate feature since a caller
        // may have one without the other (min/max always derivable from raw samples; sigma
        // needs a sum-of-squares alongside them - see bucket-series.js/daily-from-hourly.js).
        var _definedSigma = function(d) { return d.sigmaMin != null && d.sigmaMax != null; };
        graph._.$sigma0 = d3.area().curve(_curve).defined(_definedSigma).x(_cx)
          .y0(function(d) { return graph.y.$scale(0); })
          .y1(function(d) { return graph.y.$scale(0); });
        graph._.$sigma  = d3.area().curve(_curve).defined(_definedSigma).x(_cx)
          .y0(function(d) { return graph.y.$scale(d.sigmaMin); })
          .y1(function(d) { return graph.y.$scale(d.sigmaMax); });
        graph._.$line0 = d3.line().curve(_curve).defined(_definedLine).x(_cx).y(function(d) { return graph.y.$scale(0); });
        graph._.$line  = d3.line().curve(_curve).defined(_definedLine).x(_cx).y(_cy);
        // stacked's points are d3.easygraph._computeStacked()'s output - same shape as a
        // plain {x,y} point plus a precomputed y0 offset, so _definedLine (checks d.y != null)
        // is exactly the same check a stacked point needs too, no separate function.
        graph._.$stack0 = d3.area().curve(_curve).defined(_definedLine).x(_cx)
          .y0(function(d) { return graph.y.$scale(0); })
          .y1(function(d) { return graph.y.$scale(0); });
        graph._.$stack  = d3.area().curve(_curve).defined(_definedLine).x(_cx)
          .y0(function(d) { return graph.y.$scale(d.y0); })
          .y1(function(d) { return graph.y.$scale(d.y0 + d.y); });

        // Zoom's per-frame fast path: re-apply the current scales to the paths and axes that
        // already exist, skipping the data re-binding, domain recomputation and transition a
        // full render() would do - at 60fps during a drag, that difference matters. Line is
        // the only family with built-in zoom, so it's the only one that needs this; it's
        // internal for the same reason prepareScales (bars-only) and destroy (line-only) are
        // optional module hooks rather than promises every family has to keep.
        graph._.redraw = function() {
          graph._.drawAxes();
          graph.$marks.selectAll("path.easygraph-minmax").attr("d", graph._.$ribbon);
          graph.$marks.selectAll("path.easygraph-sigma").attr("d", graph._.$sigma);
          graph.$marks.selectAll("path.easygraph-stack").attr("d", graph._.$stack);
          graph.$marks.selectAll("path.easygraph-line").attr("d", graph._.$line);
        };

        if (graph.zoom) {
          var z = (typeof graph.zoom === 'object') ? graph.zoom : {};
          graph._.$zoom = d3.zoom().scaleExtent([z.min != null ? z.min : 1, z.max != null ? z.max : 10]).on("zoom", function(event) {
            graph.x.$scale.domain(event.transform.rescaleX(graph._.$xScaleRef).domain());
            graph._.redraw();
            // { transform, x }: the d3 zoom transform, and the x domain now in view (Dates on a time
            // axis) - what most listeners want, without redoing rescaleX themselves.
            graph._.emit('zoom', { transform: event.transform, x: graph.x.$scale.domain() });
          });

          graph._.$pane = graph.$plot
            .append("rect")
              .attr("class", "easygraph-pane")
              .attr("width", graph.plotWidth)
              .attr("height", graph.plotHeight)
              // Without this, iOS's native pinch-to-zoom/pan can still hijack a touch gesture
              // on this pane and zoom the whole page instead of the chart, even though d3.zoom()
              // already calls preventDefault() internally - that alone isn't reliable against
              // the OS-level gesture recognizer, on any iOS browser (all of them run on the
              // system WebKit engine, so this isn't Safari-specific).
              .style("touch-action", "none")
              .call(graph._.$zoom);
        }

        if (graph.crosshair) {
          // Binary search for the point nearest the cursor, which means each series has to be
          // sorted ascending by x. Unsorted input doesn't throw here - it just reports the
          // wrong point - so this is a documented precondition rather than a checked one:
          // verifying it would cost a full scan of every series on every construction.
          _bisect = d3.bisector(function(d) { return d.x; }).left;

          graph._.$crosshairLine = graph.$plot
            .append("line")
            .attr("class", "easygraph-crosshair-line")
            .attr("clip-path", "url(#" + graph._.clipId + ")")
            .attr("y1", 0)
            .attr("y2", graph.plotHeight)
            .style("display", "none");

          graph._.$crosshairTip = d3.select("body")
            .append("div")
            .attr("class", "easygraph-crosshair-tip")
            .style("display", "none");

          // crosshair.format { x, y } (checked with the config); a side left out keeps the default:
          // x '%Y-%m-%d %H:%M' on a time axis, else formatNumber; values formatNumber
          var _tipFmt = (graph.crosshair && graph.crosshair.format) || {};
          var _fmtX = d3.easygraph._formatter('d3.easygraph.line', 'crosshair.format.x', _tipFmt.x, { type: graph.x.type }, 'tip') ||
                      ((graph.x.type === 'time') ? d3.timeFormat('%Y-%m-%d %H:%M') : d3.easygraph.formatNumber);
          var _fmtY = d3.easygraph._formatter('d3.easygraph.line', 'crosshair.format.y', _tipFmt.y, { type: graph.y.type }, 'tip') ||
                      d3.easygraph.formatNumber;

          graph._.moveCrosshair = function(mouseX) {
            if (!graph._.crosshairData) return;
            graph._.$crosshairLine.attr("x1", mouseX).attr("x2", mouseX).style("display", null);

            var x0 = graph.x.$scale.invert(mouseX);
            var xLabel = _fmtX(x0) + ((graph.x.type === 'time') ? '' : (graph.x.unit || ''));

            var html = '<strong>' + xLabel + '</strong>';
            graph._.crosshairData.forEach(function(series, i) {
              if (!series.length) return;
              var idx = _bisect(series, x0, 1);
              var d0 = series[Math.max(idx - 1, 0)], d1 = series[idx];
              var d = (d1 && Math.abs(x0 - d1.x) < Math.abs(x0 - d0.x)) ? d1 : d0;
              if (!d) return;
              var crosshairThreshold = (graph.crosshair && graph.crosshair.threshold != null) ? graph.crosshair.threshold : 10;
              var near = Math.abs(graph.x.$scale(d.x) - mouseX) <= crosshairThreshold;
              var meta = (graph.series && graph.series[i]) || {};
              var unit = (meta.unit != null) ? meta.unit : (graph.y.unit || '');
              // the series' own label, when `series` supplies one - otherwise the row is just the
              // swatch and the value, exactly as before
              var name = (meta.label != null) ? meta.label + ' ' : '';
              // the value in crosshair.format.y, else the axes' own number format; '?' when no point is
              // near or it is a gap
              var value = (near && d.y != null) ? _fmtY(d.y) : '?';
              html += '<br><span style="color:' + graph.paletteColor(i) + '">&#9632;</span> ' +
                      name + value + unit;
            });

            graph._.$crosshairTip.html(html).style("display", null);

            var svgRect = graph.$svg.node().getBoundingClientRect();
            var tipX = svgRect.left + window.scrollX + graph._.margin.left + mouseX + 12;
            var tipY = svgRect.top  + window.scrollY + graph._.margin.top;
            var tipW = graph._.$crosshairTip.node().offsetWidth;
            if (tipX + tipW > window.scrollX + window.innerWidth) {
              tipX = svgRect.left + window.scrollX + graph._.margin.left + mouseX - 12 - tipW;
            }
            graph._.$crosshairTip.style("left", tipX + "px").style("top", tipY + "px");
          };

          graph._.hideCrosshair = function() {
            graph._.$crosshairLine.style("display", "none");
            graph._.$crosshairTip.style("display", "none");
          };

          graph.$plot.on("mousemove.crosshair", function(event) {
            var mouseX = d3.pointer(event, graph.$plot.node())[0];
            if (mouseX >= 0 && mouseX <= graph.plotWidth) {
              graph._.moveCrosshair(mouseX);
              graph._.emit('crosshair', { x: graph.x.$scale.invert(mouseX), pixel: mouseX });
            } else {
              graph._.hideCrosshair();
              graph._.emit('crosshair', null);
            }
          }).on("mouseleave.crosshair", function() {
            graph._.hideCrosshair();
            graph._.emit('crosshair', null);
          });
        }
      },

      domain: function(data, xRange, yRange) {
        // Guards against empty data (no series, or every series empty) the same way bar.js
        // already does - d3.extent/min/max on an empty array return undefined, which would
        // otherwise become the scale's domain and break axis rendering. "No data yet" (e.g.
        // page loaded, first fetch hasn't resolved) is a common real state, not an edge case.
        var xValues = _nestedValues(data, function(d) { return d.x; });
        var xDomain = xRange || (xValues.length ? d3.easygraph._clippedExtent(xValues, graph.x.trim) : [0, 1]);

        var yDomain;
        if (yRange) {
          yDomain = yRange;
        } else if (graph.stacked) {
          // a stacked area's own top edge is a cumulative sum across series, not a single
          // series' own values - trim doesn't have a single value array to work from here
          // either, and (like bars' stacked mode) the axis always includes zero regardless of
          // graph.y.trim, since a stack's height is only meaningful measured from the bottom.
          var stacked = d3.easygraph._computeStacked(data);
          var stackedMax = d3.max(stacked, function(series) {
            return d3.max(series, function(d) { return d.y0 + d.y; });
          });
          yDomain = [0, (stackedMax === undefined) ? 1 : stackedMax];
        } else if (_bandSet().minmax || _bandSet().sigma) {
          // A ribbon's/sigma band's extent comes from each point's own precomputed min/max (or
          // sigmaMin/sigmaMax), not a plain value per point - trim doesn't have a single value
          // array to work from here, so this path always uses the true extent regardless of
          // graph.y.trim. Both keys are folded in whenever both bands are on (the normal case -
          // a sigma band nests inside the wider min/max one) as two separate d3.min/max passes
          // combined afterward, so a point missing one of the two (same optional-per-point
          // convention _definedRibbon/_definedSigma already rely on for gaps) doesn't poison
          // the other's extent - d3.min/max already skip null/undefined/NaN on their own, which
          // a single combined pass using plain Math.min/max on the two raw values wouldn't.
          function nestedMin(key) { return d3.min(data, function(a) { return d3.min(a, function(d) { return d[key]; }); }); }
          function nestedMax(key) { return d3.max(data, function(a) { return d3.max(a, function(d) { return d[key]; }); }); }
          var ribbonMin = d3.min([_bandSet().minmax ? nestedMin('min') : undefined, _bandSet().sigma ? nestedMin('sigmaMin') : undefined]);
          var ribbonMax = d3.max([_bandSet().minmax ? nestedMax('max') : undefined, _bandSet().sigma ? nestedMax('sigmaMax') : undefined]);
          yDomain = (ribbonMin === undefined) ? [0, 1] : [ribbonMin, ribbonMax];
        } else {
          var yValues = _nestedValues(data, function(d) { return d.y; });
          yDomain = yValues.length ? d3.easygraph._clippedExtent(yValues, graph.y.trim) : [0, 1];
        }

        return { x: xDomain, y: yDomain };
      },

      render: function(data) {
        // A line chart with none of the three mark types enabled draws axes and nothing else -
        // the likeliest first-run mistake, and previously a silent one. A warning rather than an
        // error on purpose: the flags are meant to be toggled on a live chart (larsi.org's own
        // pages do `graph.set({ bands: hourly ? {} : {...} })` between renders), so a caller can legitimately be
        // mid-flight with all three off, and throwing would break that. Only warns when there's
        // actually data being asked for, so an empty first render stays quiet.
        var B = _bandSet();
        if (data.length && !_linesOn() && !B.minmax && !B.sigma && !graph.stacked) {
          console.warn('d3.easygraph: line chart has data but none of lines/bands/stacked ' +
                       'enabled, so nothing will be drawn');
        }

        if (graph.zoom) {
          // baseline for zoom rescaling; reset transform so new domain is "home"
          graph._.$xScaleRef = graph.x.$scale.copy();
          graph.$plot.select("rect.easygraph-pane").call(graph._.$zoom.transform, d3.zoomIdentity);
        }

        if (graph.crosshair) graph._.crosshairData = data;

        // A series' point count changing between updates (e.g. a chart's own hourly/daily
        // toggle, `weather/report.php` and `sensors/report.php`'s bucketSeries()/data_hourly.php's
        // dailyFromHourly() re-aggregating the same time range into far fewer points) is a
        // structural change, not a continuously interpolatable one - same "structural now,
        // animate the value" split bar.js's layout attrs and heatmap.js's cell geometry
        // already use. d3's default string interpolator for the `d` attribute pairs the old
        // and new path's numeric tokens positionally, so transitioning between two paths with
        // sharply different vertex counts produces a warped, "melting" intermediate shape
        // instead of a clean morph - worse the bigger the swing (very visible reducing a full
        // year of hourly EnergyPlus data, 8760 points, to 365 daily ones; present but subtler
        // at the report pages' month-at-a-time scale). Skip the animation - snap straight to
        // the new shape - only for a series that already existed last render and changed
        // length; a brand-new series (no previous entry at that index at all) still grows in
        // smoothly from $ribbon0/$stack0/$line0's flat baseline, which shares the new data's
        // own point count and x-positions on both ends, so it was never affected by this.
        var prevLengths = graph._.prevSeriesLengths;
        function _duration(d, i) {
          var prevLen = prevLengths && prevLengths[i];
          return (prevLen != null && prevLen !== data[i].length) ? 0 : graph.duration;
        }
        graph._.prevSeriesLengths = data.map(function(series) { return series.length; });

        if (B.minmax) {
          var dataRibbons = graph.$marks.selectAll(".easygraph-minmax").data(data);
          var ribbonsEntered = dataRibbons.enter().append("path")
            .attr("class",      "easygraph-minmax")
            .attr("clip-path",  "url(#" + graph._.clipId + ")")
            .attr("d",          graph._.$ribbon0)
            .style("fill",      function(d, i) { return graph.paletteColor(i); })
            .style("opacity",   1e-6);
          dataRibbons.exit().remove();
          dataRibbons = ribbonsEntered.merge(dataRibbons);
          dataRibbons.transition().duration(_duration).ease(d3.easeCubicInOut)
            .attr("d",        graph._.$ribbon)
            .style("fill",    function(d, i) { return graph.paletteColor(i); })
            .style("opacity", 0.4);
        } else {
          graph.$marks.selectAll(".easygraph-minmax").remove();
        }

        // Appended right after the minmax band (before stack/lines) so a sigma band always draws on
        // top of the wider min/max ribbon it nests inside, but under the mean line. Its own
        // opacity is 0.5, not the ~0.7 the band is meant to *look* like - the browser's normal
        // source-over compositing stacks it on top of the ribbon's own 0.4 wherever the two
        // overlap (everywhere sigmaMin/sigmaMax is defined, since that range always nests
        // inside min/max), and two same-color layers combine as 1-(1-a)(1-b): 1-(1-0.5)(1-0.4)
        // = 0.7. Setting this to the visually-intended 0.7 directly would compound with the
        // ribbon underneath into ~0.82, reading darker than intended.
        if (B.sigma) {
          var dataSigma = graph.$marks.selectAll(".easygraph-sigma").data(data);
          var sigmaEntered = dataSigma.enter().append("path")
            .attr("class",      "easygraph-sigma")
            .attr("clip-path",  "url(#" + graph._.clipId + ")")
            .attr("d",          graph._.$sigma0)
            .style("fill",      function(d, i) { return graph.paletteColor(i); })
            .style("opacity",   1e-6);
          dataSigma.exit().remove();
          dataSigma = sigmaEntered.merge(dataSigma);
          dataSigma.transition().duration(_duration).ease(d3.easeCubicInOut)
            .attr("d",        graph._.$sigma)
            .style("fill",    function(d, i) { return graph.paletteColor(i); })
            .style("opacity", 0.5);
        } else {
          graph.$marks.selectAll(".easygraph-sigma").remove();
        }

        if (graph.stacked) {
          var stackedData = d3.easygraph._computeStacked(data);
          var dataStack = graph.$marks.selectAll(".easygraph-stack").data(stackedData);
          var stackEntered = dataStack.enter().append("path")
            .attr("class",      "easygraph-stack")
            .attr("clip-path",  "url(#" + graph._.clipId + ")")
            .attr("d",          graph._.$stack0)
            .style("fill",      function(d, i) { return graph.paletteColor(i); })
            .style("opacity",   1e-6);
          dataStack.exit().remove();
          dataStack = stackEntered.merge(dataStack);
          dataStack.transition().duration(_duration).ease(d3.easeCubicInOut)
            .attr("d",        graph._.$stack)
            .style("fill",    function(d, i) { return graph.paletteColor(i); })
            .style("opacity", 1);
        } else {
          graph.$marks.selectAll(".easygraph-stack").remove();
        }

        if (_linesOn()) {
          var dataLines = graph.$marks.selectAll(".easygraph-line").data(data);
          var linesEntered = dataLines.enter().append("path")
            .attr("class",     "easygraph-line")
            .attr("clip-path", "url(#" + graph._.clipId + ")")
            .attr("d",         graph._.$line0)
            .style("stroke",   function(d, i) { return graph.paletteColor(i); })
            .style("opacity",  1e-6);
          dataLines.exit().remove();
          dataLines = linesEntered.merge(dataLines);
          dataLines.transition().duration(_duration).ease(d3.easeCubicInOut)
            .attr("d",        graph._.$line)
            .style("stroke",  function(d, i) { return graph.paletteColor(i); })
            .style("opacity", 1);
        } else {
          graph.$marks.selectAll(".easygraph-line").remove();
        }
      },

      legendItems: function() { return d3.easygraph._seriesLegendItems(graph); },

      resize: function() {
        if (graph._.$pane) graph._.$pane.attr("width", graph.plotWidth);
        if (graph._.$xScaleRef) graph._.$xScaleRef.range([0, graph.plotWidth]);
      },

      destroy: function() {
        if (graph._.$crosshairTip) graph._.$crosshairTip.remove();
      }
    };
  });
};

// The sync helpers are ordinary listeners named 'sync' (graph.on('zoom.sync', ...)), so they sit
// beside any listener the caller added and calling them twice replaces rather than stacks. Each
// returns a function that undoes the link: it removes only the listeners this call added, so a
// graph since linked into another group (whose 'sync' listener replaced this one) keeps that link.
function _syncListeners(graphs, type, has, listener) {
  var added = [];
  graphs.forEach(function(g) {
    if (!has(g)) return;
    var fn = listener(g);
    g.on(type + '.sync', fn);
    added.push({ graph: g, fn: fn });
  });
  return function unsync() {
    added.forEach(function(a) { if (!a.graph._.destroyed) a.graph.off(type + '.sync', a.fn); });
    added = [];
  };
}

d3.easygraph.syncZoom = function(graphs) {
  return _syncListeners(graphs, 'zoom', function(g) { return !!g._.$pane; }, function(g) {
    return function(event) {
      graphs.forEach(function(other) {
        if (other === g || other._.destroyed || !other._.$pane || !other._.$xScaleRef) return;
        other.x.$scale.domain(event.transform.rescaleX(other._.$xScaleRef).domain());
        other._.redraw();
        other._.$pane.node().__zoom = event.transform;
      });
    };
  });
};

d3.easygraph.syncCrosshair = function(graphs) {
  return _syncListeners(graphs, 'crosshair', function(g) { return !!g._.moveCrosshair; }, function(g) {
    return function(position) {
      graphs.forEach(function(other) {
        if (other === g || other._.destroyed || !other._.moveCrosshair) return;
        if (position === null) {
          other._.hideCrosshair();
        } else {
          other._.moveCrosshair(other.x.$scale(position.x));
        }
      });
    };
  });
};
