# Architecture Note

## The Problem

| | |
|---|---|
| Pull duration | up to 15 minutes |
| Network timeout | 30 seconds (kills any open HTTP connection) |
| Dashboard must | open instantly, update automatically on pull complete |

The classic approach — hold one HTTP request open for 15 minutes — is impossible here.

---

## Why Server-Sent Events (SSE)?

| Option | Stays under 30s? | Auto-reconnect? | Complexity | Correct? |
|---|---|---|---|---|
| Long-poll HTTP | ✗ connection dies | Manual | Medium | ✗ |
| Polling (interval) | ✓ but this is polling | N/A | Low | ✗ banned |
| WebSockets | ✓ but overkill | Manual | High | ✓ |
| **SSE (chosen)** | **✓** | **Built-in** | **Low** | **✓** |

SSE is HTTP/1.1-compatible, unidirectional (server→client, which is all we need), and the browser's `EventSource` API reconnects automatically. On reconnect it sends `Last-Event-ID` so the server can replay any missed events.

---

## System Design

```mermaid
flowchart TD
    subgraph Browser["Browser (React)"]
        A["GET /proxy/getTrades\non mount → instant data load"]
        B["EventSource /proxy/events\n← init\n← pull_started\n← pull_progress x20\n← pull_complete signal\n↻ auto-reconnect + replay if killed at 30s"]
    end

    subgraph Server["Express Server :4000"]
        C["/proxy/getTrades\nreturns committed trades instantly"]
        D["/proxy/events\nSSE stream — one per browser tab"]
        E["pullManager.js\n20 batches × 45s each\nbroadcast pull_progress per batch\n200-event ring buffer for replay\ncheckpoint per batch"]
        F["seed.js\nmulberry32 PRNG\ndeterministic synthetic trades"]
    end

    subgraph DB["MySQL"]
        G["trades table\nINSERT … ON DUPLICATE KEY UPDATE\nidempotent — no duplicates"]
        H["pull_checkpoint table\ntrade IDs + pull seed per batch\nresume after crash"]
        I["pull_lock table\nMySQL-backed lease\nprevents duplicate pulls across replicas"]
    end

    A -->|HTTP GET| C
    B -->|SSE| D
    D --> E
    E --> F
    E -->|checkpoint each batch| H
    E -->|upsert on complete| G
    E -->|acquire / renew / release| I
```

---

## Data Flow (happy path)

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant S as Express Server
    participant DB as MySQL

    U->>S: Open dashboard
    S-->>U: committed trades (instant from DB)
    U->>S: open EventSource /proxy/events
    S-->>U: init event (state + count)

    S->>S: start background pull (15 min / 20 batches)

    loop every ~45s
        S-->>U: pull_progress (% done + new trades delta)
        S->>DB: checkpoint (trade IDs + seed)
    end

    Note over U,S: network kills connection at 30s
    U->>S: auto-reconnect + Last-Event-ID
    S-->>U: replay missed events from ring buffer

    S->>DB: INSERT … ON DUPLICATE KEY UPDATE
    S-->>U: pull_complete (signal)
    U->>S: GET /proxy/getTrades
    S-->>U: 2,000 trades
    Note over U: table + charts update — no refresh
```

---

## Persistence & Resume

- **Idempotent writes:** trades upserted with `INSERT … ON DUPLICATE KEY UPDATE` keyed on `trade_id`. Re-running a pull updates rather than duplicates.
- **Checkpoint:** each batch saves only the staged trade IDs + the pull seed to the `pull_checkpoint` table (compact — IDs only, not full trade objects).
- **Resume:** on restart, the server regenerates trades from the **stored seed** and resumes from the last saved batch. Using the stored seed keeps data consistent even if the restart crosses a 5-minute seed boundary.

---

## Pull Concurrency (horizontal scaling)

- **Single instance (dev):** in-memory `pullStatus.state === "running"` flag.
- **Multiple replicas (production):** a MySQL-backed lease (`pull_lock` table) — a replica only starts a pull if the lock is unheld or its lease has expired. The lease is renewed each batch and released on completion/failure.

---

## Why not WebSockets?

WebSockets are bidirectional and require a protocol upgrade. For a strictly server-push use case, SSE is simpler, works over plain HTTP/1.1, and the browser handles reconnection natively.

## Why not polling?

Explicitly banned by the brief. Polling also lags behind the real completion by up to one poll interval and wastes bandwidth.
