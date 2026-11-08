// "Check factors": replays past terms with and without each factor. Saves nothing.
import { createElement as h, useState } from "react";
import { api } from "../api.js";
import { fmt } from "../format.js";
import Card from "./Card.js";

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

export default FactorCheck;
