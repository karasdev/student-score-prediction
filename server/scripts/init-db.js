// Creates the database (if missing) and its tables from schema.sql, then adds any columns that
// were added to schema.sql after your tables were created.  Safe to run more than once.
//   npm run db:init
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { config } = require("../db");

// Columns added after the first version. CREATE TABLE IF NOT EXISTS skips existing tables,
// so these are added with ALTER TABLE when missing. Keep in sync with schema.sql.
const ADDED_COLUMNS = [
  // [table, column, type, check rule, constraint name]
  ["factor_logs", "homework_pct", "DECIMAL(5,1)", "homework_pct BETWEEN 0 AND 100", "chk_factor_homework"],
  ["factor_logs", "late_missing", "SMALLINT", "late_missing >= 0", "chk_factor_late"],
  ["factor_logs", "early_quiz_pct", "DECIMAL(5,1)", "early_quiz_pct BETWEEN 0 AND 100", "chk_factor_early_quiz"],
  ["factor_logs", "late_arrivals", "SMALLINT", "late_arrivals >= 0", "chk_factor_late_arrivals"],
  ["factor_logs", "participation", "TINYINT", "participation BETWEEN 1 AND 5", "chk_factor_participation"],
  ["factor_logs", "online_logins", "DECIMAL(5,1)", "online_logins >= 0", "chk_factor_online"],
  ["factor_logs", "confidence", "TINYINT", "confidence BETWEEN 1 AND 5", "chk_factor_confidence"],
  ["factor_logs", "motivation", "TINYINT", "motivation BETWEEN 1 AND 5", "chk_factor_motivation"],
  ["factor_logs", "study_skills", "TINYINT", "study_skills BETWEEN 1 AND 5", "chk_factor_study_skills"],
  ["factor_logs", "target_score", "DECIMAL(5,1)", "target_score BETWEEN 0 AND 100", "chk_factor_target"],
  ["factor_logs", "screen_hours", "DECIMAL(4,1)", "screen_hours BETWEEN 0 AND 24", "chk_factor_screen"],
];

async function addMissingColumns(conn) {
  for (const [table, column, type, check, constraint] of ADDED_COLUMNS) {
    const [found] = await conn.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
      [config.database, table, column]
    );
    if (found.length) continue;
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} ${type} NULL, ADD CONSTRAINT ${constraint} CHECK (${check})`);
    console.log(`Added column ${table}.${column}`);
  }
}

async function main() {
  // connect without a database first, so we can create it
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.query(`USE \`${config.database}\``);
    const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
    await conn.query(schema);
    await addMissingColumns(conn);
    const [tables] = await conn.query("SHOW TABLES");
    console.log(`Database "${config.database}" is ready with ${tables.length} tables.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("Database setup failed:", err.message);
  if (err.code === "ER_ACCESS_DENIED_ERROR") console.error("Check DB_USER / DB_PASSWORD in server/.env");
  if (err.code === "ECONNREFUSED") console.error("Is MySQL running? Check DB_HOST / DB_PORT in server/.env");
  process.exit(1);
});
