# Architecture Note

## The Problem

```
Pull duration:     up to 15 minutes
Network timeout:   30 seconds (kills any open HTTP connection)
Dashboard must:    open instantly, update automatically on pull complete
```

The classic approach — hold one HTTP request open for 15 minutes — is impossible here.

---

## Why Server-Sent Events (SSE)?

| Option              | Works within 30s limit? | Auto-reconnect? | Complexity | Correct? |
|---------------------|------------------------|-----------------|------------|----------|
| Long-poll HTTP      | ✗ connection dies       | Manual          | Medium     | ✗        |
| Polling (interval)  | ✓ but this is polling   | N/A             | Low        | ✗ (brief says no polling) |
| WebSockets          | ✓ but overkill          | Manual          | High       | ✓        |
| **SSE (chosen)**    | **✓**                   | **Built-in**    | **Low**    | **✓**    |

SSE is HTTP/1.1-compatible, unidirectional (server→client, which is all we need), and the browser's `EventSource` API reconnects automatically with exponential back-off. On reconnect it sends `Last-Event-ID` so the server can replay any missed events.

---

## System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser (React)                          │
│                                                                   │
│  ┌─────────────────┐    useTrades hook                          │
│  │  GET /proxy/      │◄──── on mount → instant data load        │
│  │     getTrades     │                                           │
│  └─────────────────┘                                             │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  EventSource  /proxy/events   (SSE)                      │   │
│  │                                                           │   │
│  │  ← init          (current state + committed count)      │   │
│  │  ← pull_started  (pull kicked off)                       │   │
│  │  ← pull_progress (every batch, 20× over 15 min)         │   │
│  │  ← pull_complete (signal — client re-fetches via REST) │   │
│  │                                                           │   │
│  │  If network kills conn (>30s):                           │   │
│  │    EventSource auto-reconnects in 3s                     │   │
│  │    Sends Last-Event-ID → server replays if needed        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                   HTTP (BFF proxy — no key in browser)
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      Express Server (:4000)                      │
│                                                                   │
│  GET /proxy/getTrades ────► returns committedTrades[] (instant) │
│  POST /api/pull/start ────► starts pull job (async)             │
│  GET /proxy/events ───────► SSE stream, one per browser tab     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  pullManager.js                                           │   │
│  │                                                           │   │
│  │  committedTrades[]  ◄── swap on pull_complete            │   │
│  │                                                           │   │
│  │  Pull job (async):                                        │   │
│  │   generate 2000 trades (time-bucketed seed)              │   │
│  │   drip in 20 batches × (15min / 20) = 45s each          │   │
│  │   broadcast pull_progress per batch (delta only)         │   │
│  │   on done: commit + broadcast pull_complete (signal)    │   │
│  │                                                           │   │
│  │  SSE registry: Map<clientId, res>                        │   │
│  │  Ring buffer: last 200 events (replay via Last-Event-ID) │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  seed.js ─── mulberry32 PRNG (time-bucketed seed, stored in checkpoint) ─── reproducible + resumable
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow (happy path)

```
1. User opens dashboard
   → React mounts, calls GET /proxy/getTrades
   → Gets existing committed trades (0 on first boot, 2000 after a pull)
   → Opens EventSource to /proxy/events
   → Server sends "init" event immediately (state + committed count)

2. Server auto-starts a pull on startup (or user clicks "New Pull")
   → POST /api/pull/start
   → Server starts async pull job (15-min drip simulation)
   → Broadcasts "pull_started" → dashboard shows progress bar

3. Every ~45 seconds (each of 20 batches)
   → Server broadcasts "pull_progress" with % done + the new-trades delta
   → Progress bar updates in all open tabs — no page refresh

4. Pull finishes
   → committedTrades swapped
   → Server broadcasts "pull_complete" — a lightweight SIGNAL (not the payload)
   → Client sees it and re-fetches the full dataset via REST
   → React state updated → dashboard shows all trades instantly

5. Network kills SSE connection after 30s
   → EventSource reconnects in ~3s
   → Sends Last-Event-ID header
   → Server replays missed events from its 200-event ring buffer
   → No data loss
```

---

## Persistence & Resume

- **Idempotent writes:** on completion, trades are upserted with
  `INSERT … ON DUPLICATE KEY UPDATE` keyed on `trade_id`. Re-running a pull
  updates rather than duplicates — safe to retry.
- **Checkpoint:** each batch saves only the staged trade IDs + the pull's seed
  to a single `pull_checkpoint` row (compact — IDs only, not full trade objects).
- **Resume:** on restart, if a checkpoint shows a pull in progress, the server
  regenerates the full trade set from the **stored seed** and filters by the
  saved IDs, then continues from the next batch. Using the stored seed (not a
  fresh time-bucketed one) keeps resumed data consistent even if the restart
  crosses a 5-minute seed boundary.

---

## Pull Concurrency (horizontal scaling)

- **Single instance (dev):** an in-memory `pullStatus.state === "running"` flag
  prevents a second pull on the same process.
- **Multiple replicas (production):** a MySQL-backed lease
  (`pull_lock` table) guards `startPull` with an atomic conditional
  update — a replica only starts a pull if the lock is unheld or its lease has
  expired. The lease is renewed each batch and released on completion/failure,
  so a crashed replica's lock auto-expires and another replica can take over.

---

## Why not WebSockets?

WebSockets are bidirectional and require a protocol upgrade handshake. For a strictly server-push use case, SSE is simpler, works over plain HTTP/1.1, and the browser handles reconnection natively. WebSockets would have been over-engineering here.

## Why not polling?

The brief explicitly rules it out ("no polling loop"). Polling also wastes bandwidth and adds latency — the dashboard would lag behind the actual pull completion by up to one polling interval.
