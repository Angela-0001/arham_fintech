# BSE Trades Dashboard — Arham Fintech Technical Assessment

A full-stack app that solves the core constraint:

> **A full pull takes up to 15 minutes, but the network kills any HTTP connection held open longer than 30 seconds.**

---

## Architecture in one line

`GET /getTrades` returns committed data instantly.  
A background pull job streams trades in batches.  
**Server-Sent Events (SSE)** push `pull_complete` to every open browser tab — no polling, no page refresh, no cron.

---

## Tech Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| API      | Node.js + Express             |
| Frontend | React 18 + Vite               |
| Realtime | Server-Sent Events (SSE)      |
| Seed     | Deterministic mulberry32 PRNG |

---

## Project Structure

```
arham_fintech/
├── server/
│   ├── index.js          # Express API (routes)
│   ├── pullManager.js    # Pull lifecycle + SSE broadcast
│   └── seed.js           # 2000-record BSE trade generator
└── client/
    ├── src/
    │   ├── hooks/
    │   │   ├── useTrades.js   # SSE subscription + initial fetch
    │   │   └── useFilters.js  # Client-side filter/sort/paginate
    │   ├── components/
    │   │   ├── Header.jsx
    │   │   ├── StatsBar.jsx
    │   │   ├── PullStatus.jsx
    │   │   ├── Filters.jsx
    │   │   ├── TradesTable.jsx
    │   │   ├── Pagination.jsx
    │   │   ├── Notification.jsx
    │   │   └── ui/
    │   │       ├── Badge.jsx
    │   │       └── Spinner.jsx
    │   ├── App.jsx
    │   └── main.jsx
    └── vite.config.js    # Dev proxy → localhost:4000
```

---

## Setup & Run

### Prerequisites
- Node.js ≥ 18

### 1. Install dependencies

```bash
# From the project root
npm install --prefix server
npm install --prefix client
```

### 2. Start the API server

```bash
cd server
node index.js
# → http://localhost:4000
```

The server auto-starts the first pull on startup.

### 3. Start the React dashboard

```bash
cd client
npm run dev
# → http://localhost:5173
```

Open http://localhost:5173 — the dashboard loads immediately with whatever trades are already committed, and updates live when the pull completes.

---

## Environment Variables (server)

Copy `server/.env.example` to `server/.env` and fill in your values:

```
PORT=4000
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/bse_trades
PULL_DURATION_MS=900000
API_KEY=your-secret-api-key
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
```

| Variable           | Default             | Description                           |
|--------------------|---------------------|---------------------------------------|
| `PORT`             | `4000`              | API server port                       |
| `MONGO_URI`        | —                   | MongoDB Atlas connection string       |
| `PULL_DURATION_MS` | `900000` (15m)      | Simulated pull duration in ms         |
| `API_KEY`          | `dev-bse-key-2024`  | Bearer key for direct API access      |
| `ALLOWED_ORIGINS`  | `localhost:5173,...` | Comma-separated CORS allowed origins  |

To demo quickly, set `PULL_DURATION_MS=60000` for a 1-minute pull:

```powershell
$env:PULL_DURATION_MS=60000; node index.js
```

### API access

The dashboard uses the **BFF proxy** — no API key needed from the browser:
```
GET  /proxy/getTrades        — trades (paginated)
GET  /proxy/events           — SSE stream
POST /proxy/pull/start       — trigger a pull
GET  /proxy/pull/status      — pull status
```

Direct access (Postman / server-to-server) requires the Bearer key:
```
GET /getTrades
Authorization: Bearer dev-bse-key-2024
```

### MongoDB behaviour
- On startup: loads existing trades — dashboard shows data instantly after restart.
- On pull complete: bulkWrite upserts all trades (idempotent, no duplicates).
- Checkpoint: each batch saves trade IDs only (compact — no 16MB limit risk). Restart mid-pull resumes from the last batch.
- No `MONGO_URI`: falls back to in-memory mode gracefully.

### HTTPS
Runs over HTTP locally. In production, terminate TLS at a reverse proxy (nginx/Caddy) in front of Node.

---

## API Reference

### `GET /getTrades`
Returns all committed trades.

**Query params (optional):**
- `symbol` — e.g. `?symbol=RELIANCE`
- `tradeType` — `BUY` or `SELL`
- `client` — partial match
- `from` / `to` — ISO timestamp range
- `limit` — max records

**Response:**
```json
{
  "success": true,
  "meta": { "totalRecords": 2000, "pullState": "completed", "lastPulledAt": "…" },
  "trades": [ { "tradeId": "BSE000001", "symbol": "RELIANCE", … } ]
}
```

### `POST /api/pull/start`
Starts a new simulated pull. Returns `409` if one is already running.

### `GET /api/pull/status`
Returns the current pull job state and progress.

### `GET /api/events`
SSE stream. Events emitted:
- `init` — sent on connect with current state
- `pull_started` — a new pull has begun
- `pull_progress` — batch-by-batch progress (progress %, record count)
- `pull_complete` — pull done; full trade list included
- `pull_error` — something went wrong

---

## How the 30-second kill is handled

The browser's native `EventSource` reconnects automatically when a connection drops, sending `Last-Event-ID` in the `Retry` header so no events are missed. The server sets `retry: 3000` (reconnect in 3 s). The trade data is pushed in the `pull_complete` event payload so reconnecting clients always receive the full committed dataset.
