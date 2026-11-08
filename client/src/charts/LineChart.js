// Line chart, one line per series. Use null for a missing value (the line skips it).
//   h(LineChart, { labels: ["T1", "T2"], series: [{ name: "Actual", values: [70, 75] }], yLabel: "Score" })
// A series can set dashed: true and color.
import { createElement as h } from "react";
import { W, H, PAD, PALETTE, scale, niceRange, Frame } from "./chartBase.js";

function Legend(props) {
  return h("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, margin: "4px 0 0 44px" } },
    props.items.map((it, i) => h("span", { key: i, style: { display: "inline-flex", alignItems: "center", gap: 5 } },
      h("span", { style: { width: 14, height: 3, background: it.color, borderTop: it.dashed ? `3px dashed ${it.color}` : null, display: "inline-block" } }),
      it.name)));
}

function LineChart(props) {
  const { labels, yLabel } = props;
  const series = props.series.map((s, i) => ({ ...s, color: s.color || PALETTE[i % PALETTE.length] }));
  const [yMin, yMax] = niceRange(series.flatMap((s) => s.values.filter((v) => v != null)));
  const x = scale(0, Math.max(1, labels.length - 1), PAD.l, W - PAD.r);
  const y = scale(yMin, yMax, H - PAD.b, PAD.t);
  return h("div", null,
    series.length > 1 && h(Legend, { items: series }),
    h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" },
      Frame({ yMin, yMax, y, yLabel, xTicks: labels.map((l, i) => ({ x: x(i), label: l })) }),
      series.map((s, si) => {
        const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
        return h("g", { key: si },
          h("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: s.color, strokeWidth: 2, strokeDasharray: s.dashed ? "6 4" : null }),
          s.values.map((v, i) => v == null ? null :
            h("circle", { key: i, cx: x(i), cy: y(v), r: 4, fill: s.color },
              h("title", null, `${s.name} ${labels[i]}: ${v}`)))
        );
      })
    )
  );
}

export default LineChart;
