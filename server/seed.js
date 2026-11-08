// Creates demo data and runs the term-by-term loop, so the dashboard has something to show.
//
//   npm run seed          -> only runs on an empty database
//   npm run seed:reset    -> DELETES all students, scores, factors, models and predictions first
//
// The data is made up: scores follow hidden "true" weights that drift a little each term,
// so you can watch the engine re-learn them. Terms 1-4 have results; term 5 has factors only
// (that's the term being predicted).
//
// Candidate factors, to see what "Check factors" finds:
//   real hidden effect:   homework %, self-confidence, participation
//   look-alikes only:     late/missing (echoes homework %), late to class (echoes attendance),
//                         study skills / online logins / screen time (echo study hours),
//                         motivation (echoes confidence), target score (echoes last score)
//   computed from scores: early quiz % (first 2 quizzes of the term - part of the term score itself),
//                         failed tests last term, score trend, quiz-exam gap
// With this little data the check can pick a look-alike instead of the real factor - that's normal.
const { pool } = require("./db");
const engine = require("./ml/engine");

const N_STUDENTS = 80;
const TERMS_WITH_RESULTS = 4;
const PREDICT_TERM = 5;

// hidden truth: score = base + w·factors + noise   (study matters more each term, sleep a bit less)
const TRUE_WEIGHTS = {
  2: { studyHours: 4.0, sleepHours: 1.5, attendance: 0.1, parentSupport: 1.0, homeworkPct: 0.1, confidence: 1.5, participation: 0.8, prevScore: 0.45 },
  3: { studyHours: 4.5, sleepHours: 1.4, attendance: 0.1, parentSupport: 1.0, homeworkPct: 0.1, confidence: 1.5, participation: 0.8, prevScore: 0.45 },
  4: { studyHours: 5.0, sleepHours: 1.2, attendance: 0.1, parentSupport: 1.1, homeworkPct: 0.1, confidence: 1.5, participation: 0.8, prevScore: 0.45 },
  5: { studyHours: 5.5, sleepHours: 1.0, attendance: 0.1, parentSupport: 1.2, homeworkPct: 0.1, confidence: 1.5, participation: 0.8, prevScore: 0.45 },
};
const BASE = -7;

// seeded random numbers so every run gives the same data
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const uniform = (lo, hi) => lo + (hi - lo) * rand();
const normal = (sd) => sd * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;

const FIRST = ["Alex", "Bo", "Chen", "Dana", "Eli", "Fay", "Gus", "Hana", "Ivan", "Jia", "Kai", "Lena", "Mo", "Nia", "Omar", "Pia", "Quinn", "Rui", "Sam", "Tara"];
const LAST = ["Kim", "Lee", "Park", "Wang", "Garcia", "Smith", "Ng", "Ito"];

async function main() {
  const reset = process.argv.includes("--reset");
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM students");
  if (n && !reset) {
    console.log(`Database already has ${n} students. Run "npm run seed:reset" to wipe it and reseed.`);
    return;
  }
  if (reset) {
    // order matters because of foreign keys
    for (const t of ["predictions", "model_versions", "assessments", "factor_logs", "students"]) {
      await pool.query(`DELETE FROM ${t}`);
    }
    await pool.query("ALTER TABLE students AUTO_INCREMENT = 1");
    console.log("Cleared existing data.");
  }

  const studentRows = Array.from({ length: N_STUDENTS }, (_, i) => [
    `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`,
    i % 2 ? "10-A" : "10-B",
  ]);
  await pool.query("INSERT INTO students (name, class_name) VALUES ?", [studentRows]);
  const [students] = await pool.query("SELECT id FROM students ORDER BY id");

  const factorRows = [];
  const assessmentRows = [];
  for (const s of students) {
    // each student has their own habits, which wobble a bit from term to term
    const habit = {
      study: uniform(0.5, 4.5),
      sleep: uniform(5.5, 8.5),
      attendance: uniform(75, 99),
      parent: Math.round(uniform(1, 5)),
      homework: uniform(55, 98),
      confidence: uniform(1, 5),
      participation: uniform(1, 5),
      online: uniform(0.5, 4),
      screen: uniform(1.5, 6),
    };
    habit.motivation = 0.6 * habit.confidence + 0.4 * uniform(1, 5);
    let prevScore = uniform(45, 85); // term 1 score

    for (let term = 1; term <= PREDICT_TERM; term++) {
      const f = {
        studyHours: r1(clamp(habit.study + normal(0.5), 0, 8)),
        sleepHours: r1(clamp(habit.sleep + normal(0.4), 4, 10)),
        attendance: r1(clamp(habit.attendance + normal(3), 50, 100)),
        parentSupport: clamp(habit.parent + (rand() < 0.15 ? (rand() < 0.5 ? -1 : 1) : 0), 1, 5),
        homeworkPct: r1(clamp(habit.homework + normal(6), 0, 100)),
      };
      f.lateMissing = Math.max(0, Math.round((100 - f.homeworkPct) / 7 + normal(1.2)));
      const level = (v) => Math.round(clamp(v, 1, 5)); // 1-5 rating
      f.confidence = level(habit.confidence + (prevScore - 65) / 25 + normal(0.5));
      f.participation = level(habit.participation + normal(0.5));
      f.motivation = level(habit.motivation + normal(0.6));
      f.studySkills = level(1 + habit.study * 0.8 + normal(0.8));
      f.targetScore = r1(clamp(prevScore + uniform(0, 15) + normal(5), 30, 100));
      f.screenHours = r1(clamp(habit.screen - 0.4 * (f.studyHours - 2.5) + normal(0.7), 0, 12));
      f.lateArrivals = Math.max(0, Math.round((100 - f.attendance) / 4 + normal(1.5)));
      f.onlineLogins = r1(clamp(habit.online + 0.5 * f.studyHours + normal(1), 0, 30));

      // the hidden true score (term 5's exists too - its results just aren't in yet)
      let termScore;
      if (term === 1) termScore = prevScore;
      else {
        const w = TRUE_WEIGHTS[term];
        termScore = BASE + w.studyHours * f.studyHours + w.sleepHours * f.sleepHours +
          w.attendance * f.attendance + w.parentSupport * f.parentSupport + w.homeworkPct * f.homeworkPct +
          w.confidence * f.confidence + w.participation * f.participation + w.prevScore * prevScore + normal(4);
      }
      termScore = clamp(termScore, 5, 100);

      // the term's assessments scatter around the term score (quizzes are noisier)
      const results = [];
      const add = (type, count, maxScore, noise) => {
        for (let i = 0; i < count; i++) {
          const pct = clamp(termScore + normal(noise), 0, 100);
          results.push({ type, maxScore, pct });
        }
      };
      add("quiz", 6, 20, 8);
      add("monthly", 2, 50, 5);
      add("semester", 1, 100, 3);
      f.earlyQuizPct = r1((results[0].pct + results[1].pct) / 2); // the first 2 quizzes

      factorRows.push([s.id, term, f.studyHours, f.sleepHours, f.attendance, f.parentSupport, f.homeworkPct,
        f.lateMissing, f.earlyQuizPct, f.lateArrivals, f.participation, f.onlineLogins, f.confidence,
        f.motivation, f.studySkills, f.targetScore, f.screenHours]);
      if (term > TERMS_WITH_RESULTS) continue; // term 5: no results yet
      for (const a of results) {
        assessmentRows.push([s.id, term, a.type, "Math", Math.round((a.pct / 100) * a.maxScore * 2) / 2, a.maxScore]);
      }
      prevScore = termScore;
    }
  }
  await pool.query(
    `INSERT INTO factor_logs (student_id, term, study_hours, sleep_hours, attendance, parent_support, homework_pct,
       late_missing, early_quiz_pct, late_arrivals, participation, online_logins, confidence,
       motivation, study_skills, target_score, screen_hours) VALUES ?`,
    [factorRows]
  );
  await pool.query(
    "INSERT INTO assessments (student_id, term, type, subject, score, max_score) VALUES ?",
    [assessmentRows]
  );
  console.log(`Created ${students.length} students, ${factorRows.length} factor logs, ${assessmentRows.length} assessments.`);

  // Replay the real-world order: train after each term's results, then predict the next term.
  for (let term = 2; term <= TERMS_WITH_RESULTS; term++) {
    const m = await engine.train(term);
    const p = await engine.runPredictions(term + 1);
    console.log(
      `Term ${term}: trained model v${m.version}` +
      (m.liveMae != null ? ` (previous model was off by ${m.liveMae.toFixed(1)} pts on this term)` : "") +
      ` -> predicted term ${term + 1} for ${p.count} students`
    );
  }
  console.log('Done. Start the API with "npm run dev", then the client (see README).');
}

main()
  .catch((err) => {
    console.error(err.message);
    if (err.code === "ER_NO_SUCH_TABLE") console.error('Tables missing - run "npm run db:init" first.');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
