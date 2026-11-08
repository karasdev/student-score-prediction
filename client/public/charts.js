// Tiny SVG charts for React 18 without JSX or any chart library.
// Usage:
//   h(LineChart,    { labels: ["T1","T2"], series: [{ name: "Actual", values: [70, 75] }], yLabel: "Score" })
//   h(ScatterChart, { points: [{ x: 7.5, y: 80 }], xLabel: "Sleep (h)", yLabel: "Score" })
//   h(BarChart,     { labels: ["study", "sleep"], values: [5.2, 1.4] })
// Use null for a missing value in a line series.
// Wrapped in a function so its variables don't clash with other <script> files.
(function () {
  const { createElement: h } = React;

  const W = 560, H = 300, PAD = { l: 44, r: 16, t: 16, b: 36 };
  const PALETTE = ["#2563eb", "#f97316", "#16a34a", "#9333ea", "#dc2626", "#0891b2", "#ca8a04", "#db2777", "#4b5563", "#65a30d"];

  // map data value -> pixel
  function scale(min, max, from, to) {
    const span = max - min || 1;
    return (v) => from + ((v - min) / span) * (to - from);
  }
  function niceRange(values, padFrac) {
    if (!values.length) return [0, 1];
    const min = Math.min(...values), max = Math.max(...values);
    const pad = (max - min || 1) * (padFrac || 0.1);
    return [min - pad, max + pad];
  }
  function ticks(min, max, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(min + ((max - min) * i) / n);
    return out;
  }

  // "Parent support" -> ["Parent", "support"]: splits at the space nearest the middle
  function twoLines(label) {
    const mid = label.length / 2;
    let best = -1;
    for (let i = 0; i < label.length; i++) {
      if (label[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    }
    return best < 0 ? [label] : [label.slice(0, best), label.slice(best + 1)];
  }

  function Frame(props) {
    const { yMin, yMax, y, xTicks, yLabel, xLabel, wrap } = props;
    const decimals = yMax - yMin < 10 ? 1 : 0;
    return [
      ...ticks(yMin, yMax, 4).map((v, i) => h("g", { key: "y" + i },
        h("line", { x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v), stroke: "#e5e7eb" }),
        h("text", { x: PAD.l - 6, y: y(v) + 4, textAnchor: "end", fontSize: 11, fill: "#6b7280" }, v.toFixed(decimals))
      )),
      ...xTicks.map((t, i) => h("text", { key: "x" + i, x: t.x, y: H - PAD.b + 16, textAnchor: "middle", fontSize: 11, fill: "#6b7280" },
        wrap ? twoLines(t.label).map((line, j) => h("tspan", { key: j, x: t.x, dy: j ? 12 : 0 }, line)) : t.label)),
      xLabel && h("text", { key: "xl", x: (W + PAD.l) / 2, y: H - 4, textAnchor: "middle", fontSize: 12 }, xLabel),
      yLabel && h("text", { key: "yl", x: 12, y: H / 2, textAnchor: "middle", fontSize: 12, transform: `rotate(-90 12 ${H / 2})` }, yLabel),
    ];
  }

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

  function ScatterChart(props) {
    const { points, xLabel, yLabel, color } = props;
    const [xMin, xMax] = niceRange(points.map((p) => p.x));
    const [yMin, yMax] = niceRange(points.map((p) => p.y));
    const x = scale(xMin, xMax, PAD.l, W - PAD.r);
    const y = scale(yMin, yMax, H - PAD.b, PAD.t);
    const xTicks = ticks(xMin, xMax, 5).map((v) => ({ x: x(v), label: v.toFixed(1) }));
    return h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" },
      Frame({ yMin, yMax, y, xTicks, xLabel, yLabel }),
      points.map((p, i) => h("circle", { key: i, cx: x(p.x), cy: y(p.y), r: 4, fill: color || "#16a34a", fillOpacity: 0.6 },
        h("title", null, `${p.label ? p.label + ": " : ""}${p.x}, ${p.y}`)))
    );
  }

  function BarChart(props) {
    const { labels, values, color, yLabel } = props;
    const yMax = Math.max(0, ...values) * 1.1 || 1, yMin = Math.min(0, ...values) * 1.1;
    const y = scale(yMin, yMax, H - PAD.b, PAD.t);
    const slot = (W - PAD.l - PAD.r) / labels.length;
    return h("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%" },
      Frame({ yMin, yMax, y, yLabel, wrap: true, xTicks: labels.map((l, i) => ({ x: PAD.l + slot * (i + 0.5), label: l })) }),
      values.map((v, i) => h("rect", {
        key: i, x: PAD.l + slot * i + slot * 0.2, width: slot * 0.6,
        y: Math.min(y(v), y(0)), height: Math.abs(y(v) - y(0)), fill: color || "#9333ea",
      }, h("title", null, `${labels[i]}: ${v}`)))
    );
  }

  window.Charts = { LineChart, ScatterChart, BarChart, PALETTE };
})();
