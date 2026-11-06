# Shortcomings Analysis — arham_fintech (BSE Trades Dashboard)

Read-only investigation. No files were modified. Citations are `file:line`. Where a claim
depends on a condition, that condition is stated. "Confirmed" = read in code/config;
"Suspicion" = reasoned from code, with the check that would confirm it.

---

## Summary (TL;DR)

The app is a working Express + MongoDB + React/SSE trades dashboard that satisfies its
core constraint (a 15-minute pull survives a 30-second network kill via `EventSource`
auto-reconnect). The serious problems are operational/security rather than functional:

- **A live MongoDB Atlas credential with embedded username/password sits in `server/.env`
  in plaintext.** It is gitignored, but the directory is not even a git repo, and the key
  should be treated as compromised and rotated.
- **The "secret" API key is the hardcoded dev default** (`dev-bse-key-2024`) even in the
  real `.env`, and it is **printed to stdout on every boot** (`server/index.js:130,145`).
- **Auth accepts the key as `?apiKey=` in the URL**, and the request logger logs the full
  URL (`server/index.js:54`), so using that path writes the key into the access log.
- **Resume-from-checkpoint produces inconsistent data** if the process restarts across a
  5-minute seed boundary (two `generateTrades()` calls with different seeds).
- **During a running pull the API serves duplicate `tradeId`s** (`staging + committed`),
  which collide as React `key`s in the table.
- **Server-side pagination is defeated by the client**, which loops through all pages and
  pulls up to 2,500 records into memory, then re-paginates client-side.
- **No tests anywhere**, **no global error handler**, **no `trust proxy`** (rate limiting
  breaks behind a reverse proxy), and the **root `dev` script is broken on Windows** (the
  host OS) because it uses a POSIX `&` background operator.
- Dependency tree is current and patched (express 4.22.3, path-to-regexp 0.1.13); no known
  unpatched high-severity CVE in the lockfile.

---

## 1. Security shortcomings

### 1.1 Live MongoDB credential committed-to-disk in `server/.env` (confirmed)
`server/.env` contains a real MongoDB Atlas connection string of the form
`mongodb+srv://<user>:<password>@cluster0.g2p9nlt.mongodb.net/bse_trades` with the
username and password in plaintext. This is a genuine production-shaped secret.

Mitigating factor: `.gitignore` excludes it (see §6.6). But:
- The project directory is **not a git repository at all** (`git rev-parse` → "not a git
  repository"), so the `.gitignore` protection is currently theoretical.
- The file is on disk in plaintext; if this machine, a backup, or a zip of the project is
  shared, the credential leaks.
Recommendation: rotate that Atlas user's password, never store the URI in a checked-in
`.env`, use a secrets manager / runtime env injection, and add `.env` to a pre-commit
secret scan.

### 1.2 The API "secret" is the hardcoded dev default (confirmed)
`server/.env` sets `API_KEY=dev-bse-key-2024`, identical to the in-code fallback
(`server/middleware/auth.js:1` → `const API_KEY = process.env.API_KEY || "dev-bse-key-2024"`).
So the "protected" direct API (`/getTrades`, `/api/pull/*`, `/api/events`) is gated by a
public, guessable default. The BFF proxy is the real boundary and does not need it, but
the direct API is effectively unauthenticated.

### 1.3 API key is printed to stdout on boot (confirmed)
`server/index.js:130` and `:145` (inside the two duplicate `boot()` bodies):
```
console.log(`   🔑 API_KEY: ${process.env.API_KEY || "dev-bse-key-2024"}\n`);
```
This writes the active key into the process log on every start. Combined with §1.2 the
value is the dev default, but if a real key is ever set here it will be leaked to logs.

### 1.4 Query-param auth leaks the key into access logs (confirmed)
`server/middleware/auth.js:17` accepts `req.query.apiKey`, and `auth.js:19` prefers it as
`bearerToken || queryKey`. The request logger at `server/index.js:54`:
```
console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
```
logs the full URL, so any call using `?apiKey=<key>` writes the secret into the log. This
is also why query-param auth is generally an anti-pattern (keys land in browser history,
proxy logs, and referrers). The direct SSE endpoint `/api/events` (`server/index.js`) is
behind `requireApiKey`, and `EventSource` cannot set headers — so the only way to use that
endpoint is the leaking `?apiKey=` path. The BFF `/proxy/events` correctly avoids this.

### 1.5 Non-constant-time key comparison (confirmed)
`server/middleware/auth.js:28` compares `provided !== API_KEY` with JS `!==`, which short-
circuits on the first differing byte and is susceptible to timing attacks. Low severity
for a dev key, but use `crypto.timingSafeEqual` for any real key.

### 1.6 No `helmet`, no security headers, no CSP (confirmed)
`server/index.js` never sets `helmet` or any `Content-Security-Policy` /
`X-Content-Type-Options` / frame-ancestors headers. Low impact (JSON API, no stored
user HTML), but standard hardening is absent.

### 1.7 CORS is acceptable but `credentials: true` is unnecessary (confirmed)
`server/index.js` allowlists origins via `ALLOWED_ORIGINS` and rejects others with a 403
middleware. The model is Bearer/query auth, not cookies, so `credentials: true` adds no
value and broadens the surface slightly. Not a hole, just needless.

### 1.8 Dependency vulnerabilities — none known unpatched in the lockfile (confirmed)
`server/package.json` declares `"express": "^4.18.2"` (caret range), but the lockfile
resolves **express 4.22.3** and **path-to-regexp 0.1.13** (`server/package-lock.json:307`,
`:842`; confirmed installed in `server/node_modules`). path-to-regexp 0.1.13 includes the
ReDoS fixes through CVE-2026-4867. So the locked tree is current. Caveats:
- The package.json uses caret ranges (`^`), not pinned versions; reproducibility depends
  on the lockfile being committed (it is).
- Packages were resolved from `registry.npmmirror.com` (a third-party mirror), not the
  official npm registry — a supply-chain/reproducibility note worth flagging.
- There is no `npm audit` step or CI to catch future advisories.

---

## 2. Architecture / design shortcomings

### 2.1 No upstream API — the "pull" is a local PRNG (confirmed vs. brief)
The task brief describes "a `pullManager.js` that pulls trades from an upstream API via a
proxy route." In reality `pullManager.js` calls `generateTrades(2000)`
(`server/pullManager.js:106`, `:129`, `:43`) from `server/seed.js`, a deterministic
`mulberry32` PRNG. The `/proxy` router (`server/routes/proxy.js`) is a BFF wrapper around
the in-memory store, **not** an HTTP call to BSE. There is no outbound network call and no
SSRF surface. This is fine for an assessment but the "upstream API" framing in the
README/brief is misleading; the data is synthetic.

### 2.2 `pull_complete` does NOT carry the full trade payload (docs vs. code mismatch)
`server/pullManager.js:189`:
```
broadcast("pull_complete", { totalRecords: committedTrades.length, completedAt: pullStatus.completedAt });
```
`README.md` and `ARCHITECTURE.md` both state `pull_complete` carries "the full 2000-trade
payload" so reconnecting clients get the whole dataset from the event. The code sends only
a signal; the client must re-`fetch` (which `useTrades.js` does on `pull_complete`). So the
behaviour works, but the docs are wrong and the stated resilience property ("reconnecting
clients receive the full committed dataset in the event") is not how it actually works.

### 2.3 Two divergent SSE endpoints (confirmed)
- Direct `/api/events` (`server/index.js`) sends the **full trade list** in the `init`
  event and is behind `requireApiKey`.
- BFF `/proxy/events` (`server/routes/proxy.js`) sends only `pullStatus` + count in `init`
  (Fix #1) and is keyless.
The two paths have different payloads and different auth. The dashboard uses the BFF; the
direct path is heavier and exists mainly for Postman. Worth consolidating or documenting.

### 2.4 Everything is loaded into memory; filtering/pagination is in JS (confirmed)
`server/pullManager.js` keeps `committedTrades` in a module-level array.
`server/db.js` / `loadFromDB` does `Trade.find({}).lean()` (all docs) into memory. Both
`/getTrades` and `/proxy/getTrades` then filter and slice in JavaScript, never via Mongo
queries. This works for ~2,000 records but does not scale and makes the Mongoose indexes
(`server/models/Trade.js`: `symbol`, `tradeType`, `timestamp`, and two compound indexes)
largely unused for API reads. The schema indexes are good *if* DB-side querying is ever
added; today they only help direct Atlas queries.

### 2.5 No global Express error handler (confirmed)
`server/index.js` has a 404 catch-all but no 4-arg error middleware (`app.use((err, req,
res, next) => …)` — grep found none). Express 4 does not auto-catch rejected promises
from async route handlers, so any thrown error in an async handler becomes an unhandled
rejection rather than a clean 500. There are also no `uncaughtException`/`unhandledRejection`
handlers.

### 2.6 No `trust proxy` — rate limiting will collapse behind a reverse proxy (confirmed)
`server/index.js` never calls `app.set('trust proxy', …)`. `express-rate-limit` (v8) keys
on `req.ip`, which only respects `X-Forwarded-For` when `trust proxy` is configured. The
README explicitly says production runs behind nginx/Caddy; in that setup every request
appears to come from the proxy's IP, so the global limiter (200/min) and the proxy limiter
(100/min) become a single shared bucket for all clients. Confirmed by absence of the
setting.

### 2.7 Concurrency guard is single-process only (suspicion → low impact)
`startPull` guards with `if (pullStatus.state === "running")` (`server/pullManager.js`)
using a module-level variable. This is fine for one Node process, but the design cannot
scale horizontally (two instances would each run their own pull). The architecture is
implicitly single-instance. Not a bug, but a scalability ceiling worth stating.

---

## 3. Code quality shortcomings

### 3.1 Duplicate `boot()` function (confirmed)
`server/index.js` declares `async function boot()` twice: at line 122 and again at line
137. Function declarations with the same name are hoisted and the later definition wins, so
the first body (lines 122–136) is dead code; only the second (which `return`s the server
handle for graceful shutdown) runs. The duplicate `console.log` of the API key
(`:130` and `:145`) is a symptom of the copy. This is confusing and error-prone.

### 3.2 Duplicate tradeIds served during a running pull → React key collisions (confirmed)
`server/pullManager.js:227`:
```
return (pullStatus.state === "running" && stagingTrades.length > 0)
  ? [...stagingTrades, ...committedTrades]
  : committedTrades;
```
`tradeId`s are stable per index (`BSE${i+1}`, `server/seed.js`), so on a **second** pull
the in-flight `stagingTrades` (new, same IDs) are concatenated with `committedTrades`
(previous pull, same IDs). `getCommittedTrades()` then returns duplicate `tradeId`s.
`client/src/components/TradesTable.jsx:90` uses `key={trade.tradeId}`, so the table will
emit React duplicate-key warnings and render rows incorrectly while a pull runs. The
client's `pull_progress` dedup (`useTrades.js:104-107`) also drops these because the IDs
already exist (`seen.has(t.tradeId)`), so live progress does not update on a second pull
until `pull_complete` triggers a re-fetch.

### 3.3 Resume mixes two seed generations across a 5-minute boundary (confirmed, conditional)
Checkpoint resume path:
- `server/pullManager.js:43` regenerates `allTrades = generateTrades(2000)` and filters by
  saved IDs to rebuild `stagingTrades`.
- `_resumePull` (`pullManager.js:129`) calls `generateTrades(2000)` **again** and feeds
  that array to `_runBatches` for batches ≥ `startBatch`.
`seed.js` derives the seed from `Math.floor(Date.now() / (5*60*1000))` — a 5-minute bucket.
If the restart crosses a bucket boundary, the two `generateTrades()` calls use different
seeds, so the rebuilt early batches and the freshly-run later batches have **different
prices/timestamps for the same `tradeId`s**. Within one 5-minute window the data is
consistent; across the boundary it is internally inconsistent. The "deterministic resume"
comment (`pullManager.js:43`) overstates the guarantee.

### 3.4 Pagination params (`page`, `pageSize`) are unvalidated (confirmed)
`server/middleware/validate.js:17` destructures only `{ symbol, tradeType, limit, from, to }`
and validates `limit`. But the actual routes use `page` and `pageSize`
(`server/index.js` `/getTrades`, `server/routes/proxy.js` `/proxy/getTrades`):
```
const pageSize = Math.min(parseInt(req.query.pageSize || "200", 10), 500);
const pageNum  = Math.max(parseInt(req.query.page    || "1",   10), 1);
```
`parseInt("abc")` → `NaN`; `Math.min(NaN,500)` → `NaN`; `Math.max(NaN,1)` → `NaN`; then
`result.slice(NaN, NaN)` → empty array. So `?page=foo` silently returns zero trades with
`success: true` instead of a 400. The `limit` validation that does exist is effectively dead
for these endpoints because they don't read `limit`.

### 3.5 `from`/`to` filtering compares ISO strings lexicographically (confirmed, edge case)
Routes filter with `t.timestamp >= from` (`server/routes/proxy.js`, `server/index.js`).
`validate.js` only checks `Date.parse(from)` is parseable, not that it is a normalized ISO
string. A value like `from=01/01/2024` passes `Date.parse` but compares lexically against
`"2024-...T..."` timestamps and silently misbehaves. Fine for strict ISO-8601 input; broken
for other parseable date formats.

### 3.6 Inconsistent pagination PAGE_SIZE across layers (confirmed)
Three different page sizes: client REST fetch `useTrades.js:11` `PAGE_SIZE = 500`
(fetches up to 5 pages = 2,500 records); client UI `useFilters.js` `PAGE_SIZE = 50`; server
caps `pageSize` at 500. The client loops the server's pages to pull everything, then
re-paginates client-side — so server pagination provides no real benefit for the dashboard
and the two `PAGE_SIZE` constants invite confusion.

### 3.7 Notification auto-clear timer is not reset on replacement (confirmed)
`client/src/hooks/useTrades.js` `showNotification` sets a 6s `setTimeout` to clear the
notification but does not clear the previous timer. Two notifications within 6s → the
first timer fires and clears the second early; the timeout also risks a setState-after-
unmount warning. Minor.

### 3.8 Loading timeout can race with a late successful fetch (confirmed)
`useTrades.js:13` `LOAD_TIMEOUT_MS = 8000`. The timer fires `setServerError(true)` at 8s
even if a slow fetch is still in flight; when the fetch later resolves it calls
`setServerError(false)`. The user may briefly see an error screen that then corrects
itself. Minor UX bug.

### 3.9 Dead/misleading Vite proxy config (confirmed)
`client/vite.config.js:9-10` proxies `/getTrades` and `/api` to `http://localhost:4000`.
But the client talks to the API via the absolute `VITE_API_URL`
(`useTrades.js:10` → `http://localhost:4000/proxy`), so these proxy entries are unused.
Worse, `/getTrades` and `/api/*` on the server are the **auth-required** direct endpoints,
so if anyone ever switched the client to the proxied relative paths they would get 401s.
The proxy also does not include `/proxy`, the path the client actually uses (which is why
the client relies on CORS, not the dev proxy).

### 3.10 Redundant `dotenv` load (confirmed)
`require("dotenv").config()` runs in both `server/index.js` and `server/pullManager.js`.
Harmless, but redundant.

---

## 4. Data-layer shortcomings

### 4.1 Schema/index design is reasonable but underused (confirmed)
`server/models/Trade.js` indexes `symbol`, `tradeType`, `timestamp` plus compound
`{symbol:1, timestamp:-1}` and `{tradeType:1, timestamp:-1}`. These are good choices — but
all API reads filter in memory over `committedTrades`, so the indexes only help direct
Atlas queries, not the dashboard. There is **no index on `client`** (filtered with
`.includes()` in memory, so not needed today, but would be if DB-side filtering is added).

### 4.2 Idempotency is correct (confirmed)
`pullManager.js` persists via `Trade.bulkWrite` with `filter: { _id: t.tradeId }`,
`upsert: true` (`_id` is the stable `tradeId`). Running the same pull twice updates rather
than duplicates. `server/models/Trade.js` overrides `_id` to the string `tradeId`. Correct.

### 4.3 Checkpoint correctness — see §3.3 (conditional data inconsistency on resume)
The compact-ID checkpoint design is sound in principle (stays under the 16MB limit), but
the resume path's reliance on regenerating trades from a time-bucketed seed breaks across
the 5-minute boundary. A robust fix would store the `pullSeed` used in the checkpoint and
replay with that exact seed.

### 4.4 Stale checkpoint not always cleaned (suspicion, low impact)
`startPull` writes an initial checkpoint with `stagedTradeIds: []` and `state: "running"`
(`pullManager.js`). `loadFromDB` only resumes when `cp.stagedTradeIds?.length > 0`
(`pullManager.js`). A crash exactly at batch 0 therefore leaves a checkpoint that does not
trigger resume, and a fresh boot auto-starts a new pull that overwrites it. The stale doc
lingers until then. Minor.

### 4.5 `committedTrades` swap is not atomic across async reads (suspicion, very low impact)
`pullManager.js` does `committedTrades = [...stagingTrades]; stagingTrades = [];` as two
statements. A concurrent `getCommittedTrades()` between them (impossible in a single
synchronous tick, but the surrounding code is `async`) could in principle observe a
transient state. In practice Node's single thread makes this harmless; flagging only for
completeness.

---

## 5. Frontend shortcomings

### 5.1 Sortable table headers are not keyboard-accessible (confirmed)
`client/src/components/TradesTable.jsx:71-72` puts `onClick={() => onSort(col.field)}` on a
`<th>` with `aria-sort` set correctly, but the `<th>` is not a button, has no `tabIndex`,
and no `onKeyDown`. Keyboard-only users cannot trigger sorting. Add a real `<button>`
inside the `<th>` (with `scope="col"` on the th) or `tabIndex={0}` + Enter/Space handling.

### 5.2 Progress bar and charts lack ARIA roles / text alternatives (confirmed)
`PullStatus.jsx` renders a progress bar with no `role="progressbar"` /
`aria-valuenow`/`aria-valuemax`. `Charts.jsx` recharts SVGs have no `title`/`desc` or
`aria-label`. The wrapping `<section aria-label="Trade charts">` helps, but the widgets
themselves are not accessible to screen readers. (Full WCAG validation requires manual
testing with assistive tech and expert review; this is a static-axe-level observation.)

### 5.3 Color-only status is mostly mitigated (confirmed, OK)
The "Live / Reconnecting…" indicator uses a colored dot plus text label, so it is not
color-only. The Buy/Sell `Badge` uses both color and text. This area is fine.

### 5.4 Client-side filtering over the full dataset (confirmed, scale note)
`useFilters.js` filters/sorts the entire in-memory trades array (up to 2,500) on every
keystroke with no debounce. Fine at this volume; would need virtualization/debounce to
scale. `Charts.jsx` throttles recompute (every 100 new trades, "Fix #7") — a good
optimization already present.

### 5.5 `VITE_API_URL` baked at build time, default points at localhost (confirmed, deploy)
`useTrades.js:10` and `ErrorState.jsx` use `import.meta.env.VITE_API_URL || 'http://localhost:4000/proxy'`.
Vite inlines `VITE_*` vars at **build** time. `client/.env` sets it to `http://localhost:4000/proxy`,
and `.env.example` mirrors that. A production build without overriding `VITE_API_URL` will
point the dashboard at `localhost:4000` and break. There is no runtime config injection.

### 5.6 No frontend input validation, but not needed (confirmed, OK)
Filters/search are client-only; the only data sent to the server is pagination params to
`/proxy/getTrades`, which the server validates (with the §3.4 caveat). No XSS surface from
user input because nothing user-supplied is rendered as HTML (all via JSX). The
`validate.js` HTML-strip on `client` is therefore low-value (the data is seeded anyway).

---

## 6. Operational / dev shortcomings

### 6.1 Root `dev` script is broken on Windows (confirmed)
Root `package.json`:
```
"dev": "npm run server & npm run client"
```
`&` is a POSIX background operator. On Windows (this host's OS, per `win32`/PowerShell),
`&` is not a background operator — in cmd it sequences, in PowerShell it is the call
operator. So `npm run dev` will not run both processes correctly on Windows. Use
`concurrently`/`npm-run-all` or document running the two `npm run` commands in separate
terminals (which the README already does).

### 6.2 No health check beyond `/health` (mostly OK)
`server/index.js` exposes `GET /health` returning status, uptime, committed count, pull
state, DB flag, and SSE client count. This is good. It does **not** probe MongoDB
connectivity actively (it reports `dbConnected` from the cached flag), but that flag is
derived from `mongoose.connection.readyState`, so it is effectively live. Acceptable.

### 6.3 Logging is `console.log` only (confirmed)
No structured logger, no levels, no request IDs, no log levels by env. Secrets are logged
(§1.3, §1.4). Not production-grade.

### 6.4 No tests, no lint on the server, no CI (confirmed)
The recursive file listing shows **no test files** anywhere; `server/package.json` has no
`test` script and no test framework; `client/package.json` has `lint: oxlint` but no test
script and `oxlint` is only a devDependency with no config beyond `.oxlintrc.json`. There is
no CI configuration in the tree. This is the biggest code-quality gap for an assessment
deliverable.

### 6.5 No process manager / containerization (confirmed)
No `Dockerfile`, no `pm2`/ecosystem config, no Procfile. `npm run dev`/`start` run bare
`node`. Not deploy-ready without extra work.

### 6.6 `.gitignore` correctly excludes `.env` — with a small gap (confirmed)
`.gitignore` contains:
```
server/.env
client/.env
.env
```
So all three `.env` variants present are ignored. ✅ (This is the security-critical check
the brief asked for.) Small gap: there is no `.env*` or `.env.*` glob, so `.env.production`
or `.env.local` at the **root** would not be ignored (the client-level `.gitignore` covers
`*.local`, but the root does not). Also note the repo is not yet a git repo, so these rules
are not active until `git init`.

### 6.7 `.env.example` is incomplete (confirmed)
`server/.env.example` omits `ALLOWED_ORIGINS` (present in the real `.env` and used by
`server/index.js`). A user copying the example would not set CORS origins and would get the
hardcoded default, which happens to match localhost — fine for dev, but the example should
document it.

### 6.8 No fail-fast on missing config (confirmed)
`server/db.js` silently falls back to in-memory when `MONGO_URI` is absent, and `auth.js`
falls back to the dev key when `API_KEY` is absent. Neither logs a warning at the right
severity nor fails in production. A production deployment missing `MONGO_URI` would run
stateless and lose data on restart without an explicit error.

---

## Conclusions

The application satisfies its headline requirement (long pull under a 30s connection kill,
via SSE + auto-reconnect + an in-memory ring-buffer replay). The most important issues to
fix before anything resembling production:

1. **Rotate the leaked MongoDB credential** in `server/.env` and stop storing secrets in
   checked-in files (§1.1).
2. **Stop logging the API key** and stop accepting it via `?apiKey=` (§1.3, §1.4); set a
   real, non-default key (§1.2) and compare with `crypto.timingSafeEqual` (§1.5).
3. **Fix resume seed determinism** by storing the `pullSeed` in the checkpoint and
   replaying with it (§3.3, §4.3).
4. **Fix duplicate-`tradeId` serving during a running pull** — return only `committed`, or
   dedupe by `tradeId`, so the table keys don't collide (§3.2).
5. **Add a global error handler and `app.set('trust proxy', …)`** for reverse-proxy
   deployments (§2.5, §2.6).
6. **Add tests** (server unit/integration for pullManager + validation; client component
   tests) — currently zero coverage (§6.4).
7. **Add `helmet`/CSP and pin/audit dependencies** (§1.6, §1.8).
8. **Validate `page`/`pageSize`** and stop using `limit` validation that nothing reads
   (§3.4); **fix the root `dev` script for Windows** (§6.1); **document/set `VITE_API_URL`
   for prod builds** (§5.5).

Lower-priority polish: consolidate the two SSE endpoints and their divergent `init`
payloads (§2.3), correct the README/ARCHITECTURE claim that `pull_complete` carries the
full payload (§2.2), remove the dead Vite proxy entries (§3.9), make sortable headers
keyboard-operable (§5.1), and add `role="progressbar"` to the pull progress UI (§5.2).

## What is fine (briefly)
- Core SSE reconnect + ring-buffer replay design (`pullManager.js` `eventLog`/`broadcast`).
- Idempotent `bulkWrite` upsert keyed on `tradeId` (§4.2).
- The compact-ID checkpoint idea (under the 16MB limit) (§4.3).
- Charts recompute throttling (§5.4).
- `.gitignore` excludes `.env` (§6.6).
- Dependency tree is patched (§1.8).
- BFF pattern keeps the key out of the browser bundle (`VITE_API_URL` is just a URL).
