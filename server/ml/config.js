// Settings for the prediction engine. Change these to tune how it learns.

// Every factor the engine knows about.
//   key    = field name used in the data
//   label  = shown on the dashboard
//   use    = true: the model learns a weight for it on the next retrain
//            false: a candidate - "Check factors" on the Model page tests whether it would help
//   source = "log": entered per term in factor_logs (can be changed in "What if")
//            "history": computed from the student's past results (can't be changed)
//
// Workflow for a candidate: run the check, set use: true only if it clearly lowers the live error,
// then retrain. Keep the total around 8-10 factors for ~80 students.
const FEATURES = [
  { key: "studyHours", label: "Study h/day", use: true, source: "log" },
  { key: "sleepHours", label: "Sleep h/day", use: true, source: "log" },
  { key: "attendance", label: "Attendance %", use: true, source: "log" },
  { key: "parentSupport", label: "Parent support", use: true, source: "log" },
  // score in the previous term
  { key: "prevScore", label: "Prev score", use: true, source: "history" },
  // points per term over the last 2-3 terms (0 when only one past term exists)
  { key: "scoreTrend", label: "Score trend", use: false, source: "history" },
  // last term: quiz average % minus exam average % (0 when either is missing)
  { key: "quizExamGap", label: "Quiz-exam gap", use: false, source: "history" },
  // % of this term's homework handed in
  { key: "homeworkPct", label: "Homework %", use: false, source: "log" },
  // number of late or missing assignments this term
  { key: "lateMissing", label: "Late/missing", use: false, source: "log" },

  // --- school records ---
  // average % of this term's first quizzes (first 4-5 weeks). Only useful if you predict after them.
  { key: "earlyQuizPct", label: "Early quiz %", use: false, source: "log" },
  // last term: number of assessments below PASS_MARK
  { key: "failedLastTerm", label: "Failed tests (last term)", use: false, source: "history" },
  // times late to class this term
  { key: "lateArrivals", label: "Late to class", use: false, source: "log" },
  // teacher's rating, 1-5
  { key: "participation", label: "Participation", use: false, source: "log" },
  // logins per week on the class website / online platform
  { key: "onlineLogins", label: "Online logins/wk", use: false, source: "log" },

  // --- short student survey ---
  // all 1-5 except target score (%) and screen time (hours/day)
  { key: "confidence", label: "Self-confidence", use: false, source: "log" },
  { key: "motivation", label: "Motivation", use: false, source: "log" },
  { key: "studySkills", label: "Study skills", use: false, source: "log" },
  { key: "targetScore", label: "Target score %", use: false, source: "log" },
  { key: "screenHours", label: "Screen h/day", use: false, source: "log" },
];

// An assessment below this % counts as failed (for "Failed tests (last term)")
const PASS_MARK = 50;

// How much each assessment type counts toward a student's term score.
// A term score = weighted average of all assessment percentages in that term.
const TYPE_WEIGHTS = { quiz: 1, monthly: 2, semester: 3, yearly: 4 };

// How much older terms count when retraining.
// 1 term old counts 0.6x, 2 terms old 0.36x, ...  Lower = follows changes faster but noisier.
const RECENCY_DECAY = 0.6;

// Ridge strength. Pulls weights slightly toward 0 so they don't swing wildly
// when there is little data. 0 = plain least squares.
const RIDGE_LAMBDA = 1.0;

// "Check factors" only advises adding a factor if it lowers the live error by at least this many
// points (and by more than 2x the noise). Smaller gains aren't worth the extra data entry.
const MIN_GAIN = 0.1;

module.exports = { FEATURES, PASS_MARK, TYPE_WEIGHTS, RECENCY_DECAY, RIDGE_LAMBDA, MIN_GAIN };
