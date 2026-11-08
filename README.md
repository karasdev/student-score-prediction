# Student Score Prediction

Learns how much each factor (study hours, sleep, attendance, parent support, previous score)
relates to a student's term score, **re-learns those weights every term**, and predicts the next
term's scores. A dashboard shows trends, predictions vs actual results, and how the weights change.

Plain JavaScript (no TypeScript, no JSX, no build step, no Docker). Tested on **Node 16.8.0**
with **MySQL 8.0**.

```
client/   Dashboard UI   – React 18 (createElement, useState/useEffect), served on :3000
server/   API + engine   – Express 4 + MySQL (mysql2), on :5050
```

## Requirements

- Node.js 16.8+
- MySQL Server 8.0 running locally

## Setup

**1. Server** (terminal 1)

```bash
cd server
npm install
cp .env.example .env      # set DB_USER / DB_PASSWORD (keep the quotes around the password)
npm run db:init           # creates the database + tables (safe to re-run)
npm run seed              # optional: demo data (80 students, terms 1-5)
npm run dev               # API on http://localhost:5050
```

**2. Client** (terminal 2)

```bash
cd client
npm install
npm start                 # open http://localhost:3000
```

The client finds the API through `client/public/config.js`. The server only accepts browser
requests from `CLIENT_ORIGIN` in `server/.env` (default `http://localhost:3000`). Change both if
you use other ports.

| Server script | What it does |
|---|---|
| `npm run dev` | Start with nodemon (restarts on changes) |
| `npm start` | Start normally |
| `npm run db:init` | Create database + tables from `schema.sql`, add new columns to existing tables |
| `npm run seed` | Add demo data (only if the database is empty) |
| `npm run seed:reset` | **Delete all data** and reseed |
| `npm run features:check` | Which factors lower the live error? (same as Model → Check factors) |

Client files in `client/public/` are served as-is: edit and refresh the browser.

## How the learning works

```
score = intercept + w1·study + w2·sleep + w3·attendance + w4·parentSupport + w5·prevScore + ...
```

### Factors

All factors are listed in `server/ml/config.js`. Only those with `use: true` get a weight.

| Factor | Where it comes from | In use |
|---|---|---|
| Study h/day, sleep h/day, attendance %, parent support (1-5) | entered per term (`factor_logs`) | yes |
| Prev score | last term's score (computed) | yes |
| Score trend | slope of the last 2-3 term scores, points per term (computed; 0 with only one past term) | candidate |
| Quiz-exam gap | last term: quiz average % minus exam average % (computed) | candidate |
| Homework % | entered per term (`factor_logs.homework_pct`, optional) | candidate |
| Late/missing | late or missing assignments, entered per term (`factor_logs.late_missing`, optional) | candidate |

Computed factors only use results from earlier terms, so they are known before the term's results.

**Adding a factor:** Model → **Check factors** (or `npm run features:check`) replays past terms
with and without each factor and compares the live error, on the same predictions. A factor
counts as helping only if it lowers the live error by more than 2× the noise. Set `use: true` for
the ones marked **add**, then retrain. "No clear effect" means too small to measure with the data
so far, not proven useless. Keep the total around 8-10 factors for ~80 students.

A student-term with an empty value for a factor in use is left out of training and predictions.

Every term, after results are entered:

1. **Check** – the current model's predictions for this term are compared with the actual scores
   (*live error*: the honest accuracy number).
2. **Retrain** – weights are re-learned from all terms so far. Recent terms count more
   (`RECENCY_DECAY` = 0.6 → last term 0.6×, two terms ago 0.36×, ...).
3. **Predict** – the new model predicts the next term.

Details (`server/ml/`):
- Factors are standardized before fitting, so weights are comparable ("points per 1 std dev").
  Raw weights ("points per hour", "per %") are also stored.
- Ridge regularization (`RIDGE_LAMBDA`) keeps weights stable when data is small.
- A **term score** is the weighted average percentage of that term's assessments
  (`TYPE_WEIGHTS`: quiz 1, monthly 2, semester 3, yearly 4), so quizzes and exams with different
  max points are comparable.
- Weights show association, not cause.

Tune everything in `server/ml/config.js`.

## Structure

```
server/
  server.js            Express app, CORS, error handling
  db.js                MySQL connection pool (settings from .env)
  schema.sql           Tables: students, assessments, factor_logs, model_versions, predictions
  scripts/init-db.js   Creates the database and runs schema.sql (+ adds new columns)
  scripts/check-features.js  Prints which factors lower the live error
  routes/api.js        All API routes
  ml/config.js         Factors (in use / candidates), assessment weights, recency decay, ridge strength
  ml/regression.js     Weighted ridge regression (no dependencies)
  ml/dataset.js        SQL queries that build training rows (term scores, factors, trend, quiz-exam gap)
  ml/engine.js         train / runPredictions / scenario / checkFeatures
  seed.js              Demo data + replays the term-by-term loop
client/
  serve.js             Static file server (Node built-in http, no dependencies)
  public/config.js     API URL
  public/index.html    Page + styles
  public/charts.js     SVG line / scatter / bar charts (no chart library)
  public/app.js        Dashboard, Students, Model pages
```

## API (`http://localhost:5050/api`)

| Method | Path | Body / query |
|---|---|---|
| GET | `/students` | |
| POST | `/students` | `{ name, className }` |
| GET | `/students/:id` | term-by-term actual, predicted, factors |
| GET | `/assessments` | `?student=&term=` |
| POST | `/assessments` | `{ student, term, type, subject?, date?, score, maxScore }` (`type`: quiz/monthly/semester/yearly) |
| GET | `/factors` | `?student=&term=` |
| PUT | `/factors` | `{ student, term, studyHours, sleepHours, attendance, parentSupport, homeworkPct?, lateMissing? }` (insert or replace) |
| GET | `/features` | all factors with `use` and `source` |
| GET | `/features/check` | which factors lower the live error (saves nothing) |
| GET | `/models` | all model versions |
| POST | `/models/train` | `{ term? }` (default: latest term with results) |
| POST | `/predictions/run` | `{ term }` |
| POST | `/scenario` | `{ studentId, term, overrides: { studyHours: 4, ... } }` (saves nothing) |
| GET | `/dashboard` | summary for the dashboard |

## Using your own data

1. Create students (`POST /api/students`).
2. For each term, record factors (`PUT /api/factors`) and assessment results (`POST /api/assessments`).
   Terms are numbers in time order: 1, 2, 3, ...
3. When a term's results are in: **Model → Retrain**, then **Run predictions** for the next term
   (the next term's factors must be entered first).

Training needs at least two terms of results (the first term only provides "previous score").
