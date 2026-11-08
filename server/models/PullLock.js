/**
 * PullLock.js — MySQL helpers for the pull_lock table.
 *
 * One row (id='pull-lock') acts as a distributed lock with an expiring lease.
 * The atomic "only update if unheld or expired" semantics are enforced with a
 * single conditional UPDATE (no upsert needed — the row is created in initSchema).
 */
const { getPool } = require("../db");

// Test seam: lets unit tests inject an in-memory pool without a real DB.
let _testPool = null;
function resolvePool() { return _testPool || getPool(); }
function __setPoolForTest(p) { _testPool = p; }

/**
 * Try to acquire the lock.
 * Returns the holder string if this call won, or null if another holder owns it.
 */
async function acquireLockRow(holder, expiresAt) {
  const pool = resolvePool();
  if (!pool) return null;
  const now = new Date();
  // Ensure the row exists first (INSERT IGNORE is idempotent)
  await pool.execute(
    "INSERT IGNORE INTO pull_lock (id, holder, expires_at) VALUES ('pull-lock', NULL, NULL)"
  );
  const [result] = await pool.execute(
    `UPDATE pull_lock
     SET holder=?, expires_at=?
     WHERE id='pull-lock'
       AND (holder IS NULL OR expires_at < ?)`,
    [holder, expiresAt, now]
  );
  return result.affectedRows === 1 ? holder : null;
}

/** Renew the lease. Returns true if this holder still owns the lock. */
async function renewLockRow(holder, expiresAt) {
  const pool = resolvePool();
  if (!pool) return false;
  const [result] = await pool.execute(
    "UPDATE pull_lock SET expires_at=? WHERE id='pull-lock' AND holder=?",
    [expiresAt, holder]
  );
  return result.affectedRows === 1;
}

/** Release the lock. Only clears it if this holder still owns it. */
async function releaseLockRow(holder) {
  const pool = resolvePool();
  if (!pool) return;
  await pool.execute(
    "UPDATE pull_lock SET holder=NULL, expires_at=NULL WHERE id='pull-lock' AND holder=?",
    [holder]
  );
}

module.exports = { acquireLockRow, renewLockRow, releaseLockRow, __setPoolForTest };
