// "What if" for one student and term: change factors, see the prediction move. Saves nothing.
// The fields come from the active model: only factors it uses that are entered per term.
import { createElement as h, useState, useEffect } from "react";
import { api } from "../api.js";
import { fmt } from "../format.js";
import Card from "./Card.js";

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

export default WhatIf;
