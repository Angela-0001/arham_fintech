/**
 * db.js — MySQL connection pool via mysql2/promise.
 *
 * Call connectDB() once at startup. The pool is exported and shared across
 * all modules. In development, if MYSQL_URI (or the individual host/user/…
 * vars) are absent the app falls back to in-memory mode gracefully.
 * In production (NODE_ENV=production) MYSQL_URI is REQUIRED — boot() will
 * throw and the process exits with a clear error.
 *
 * Connection string format:
 *   mysql://user:password@host:3306/dbname
 */

const mysql = require("mysql2/promise");

let pool       = null;
let connected  = false;

/**
 * Parse a mysql:// URI into a mysql2 config object.
 * Falls back to individual env vars so both styles work.
 */
function parseConfig(uri) {
  if (uri) {
    // mysql://user:pass@host:port/dbname[?ssl=true]
    const u = new URL(uri);
    const cfg = {
      host:     u.hostname,
      port:     parseInt(u.port || "3306", 10),
      user:     decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
    };
    if (u.searchParams.get("ssl") === "true") {
      cfg.ssl = { rejectUnauthorized: false };
    }
    return cfg;
  }
  // Individual env vars (docker-compose style)
  return {
    host:     process.env.MYSQL_HOST     || "localhost",
    port:     parseInt(process.env.MYSQL_PORT || "3306", 10),
    user:     process.env.MYSQL_USER     || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "bse_trades",
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
  };
}

async function connectDB() {
  if (connected) return;

  const uri = process.env.MYSQL_URI ||
    (process.env.MYSQL_HOST ? null : null);  // uri-only check

  // Determine whether *any* mysql config is present
  const hasConfig = !!(
    process.env.MYSQL_URI ||
    process.env.MYSQL_HOST ||
    process.env.MYSQL_USER
  );

  if (!hasConfig) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: MySQL config must be set in production. " +
        "Set MYSQL_URI or MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE."
      );
    }
    console.warn("[DB] No MySQL config — running without persistence.");
    return;
  }

  try {
    pool = mysql.createPool(parseConfig(process.env.MYSQL_URI || null));

    // Test the connection and create tables
    await initSchema();
    connected = true;
    console.log("[DB] Connected to MySQL ✓");
  } catch (err) {
    console.error("[DB] Connection failed:", err.message);
    console.warn("[DB] Falling back to in-memory mode.");
    pool = null;
  }
}

/** Create tables if they don't exist yet. */
async function initSchema() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS trades (
      trade_id    VARCHAR(20)  NOT NULL PRIMARY KEY,
      client      VARCHAR(100) NOT NULL,
      symbol      VARCHAR(20)  NOT NULL,
      series      VARCHAR(5),
      trade_type  ENUM('BUY','SELL') NOT NULL,
      exchange    VARCHAR(10),
      quantity    INT          NOT NULL,
      price       DECIMAL(12,2) NOT NULL,
      value       DECIMAL(18,2) NOT NULL,
      trade_date  VARCHAR(10),
      timestamp   VARCHAR(30)  NOT NULL,
      INDEX idx_symbol    (symbol),
      INDEX idx_type      (trade_type),
      INDEX idx_ts        (timestamp),
      INDEX idx_sym_ts    (symbol, timestamp),
      INDEX idx_type_ts   (trade_type, timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS pull_checkpoint (
      id            VARCHAR(20)  NOT NULL PRIMARY KEY DEFAULT 'singleton',
      state         ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
      total_records INT,
      pulled_records INT,
      batch_number  INT,
      total_batches INT,
      started_at    VARCHAR(30),
      updated_at    VARCHAR(30),
      pull_seed     INT,
      staged_trade_ids MEDIUMTEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS pull_lock (
      id          VARCHAR(20)  NOT NULL PRIMARY KEY DEFAULT 'pull-lock',
      holder      VARCHAR(200),
      expires_at  DATETIME
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function getPool()      { return pool; }
function isDbConnected(){ return connected && pool !== null; }

module.exports = { connectDB, getPool, isDbConnected };
