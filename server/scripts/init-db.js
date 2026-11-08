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
  {
    table: "factor_logs",
    column: "homework_pct",
    sql: `ADD COLUMN homework_pct DECIMAL(5,1) NULL AFTER parent_support,
          ADD CONSTRAINT chk_factor_homework CHECK (homework_pct BETWEEN 0 AND 100)`,
  },
  {
    table: "factor_logs",
    column: "late_missing",
    sql: `ADD COLUMN late_missing SMALLINT NULL AFTER homework_pct,
          ADD CONSTRAINT chk_factor_late CHECK (late_missing >= 0)`,
  },
];

async function addMissingColumns(conn) {
  for (const c of ADDED_COLUMNS) {
    const [found] = await conn.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
      [config.database, c.table, c.column]
    );
    if (found.length) continue;
    await conn.query(`ALTER TABLE \`${c.table}\` ${c.sql}`);
    console.log(`Added column ${c.table}.${c.column}`);
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
