/**
 * validate.js — Input validation for query parameters.
 */

const MAX_LIMIT = 5000;
const VALID_SYMBOLS = new Set([
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","WIPRO","BHARTIARTL",
  "BAJFINANCE","SBIN","HINDUNILVR","ITC","KOTAKBANK","LT","ASIANPAINT",
  "AXISBANK","HCLTECH","MARUTI","SUNPHARMA","TITAN","ULTRACEMCO",
  "NESTLEIND","POWERGRID","NTPC","TECHM","ONGC","TATAMOTORS","TATASTEEL",
  "ADANIENT","ADANIPORTS","JSWSTEEL",
]);

function validateTradeQuery(req, res, next) {
  const errors = [];

  const { symbol, tradeType, limit, from, to } = req.query;

  // symbol — must be a known BSE symbol
  if (symbol && !VALID_SYMBOLS.has(symbol.toUpperCase())) {
    errors.push(`Invalid symbol "${symbol}". Must be a valid BSE symbol.`);
  }

  // tradeType — BUY or SELL only
  if (tradeType && !["BUY", "SELL"].includes(tradeType.toUpperCase())) {
    errors.push(`Invalid tradeType "${tradeType}". Must be BUY or SELL.`);
  }

  // limit — positive integer, capped at MAX_LIMIT
  if (limit !== undefined) {
    const n = parseInt(limit, 10);
    if (isNaN(n) || n < 1) {
      errors.push(`Invalid limit "${limit}". Must be a positive integer.`);
    } else if (n > MAX_LIMIT) {
      // Don't error — just cap silently and note in response
      req.query.limit = String(MAX_LIMIT);
    }
  }

  // from / to — must be valid ISO date strings
  if (from && isNaN(Date.parse(from))) {
    errors.push(`Invalid from date "${from}". Must be ISO 8601 format.`);
  }
  if (to && isNaN(Date.parse(to))) {
    errors.push(`Invalid to date "${to}". Must be ISO 8601 format.`);
  }
  if (from && to && Date.parse(from) > Date.parse(to)) {
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

  next();
}

module.exports = { validateTradeQuery };
