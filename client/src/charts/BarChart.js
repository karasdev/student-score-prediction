// Bar chart; negative values go below the zero line. Long labels wrap onto two lines.
//   h(BarChart, { labels: ["Study", "Sleep"], values: [5.2, 1.4] })
import { createElement as h } from "react";
import { W, H, PAD, PALETTE, scale, Frame } from "./chartBase.js";

function BarChart(props) {
  const { labels, values, color, yLabel } = props;
  const yMax = Math.max(0, ...values) * 1.1 || 1, yMin = Math.min(0, ...values) * 1.1;
  const y = scale(yMin, yMax, H - PAD.b, PAD.t);
  const slot = (W - PAD.l - PAD.r) / labels.length;
  return h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" },
    Frame({ yMin, yMax, y, yLabel, wrap: true, xTicks: labels.map((l, i) => ({ x: PAD.l + slot * (i + 0.5), label: l })) }),
    values.map((v, i) => h("rect", {
      key: i, x: PAD.l + slot * i + slot * 0.2, width: slot * 0.6,
      y: Math.min(y(v), y(0)), height: Math.abs(y(v) - y(0)), fill: color || PALETTE[0],
    }, h("title", null, `${labels[i]}: ${v}`)))
  );
}

export default BarChart;
