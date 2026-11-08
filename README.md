# BSE Trades Dashboard — Arham Fintech Technical Assessment

A full-stack app that solves the core constraint:

> **A full pull takes up to 15 minutes, but the network kills any HTTP connection held open longer than 30 seconds.**

---

## Architecture in one line

`GET /proxy/getTrades` returns committed data instantly.
A background pull job streams trades in batches.
**Server-Sent Events (SSE)** push progress to every open browser tab — no polling, no page refresh, no cron.

---

## Tech Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| API      | Node.js + Express + MongoDB (Mongoose) |
| Frontend | React 18 + Vite               |
| Realtime | Server-Sent Events (SSE)      |
| Data     | Deterministic mulberry32 PRNG (synthetic BSE trades) |

> **Note on data:** there is no live BSE upstream. `server/seed.js` generates
> 2,000 synthetic but realistic BSE-shaped trades with a seeded PRNG, so runs
> are reproducible and the dashboard can be demoed offline.

---

## Project Structure

```
arham_fintech/
├── package.json            # root: `npm run dev` (concurrently) + `npm test`
├── docker-compose.yml      # server + client (nginx) + mongo
├── ecosystem.config.js     # pm2 process manager
├── server/
│   ├── index.js            # Express API (routes, helmet, error handler, trust proxy)
│   ├── pullManager.js      # Pull lifecycle + SSE broadcast
│   ├── pullLock.js         # Distributed pull lock (MongoDB lease)
│   ├── db.js               # MongoDB connection + production fail-fast
│   ├── seed.js             # 2000-record BSE trade generator (PRNG)
│   ├── middleware/         # auth.js (Bearer, constant-time) + validate.js
│   ├── models/             # Trade.js, PullCheckpoint.js, PullLock.js
│   ├── routes/proxy.js     # BFF proxy (no key needed from browser)
│   └── test/               # Vitest server suite
└── client/
    ├── src/
    │   ├── config.js       # runtime API URL (window.__CONFIG__ -> VITE_API_URL)
    │   ├── hooks/          # useTrades.js (SSE + fetch), useFilters.js
    │   ├── components/     # TradesTable, Charts, PullStatus, Filters, …
    │   └── *.test.jsx       # Vitest client suite
    ├── public/config.js    # editable post-build runtime config
    └── vite.config.js
```

---

## Setup & Run

### Prerequisites
- Node.js ≥ 18

### 1. Install dependencies

```powershell
npm install --prefix server
npm install --prefix client
# (optional, for the one-command dev runner) install root tooling:
npm install
```

### 2. Start everything (one command)

```powershell
npm run dev     # at the repo root — runs server + client via concurrently
```

…or run them separately:

```powershell
node server/index.js            # API  → http://localhost:4000
npm run dev --prefix client      # UI   → http://localhost:5173
```

The server auto-starts the first pull on startup. Open http://localhost:5173 — the
dashboard loads immediately with whatever trades are already committed, and updates
live as the pull progresses.

### Tests

```powershell
npm test --prefix server     # Vitest server suite (pullManager, validate, auth, db, pullLock, app)
npm test --prefix client      # Vitest client suite (TradesTable, PullStatus, Charts, useTrades)
```

---

## Environment Variables (server)

Copy `server/.env.example` to `server/.env` and fill in your values:

```
PORT=4000
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/bse_trades
PULL_DURATION_MS=900000
API_KEY=<your-secret-api-key>
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
NODE_ENV=development
TRUST_PROXY=1
```

| Variable           | Default             | Description                                              |
|--------------------|---------------------|----------------------------------------------------------|
| `PORT`             | `4000`              | API server port                                          |
| `MONGO_URI`        | —                   | MongoDB connection string (**required in production**)  |
| `PULL_DURATION_MS` | `900000` (15m)      | Simulated pull duration in ms                           |
| `API_KEY`          | —                   | Bearer key for the direct API (**required in production**; no hardcoded default) |
| `ALLOWED_ORIGINS`  | `localhost:5173,…`  | Comma-separated CORS allowed origins                     |
| `NODE_ENV`         | `development`       | Set to `production` to fail fast on missing config       |
| `TRUST_PROXY`      | `1`                 | Trust `X-Forwarded-*` behind a reverse proxy (rate limiting + client IP) |

To demo quickly, set `PULL_DURATION_MS=60000` for a 1-minute pull:

```powershell
$env:PULL_DURATION_MS=60000; node server/index.js
```

### API access

The dashboard uses the **BFF proxy** — no API key needed from the browser:

```
GET  /proxy/getTrades        — trades (paginated)
GET  /proxy/events           — SSE stream
POST /proxy/pull/start       — trigger a pull
GET  /proxy/pull/status      — pull status
```

Direct access (Postman / server-to-server) requires the Bearer key (no query-param auth):

```
GET /getTrades
Authorization: Bearer <your-api-key>
```

### MongoDB behaviour
- **On startup:** loads existing trades — dashboard shows data instantly after restart.
- **On pull complete:** `bulkWrite` upserts all trades (idempotent — re-running a pull never duplicates).
- **Checkpoint:** each batch saves only trade IDs + the pull's seed (compact — no 16MB limit risk). A restart mid-pull resumes from the last batch using the *same* seed, so resumed data stays consistent even across a 5-minute seed boundary.
- **Pull concurrency:** a MongoDB-backed lease (`pull_lock` collection) prevents two replicas from running the same pull. In dev (no `MONGO_URI`) an in-memory guard is used instead.
- **No `MONGO_URI`:** falls back to in-memory mode gracefully in development; **throws** in production.

---

## API Reference

### `GET /proxy/getTrades`  (and `GET /getTrades` with a Bearer key)
Returns committed trades, paginated server-side.

**Query params (optional):**
- `symbol` — e.g. `?symbol=RELIANCE`
- `tradeType` — `BUY` or `SELL`
- `client` — partial match
- `from` / `to` — ISO-8601 timestamp range
- `page` — page number (integer ≥ 1, default 1)
- `pageSize` — records per page (1–500, default 200)

Invalid `page`/`pageSize` (NaN, < 1, non-integer) → `400`.

**Response:**
```json
{
  "success": true,
  "meta": { "totalRecords": 2000, "pullState": "completed", "lastPulledAt": "…", "page": 1, "pageSize": 200, "totalPages": 10 },
  "trades": [ { "tradeId": "BSE000001", "symbol": "RELIANCE", … } ]
}
```

### `POST /api/pull/start`  (Bearer)
Starts a new simulated pull. Returns `409` if one is already running (or `200` with `started:false` and a reason).

### `GET /api/pull/status`  (Bearer)
Returns the current pull job state and progress.

### `GET /proxy/events`  /  `GET /api/events`  (SSE)
Events emitted:
- `init` — current pull state + committed count on connect
- `pull_started` — a pull has begun (optionally `resumed: true`)
- `pull_progress` — per-batch progress (%, counts, and the new-trades delta)
- `pull_complete` — pull done. **Signal only** (`{ totalRecords, completedAt }`); the client re-fetches the full dataset via REST on this signal.
- `pull_error` — something went wrong

---

## How the 30-second kill is handled

The browser's native `EventSource` reconnects automatically when a connection drops.
The server sets `retry: 3000` (reconnect in 3 s) and keeps a 200-event ring buffer. On
reconnect the client sends `Last-Event-ID`, and the server replays any missed
`pull_progress` events — no data lost. `pull_complete` is a lightweight signal rather
than the full payload, so reconnecting clients re-fetch committed trades via REST when
they see it.

---

## Deploy

### Docker (recommended)

```powershell
docker compose up --build
```

- API: http://localhost:4000
- UI:  http://localhost:8080  (nginx serves the built client and proxies `/proxy` → the API)

Set `API_KEY` via env (e.g. an `.env` file next to `docker-compose.yml`, or
`API_KEY=… docker compose up`). For production, point `MONGO_URI` at Atlas or your own
MongoDB and remove the `mongo` service.

### Process manager (pm2)

```powershell
pm2 start ecosystem.config.js --env production
```

### HTTPS
Runs over HTTP locally. In production, terminate TLS at a reverse proxy (nginx/Caddy) in
front of Node, and set `TRUST_PROXY=1` so rate limiting and client-IP detection work behind it.
