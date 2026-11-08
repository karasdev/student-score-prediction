// Model: retrain / run predictions, weight history, factor check, list of model versions.
import { createElement as h, useState, useEffect } from "react";
import { api } from "../api.js";
import { fmt } from "../format.js";
import Card from "../components/Card.js";
import FactorCheck from "../components/FactorCheck.js";
import LineChart from "../charts/LineChart.js";

function ModelPage() {
  const [models, setModels] = useState(null);
  const [features, setFeatures] = useState([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [predictTerm, setPredictTerm] = useState("");
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    Promise.all([api("/models"), api("/features")]).then(([ms, fs]) => {
      setModels(ms);
      setFeatures(fs);
      const active = ms.find((m) => m.isActive);
      if (active && !predictTerm) setPredictTerm(String(active.trainedThroughTerm + 1));
    }).catch((e) => setLoadError(e.message));
  }, [reload]);

  // run an action, show its message, then reload the models
  function act(fn) {
    setBusy(true);
    setMessage(null);
    fn()
      .then((text) => setMessage({ ok: true, text }))
      .catch((e) => setMessage({ ok: false, text: e.message }))
      .finally(() => { setBusy(false); setReload(reload + 1); });
  }
  const retrain = () => act(() => api("/models/train", { method: "POST", body: {} })
    .then((m) => `Trained v${m.version} on ${m.rows} rows through T${m.trainedThroughTerm}.`));
  const predict = () => act(() => api("/predictions/run", { method: "POST", body: { term: Number(predictTerm) } })
    .then((r) => `Predicted T${r.term} for ${r.count} students with model v${r.modelVersion}.` +
      (r.skipped ? ` Skipped ${r.skipped} (no previous score, or a factor the model uses is empty).` : "")));

  if (loadError) return h("p", { className: "error" }, loadError);
  if (!models) return h("p", null, "Loading...");
  return h("div", { className: "grid" },
    h(Card, { title: "Actions", hint: "After a term's results are entered: retrain, then predict the next term." },
      h("p", null, h("button", { className: "btn", disabled: busy, onClick: retrain }, "Retrain on latest results")),
      h("p", null, "Predict term ",
        h("input", { type: "number", min: 1, value: predictTerm, onChange: (e) => setPredictTerm(e.target.value) }), " ",
        h("button", { className: "btn", disabled: busy || !predictTerm, onClick: predict }, "Run predictions")),
      message && h("p", { className: message.ok ? "ok" : "error" }, message.text)),
    models.length > 0 && h(Card, { title: "How the weights changed", hint: "Per 1 standard deviation, one point per retrain." },
      h(LineChart, {
        labels: models.map((m) => `v${m.version}·T${m.trainedThroughTerm}`),
        // a model that didn't use a factor has no point for it
        series: features.filter((f) => models.some((m) => m.features.includes(f.key))).map((f) => ({
          name: f.label,
          values: models.map((m) => {
            const j = m.features.indexOf(f.key);
            return j < 0 ? null : Math.round(m.coefStd[j] * 100) / 100;
          }),
        })),
      })),
    h(FactorCheck),
    h(Card, { title: "Model versions" },
      h("table", null,
        h("thead", null, h("tr", null, ["Version", "Through", "Rows", "Train error", "Live error", "Active"].map((c) => h("th", { key: c }, c)))),
        h("tbody", null, models.slice().reverse().map((m) => h("tr", { key: m.version },
          h("td", null, "v" + m.version), h("td", null, "T" + m.trainedThroughTerm), h("td", null, m.rows),
          h("td", null, fmt(m.trainMae)), h("td", null, fmt(m.liveMae)), h("td", null, m.isActive ? "✓" : ""))))),
      h("p", { className: "hint", style: { marginTop: 8 } },
        "Live error = how far off the previous model was on this term, before it saw the results. That's the honest accuracy number."))
  );
}

export default ModelPage;
