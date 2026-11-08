/**
 * seed.js — Generates BSE trade records.
 * Fix #5: Uses a time-bucketed seed so each pull produces different
 * timestamps and prices while keeping tradeIds stable for upserts.
 */

const { v4: uuidv4 } = require("uuid");

const SYMBOLS = [
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","WIPRO","BHARTIARTL",
  "BAJFINANCE","SBIN","HINDUNILVR","ITC","KOTAKBANK","LT","ASIANPAINT",
  "AXISBANK","HCLTECH","MARUTI","SUNPHARMA","TITAN","ULTRACEMCO",
  "NESTLEIND","POWERGRID","NTPC","TECHM","ONGC","TATAMOTORS","TATASTEEL",
  "ADANIENT","ADANIPORTS","JSWSTEEL",
];

const CLIENTS = [
  "Aditya Capital","Bharat Securities","Chandragupta Brokers",
  "Dhanvantari Trading","Eshaan Investments","Fanibhushan Wealth",
  "Girish Asset Mgmt","Hemant Portfolio","Indra Fin Services",
  "Jagdish Equities","Kalyan Broking","Lakshman Capital",
  "Madhavan Trading","Narmada Wealth","Omkar Securities",
  "Prabhat Investments","Quasar Brokers","Ramesh Equity",
  "Saraswati Finance","Trimurti Trading",
];

const TRADE_TYPES = ["BUY","SELL"];
const SERIES      = ["EQ","BE","BL","GC"];
const EXCHANGES   = ["BSE","NSE"];

/** mulberry32 PRNG — deterministic but seed-dependent */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate trades.
 * Fix #5: pullSeed changes each pull so prices/timestamps differ,
 * making the dashboard show visibly fresh data after each pull.
 * tradeIds are stable (based on index) so MySQL upserts work correctly.
 */
function generateTrades(count = 2000, pullSeed = null) {
  // Default seed: current 5-minute bucket — same within a pull, different across pulls
  const seed = pullSeed ?? Math.floor(Date.now() / (5 * 60 * 1000));
  const rand = mulberry32(seed);

  const now = Date.now();
  const trades = [];

  for (let i = 0; i < count; i++) {
    const symbol    = SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
    const client    = CLIENTS[Math.floor(rand() * CLIENTS.length)];
    const tradeType = TRADE_TYPES[Math.floor(rand() * TRADE_TYPES.length)];
    const exchange  = EXCHANGES[Math.floor(rand() * EXCHANGES.length)];
    const series    = SERIES[Math.floor(rand() * SERIES.length)];
    const price     = parseFloat((50 + rand() * 4950).toFixed(2));
    const quantity  = Math.floor(1 + rand() * 4999);
    const value     = parseFloat((price * quantity).toFixed(2));
    // Timestamps within the last 7 days (fresh data each pull)
    const timestamp = new Date(now - rand() * 7 * 24 * 60 * 60 * 1000).toISOString();
    const tradeDate = timestamp.split("T")[0];

    trades.push({
      tradeId:   `BSE${String(i + 1).padStart(6, "0")}`,
      client, symbol, series, tradeType, exchange,
      quantity, price, value, tradeDate, timestamp,
    });
  }

  trades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return trades;
}

module.exports = { generateTrades };

