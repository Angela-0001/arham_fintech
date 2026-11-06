/**
 * auth.js — API key authentication middleware.
 *
 * Clients must send:  Authorization: Bearer <API_KEY>
 * OR as query param:  ?apiKey=<API_KEY>  (for EventSource which can't set headers)
 *
 * API_KEY is set in .env. Falls back to a dev default if not set.
 */

const API_KEY = process.env.API_KEY || "dev-bse-key-2024";

function requireApiKey(req, res, next) {
  const authHeader = req.headers["authorization"] || "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const queryKey = req.query.apiKey;

  const provided = bearerToken || queryKey;

  if (!provided) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing API key. Send Authorization: Bearer <key> or ?apiKey=<key>",
    });
  }

  if (provided !== API_KEY) {
    return res.status(403).json({
      error: "Forbidden",
      message: "Invalid API key.",
    });
  }

  next();
}

module.exports = { requireApiKey };
