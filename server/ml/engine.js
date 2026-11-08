// The term loop: train on results, predict next term, compare when results arrive.
const { pool } = require("../db");
const { FEATURES, RECENCY_DECAY, RIDGE_LAMBDA } = require("./config");
const { fit, predict, mae } = require("./regression");
const {
  key, HISTORY_TERMS, loadTermStats, loadFactorLogs, featuresFor, loadData, rowsFrom, latestScoredTerm,
} = require("./dataset");

// Factors the next retrain will use (use: true in config.js)
const usedKeys = FEATURES.filter((f) => f.use).map((f) => f.key);
const featureInfo = (k) => FEATURES.find((f) => f.key === k) || { key: k, label: k, source: "history" };

// Errors meant for the user (bad data, missing setup) - the API returns them as 400
const userError = (msg) => Object.assign(new Error(msg), { status: 400 });

// model_versions row -> object the regression code understands
function rowToModel(r) {
  return {
    version: r.version,
    trainedThroughTerm: r.trained_through_term,
    features: r.features,
    means: r.means,
    stds: r.stds,
    intercept: r.intercept,
    coefStd: r.coef_std,
    coefRaw: r.coef_raw,
    rawIntercept: r.raw_intercept,
    rows: r.rows_used,
    trainMae: r.train_mae,
    liveMae: r.live_mae,
    settings: { recencyDecay: r.recency_decay, ridgeLambda: r.ridge_lambda },
    isActive: !!r.is_active,
    createdAt: r.created_at,
  };
}

async function listModels() {
  const [rows] = await pool.query("SELECT * FROM model_versions ORDER BY version");
  return rows.map(rowToModel);
}

async function getActiveModel() {
  const [rows] = await pool.query("SELECT * FROM model_versions WHERE is_active = TRUE LIMIT 1");
  return rows.length ? rowToModel(rows[0]) : null;
}

// Retrain using every term up to `throughTerm` (default: latest term with results).
// Recent terms count more (RECENCY_DECAY). The new model becomes active.
async function train(throughTerm) {
  const term = throughTerm || (await latestScoredTerm());
  if (!term) throw userError("No assessment results yet - add scores before training");

  const data = await loadData(term);
  const rows = rowsFrom(data, usedKeys);
  const sampleWeights = rows.map((r) => RECENCY_DECAY ** (term - r.term));
  const m = fit(rows, usedKeys, { sampleWeights, lambda: RIDGE_LAMBDA });

  // Honest accuracy: how well did the model we HAD predict this term, before seeing its results?
  // (It may use different factors than the new one, so build its rows separately.)
  const previous = await getActiveModel();
  let liveMae = null;
  if (previous && previous.trainedThroughTerm < term) {
    liveMae = mae(previous, rowsFrom(data, previous.features).filter((r) => r.term === term));
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[last]] = await conn.query("SELECT COALESCE(MAX(version), 0) AS v FROM model_versions FOR UPDATE");
    const version = last.v + 1;
    await conn.query("UPDATE model_versions SET is_active = FALSE WHERE is_active = TRUE");
    await conn.query(
      `INSERT INTO model_versions
        (version, trained_through_term, features, means, stds, intercept, coef_std, coef_raw, raw_intercept,
         rows_used, train_mae, live_mae, recency_decay, ridge_lambda, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        version, term, JSON.stringify(m.features), JSON.stringify(m.means), JSON.stringify(m.stds), m.intercept,
        JSON.stringify(m.coefStd), JSON.stringify(m.coefRaw), m.rawIntercept,
        rows.length, m.trainMae, liveMae, RECENCY_DECAY, RIDGE_LAMBDA,
      ]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return getActiveModel();
}

// Results from the terms before `term` that the history factors need
const historyFilter = (term, studentId) => ({ studentId, minTerm: term - HISTORY_TERMS, maxTerm: term - 1 });

// Predict every student's score for `term` using the active model.
// Needs that term's factor logs and the previous term's scores.
async function runPredictions(term) {
  const model = await getActiveModel();
  if (!model) throw userError("No trained model yet - train first");
  const [logs, stats] = await Promise.all([loadFactorLogs({ term }), loadTermStats(historyFilter(term))]);
  const results = [];
  for (const log of logs) {
    const x = featuresFor(log, stats, model.features);
    if (x) results.push([log.student, term, model.version, predict(model, x)]);
  }
  if (results.length) {
    await pool.query(
      `INSERT INTO predictions (student_id, term, model_version, predicted) VALUES ?
       ON DUPLICATE KEY UPDATE model_version = VALUES(model_version), predicted = VALUES(predicted), created_at = CURRENT_TIMESTAMP`,
      [results]
    );
  }
  return {
    term,
    modelVersion: model.version,
    count: results.length,
    skipped: logs.length - results.length, // missing previous score or a factor the model uses
    results: results.map((r) => ({ student: r[0], predicted: r[3] })),
  };
}

// "What if" - predict with some factors changed. Saves nothing.
// Only factors entered per term (source "log") can be changed.
async function scenario(studentId, term, overrides) {
  const model = await getActiveModel();
  if (!model) throw userError("No trained model yet - train first");
  const [logs, stats] = await Promise.all([
    loadFactorLogs({ studentId, term }),
    loadTermStats(historyFilter(term, studentId)),
  ]);
  if (!logs.length) throw userError(`No factors recorded for this student in term ${term}`);
  if (!stats.has(key(studentId, term - 1))) throw userError(`No scores for this student in term ${term - 1}`);
  const base = featuresFor(logs[0], stats, model.features);
  if (!base) {
    const missing = model.features.filter((k) => logs[0][k] === null).map((k) => featureInfo(k).label);
    throw userError(`Missing factors for this student in term ${term}: ${missing.join(", ")}`);
  }
  const fields = model.features.map(featureInfo).filter((f) => f.source === "log").map((f) => ({ key: f.key, label: f.label }));
  const changed = { ...base };
  for (const f of fields) {
    const v = overrides[f.key];
    if (v != null && v !== "" && Number.isFinite(Number(v))) changed[f.key] = Number(v);
  }
  return {
    base,
    changed,
    fields,
    basePrediction: predict(model, base),
    scenarioPrediction: predict(model, changed),
    modelVersion: model.version,
  };
}

// ---------- checking factors ----------

// Replays the term loop with a given set of factors: for every term T, train on terms before T
// (exactly what a retrain after T-1 does), predict T, record the error. These are the live errors
// the model would have had. Returns Map "student:term" -> absolute error.
function replay(data, keys) {
  const rows = rowsFrom(data, keys);
  const errors = new Map();
  const terms = [...new Set(rows.map((r) => r.term))].sort((a, b) => a - b);
  for (const T of terms) {
    const trainRows = rows.filter((r) => r.term < T);
    const testRows = rows.filter((r) => r.term === T);
    if (!trainRows.length) continue;
    let m;
    try {
      const sampleWeights = trainRows.map((r) => RECENCY_DECAY ** (T - 1 - r.term));
      m = fit(trainRows, keys, { sampleWeights, lambda: RIDGE_LAMBDA });
    } catch (err) {
      if (err.status === 400) continue; // too few rows for this term - skip it
      throw err;
    }
    for (const r of testRows) errors.set(key(r.student, r.term), Math.abs(predict(m, r.x) - r.y));
  }
  return errors;
}

// How much lower is the live error with B than with A? Compared on the same predictions.
// "helps" only if the gain is bigger than about 2 standard errors - smaller gains are likely luck.
function compare(errorsA, errorsB) {
  const a = [], b = [];
  for (const [k, e] of errorsA) if (errorsB.has(k)) { a.push(e); b.push(errorsB.get(k)); }
  const n = a.length;
  if (n < 10) return { n, maeWithout: null, maeWith: null, gain: null, se: null, verdict: "not enough data" };
  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
  const diffs = a.map((v, i) => v - b[i]);
  const gain = mean(diffs);
  const se = Math.sqrt(diffs.reduce((s, d) => s + (d - gain) ** 2, 0) / (n - 1) / n);
  const verdict = gain > 2 * se ? "helps" : gain < -2 * se ? "hurts" : "no clear effect";
  return { n, maeWithout: mean(a), maeWith: mean(b), gain, se, verdict };
}

// Which factors lower the live error?
//  1) Start from the factors in use. Try adding each candidate; add the one that helps most.
//     Repeat until no candidate clearly helps.
//  2) For that set, report each factor's gain: live error without it minus live error with it.
// Saves nothing - change `use` in config.js and retrain to apply the result.
async function checkFeatures() {
  const lastTerm = await latestScoredTerm();
  if (!lastTerm) throw userError("No assessment results yet");
  const data = await loadData(lastTerm);

  const cache = new Map();
  const run = (keys) => {
    const id = keys.join(",");
    if (!cache.has(id)) cache.set(id, replay(data, keys));
    return cache.get(id);
  };
  const baseline = run(usedKeys);
  if (baseline.size < 10) throw userError("Need at least 3 terms of results to check factors");

  const chosen = usedKeys.slice();
  let remaining = FEATURES.filter((f) => !f.use).map((f) => f.key);
  while (remaining.length) {
    const current = run(chosen);
    const best = remaining
      .map((k) => ({ k, c: compare(current, run(chosen.concat(k))) }))
      .filter((t) => t.c.verdict === "helps")
      .sort((x, y) => y.c.gain - x.c.gain)[0];
    if (!best) break;
    chosen.push(best.k);
    remaining = remaining.filter((k) => k !== best.k);
  }

  const final = run(chosen);
  const factors = FEATURES.map((f) => {
    const inSet = chosen.includes(f.key);
    const c = inSet ? compare(run(chosen.filter((k) => k !== f.key)), final) : compare(final, run(chosen.concat(f.key)));
    // factors already in use are never dropped automatically - only flagged
    const advice = !inSet ? "" : !f.use ? "add" : c.verdict === "hurts" ? "consider dropping" : "keep";
    return { key: f.key, label: f.label, use: f.use, recommended: inSet, advice, ...c };
  });
  const evalTerms = [...new Set([...baseline.keys()].map((k) => Number(k.split(":")[1])))].sort((a, b) => a - b);
  const avg = (m) => [...m.values()].reduce((s, v) => s + v, 0) / m.size;
  return {
    evalTerms,
    predictions: baseline.size,
    current: { features: usedKeys, liveMae: avg(baseline) },
    recommended: { features: chosen, liveMae: avg(final) },
    factors,
  };
}

module.exports = { train, runPredictions, scenario, checkFeatures, getActiveModel, listModels };
