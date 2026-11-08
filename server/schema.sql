-- Tables for the student score prediction engine (MySQL 8.0+).
-- Run with: npm run db:init   (creates the database too)

CREATE TABLE IF NOT EXISTS students (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  class_name  VARCHAR(50)  NOT NULL DEFAULT '',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One quiz / exam result. Stored as raw points + max points; converted to % for term scores.
CREATE TABLE IF NOT EXISTS assessments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  student_id  INT NOT NULL,
  term        INT NOT NULL,                       -- 1, 2, 3, ... in time order
  type        ENUM('quiz', 'monthly', 'semester', 'yearly') NOT NULL,
  subject     VARCHAR(100) NOT NULL DEFAULT '',
  date        DATE NULL,
  score       DECIMAL(7,2) NOT NULL,
  max_score   DECIMAL(7,2) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_assessment_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT chk_assessment_term  CHECK (term >= 1),
  CONSTRAINT chk_assessment_score CHECK (score >= 0 AND max_score > 0),
  INDEX idx_assessment_student_term (student_id, term)
);

-- The factors for one student in one term (averages over that term).
CREATE TABLE IF NOT EXISTS factor_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  student_id      INT NOT NULL,
  term            INT NOT NULL,
  study_hours     DECIMAL(4,1) NOT NULL,
  sleep_hours     DECIMAL(4,1) NOT NULL,
  attendance      DECIMAL(5,1) NOT NULL,          -- percent
  parent_support  TINYINT      NOT NULL,          -- 1-5 rating
  homework_pct    DECIMAL(5,1) NULL,              -- % of homework handed in (optional)
  late_missing    SMALLINT     NULL,              -- late or missing assignments (optional)
  early_quiz_pct  DECIMAL(5,1) NULL,              -- % on this term's first quizzes (optional)
  late_arrivals   SMALLINT     NULL,              -- times late to class (optional)
  participation   TINYINT      NULL,              -- teacher rating 1-5 (optional)
  online_logins   DECIMAL(5,1) NULL,              -- online platform logins per week (optional)
  confidence      TINYINT      NULL,              -- survey 1-5 (optional)
  motivation      TINYINT      NULL,              -- survey 1-5 (optional)
  study_skills    TINYINT      NULL,              -- survey 1-5 (optional)
  target_score    DECIMAL(5,1) NULL,              -- survey: score the student aims for, % (optional)
  screen_hours    DECIMAL(4,1) NULL,              -- survey: screen time h/day (optional)
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_factor_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT uq_factor_student_term UNIQUE (student_id, term),
  CONSTRAINT chk_factor_term       CHECK (term >= 1),
  CONSTRAINT chk_factor_study      CHECK (study_hours BETWEEN 0 AND 24),
  CONSTRAINT chk_factor_sleep      CHECK (sleep_hours BETWEEN 0 AND 24),
  CONSTRAINT chk_factor_attendance CHECK (attendance BETWEEN 0 AND 100),
  CONSTRAINT chk_factor_parent     CHECK (parent_support BETWEEN 1 AND 5),
  CONSTRAINT chk_factor_homework   CHECK (homework_pct BETWEEN 0 AND 100),
  CONSTRAINT chk_factor_late       CHECK (late_missing >= 0),
  CONSTRAINT chk_factor_early_quiz    CHECK (early_quiz_pct BETWEEN 0 AND 100),
  CONSTRAINT chk_factor_late_arrivals CHECK (late_arrivals >= 0),
  CONSTRAINT chk_factor_participation CHECK (participation BETWEEN 1 AND 5),
  CONSTRAINT chk_factor_online        CHECK (online_logins >= 0),
  CONSTRAINT chk_factor_confidence    CHECK (confidence BETWEEN 1 AND 5),
  CONSTRAINT chk_factor_motivation    CHECK (motivation BETWEEN 1 AND 5),
  CONSTRAINT chk_factor_study_skills  CHECK (study_skills BETWEEN 1 AND 5),
  CONSTRAINT chk_factor_target        CHECK (target_score BETWEEN 0 AND 100),
  CONSTRAINT chk_factor_screen        CHECK (screen_hours BETWEEN 0 AND 24)
);

-- Every retrain is saved, so you can see how the weights change term by term.
CREATE TABLE IF NOT EXISTS model_versions (
  version               INT PRIMARY KEY,
  trained_through_term  INT NOT NULL,
  features              JSON NOT NULL,          -- ["studyHours", ...]
  means                 JSON NOT NULL,
  stds                  JSON NOT NULL,
  intercept             DOUBLE NOT NULL,
  coef_std              JSON NOT NULL,          -- points per 1 std dev (comparable across factors)
  coef_raw              JSON NOT NULL,          -- points per 1 unit (per hour, per %, ...)
  raw_intercept         DOUBLE NOT NULL,
  rows_used             INT NOT NULL,
  train_mae             DOUBLE NOT NULL,        -- error on its own training data (optimistic)
  live_mae              DOUBLE NULL,            -- error of the PREVIOUS model on this term, before seeing results (honest)
  recency_decay         DOUBLE NOT NULL,
  ridge_lambda          DOUBLE NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A predicted term score, made BEFORE that term's results came in.
CREATE TABLE IF NOT EXISTS predictions (
  student_id     INT NOT NULL,
  term           INT NOT NULL,
  model_version  INT NOT NULL,
  predicted      DOUBLE NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, term),
  CONSTRAINT fk_prediction_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_prediction_model   FOREIGN KEY (model_version) REFERENCES model_versions(version)
);
