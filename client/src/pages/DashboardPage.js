// Dashboard: summary tiles, class average actual vs predicted, sleep vs score, learned weights.
import { createElement as h, useState, useEffect } from "react";
import { api } from "../api.js";
import { fmt } from "../format.js";
import Card from "../components/Card.js";
import Stat from "../components/Stat.js";
import LineChart from "../charts/LineChart.js";
import ScatterChart from "../charts/ScatterChart.js";
import BarChart from "../charts/BarChart.js";

function DashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api("/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return h("p", { className: "error" }, error);
  if (!data) return h("p", null, "Loading...");

  const m = data.activeModel;
  const labels = data.byTerm.map((t) => "T" + t.term);
  const labelOf = (k) => (data.features.find((f) => f.key === k) || { label: k }).label;
  const lastLive = data.byTerm.filter((t) => t.mae != null).slice(-1)[0];

  return h("div", null,
    h("div", { className: "stats" },
      h(Stat, { label: "Students", value: data.studentCount }),
      h(Stat, { label: "Latest term with results", value: data.latestScoredTerm ? "T" + data.latestScoredTerm : "–" }),
      h(Stat, { label: "Active model", value: m ? `v${m.version} (through T${m.trainedThroughTerm})` : "none" }),
      h(Stat, { label: lastLive ? `Avg prediction error, T${lastLive.term}` : "Avg prediction error", value: lastLive ? fmt(lastLive.mae) + " pts" : "–" })
    ),
    h("div", { className: "grid" },
      h(Card, { title: "Class average: actual vs predicted", hint: "Predictions are made before each term's results come in." },
        h(LineChart, { labels, yLabel: "Score %", series: [
          { name: "Actual", values: data.byTerm.map((t) => t.actual) },
          { name: "Predicted", values: data.byTerm.map((t) => t.predicted), dashed: true },
        ] })),
      h(Card, { title: `Sleep vs score (T${data.latestScoredTerm || "?"})`, hint: "Each dot is a student." },
        h(ScatterChart, { points: data.sleepVsScore, xLabel: "Sleep (h/day)", yLabel: "Score %" })),
      m && h(Card, { title: "What the model learned", hint: "Score points per 1 standard deviation of each factor, so the bars are comparable." },
        h(BarChart, { labels: m.features.map(labelOf), values: m.coefStd.map((v) => Math.round(v * 100) / 100) })),
      m && h(Card, { title: "Weights in real units" },
        h("table", null,
          h("thead", null, h("tr", null, h("th", null, "Factor"), h("th", null, "Points per 1 unit"), h("th", null, "Per 1 std dev"))),
          h("tbody", null, m.features.map((k, i) => h("tr", { key: k },
            h("td", null, labelOf(k)), h("td", null, fmt(m.coefRaw[i], 2)), h("td", null, fmt(m.coefStd[i], 2)))))),
        h("p", { className: "hint", style: { marginTop: 8 } },
          "These show association, not cause: a big weight doesn't mean changing that factor will change the score by that much."))
    )
  );
}

export default DashboardPage;
