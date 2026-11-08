require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { pool, config } = require("./db");
const apiRoutes = require("./routes/api");

const PORT = process.env.PORT || 5050;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:3000";

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get("/", (req, res) => res.json({ ok: true, message: "Score prediction API. The UI runs from the client folder." }));
app.use("/api", apiRoutes);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// MySQL errors caused by bad input -> 400 with the message, everything else -> 500
const BAD_INPUT_ERRORS = new Set([
  "ER_CHECK_CONSTRAINT_VIOLATED", "ER_NO_REFERENCED_ROW_2", "WARN_DATA_TRUNCATED", "ER_TRUNCATED_WRONG_VALUE",
  "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD", "ER_BAD_NULL_ERROR", "ER_DATA_TOO_LONG", "ER_WARN_DATA_OUT_OF_RANGE",
  "ER_DUP_ENTRY",
]);
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body" });
  if (err.code === "ER_NO_REFERENCED_ROW_2") return res.status(400).json({ error: "That student does not exist" });
  if (BAD_INPUT_ERRORS.has(err.code)) return res.status(400).json({ error: err.sqlMessage || err.message });
  if (err.status) return res.status(err.status).json({ error: err.message }); // e.g. "No trained model yet"
  console.error(err); // something unexpected
  res.status(500).json({ error: err.sqlMessage ? "Database error: " + err.sqlMessage : "Internal server error" });
});

pool
  .query("SELECT 1")
  .then(() => {
    app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}  (MySQL: ${config.database})`));
  })
  .catch((err) => {
    console.error(`Could not connect to MySQL at ${config.host}:${config.port} as "${config.user}":`, err.message);
    if (err.code === "ER_BAD_DB_ERROR") console.error('Database not found - run "npm run db:init" first.');
    process.exit(1);
  });
