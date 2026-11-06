require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");

const { connectDB, isDbConnected } = require("./db");
const { requireApiKey }            = require("./middleware/auth");
const { validateTradeQuery }       = require("./middleware/validate");
const proxyRouter                  = require("./routes/proxy");
const {
  startPull, loadFromDB,
  getCommittedTrades, getPullStatus, getSseClientCount,
  addSseClient, removeSseClient,
} = require("./pullManager");

const app  = express();
const PORT = process.env.PORT || 4000;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:4173")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // Fix #2: return false instead of throwing — avoids unhandled error in Express
    cb(null, false);
  },
  credentials: true,
}));

// Explicit CORS rejection response (Express doesn't do this automatically when cb(null,false))
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "CORS: origin not allowed" });
  }
  next();
});
app.use(express.json());

// Global rate limiter
app.use(rateLimit({
  windowMs: 60_000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests." },
}));

const pullLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { error: "Too many pull requests." } });

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ── Public ────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({
  status: "ok", uptime: Math.round(process.uptime()),
  committedTrades: getCommittedTrades().length,
  pullStatus: getPullStatus().state,
  dbConnected: isDbConnected(),
  sseClients: getSseClientCount(),
}));

// ── BFF proxy (no auth needed from browser — Fix #1) ─────────────────────────
app.use("/proxy", proxyRouter);

// ── Protected direct API (for server-to-server / Postman use) ─────────────────
app.get("/getTrades", requireApiKey, validateTradeQuery, (req, res) => {
  const trades = getCommittedTrades();
  const status = getPullStatus();
  const { symbol, client, tradeType, from, to } = req.query;
  let result = [...trades];
  if (symbol)    result = result.filter(t => t.symbol === symbol.toUpperCase());
  if (client)    result = result.filter(t => t.client.toLowerCase().includes(client.toLowerCase()));
  if (tradeType) result = result.filter(t => t.tradeType === tradeType.toUpperCase());
  if (from)      result = result.filter(t => t.timestamp >= from);
  if (to)        result = result.filter(t => t.timestamp <= to);

  // Fix #4 — server-side offset pagination
  const pageSize = Math.min(parseInt(req.query.pageSize || "200", 10), 500);
  const pageNum  = Math.max(parseInt(req.query.page    || "1",   10), 1);
  const total    = result.length;
  const trades_  = result.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({
    success: true,
    meta: { total, page: pageNum, pageSize, totalPages: Math.ceil(total / pageSize), pullState: status.state, lastPulledAt: status.completedAt, dbConnected: isDbConnected() },
    trades: trades_,
  });
});

app.get("/api/pull/status", requireApiKey, (_req, res) => res.json(getPullStatus()));

app.post("/api/pull/start", requireApiKey, pullLimiter, async (_req, res) => {
  const result = await startPull();
  result.started
    ? res.json({ success: true, message: "Pull started", pullStatus: getPullStatus() })
    : res.status(409).json({ success: false, message: result.reason });
});

app.get("/api/events", requireApiKey, (req, res) => {
  const clientId    = uuidv4();
  const lastEventId = parseInt(req.headers["last-event-id"] || "0", 10);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("retry: 3000\n\n");
  const trades = getCommittedTrades();
  res.write(`event: init\ndata: ${JSON.stringify({ pullStatus: getPullStatus(), trades })}\n\n`);
  addSseClient(clientId, res, lastEventId);
  req.on("close", () => removeSseClient(clientId));
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  await connectDB();
  await loadFromDB();
  app.listen(PORT, () => {
    console.log(`\n🚀  BSE API → http://localhost:${PORT}`);
    console.log(`   /proxy/*  — BFF (no key needed from browser)`);
    console.log(`   /getTrades — direct API (requires Bearer key)`);
    console.log(`   DB: ${isDbConnected() ? "MongoDB Atlas ✓" : "in-memory"}`);
    console.log(`   🔑 API_KEY: ${process.env.API_KEY || "dev-bse-key-2024"}\n`);
  });
  const existing = getCommittedTrades();
  if (existing.length === 0) { console.log("[Startup] No trades in DB — auto-pulling."); await startPull(); }
  else console.log(`[Startup] ${existing.length} trades loaded from DB.`);
}

async function boot() {
  await connectDB();
  await loadFromDB();
  const server = app.listen(PORT, () => {
    console.log(`\n🚀  BSE API → http://localhost:${PORT}`);
    console.log(`   /proxy/*  — BFF (no key needed from browser)`);
    console.log(`   /getTrades — direct API (requires Bearer key)`);
    console.log(`   DB: ${isDbConnected() ? "MongoDB Atlas ✓" : "in-memory"}`);
    console.log(`   🔑 API_KEY: ${process.env.API_KEY || "dev-bse-key-2024"}\n`);
  });

  const existing = getCommittedTrades();
  if (existing.length === 0) { console.log("[Startup] No trades in DB — auto-pulling."); await startPull(); }
  else console.log(`[Startup] ${existing.length} trades loaded from DB.`);

  // Fix #3 — store server handle for graceful shutdown
  return server;
}

let _server;
boot().then(s => { _server = s; }).catch(err => { console.error("[Boot] Fatal:", err); process.exit(1); });

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Shutdown] ${signal} received — closing gracefully…`);
  const { broadcast } = require("./pullManager");
  broadcast("server_shutdown", { message: "Server restarting. Reconnecting shortly…" });
  // Stop accepting new connections
  if (_server) _server.close(() => console.log("[Shutdown] HTTP server closed."));
  setTimeout(() => { console.log("[Shutdown] Done."); process.exit(0); }, 1500);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
