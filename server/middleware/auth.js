/**
 * auth.js — API key authentication middleware.
 *
 * Clients must send:  Authorization: Bearer <API_KEY>
 *
 * Query-param auth (?apiKey=) has been removed — it leaks keys into access
 * logs, browser history, and referrers. EventSource cannot set headers, so
 * the BFF /proxy/* routes (which are keyless) are the intended path for the
 * browser. The direct /api/* routes are for server-to-server / Postman use
 * where a Bearer header can be set.
 *
 * API_KEY is loaded from the environment. In production it is REQUIRED
 * (boot() fails fast if missing). In development, if unset the direct API
 * returns a clear 503 while the BFF dashboard keeps working.
 */

const crypto = require("crypto");

/**
 * Constant-time string comparison to avoid timing side-channels.
 * Guards equal length first so timingSafeEqual never throws on mismatched
 * Buffer lengths.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireApiKey(req, res, next) {
  // Read at call-time so tests can change process.env.API_KEY without reloading.
  const API_KEY = process.env.API_KEY || null;

  if (!API_KEY) {
    return res.status(503).json({
      error: "Service Unavailable",
      message: "API key not configured. Set API_KEY in the environment.",
    });
  }

  const authHeader = req.headers["authorization"] || "";
  const provided = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!provided) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing API key. Send Authorization: Bearer <key>.",
    });
  }

  if (!safeEqual(provided, API_KEY)) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid API key.",
    });
  }

  next();
}

module.exports = { requireApiKey };
