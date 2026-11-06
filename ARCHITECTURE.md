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
│  │  GET /getTrades  │◄──── on mount → instant data load         │
│  └─────────────────┘                                             │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  EventSource  /api/events   (SSE)                        │   │
│  │                                                           │   │
│  │  ← init          (current state on connect)              │   │
│  │  ← pull_started  (pull kicked off)                       │   │
│  │  ← pull_progress (every batch, 20× over 15 min)         │   │
│  │  ← pull_complete (full 2000-trade payload)               │   │
│  │                                                           │   │
│  │  If network kills conn (>30s):                           │   │
│  │    EventSource auto-reconnects in 3s                     │   │
│  │    Sends Last-Event-ID → server replays if needed        │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                   HTTP (Vite proxy in dev)
                                │
┌─────────────────────────────────────────────────────────────────┐
│                      Express Server (:4000)                      │
│                                                                   │
│  GET /getTrades ──────────► returns committedTrades[] (instant) │
│  POST /api/pull/start ────► starts pull job (async)             │
│  GET /api/events ─────────► SSE stream, one per browser tab     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  pullManager.js                                           │   │
│  │                                                           │   │
│  │  committedTrades[]  ◄── swap on pull_complete            │   │
│  │                                                           │   │
│  │  Pull job (async):                                        │   │
│  │   generate 2000 trades                                    │   │
│  │   drip in 20 batches × (15min / 20) = 45s each          │   │
│  │   broadcast pull_progress per batch                       │   │
│  │   on done: commit + broadcast pull_complete              │   │
│  │                                                           │   │
│  │  SSE registry: Map<clientId, res>                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  seed.js ─── mulberry32 PRNG (seeded=42) ─── reproducible data  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow (happy path)

```
1. User opens dashboard
   → React mounts, calls GET /getTrades
   → Gets existing committed trades (0 on first boot, 2000 after pull)
   → Opens EventSource to /api/events
   → Server sends "init" event immediately

2. User clicks "New Pull" (or server auto-pulls on startup)
   → POST /api/pull/start
   → Server starts async pull job (15-min drip simulation)
   → Broadcasts "pull_started" → dashboard shows progress bar

3. Every ~45 seconds (each of 20 batches)
   → Server broadcasts "pull_progress" with % done
   → Progress bar updates in all open tabs — no page refresh

4. Pull finishes
   → committedTrades swapped atomically
   → Server broadcasts "pull_complete" with full 2000-trade payload
   → React state updated: setTrades(data.trades)
   → Dashboard shows all trades instantly — no refresh, no polling

5. Network kills SSE connection after 30s
   → EventSource reconnects in ~3s
   → Sends Last-Event-ID header
   → Server sends "init" event with current state
   → No data loss
```

---

## Why not WebSockets?

WebSockets are bidirectional and require a protocol upgrade handshake. For a strictly server-push use case, SSE is simpler, works over plain HTTP/1.1, and the browser handles reconnection natively. WebSockets would have been over-engineering here.

## Why not polling?

The brief explicitly rules it out ("no polling loop"). Polling also wastes bandwidth and adds latency — the dashboard would lag behind the actual pull completion by up to one polling interval.
