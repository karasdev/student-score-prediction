// Dashboard UI: React 18 with createElement (no JSX, no build step).
// Only useState and useEffect.
(function () {
  const { createElement: h, useState, useEffect } = React;
  const { LineChart, ScatterChart, BarChart } = Charts;

  // ---------- helpers ----------
  async function api(path, options) {
    const opts = options || {};
    let res;
    try {
      res = await fetch(window.APP_CONFIG.API_URL + path, {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json" },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new Error(`Can't reach the API at ${window.APP_CONFIG.API_URL} - is the server running?`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }
  const fmt = (v, d) => (v == null ? "–" : Number(v).toFixed(d == null ? 1 : d));

  function Card(props) {
    return h("div", { className: "card", style: props.style },
      props.title && h("h3", null, props.title),
      props.hint && h("p", { className: "hint" }, props.hint),
      props.children);
  }
  function Stat(props) {
    return h("div", { className: "card stat" },
      h("div", { className: "value" }, props.value),
      h("div", { className: "label" }, props.label));
  }

  // ---------- Dashboard page ----------
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

  // ---------- Students page ----------
  function StudentsPage() {
    const [students, setStudents] = useState([]);
    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState(null);
    useEffect(() => {
      api("/students").then((list) => {
        setStudents(list);
        if (list.length) setSelected(list[0].id);
      }).catch((e) => setError(e.message));
    }, []);
    useEffect(() => {
      if (!selected) return;
      setDetail(null);
      api("/students/" + selected).then(setDetail).catch((e) => setError(e.message));
    }, [selected]);

    if (error) return h("p", { className: "error" }, error);
    return h("div", { className: "row" },
      h(Card, { style: { padding: 8 } },
        h("div", { className: "list" }, students.map((s) =>
          h("button", { key: s.id, className: s.id === selected ? "active" : "", onClick: () => setSelected(s.id) },
            s.name, h("span", { style: { color: "#9ca3af" } }, " · " + s.className))))),
      h("div", { style: { flex: 1 } }, detail ? h(StudentDetail, { detail }) : h("p", null, students.length ? "Loading..." : "No students yet."))
    );
  }

  // factor columns in the term table: [key, header]
  const LOG_COLUMNS = [
    ["studyHours", "Study"], ["sleepHours", "Sleep"], ["attendance", "Attend."], ["parentSupport", "Parents"],
    ["homeworkPct", "Homework"], ["lateMissing", "Late"],
  ];

  function StudentDetail(props) {
    const { student, terms } = props.detail;
    const nextTerm = terms.filter((t) => t.predicted != null && t.actual == null).slice(-1)[0];
    return h("div", { className: "grid" },
      h(Card, { title: student.name + " – actual vs predicted" },
        h(LineChart, { labels: terms.map((t) => "T" + t.term), yLabel: "Score %", series: [
          { name: "Actual", values: terms.map((t) => t.actual) },
          { name: "Predicted", values: terms.map((t) => t.predicted), dashed: true },
        ] })),
      h(Card, { title: "Term by term" },
        h("table", null,
          h("thead", null, h("tr", null, ["Term", "Actual", "Predicted"].concat(LOG_COLUMNS.map((c) => c[1])).map((c) => h("th", { key: c }, c)))),
          h("tbody", null, terms.map((t) => h("tr", { key: t.term },
            h("td", null, "T" + t.term), h("td", null, fmt(t.actual)), h("td", null, fmt(t.predicted)),
            LOG_COLUMNS.map(([k]) => h("td", { key: k }, t.factors && t.factors[k] != null ? t.factors[k] : "–"))))))),
      nextTerm && nextTerm.factors && h(WhatIf, { key: student.id + ":" + nextTerm.term, studentId: student.id, term: nextTerm.term })
    );
  }

  // The fields come from the active model: only factors it uses that are entered per term.
  function WhatIf(props) {
    const [info, setInfo] = useState(null); // { fields, base, basePrediction }
    const [values, setValues] = useState({});
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const ask = (overrides) =>
      api("/scenario", { method: "POST", body: { studentId: props.studentId, term: props.term, overrides } });

    useEffect(() => {
      ask({}).then((r) => {
        const v = {};
        r.fields.forEach((f) => { v[f.key] = r.base[f.key]; });
        setValues(v);
        setInfo(r);
      }).catch((e) => setError(e.message));
    }, []);

    function run() {
      setError(null);
      ask(values).then(setResult).catch((e) => setError(e.message));
    }

    const card = (...children) => h(Card, { title: `What if… (T${props.term})`, hint: "Change the factors and see how the prediction moves. Nothing is saved." }, ...children);
    if (!info) return card(error ? h("p", { className: "error" }, error) : h("p", null, "Loading..."));
    return card(
      info.fields.map((f) => h("label", { key: f.key }, f.label,
        h("input", { type: "number", step: "0.1", value: values[f.key], onChange: (e) => setValues({ ...values, [f.key]: e.target.value }) }))),
      h("button", { className: "btn", onClick: run }, "Predict"),
      error && h("p", { className: "error" }, error),
      result && h("p", null,
        `Current prediction: ${fmt(result.basePrediction)}  →  with changes: `,
        h("strong", null, fmt(result.scenarioPrediction)),
        ` (${result.scenarioPrediction >= result.basePrediction ? "+" : ""}${fmt(result.scenarioPrediction - result.basePrediction)})`)
    );
  }

  // Replays past terms with and without each factor. Saves nothing.
  function FactorCheck() {
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    function run() {
      setBusy(true);
      setError(null);
      api("/features/check").then(setResult).catch((e) => setError(e.message)).finally(() => setBusy(false));
    }
    const r = result;
    return h(Card, { title: "Check factors", hint: "Replays past terms with and without each factor and compares the live error. Saves nothing." },
      h("button", { className: "btn", disabled: busy, onClick: run }, busy ? "Checking..." : "Run check"),
      error && h("p", { className: "error" }, error),
      r && h("p", null,
        `Live error now ${fmt(r.current.liveMae, 2)} pts → with the recommended factors `,
        h("strong", null, fmt(r.recommended.liveMae, 2) + " pts"),
        ` (terms ${r.evalTerms.map((t) => "T" + t).join(", ")}, ${r.predictions} predictions).`),
      r && h("table", null,
        h("thead", null, h("tr", null, ["Factor", "In use", "Gain", "± noise", "Verdict", "Advice"].map((c) => h("th", { key: c }, c)))),
        h("tbody", null, r.factors.map((f) => h("tr", { key: f.key },
          h("td", null, f.label), h("td", null, f.use ? "✓" : ""),
          h("td", null, fmt(f.gain, 2)), h("td", null, fmt(f.se, 2)), h("td", null, f.verdict),
          h("td", null, h("strong", null, f.advice)))))),
      r && h("p", { className: "hint", style: { marginTop: 8 } },
        "Gain = how much lower the live error is with the factor (points). It counts only if it's more than 2× the noise. " +
        "\"No clear effect\" means too small to measure with this much data, not proven useless. " +
        "To apply: set use: true / false in server/ml/config.js, then retrain."));
  }

  // ---------- Model page ----------
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

  // ---------- App shell ----------
  function App() {
    const [page, setPage] = useState("dashboard");
    const pages = { dashboard: ["Dashboard", DashboardPage], students: ["Students", StudentsPage], model: ["Model", ModelPage] };
    return h("div", null,
      h("header", null,
        h("h1", null, "Student Score Prediction"),
        h("nav", null, Object.keys(pages).map((p) =>
          h("button", { key: p, className: p === page ? "active" : "", onClick: () => setPage(p) }, pages[p][0])))),
      h("main", null, h(pages[page][1]))
    );
  }

  ReactDOM.createRoot(document.getElementById("root")).render(h(App));
})();
