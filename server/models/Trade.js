/**
 * Trade.js — MySQL helpers for the trades table.
 *
 * All writes are INSERT … ON DUPLICATE KEY UPDATE so re-running a pull
 * is idempotent — same tradeId → update, never duplicate.
 */
const { getPool } = require("../db");

/**
 * Upsert a batch of trades.
 * Uses INSERT … ON DUPLICATE KEY UPDATE (MySQL idempotent upsert).
 * @param {Array} trades
 */
async function bulkUpsertTrades(trades) {
  const pool = getPool();
  if (!pool || trades.length === 0) return;

  // Build a single multi-row INSERT … ON DUPLICATE KEY UPDATE
  const placeholders = trades.map(() =>
    "(?,?,?,?,?,?,?,?,?,?,?)"
  ).join(",");

  const values = trades.flatMap(t => [
    t.tradeId, t.client, t.symbol, t.series,
    t.tradeType, t.exchange, t.quantity, t.price,
    t.value, t.tradeDate, t.timestamp,
  ]);

  await pool.execute(
    `INSERT INTO trades
       (trade_id,client,symbol,series,trade_type,exchange,quantity,price,value,trade_date,timestamp)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       client=VALUES(client), symbol=VALUES(symbol), series=VALUES(series),
       trade_type=VALUES(trade_type), exchange=VALUES(exchange),
       quantity=VALUES(quantity), price=VALUES(price),
       value=VALUES(value), trade_date=VALUES(trade_date), timestamp=VALUES(timestamp)`,
    values
  );
}

/** Load all trades from the DB. */
async function findAllTrades() {
  const pool = getPool();
  if (!pool) return [];
  const [rows] = await pool.execute(
    "SELECT trade_id as tradeId, client, symbol, series, trade_type as tradeType, " +
    "exchange, quantity, price, value, trade_date as tradeDate, timestamp FROM trades"
  );
  return rows;
}

module.exports = { bulkUpsertTrades, findAllTrades };
