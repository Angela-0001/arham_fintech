/**
 * pullManager.js — BSE pull lifecycle + SSE broadcast
 *
 * Uses mysql2 for persistence.
 * The SSE broadcast / ring-buffer / replay machinery is intentionally
 * untouched — that's the headline resilience feature.
 */

const { generateTrades }    = require("./seed");
const { isDbConnected }     = require("./db");
const { bulkUpsertTrades, findAllTrades } = require("./models/Trade");
const { saveCheckpoint, loadCheckpoint, deleteCheckpoint } = require("./models/PullCheckpoint");
const { acquirePullLock, renewPullLock, releasePullLock } = require("./pullLock");

// ─── State ────────────────────────────────────────────────────────────────────
let committedTrades = [];
let stagingTrades   = [];

let pullStatus = {
  state: "idle", startedAt: null, completedAt: null,
  progress: 0, totalRecords: 0, pulledRecords: 0,
  batchNumber: 0, totalBatches: 0, error: null,
};

const sseClients = new Map();
const MAX_LOG    = 200;
const eventLog   = [];
let   eventCtr   = 0;

const PULL_DURATION_MS = parseInt(process.env.PULL_DURATION_MS || String(15 * 60 * 1000), 10);
const LOCK_LEASE_MS    = PULL_DURATION_MS + 5 * 60 * 1000;

// ─── DB bootstrap ─────────────────────────────────────────────────────────────
async function loadFromDB() {
  if (!isDbConnected()) return;
  try {
    const cp = await loadCheckpoint();
    if (cp && cp.state === "running" && cp.stagedTradeIds?.length > 0) {
      console.log(`[DB] Found interrupted pull at batch ${cp.batchNumber}/${cp.totalBatches} — resuming.`);
      const allTrades  = generateTrades(2000, cp.pullSeed);
      const idSet      = new Set(cp.stagedTradeIds);
      stagingTrades    = allTrades.filter(t => idSet.has(t.tradeId));
      pullStatus = {
        state: "running", startedAt: cp.startedAt,
        completedAt: null,
        progress: Math.round((cp.pulledRecords / cp.totalRecords) * 100),
        totalRecords: cp.totalRecords, pulledRecords: cp.pulledRecords,
        batchNumber: cp.batchNumber, totalBatches: cp.totalBatches, error: null,
        pullSeed: cp.pullSeed,
      };
      _resumePull(cp);
      return;
    }

    const docs = await findAllTrades();
    if (docs.length > 0) {
      committedTrades = docs;
      committedTrades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      pullStatus.state = "completed";
      console.log(`[DB] Loaded ${committedTrades.length} trades.`);
    } else {
      console.log("[DB] No trades yet.");
    }
  } catch (err) {
    console.error("[DB] loadFromDB:", err.message);
  }
}

// ─── SSE helpers (untouched) ─────────────────────────────────────────────────
function addSseClient(clientId, res, lastEventId = 0) {
  sseClients.set(clientId, { res, lastEventId });
  console.log(`[SSE] +${clientId.slice(0,8)} (total: ${sseClients.size})`);
  const missed = eventLog.filter(e => e.id > lastEventId);
  if (missed.length) {
    console.log(`[SSE] Replaying ${missed.length} events`);
    for (const e of missed) {
      try { res.write(`id: ${e.id}\nevent: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`); }
      catch (_) { break; }
    }
  }
}

function removeSseClient(clientId) {
  sseClients.delete(clientId);
  console.log(`[SSE] -${clientId.slice(0,8)} (total: ${sseClients.size})`);
}

function broadcast(event, data) {
  eventCtr++;
  const id  = eventCtr;
  eventLog.push({ id, event, data });
  if (eventLog.length > MAX_LOG) eventLog.shift();
  const msg = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [cid, c] of sseClients.entries()) {
    try { c.res.write(msg); c.lastEventId = id; }
    catch { console.warn(`[SSE] write fail, removing ${cid}`); sseClients.delete(cid); }
  }
}

// ─── Pull ─────────────────────────────────────────────────────────────────────
async function startPull() {
  if (pullStatus.state === "running") return { started: false, reason: "Pull already running" };

  if (isDbConnected()) {
    const lock = await acquirePullLock(LOCK_LEASE_MS);
    if (!lock) return { started: false, reason: "Pull already running on another instance" };
  }

  stagingTrades = [];
  const pullSeed   = Math.floor(Date.now() / (5 * 60 * 1000));
  const allTrades  = generateTrades(2000, pullSeed);
  const BATCH_COUNT = 20;
  const batchSize   = Math.ceil(allTrades.length / BATCH_COUNT);
  const batchDelay  = PULL_DURATION_MS / BATCH_COUNT;

  pullStatus = {
    state: "running", startedAt: new Date().toISOString(),
    completedAt: null, progress: 0,
    totalRecords: allTrades.length, pulledRecords: 0,
    batchNumber: 0, totalBatches: BATCH_COUNT, error: null,
    pullSeed,
  };

  await _saveCheckpoint(0, []);
  broadcast("pull_started", {
    totalRecords: allTrades.length,
    estimatedMs: PULL_DURATION_MS,
    startedAt: pullStatus.startedAt,
  });

  _runBatches(allTrades, batchSize, batchDelay, BATCH_COUNT, 0);
  return { started: true };
}

async function _resumePull(cp) {
  const allTrades   = generateTrades(2000, cp.pullSeed);
  const BATCH_COUNT = cp.totalBatches;
  const batchSize   = Math.ceil(allTrades.length / BATCH_COUNT);
  const batchDelay  = PULL_DURATION_MS / BATCH_COUNT;

  broadcast("pull_started", {
    totalRecords: cp.totalRecords, estimatedMs: PULL_DURATION_MS,
    startedAt: cp.startedAt, resumed: true, resumedFromBatch: cp.batchNumber,
  });

  _runBatches(allTrades, batchSize, batchDelay, BATCH_COUNT, cp.batchNumber);
}

function _runBatches(allTrades, batchSize, batchDelay, BATCH_COUNT, startBatch) {
  (async () => {
    for (let b = startBatch; b < BATCH_COUNT; b++) {
      await sleep(batchDelay);
      if (isDbConnected()) {
        try { await renewPullLock(LOCK_LEASE_MS); }
        catch (e) { console.warn("[Lock] renew failed:", e.message); }
      }
      const batch = allTrades.slice(b * batchSize, (b + 1) * batchSize);
      stagingTrades.push(...batch);

      pullStatus.pulledRecords = stagingTrades.length;
      pullStatus.batchNumber   = b + 1;
      pullStatus.progress      = Math.round((pullStatus.pulledRecords / allTrades.length) * 100);

      await _saveCheckpoint(b + 1, [...stagingTrades]);

      broadcast("pull_progress", {
        progress:      pullStatus.progress,
        pulledRecords: pullStatus.pulledRecords,
        totalRecords:  pullStatus.totalRecords,
        batchNumber:   pullStatus.batchNumber,
        totalBatches:  BATCH_COUNT,
        newTrades:     batch,
      });

      console.log(`[Pull] Batch ${b+1}/${BATCH_COUNT} — ${pullStatus.pulledRecords}/${allTrades.length}`);
    }

    committedTrades        = [...stagingTrades];
    stagingTrades          = [];
    pullStatus.state       = "completed";
    pullStatus.completedAt = new Date().toISOString();
    pullStatus.progress    = 100;

    if (isDbConnected()) {
      try {
        await bulkUpsertTrades(committedTrades);
        console.log(`[DB] Upserted ${committedTrades.length} trades.`);
        await deleteCheckpoint();
      } catch (err) { console.error("[DB] upsert:", err.message); }
    }

    broadcast("pull_complete", {
      totalRecords: committedTrades.length,
      completedAt:  pullStatus.completedAt,
    });
    console.log(`[Pull] Complete — ${committedTrades.length} trades committed.`);
    if (isDbConnected()) {
      try { await releasePullLock(); }
      catch (e) { console.warn("[Lock] release failed:", e.message); }
    }
  })().catch(async err => {
    pullStatus.state = "failed"; pullStatus.error = err.message;
    broadcast("pull_error", { error: err.message });
    console.error("[Pull] Error:", err);
    if (isDbConnected()) { try { await releasePullLock(); } catch (_) {} }
  });
}

async function _saveCheckpoint(batchNumber, currentStaging) {
  if (!isDbConnected()) return;
  try {
    await saveCheckpoint({
      state:         batchNumber >= pullStatus.totalBatches ? "completed" : "running",
      totalRecords:  pullStatus.totalRecords,
      pulledRecords: pullStatus.pulledRecords,
      batchNumber,
      totalBatches:  pullStatus.totalBatches,
      startedAt:     pullStatus.startedAt,
      updatedAt:     new Date().toISOString(),
      pullSeed:      pullStatus.pullSeed,
      stagedTradeIds: currentStaging.map(t => t.tradeId),
    });
  } catch (err) { console.warn("[DB] checkpoint save failed:", err.message); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Accessors ────────────────────────────────────────────────────────────────
function getCommittedTrades() { return committedTrades; }
function getPullStatus()      { return { ...pullStatus }; }
function getSseClientCount()  { return sseClients.size;  }

module.exports = {
  startPull, loadFromDB,
  getCommittedTrades, getPullStatus, getSseClientCount,
  addSseClient, removeSseClient, broadcast,
};
