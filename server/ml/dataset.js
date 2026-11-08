// Turns raw assessments + factor logs into training rows: { student, term, x: {...factors}, y }
const { pool } = require("../db");
const { TYPE_WEIGHTS } = require("./config");

const key = (studentId, term) => `${studentId}:${term}`;

// How many past terms the "history" factors look back (score trend uses up to 3)
const HISTORY_TERMS = 3;

// Columns of factor_logs, renamed to the names the model uses
const FACTOR_COLUMNS = `student_id AS student, term, study_hours AS studyHours, sleep_hours AS sleepHours,
  attendance, parent_support AS parentSupport, homework_pct AS homeworkPct, late_missing AS lateMissing`;

// filter: { studentId, term, minTerm, maxTerm } - all optional
function whereClause(f, params) {
  const where = [];
  if (f.studentId != null) { where.push("student_id = ?"); params.push(f.studentId); }
  if (f.term != null) { where.push("term = ?"); params.push(f.term); }
  if (f.minTerm != null) { where.push("term >= ?"); params.push(f.minTerm); }
  if (f.maxTerm != null) { where.push("term <= ?"); params.push(f.maxTerm); }
  return where.length ? "WHERE " + where.join(" AND ") : "";
}

// Map "studentId:term" -> { score, quizAvg, examAvg }
//   score   = term score (weighted average % of that term's assessments)
//   quizAvg = average % of quizzes, examAvg = weighted average % of everything else (null if none)
async function loadTermStats(filter) {
  const types = Object.keys(TYPE_WEIGHTS);
  const weightCase = `CASE type ${types.map(() => "WHEN ? THEN ?").join(" ")} ELSE 1 END`;
  const params = types.flatMap((t) => [t, TYPE_WEIGHTS[t]]);
  const where = whereClause(filter || {}, params);
  const sql = `
    SELECT student_id, term,
           SUM(w * pct) / SUM(w) AS term_score,
           AVG(CASE WHEN type = 'quiz' THEN pct END) AS quiz_avg,
           SUM(CASE WHEN type <> 'quiz' THEN w * pct END) / SUM(CASE WHEN type <> 'quiz' THEN w END) AS exam_avg
    FROM (SELECT student_id, term, type, score / max_score * 100 AS pct, ${weightCase} AS w
          FROM assessments ${where}) a
    GROUP BY student_id, term`;
  const [rows] = await pool.query(sql, params);
  const num = (v) => (v == null ? null : Number(v));
  const stats = new Map();
  for (const r of rows) {
    stats.set(key(r.student_id, r.term), { score: num(r.term_score), quizAvg: num(r.quiz_avg), examAvg: num(r.exam_avg) });
  }
  return stats;
}

// Map "studentId:term" -> term score
async function loadTermScores(filter) {
  const stats = await loadTermStats(filter);
  const scores = new Map();
  for (const [k, s] of stats) scores.set(k, s.score);
  return scores;
}

// Least-squares slope (points per term) of the scores in the last HISTORY_TERMS terms before `term`
function scoreTrend(student, term, stats) {
  const pts = [];
  for (let t = term - HISTORY_TERMS; t < term; t++) {
    const s = stats.get(key(student, t));
    if (s) pts.push([t, s.score]);
  }
  if (pts.length < 2) return 0; // not enough history: assume flat
  const mt = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const ms = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const num = pts.reduce((s, p) => s + (p[0] - mt) * (p[1] - ms), 0);
  const den = pts.reduce((s, p) => s + (p[0] - mt) ** 2, 0);
  return num / den;
}

// Values of every known factor for one student-term. Uses only the factor log of that term
// and results from EARLIER terms (what is known before the term's results come in).
// Returns null if there is no previous-term score. A factor not recorded is null.
function allFeatures(log, stats) {
  const prev = stats.get(key(log.student, log.term - 1));
  if (!prev) return null;
  return {
    studyHours: log.studyHours,
    sleepHours: log.sleepHours,
    attendance: log.attendance,
    parentSupport: log.parentSupport,
    homeworkPct: log.homeworkPct,
    lateMissing: log.lateMissing,
    prevScore: prev.score,
    scoreTrend: scoreTrend(log.student, log.term, stats),
    quizExamGap: prev.quizAvg != null && prev.examAvg != null ? prev.quizAvg - prev.examAvg : 0,
  };
}

// Just the factors in `keys`. Returns null if any of them is missing.
function featuresFor(log, stats, keys) {
  const all = allFeatures(log, stats);
  if (!all) return null;
  const x = {};
  for (const k of keys) {
    if (all[k] == null) return null;
    x[k] = all[k];
  }
  return x;
}

async function loadFactorLogs(filter) {
  const params = [];
  const where = whereClause(filter || {}, params);
  const [rows] = await pool.query(`SELECT ${FACTOR_COLUMNS} FROM factor_logs ${where} ORDER BY term`, params);
  return rows;
}

// Everything needed to build rows for terms <= throughTerm
async function loadData(throughTerm) {
  const [logs, stats] = await Promise.all([
    loadFactorLogs({ maxTerm: throughTerm }),
    loadTermStats({ maxTerm: throughTerm }),
  ]);
  return { logs, stats };
}

// Training rows for the factors in `keys`: every student-term with those factors, a previous score
// and an actual score.
function rowsFrom(data, keys) {
  const rows = [];
  for (const log of data.logs) {
    const x = featuresFor(log, data.stats, keys);
    const actual = data.stats.get(key(log.student, log.term));
    if (x && actual) rows.push({ student: log.student, term: log.term, x, y: actual.score });
  }
  return rows;
}

async function buildRows(throughTerm, keys) {
  return rowsFrom(await loadData(throughTerm), keys);
}

// Latest term that has any assessment results
async function latestScoredTerm() {
  const [rows] = await pool.query("SELECT MAX(term) AS term FROM assessments");
  return rows[0].term;
}

module.exports = {
  key, HISTORY_TERMS, loadTermStats, loadTermScores, loadFactorLogs, featuresFor,
  loadData, rowsFrom, buildRows, latestScoredTerm,
};
