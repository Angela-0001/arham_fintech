/**
 * pullLock.js — distributed pull-concurrency lock (MongoDB-backed lease).
 *
 * Lets the server run as multiple replicas behind a load balancer without two
 * instances running the same pull simultaneously. A single "pull-lock" document
 * is acquired with an atomic conditional update: you only win if it is unheld or
 * its lease has expired. The lease is renewed each batch and released when the
 * pull completes (or fails), so a crashed instance's lock auto-expires and
 * another replica can take over.
 *
 * These functions are ONLY called when MongoDB is connected. In dev
 * (no MONGO_URI) the in-memory flag in pullManager.js is the only guard.
 */
let PullLockModel = require("./models/PullLock");

let instanceId = null;
function getInstanceId() {
  if (!instanceId) {
    instanceId = `${process.env.HOSTNAME || "host"}-${process.pid}-${Date.now().toString(36)}`;
  }
  return instanceId;
}

/**
 * Try to acquire the pull lock for `leaseMs` milliseconds.
 * Returns the lock document if this instance now holds it, or null if another
 * instance holds a non-expired lock.
 */
async function acquirePullLock(leaseMs) {
  const id = getInstanceId();
  const expiresAt = new Date(Date.now() + leaseMs);
  const now = new Date();
  try {
    const res = await PullLockModel.findOneAndUpdate(
      {
        _id: "pull-lock",
        $or: [
          { holder: null },
          { holder: { $exists: false } },
          { expiresAt: { $lt: now } },
        ],
      },
      { $set: { holder: id, expiresAt } },
      { upsert: true, new: true }
    );
    return res && res.holder === id ? res : null;
  } catch (err) {
    // E11000: the doc exists and is held (filter didn't match -> upsert tried to
    // re-insert _id "pull-lock"), or two replicas raced the first insert. Either
    // way, this instance did not get the lock.
    if (err && err.code === 11000) return null;
    throw err;
  }
}

/** Extend the lease. Only succeeds if this instance still holds the lock. */
async function renewPullLock(leaseMs) {
  const id = getInstanceId();
  const expiresAt = new Date(Date.now() + leaseMs);
  const res = await PullLockModel.updateOne(
    { _id: "pull-lock", holder: id },
    { $set: { expiresAt } }
  );
  return !!(res && res.modifiedCount === 1);
}

/**
 * Release the lock. Only clears it if this instance is still the holder, so a
 * replica whose lease already expired (and was taken over) cannot steal it back.
 */
async function releasePullLock() {
  const id = getInstanceId();
  await PullLockModel.updateOne(
    { _id: "pull-lock", holder: id },
    { $set: { holder: null, expiresAt: null } }
  );
}

// Test seam: lets the suite inject an in-memory model. Not for production use.
function __setModelForTest(model) {
  PullLockModel = model;
}

module.exports = { acquirePullLock, renewPullLock, releasePullLock, getInstanceId, __setModelForTest };
