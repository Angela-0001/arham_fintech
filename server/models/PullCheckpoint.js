/**
 * PullCheckpoint.js — MySQL helpers for the pull_checkpoint table.
 *
 * Stores only stagedTradeIds (comma-joined) + pullSeed so the row stays
 * well under MySQL's MEDIUMTEXT 16MB limit. On resume, trades are
 * regenerated from the deterministic seed and matched by ID.
 */
const { getPool } = require("../db");

async function saveCheckpoint(data) {
  const pool = getPool();
  if (!pool) return;
  const {
    state, totalRecords, pulledRecords, batchNumber,
    totalBatches, startedAt, updatedAt, pullSeed, stagedTradeIds,
  } = data;
  await pool.execute(
    `INSERT INTO pull_checkpoint
       (id, state, total_records, pulled_records, batch_number, total_batches,
        started_at, updated_at, pull_seed, staged_trade_ids)
     VALUES ('singleton',?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       state=VALUES(state), total_records=VALUES(total_records),
       pulled_records=VALUES(pulled_records), batch_number=VALUES(batch_number),
       total_batches=VALUES(total_batches), started_at=VALUES(started_at),
       updated_at=VALUES(updated_at), pull_seed=VALUES(pull_seed),
       staged_trade_ids=VALUES(staged_trade_ids)`,
    [
      state, totalRecords, pulledRecords, batchNumber,
      totalBatches, startedAt, updatedAt, pullSeed,
      Array.isArray(stagedTradeIds) ? stagedTradeIds.join(",") : (stagedTradeIds || ""),
    ]
  );
}

async function loadCheckpoint() {
  const pool = getPool();
  if (!pool) return null;
  const [rows] = await pool.execute(
    "SELECT * FROM pull_checkpoint WHERE id='singleton' LIMIT 1"
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    state:          r.state,
    totalRecords:   r.total_records,
    pulledRecords:  r.pulled_records,
    batchNumber:    r.batch_number,
    totalBatches:   r.total_batches,
    startedAt:      r.started_at,
    pullSeed:       r.pull_seed,
    stagedTradeIds: r.staged_trade_ids
      ? r.staged_trade_ids.split(",").filter(Boolean)
      : [],
  };
}

async function deleteCheckpoint() {
  const pool = getPool();
  if (!pool) return;
  await pool.execute("DELETE FROM pull_checkpoint WHERE id='singleton'");
}

module.exports = { saveCheckpoint, loadCheckpoint, deleteCheckpoint };
