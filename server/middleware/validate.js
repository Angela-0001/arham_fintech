/**
 * validate.js — Input validation for query parameters.
 */

const VALID_SYMBOLS = new Set([
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","WIPRO","BHARTIARTL",
  "BAJFINANCE","SBIN","HINDUNILVR","ITC","KOTAKBANK","LT","ASIANPAINT",
  "AXISBANK","HCLTECH","MARUTI","SUNPHARMA","TITAN","ULTRACEMCO",
  "NESTLEIND","POWERGRID","NTPC","TECHM","ONGC","TATAMOTORS","TATASTEEL",
  "ADANIENT","ADANIPORTS","JSWSTEEL",
]);

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 200;

function isPositiveInt(value) {
  // Reject NaN, non-integers, and anything < 1.
  const n = Number(value);
  return Number.isInteger(n) && n >= 1;
}

function validateTradeQuery(req, res, next) {
  const errors = [];

  const { symbol, tradeType, from, to, page, pageSize } = req.query;

  // symbol — must be a known BSE symbol
  if (symbol && !VALID_SYMBOLS.has(symbol.toUpperCase())) {
    errors.push(`Invalid symbol "${symbol}". Must be a valid BSE symbol.`);
  }

  // tradeType — BUY or SELL only
  if (tradeType && !["BUY", "SELL"].includes(tradeType.toUpperCase())) {
    errors.push(`Invalid tradeType "${tradeType}". Must be BUY or SELL.`);
  }

  // page — positive integer (default 1). NaN/non-int/<1 → 400.
  if (page !== undefined && !isPositiveInt(page)) {
    errors.push(`Invalid page "${page}". Must be a positive integer.`);
  } else if (errors.length === 0) {
    req.query.page = Math.max(parseInt(page, 10) || 1, 1);
  }

  // pageSize — positive integer (default 200, clamp 1–500). NaN/non-int/<1 → 400.
  if (pageSize !== undefined && !isPositiveInt(pageSize)) {
    errors.push(`Invalid pageSize "${pageSize}". Must be a positive integer.`);
  } else if (errors.length === 0) {
    const ps = Math.min(Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    req.query.pageSize = ps;
  }

  // from / to — must be valid dates; normalize to ISO-8601 so the lexical
  // compare in the routes is correct (e.g. "01/01/2024" → "2024-01-01T...").
  if (from) {
    const d = new Date(from);
    if (isNaN(d.getTime())) {
      errors.push(`Invalid from date "${from}". Must be a parseable date.`);
    } else {
      req.query.from = d.toISOString();
    }
  }
  if (to) {
    const d = new Date(to);
    if (isNaN(d.getTime())) {
      errors.push(`Invalid to date "${to}". Must be a parseable date.`);
    } else {
      req.query.to = d.toISOString();
    }
  }
  if (req.query.from && req.query.to && Date.parse(req.query.from) > Date.parse(req.query.to)) {
    errors.push(`"from" date must be before "to" date.`);
  }

  // client — basic sanitize: strip HTML, limit length
  if (req.query.client) {
    req.query.client = req.query.client
      .replace(/[<>"']/g, "")
      .slice(0, 100);
  }

  if (errors.length > 0) {
    return res.status(400).json({ error: "Validation failed", details: errors });
  }

  // Ensure defaults are set even when params are absent
  if (!req.query.page)     req.query.page = 1;
  if (!req.query.pageSize) req.query.pageSize = DEFAULT_PAGE_SIZE;

  next();
}

module.exports = { validateTradeQuery };
