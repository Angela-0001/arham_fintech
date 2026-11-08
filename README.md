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
| API      | Node.js + Express             |
| Database | MySQL 8 (mysql2)              |
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
├── docker-compose.yml      # server + client (nginx) + mysql
├── ecosystem.config.js     # pm2 process manager
├── server/
│   ├── index.js            # Express API (routes, helmet, error handler, trust proxy)
│   ├── pullManager.js      # Pull lifecycle + SSE broadcast
│   ├── pullLock.js         # Distributed pull lock (MySQL lease)
│   ├── db.js               # MySQL connection pool + production fail-fast
│   ├── seed.js             # 2000-record BSE trade generator (PRNG)
│   ├── middleware/         # auth.js (Bearer, constant-time) + validate.js
│   ├── models/             # Trade.js, PullCheckpoint.js, PullLock.js (SQL helpers)
│   ├── routes/proxy.js     # BFF proxy (no key needed from browser)
│   └── test/               # Vitest server suite (46 tests)
└── client/
    ├── src/
    │   ├── config.js       # runtime API URL (window.__CONFIG__ -> VITE_API_URL)
    │   ├── hooks/          # useTrades.js (SSE + fetch), useFilters.js
    │   ├── components/     # TradesTable, Charts, PullStatus, Filters, …
    │   └── *.test.jsx      # Vitest client suite (12 tests)
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
npm install   # root (concurrently)
```

### 2. Quick start — no database (in-memory)

```powershell
$env:PULL_DURATION_MS = "30000"   # 30-second pull for a fast demo
npm run dev
```
Open **http://localhost:5173**. Trades are not persisted across restarts in this mode.

### 3. Full stack with MySQL (Docker)

```powershell
docker compose up --build
```
- API: http://localhost:4000
- UI:  http://localhost:8080

MySQL starts automatically; the server connects and creates tables on first boot.

### Tests

```powershell
npm test --prefix server   # 46 tests
npm test --prefix client   # 12 tests
```

---

## Environment Variables (server)

Copy `server/.env.example` to `server/.env`:

```
PORT=4000
MYSQL_URI=mysql://user:password@host:3306/bse_trades
PULL_DURATION_MS=900000
API_KEY=your-secret-api-key
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
NODE_ENV=development
TRUST_PROXY=1
```

| Variable           | Default              | Description                                               |
|--------------------|----------------------|-----------------------------------------------------------|
| `PORT`             | `4000`               | API server port                                           |
| `MYSQL_URI`        | —                    | MySQL connection string (**required in production**)      |
| `MYSQL_HOST/USER/PASSWORD/DATABASE` | — | Alternative to URI |
| `PULL_DURATION_MS` | `900000` (15m)       | Simulated pull duration in ms                             |
| `API_KEY`          | —                    | Bearer key for the direct API (**required in production**)|
| `ALLOWED_ORIGINS`  | `localhost:5173,…`   | Comma-separated CORS allowed origins                      |
| `NODE_ENV`         | `development`        | Set to `production` to fail fast on missing config        |
| `TRUST_PROXY`      | `1`                  | Trust `X-Forwarded-*` behind a reverse proxy              |

### API access

Dashboard uses the **BFF proxy** (no API key needed from the browser):

```
GET  /proxy/getTrades        — trades (paginated)
GET  /proxy/events           — SSE stream
POST /proxy/pull/start       — trigger a pull
GET  /proxy/pull/status      — pull status
```

Direct access (Postman / server-to-server) requires Bearer key:

```
GET /getTrades
Authorization: Bearer <your-api-key>
```

### Database behaviour
- **On startup:** loads existing trades instantly — dashboard shows data after restart.
- **On pull complete:** upserts all trades with `INSERT … ON DUPLICATE KEY UPDATE` (idempotent — re-running a pull never duplicates).
- **Checkpoint:** each batch saves only trade IDs + the pull seed. Restart mid-pull resumes from the last batch with the same seed, so data is consistent across restarts.
- **Pull concurrency:** a MySQL-backed lease (`pull_lock` table) prevents two replicas from running the same pull. In dev (no MySQL config) an in-memory guard is used instead.
- **No MySQL config:** falls back to in-memory mode gracefully in development; **throws** in production.

---

## API Reference

### `GET /proxy/getTrades`
Returns committed trades, paginated.

**Query params:**
- `symbol`, `tradeType` (BUY/SELL), `client`, `from`/`to` (ISO-8601), `page`, `pageSize` (1–500)

Invalid `page`/`pageSize` → `400`.

### `POST /api/pull/start` (Bearer)
Starts a new pull. Returns `409` if one is already running.

### `GET /proxy/events` (SSE)
- `init` — current state on connect
- `pull_started`, `pull_progress` (delta), `pull_complete` (signal — client re-fetches via REST), `pull_error`

---

## How the 30-second kill is handled

`EventSource` reconnects automatically (retry 3s). The server keeps a 200-event ring buffer; on reconnect the client sends `Last-Event-ID` and the server replays missed events. `pull_complete` is a lightweight signal — the client re-fetches the full dataset via REST.

---

## Deploy

### Docker

```powershell
docker compose up --build
```

Set `API_KEY` and `MYSQL_PASSWORD` via env or a `.env` file next to `docker-compose.yml`.

### pm2

```powershell
pm2 start ecosystem.config.js --env production
```

### HTTPS
Terminate TLS at nginx/Caddy in front of Node. Set `TRUST_PROXY=1`.
