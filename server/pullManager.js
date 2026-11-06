/**
 * pullManager.js — BSE pull lifecycle + SSE broadcast
 *
 * All previous fixes retained, plus:
 * Fix #2  — checkpoint each batch to MongoDB; restart resumes from last batch
 * Fix #4  — pagination now done in routes/proxy.js and /getTrades directly
 * Fix #6  — SSE sends delta (newTrades) only, not growing array
 * Fix #4b — event replay via in-memory ring buffer (200 events)
 */

require("dotenv").config();
const { generateTrades }    = require("./seed");
const { isDbConnected }     = require("./db");
const Trade                 = require("./models/Trade");
const PullCheckpoint        = require("./models/PullCheckpoint");

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

// ─── DB bootstrap ─────────────────────────────────────────────────────────────
async function loadFromDB() {
  if (!isDbConnected()) return;
  try {
    // Check for an interrupted pull and resume it (Fix #2)
    const cp = await PullCheckpoint.findById("singleton").lean();
    if (cp && cp.state === "running" && cp.stagedTradeIds?.length > 0) {
      console.log(`[DB] Found interrupted pull at batch ${cp.batchNumber}/${cp.totalBatches} — resuming.`);
      // Regenerate full trade objects from deterministic seed, filtered by saved IDs
      const allTrades  = generateTrades(2000);
      const idSet      = new Set(cp.stagedTradeIds);
      stagingTrades    = allTrades.filter(t => idSet.has(t.tradeId));
      pullStatus = {
        state: "running", startedAt: cp.startedAt,
        completedAt: null, progress: Math.round((cp.pulledRecords / cp.totalRecords) * 100),
        totalRecords: cp.totalRecords, pulledRecords: cp.pulledRecords,
        batchNumber: cp.batchNumber, totalBatches: cp.totalBatches, error: null,
      };
      _resumePull(cp);
      return;
    }

    const docs = await Trade.find({}).lean();
    if (docs.length > 0) {
      committedTrades = docs.map(({ _id, __v, ...rest }) => rest);
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

// ─── SSE helpers ─────────────────────────────────────────────────────────────
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

  stagingTrades = [];
  const allTrades   = generateTrades(2000);
  const BATCH_COUNT = 20;
  const batchSize   = Math.ceil(allTrades.length / BATCH_COUNT);
  const batchDelay  = PULL_DURATION_MS / BATCH_COUNT;

  pullStatus = {
    state: "running", startedAt: new Date().toISOString(),
    completedAt: null, progress: 0,
    totalRecords: allTrades.length, pulledRecords: 0,
    batchNumber: 0, totalBatches: BATCH_COUNT, error: null,
  };

  // Persist initial checkpoint (Fix #2)
  await _saveCheckpoint(0, []);

  broadcast("pull_started", { totalRecords: allTrades.length, estimatedMs: PULL_DURATION_MS, startedAt: pullStatus.startedAt });

  _runBatches(allTrades, batchSize, batchDelay, BATCH_COUNT, 0);
  return { started: true };
}

// Separate function so resume can call it from any batch index
async function _resumePull(cp) {
  const allTrades   = generateTrades(2000);
  const BATCH_COUNT = cp.totalBatches;
  const batchSize   = Math.ceil(allTrades.length / BATCH_COUNT);
  const batchDelay  = PULL_DURATION_MS / BATCH_COUNT;
  const startBatch  = cp.batchNumber; // resume from next batch

  broadcast("pull_started", {
    totalRecords: cp.totalRecords, estimatedMs: PULL_DURATION_MS,
    startedAt: cp.startedAt, resumed: true, resumedFromBatch: startBatch,
  });

  _runBatches(allTrades, batchSize, batchDelay, BATCH_COUNT, startBatch);
}

function _runBatches(allTrades, batchSize, batchDelay, BATCH_COUNT, startBatch) {
  (async () => {
    for (let b = startBatch; b < BATCH_COUNT; b++) {
      await sleep(batchDelay);
      const batch = allTrades.slice(b * batchSize, (b + 1) * batchSize);
      stagingTrades.push(...batch);

      pullStatus.pulledRecords = stagingTrades.length;
      pullStatus.batchNumber   = b + 1;
      pullStatus.progress      = Math.round((pullStatus.pulledRecords / allTrades.length) * 100);

      // Checkpoint every batch (Fix #2)
      await _saveCheckpoint(b + 1, [...stagingTrades]);

      // Delta only — not growing array (Fix #6)
      broadcast("pull_progress", {
        progress: pullStatus.progress,
        pulledRecords: pullStatus.pulledRecords,
        totalRecords: pullStatus.totalRecords,
        batchNumber: pullStatus.batchNumber,
        totalBatches: BATCH_COUNT,
        newTrades: batch,
      });

      console.log(`[Pull] Batch ${b+1}/${BATCH_COUNT} — ${pullStatus.pulledRecords}/${allTrades.length}`);
    }

    committedTrades        = [...stagingTrades];
    stagingTrades          = [];
    pullStatus.state       = "completed";
    pullStatus.completedAt = new Date().toISOString();
    pullStatus.progress    = 100;

    // Persist to MongoDB
    if (isDbConnected()) {
      try {
        const ops = committedTrades.map(t => ({
          updateOne: { filter: { _id: t.tradeId }, update: { $set: { ...t, _id: t.tradeId } }, upsert: true },
        }));
        const r = await Trade.bulkWrite(ops, { ordered: false });
        console.log(`[DB] Upserted ${r.upsertedCount} new, modified ${r.modifiedCount}.`);
        // Clear checkpoint now that pull is done
        await PullCheckpoint.deleteOne({ _id: "singleton" });
      } catch (err) { console.error("[DB] bulkWrite:", err.message); }
    }

    broadcast("pull_complete", { totalRecords: committedTrades.length, completedAt: pullStatus.completedAt });
    console.log(`[Pull] Complete — ${committedTrades.length} trades committed.`);
  })().catch(err => {
    pullStatus.state = "failed"; pullStatus.error = err.message;
    broadcast("pull_error", { error: err.message });
    console.error("[Pull] Error:", err);
  });
}

async function _saveCheckpoint(batchNumber, currentStaging) {
  if (!isDbConnected()) return;
  try {
    // Store only tradeIds (not full objects) to stay well under MongoDB's 16MB doc limit.
    // On resume we regenerate trades from seed (deterministic) and filter by stored ids.
    const tradeIds = currentStaging.map(t => t.tradeId);
    await PullCheckpoint.findOneAndUpdate(
      { _id: "singleton" },
      {
        state: batchNumber >= pullStatus.totalBatches ? "completed" : "running",
        totalRecords:  pullStatus.totalRecords,
        pulledRecords: pullStatus.pulledRecords,
        batchNumber,
        totalBatches:  pullStatus.totalBatches,
        startedAt:     pullStatus.startedAt,
        updatedAt:     new Date().toISOString(),
        // Compact: just IDs, not full trade objects
        stagedTradeIds: tradeIds,
      },
      { upsert: true, new: true }
    );
  } catch (err) { console.warn("[DB] checkpoint save failed:", err.message); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Accessors ────────────────────────────────────────────────────────────────
function getCommittedTrades() {
  return (pullStatus.state === "running" && stagingTrades.length > 0)
    ? [...stagingTrades, ...committedTrades]
    : committedTrades;
}
function getPullStatus()    { return { ...pullStatus }; }
function getSseClientCount(){ return sseClients.size;  }

module.exports = {
  startPull, loadFromDB,
  getCommittedTrades, getPullStatus, getSseClientCount,
  addSseClient, removeSseClient, broadcast,
};
