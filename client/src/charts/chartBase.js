// Shared pieces of the hand-written SVG charts: size, colors, scales and the axis frame.
// Gridline and text colors come from CSS (.chart-grid, .chart-tick, .chart-label in index.css).
import { createElement as h } from "react";

export const W = 560, H = 300, PAD = { l: 44, r: 16, t: 16, b: 36 };
// Series colors for the dark background, always used in this order (blue, orange, aqua, yellow,
// magenta, green, violet, red). Checked for color-blind safety and contrast on the dark cards.
export const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

// map data value -> pixel
export function scale(min, max, from, to) {
  const span = max - min || 1;
  return (v) => from + ((v - min) / span) * (to - from);
}

export function niceRange(values, padFrac) {
  if (!values.length) return [0, 1];
  const min = Math.min(...values), max = Math.max(...values);
  const pad = (max - min || 1) * (padFrac || 0.1);
  return [min - pad, max + pad];
}

export function ticks(min, max, n) {
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

// Grid lines, axis numbers and axis labels. Returns an array of SVG elements (call it, don't h() it).
//   wrap: true -> x labels split over two lines (for long bar labels)
export function Frame(props) {
  const { yMin, yMax, y, xTicks, yLabel, xLabel, wrap } = props;
  const decimals = yMax - yMin < 10 ? 1 : 0;
  return [
    ...ticks(yMin, yMax, 4).map((v, i) => h("g", { key: "y" + i },
      h("line", { className: "chart-grid", x1: PAD.l, x2: W - PAD.r, y1: y(v), y2: y(v) }),
      h("text", { className: "chart-tick", x: PAD.l - 6, y: y(v) + 4, textAnchor: "end", fontSize: 11 }, v.toFixed(decimals))
    )),
    ...xTicks.map((t, i) => h("text", { key: "x" + i, className: "chart-tick", x: t.x, y: H - PAD.b + 16, textAnchor: "middle", fontSize: 11 },
      wrap ? twoLines(t.label).map((line, j) => h("tspan", { key: j, x: t.x, dy: j ? 12 : 0 }, line)) : t.label)),
    xLabel && h("text", { key: "xl", className: "chart-label", x: (W + PAD.l) / 2, y: H - 4, textAnchor: "middle", fontSize: 12 }, xLabel),
    yLabel && h("text", { key: "yl", className: "chart-label", x: 12, y: H / 2, textAnchor: "middle", fontSize: 12, transform: `rotate(-90 12 ${H / 2})` }, yLabel),
  ];
}
