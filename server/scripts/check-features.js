// Which factors lower the live error? Replays past terms with and without each factor. Saves nothing.
//   npm run features:check
// To apply the result: set use: true/false in ml/config.js, then retrain.
const { pool } = require("../db");
const engine = require("../ml/engine");

const f2 = (v) => (v == null ? "-" : v.toFixed(2));

async function main() {
  const r = await engine.checkFeatures();
  console.log(`Replayed terms ${r.evalTerms.join(", ")} (${r.predictions} predictions).`);
  console.log(`Live error now:            ${f2(r.current.liveMae)} pts  [${r.current.features.join(", ")}]`);
  console.log(`Live error, recommended:   ${f2(r.recommended.liveMae)} pts  [${r.recommended.features.join(", ")}]`);
  console.log("");
  console.log("Gain = how much lower the live error is WITH the factor (pts). Needs > 2x noise to count.");
  console.table(r.factors.map((f) => ({
    factor: f.label,
    "in use": f.use ? "yes" : "",
    gain: f2(f.gain),
    "± noise": f2(f.se),
    verdict: f.verdict,
    advice: f.advice,
  })));
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
