// Scatter chart, one dot per point.
//   h(ScatterChart, { points: [{ x: 7.5, y: 80, label: "Alex" }], xLabel: "Sleep (h)", yLabel: "Score" })
import { createElement as h } from "react";
import { W, H, PAD, PALETTE, scale, niceRange, ticks, Frame } from "./chartBase.js";

function ScatterChart(props) {
  const { points, xLabel, yLabel, color } = props;
  const [xMin, xMax] = niceRange(points.map((p) => p.x));
  const [yMin, yMax] = niceRange(points.map((p) => p.y));
  const x = scale(xMin, xMax, PAD.l, W - PAD.r);
  const y = scale(yMin, yMax, H - PAD.b, PAD.t);
  const xTicks = ticks(xMin, xMax, 5).map((v) => ({ x: x(v), label: v.toFixed(1) }));
  return h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" },
    Frame({ yMin, yMax, y, xTicks, xLabel, yLabel }),
    points.map((p, i) => h("circle", { key: i, cx: x(p.x), cy: y(p.y), r: 4, fill: color || PALETTE[0], fillOpacity: 0.7 },
      h("title", null, `${p.label ? p.label + ": " : ""}${p.x}, ${p.y}`)))
  );
}

export default ScatterChart;
