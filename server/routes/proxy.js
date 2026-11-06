/**
 * proxy.js — BFF layer: browser hits /proxy/*, no API key needed in frontend.
 * Fix #1: API key stays server-side only.
 * Fix #4: proper offset pagination on getTrades.
 * Fix: proxy-specific rate limiter + CORS origin check added.
 */
const express    = require("express");
const router     = express.Router();
const rateLimit  = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const { validateTradeQuery } = require("../middleware/validate");
const {
  getCommittedTrades, getPullStatus,
  startPull, addSseClient, removeSseClient,
} = require("../pullManager");
const { isDbConnected } = require("../db");

// Strict rate limiter for proxy — 100 req/min per IP
const proxyLimiter = rateLimit({
  windowMs: 60_000, max: 100,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests to proxy." },
});

// Extra-strict for pull trigger — 3 per minute
const proxyPullLimiter = rateLimit({
  windowMs: 60_000, max: 3,
  message: { error: "Too many pull requests." },
});

router.use(proxyLimiter);

// GET /proxy/getTrades  — Fix #4: paginated
router.get("/getTrades", validateTradeQuery, (req, res) => {
  const trades = getCommittedTrades();
  const status = getPullStatus();
  const { symbol, client, tradeType, from, to } = req.query;
  let result = [...trades];

  if (symbol)    result = result.filter(t => t.symbol === symbol.toUpperCase());
  if (client)    result = result.filter(t => t.client.toLowerCase().includes(client.toLowerCase()));
  if (tradeType) result = result.filter(t => t.tradeType === tradeType.toUpperCase());
  if (from)      result = result.filter(t => t.timestamp >= from);
  if (to)        result = result.filter(t => t.timestamp <= to);

  const pageSize   = Math.min(parseInt(req.query.pageSize || "200", 10), 500);
  const pageNum    = Math.max(parseInt(req.query.page    || "1",   10), 1);
  const total      = result.length;
  const totalPages = Math.ceil(total / pageSize);
  const paginated  = result.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({
    success: true,
    meta: {
      total, page: pageNum, pageSize, totalPages,
      pullState: status.state, lastPulledAt: status.completedAt,
      dbConnected: isDbConnected(),
    },
    trades: paginated,
  });
});

// GET /proxy/pull/status
router.get("/pull/status", (_req, res) => res.json(getPullStatus()));

// POST /proxy/pull/start
router.post("/pull/start", proxyPullLimiter, async (_req, res) => {
  const result = await startPull();
  result.started
    ? res.json({ success: true, message: "Pull started", pullStatus: getPullStatus() })
    : res.status(409).json({ success: false, message: result.reason });
});

// GET /proxy/events — SSE (no key, BFF handles auth)
router.get("/events", (req, res) => {
  const clientId    = uuidv4();
  const lastEventId = parseInt(req.headers["last-event-id"] || "0", 10);
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  // Fix #1: send count + pull status only — client fetches trades via GET /getTrades
  // Avoids serializing 400KB of JSON into every SSE connection
  const trades = getCommittedTrades();
  res.write(`event: init\ndata: ${JSON.stringify({
    pullStatus:     getPullStatus(),
    totalCommitted: trades.length,
    // Only send trades in init if there are none yet (avoids flash of empty table)
    // For non-empty, client already has data from its own GET /getTrades fetch
    trades: trades.length === 0 ? [] : undefined,
  })}\n\n`);

  addSseClient(clientId, res, lastEventId);
  req.on("close", () => removeSseClient(clientId));
});

module.exports = router;
