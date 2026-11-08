const express = require("express");
const { pool } = require("../db");
const { FEATURES } = require("../ml/config");
const { loadTermScores, loadFactorLogs, key, LOG_FIELDS } = require("../ml/dataset");
const engine = require("../ml/engine");

const router = express.Router();

// Lets async handlers pass errors to the error middleware (Express 4 doesn't do this by itself)
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const round = (v) => (v == null ? null : Math.round(v * 10) / 10);
const avg = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const badRequest = (res, msg) => res.status(400).json({ error: msg });
const toInt = (v) => (v == null || v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN);

// ---------- students ----------
router.get("/students", ah(async (req, res) => {
  const [rows] = await pool.query("SELECT id, name, class_name AS className FROM students ORDER BY name, id");
  res.json(rows);
}));

router.post("/students", ah(async (req, res) => {
  const { name, className } = req.body;
  if (!name || !String(name).trim()) return badRequest(res, "name is required");
  const [r] = await pool.query("INSERT INTO students (name, class_name) VALUES (?, ?)", [String(name).trim(), className || ""]);
  res.status(201).json({ id: r.insertId, name: String(name).trim(), className: className || "" });
}));

// One student with term-by-term actual scores, predictions and factors
router.get("/students/:id", ah(async (req, res) => {
  const id = toInt(req.params.id);
  if (!Number.isInteger(id)) return badRequest(res, "Invalid student id");
  const [[student]] = await pool.query("SELECT id, name, class_name AS className FROM students WHERE id = ?", [id]);
  if (!student) return res.status(404).json({ error: "Student not found" });
  const [factors, [predictions], termScores] = await Promise.all([
    loadFactorLogs({ studentId: id }),
    pool.query("SELECT term, predicted FROM predictions WHERE student_id = ?", [id]),
    loadTermScores({ studentId: id }),
  ]);
  const terms = [...new Set([
    ...factors.map((f) => f.term),
    ...predictions.map((p) => p.term),
    ...[...termScores.keys()].map((k) => Number(k.split(":")[1])),
  ])].sort((a, b) => a - b);
  res.json({
    student,
    terms: terms.map((t) => {
      const p = predictions.find((x) => x.term === t);
      return {
        term: t,
        actual: round(termScores.get(key(id, t))),
        predicted: p ? round(p.predicted) : null,
        factors: factors.find((f) => f.term === t) || null,
      };
    }),
  });
}));

// ---------- assessments ----------
router.get("/assessments", ah(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.student) { where.push("student_id = ?"); params.push(toInt(req.query.student)); }
  if (req.query.term) { where.push("term = ?"); params.push(toInt(req.query.term)); }
  const [rows] = await pool.query(
    `SELECT id, student_id AS student, term, type, subject, date, score, max_score AS maxScore
     FROM assessments ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY term, date, id`,
    params
  );
  res.json(rows);
}));

router.post("/assessments", ah(async (req, res) => {
  const { student, term, type, subject, date, score, maxScore } = req.body;
  if (student == null || term == null || !type || score == null || maxScore == null) {
    return badRequest(res, "student, term, type, score and maxScore are required");
  }
  if (!["quiz", "monthly", "semester", "yearly"].includes(type)) {
    return badRequest(res, "type must be one of: quiz, monthly, semester, yearly");
  }
  const [r] = await pool.query(
    "INSERT INTO assessments (student_id, term, type, subject, date, score, max_score) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [student, term, type, subject || "", date || null, score, maxScore]
  );
  res.status(201).json({ id: r.insertId, student, term, type, subject: subject || "", date: date || null, score, maxScore });
}));

// ---------- factors (one per student per term, upsert) ----------
router.get("/factors", ah(async (req, res) => {
  res.json(await loadFactorLogs({
    studentId: req.query.student ? toInt(req.query.student) : null,
    term: req.query.term ? toInt(req.query.term) : null,
  }));
}));

// studyHours, sleepHours, attendance and parentSupport are required; the other factors are optional.
// It's a full replace: a factor you leave out is cleared. (All factor names: LOG_FIELDS in ml/dataset.js)
router.put("/factors", ah(async (req, res) => {
  const { student, term } = req.body;
  const required = ["student", "term"].concat(LOG_FIELDS.filter((f) => f.required).map((f) => f.key));
  const missing = required.filter((k) => req.body[k] == null);
  if (missing.length) return badRequest(res, `Missing: ${missing.join(", ")}`);
  const columns = LOG_FIELDS.map((f) => f.column);
  const values = LOG_FIELDS.map((f) => (req.body[f.key] == null ? null : req.body[f.key]));
  await pool.query(
    `INSERT INTO factor_logs (student_id, term, ${columns.join(", ")})
     VALUES (?, ?, ${columns.map(() => "?").join(", ")})
     ON DUPLICATE KEY UPDATE ${columns.map((c) => `${c} = VALUES(${c})`).join(", ")}`,
    [student, term, ...values]
  );
  const [log] = await loadFactorLogs({ studentId: student, term });
  res.json(log);
}));

// ---------- model ----------
router.get("/features", (req, res) => res.json(FEATURES));

// Replays past terms to see which factors lower the live error. Saves nothing.
router.get("/features/check", ah(async (req, res) => {
  res.json(await engine.checkFeatures());
}));

router.get("/models", ah(async (req, res) => {
  res.json(await engine.listModels());
}));

router.post("/models/train", ah(async (req, res) => {
  const term = req.body.term != null ? toInt(req.body.term) : undefined;
  if (Number.isNaN(term)) return badRequest(res, "term must be a whole number");
  res.status(201).json(await engine.train(term));
}));

// ---------- predictions ----------
router.post("/predictions/run", ah(async (req, res) => {
  const term = toInt(req.body.term);
  if (!Number.isInteger(term) || term < 1) return badRequest(res, "term is required (a whole number >= 1)");
  res.json(await engine.runPredictions(term));
}));

router.post("/scenario", ah(async (req, res) => {
  const { studentId, term, overrides } = req.body;
  if (studentId == null || term == null) return badRequest(res, "studentId and term are required");
  res.json(await engine.scenario(toInt(studentId), toInt(term), overrides || {}));
}));

// ---------- dashboard summary ----------
router.get("/dashboard", ah(async (req, res) => {
  const [[[{ studentCount }]], logs, [predictions], models, termScores] = await Promise.all([
    pool.query("SELECT COUNT(*) AS studentCount FROM students"),
    loadFactorLogs(),
    pool.query("SELECT student_id AS student, term, predicted FROM predictions"),
    engine.listModels(),
    loadTermScores(),
  ]);

  const scoredTerms = [...new Set([...termScores.keys()].map((k) => Number(k.split(":")[1])))];
  const terms = [...new Set([...scoredTerms, ...predictions.map((p) => p.term)])].sort((a, b) => a - b);

  // class average actual vs predicted, and prediction error per term
  const byTerm = terms.map((t) => {
    const actuals = [...termScores].filter(([k]) => Number(k.split(":")[1]) === t).map(([, v]) => v);
    const preds = predictions.filter((p) => p.term === t);
    const errors = preds
      .map((p) => {
        const a = termScores.get(key(p.student, t));
        return a == null ? null : Math.abs(a - p.predicted);
      })
      .filter((e) => e != null);
    return {
      term: t,
      actual: round(avg(actuals)),
      predicted: round(avg(preds.map((p) => p.predicted))),
      mae: round(avg(errors)),
    };
  });

  // sleep vs score for the latest term with results
  const latest = scoredTerms.length ? Math.max(...scoredTerms) : null;
  const sleepVsScore = logs
    .filter((l) => l.term === latest && termScores.has(key(l.student, l.term)))
    .map((l) => ({ x: l.sleepHours, y: round(termScores.get(key(l.student, l.term))) }));

  res.json({
    studentCount,
    latestScoredTerm: latest,
    features: FEATURES,
    byTerm,
    sleepVsScore,
    activeModel: models.find((m) => m.isActive) || null,
    weightHistory: models.map((m) => ({ version: m.version, term: m.trainedThroughTerm, coefStd: m.coefStd })),
  });
}));

module.exports = router;
