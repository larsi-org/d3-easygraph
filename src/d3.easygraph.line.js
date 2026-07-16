// d3.easygraph.line.js
// Creative Commons Attribution-ShareAlike 3.0 License (CC BY-SA 3.0)
// http://creativecommons.org/licenses/by-sa/3.0/
// Copyright (c) 2015, Lars Schumann, larsi.org@gmail.com
//
// The continuous chart-family module: lines, areas, zoom, and crosshair — these
// always travel together in practice and share a continuous (time/linear) x scale.

// defined once at module level — never changes
var _curveMap = {
  'linear':      d3.curveLinear,
  'monotone':    d3.curveMonotoneX,
  'step-after':  d3.curveStepAfter,
  'step-before': d3.curveStepBefore,
  'basis':       d3.curveBasis,
  'cardinal':    d3.curveCardinal
};

// returns [min, max] across a nested array using acc
function _nestedExtent(data, acc) {
  return [
    d3.min(data, function(a) { return d3.min(a, acc); }),
    d3.max(data, function(a) { return d3.max(a, acc); })
  ];
}

d3.easygraph.modules.push({
  test: function(graph) {
    return graph.show_lines || graph.show_areas || graph.show_zoom || graph.show_crosshair;
  },
  factory: function(graph) {
    var clipId = "clip-" + graph.id;
    var _cx, _cy, _bisect;

    return {
      init: function() {
        _cx = function(d) { return graph.x.$scale(d.x); };
        _cy = function(d) { return graph.y.$scale(d.y); };

        var _curve = _curveMap[graph.interpolate] || d3.curveLinear;
        graph.$area0 = d3.area().curve(_curve).x(_cx)
          .y0(function(d) { return graph.y.$scale(0); })
          .y1(function(d) { return graph.y.$scale(0); });
        graph.$area  = d3.area().curve(_curve).x(_cx)
          .y0(function(d) { return graph.y.$scale(d.min); })
          .y1(function(d) { return graph.y.$scale(d.max); });
        graph.$line0 = d3.line().curve(_curve).x(_cx).y(function(d) { return graph.y.$scale(0); });
        graph.$line  = d3.line().curve(_curve).x(_cx).y(_cy);

        graph.draw = function() {
          graph.$svg.select("g.x.axis").call(graph.x.$axis);
          graph.$svg.select("g.y.axis").call(graph.y.$axis);
          graph.$group.selectAll("path.data-areas").attr("d", graph.$area);
          graph.$group.selectAll("path.data-lines").attr("d", graph.$line);
        };

        if (graph.show_zoom) {
          graph.$zoom = d3.zoom().scaleExtent(graph.show_zoom).on("zoom", function(event) {
            graph.x.$scale.domain(event.transform.rescaleX(graph.$x_scale_ref).domain());
            graph.draw();
            if (graph.onZoom) graph.onZoom(event.transform);
          });

          graph.$pane = graph.$svg
            .append("rect")
              .attr("class", "pane")
              .attr("width", graph.width)
              .attr("height", graph.height)
              .call(graph.$zoom);
        }

        if (graph.show_crosshair) {
          _bisect = d3.bisector(function(d) { return d.x; }).left;

          graph.$crosshair_line = graph.$svg
            .append("line")
            .attr("class", "crosshair-line")
            .attr("clip-path", "url(#" + clipId + ")")
            .attr("y1", 0)
            .attr("y2", graph.height)
            .style("display", "none");

          graph.$crosshair_tip = d3.select("body")
            .append("div")
            .attr("class", "easygraph-crosshair-tip")
            .style("display", "none");

          graph._moveCrosshair = function(mouseX) {
            if (!graph._crosshair_data) return;
            graph.$crosshair_line.attr("x1", mouseX).attr("x2", mouseX).style("display", null);

            var x0 = graph.x.$scale.invert(mouseX);
            var xLabel = (graph.x.scale === 'time')
              ? d3.timeFormat('%Y-%m-%d %H:%M')(x0)
              : (graph.numberFormat(x0) + (graph.x.unit || ''));

            var html = '<strong>' + xLabel + '</strong>';
            graph._crosshair_data.forEach(function(series, i) {
              if (!series.length) return;
              var idx = _bisect(series, x0, 1);
              var d0 = series[Math.max(idx - 1, 0)], d1 = series[idx];
              var d = (d1 && Math.abs(x0 - d1.x) < Math.abs(x0 - d0.x)) ? d1 : d0;
              if (!d) return;
              var near = Math.abs(graph.x.$scale(d.x) - mouseX) <= graph.crosshair_threshold;
              var unit = (graph.units && graph.units[i] != null) ? graph.units[i] : (graph.unit || '');
              html += '<br><span style="color:' + graph.getPaletteColor(i) + '">&#9632;</span> ' + (near ? d.y : '?') + unit;
            });

            graph.$crosshair_tip.html(html).style("display", null);

            var svgRect = graph.$svg.node().ownerSVGElement.getBoundingClientRect();
            var tipX = svgRect.left + window.scrollX + graph.margin.left + mouseX + 12;
            var tipY = svgRect.top  + window.scrollY + graph.margin.top;
            var tipW = graph.$crosshair_tip.node().offsetWidth;
            if (tipX + tipW > window.scrollX + window.innerWidth) {
              tipX = svgRect.left + window.scrollX + graph.margin.left + mouseX - 12 - tipW;
            }
            graph.$crosshair_tip.style("left", tipX + "px").style("top", tipY + "px");
          };

          graph._hideCrosshair = function() {
            graph.$crosshair_line.style("display", "none");
            graph.$crosshair_tip.style("display", "none");
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

      domain: function(data, x_range, y_range) {
        var x_domain = x_range || _nestedExtent(data, function(d) { return d.x; });

        var y_domain;
        if (y_range) {
          y_domain = y_range;
        } else if (graph.show_areas) {
          y_domain = [
            d3.min(data, function(a) { return d3.min(a, function(d) { return d.min; }); }),
            d3.max(data, function(a) { return d3.max(a, function(d) { return d.max; }); })
          ];
        } else {
          y_domain = _nestedExtent(data, function(d) { return d.y; });
        }

        return { x: x_domain, y: y_domain };
      },

      render: function(data) {
        if (graph.show_zoom) {
          // baseline for zoom rescaling; reset transform so new domain is "home"
          graph.$x_scale_ref = graph.x.$scale.copy();
          graph.$svg.select("rect.pane").call(graph.$zoom.transform, d3.zoomIdentity);
        }

        if (graph.show_crosshair) graph._crosshair_data = data;

        if (graph.show_areas) {
          var data_areas = graph.$group.selectAll(".data-areas").data(data);
          var areas_entered = data_areas.enter().append("path")
            .attr("class",      "data-areas")
            .attr("clip-path",  "url(#" + clipId + ")")
            .attr("d",          graph.$area0)
            .style("fill",      function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity",   1e-6);
          data_areas.exit().remove();
          data_areas = areas_entered.merge(data_areas);
          data_areas.transition().duration(graph.animation_stage1).ease(d3.easeCubicInOut)
            .attr("d",        graph.$area)
            .style("fill",    function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity", 0.4);
        } else {
          graph.$group.selectAll(".data-areas").remove();
        }

        if (graph.show_lines) {
          var data_lines = graph.$group.selectAll(".data-lines").data(data);
          var lines_entered = data_lines.enter().append("path")
            .attr("class",     "data-lines")
            .attr("clip-path", "url(#" + clipId + ")")
            .attr("d",         graph.$line0)
            .style("stroke",   function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity",  1e-6);
          data_lines.exit().remove();
          data_lines = lines_entered.merge(data_lines);
          data_lines.transition().duration(graph.animation_stage1).ease(d3.easeCubicInOut)
            .attr("d",        graph.$line)
            .style("stroke",  function(d, i) { return graph.getPaletteColor(i); })
            .style("opacity", 1);
        } else {
          graph.$group.selectAll(".data-lines").remove();
        }
      },

      resize: function() {
        if (graph.$pane) graph.$pane.attr("width", graph.width);
        if (graph.$x_scale_ref) graph.$x_scale_ref.range([0, graph.width]);
      }
    };
  }
});

d3.easygraph.syncZoom = function(graphs) {
  graphs.forEach(function(g) {
    if (!g.$pane) return;
    g.onZoom = function(transform) {
      graphs.forEach(function(other) {
        if (other === g || !other.$pane || !other.$x_scale_ref) return;
        other.x.$scale.domain(transform.rescaleX(other.$x_scale_ref).domain());
        other.draw();
        other.$pane.node().__zoom = transform;
      });
    };
  });
};

d3.easygraph.syncCrosshair = function(graphs) {
  graphs.forEach(function(g) {
    if (!g._moveCrosshair) return;
    g.onCrosshair = function(mouseX) {
      graphs.forEach(function(other) {
        if (other === g || !other._moveCrosshair || !other.$x_scale_ref) return;
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
