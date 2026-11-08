/**
 * pullLock.js — distributed pull-concurrency lock (MySQL-backed lease).
 *
 * Lets the server run as multiple replicas without two instances running the
 * same pull simultaneously. A single 'pull-lock' row is acquired with a
 * conditional UPDATE — you only win if it's unheld or its lease has expired.
 * The lease is renewed each batch and released on completion/failure.
 *
 * Only called when MySQL is connected. In dev (no DB) the in-memory
 * pullStatus.state flag in pullManager.js is the only guard.
 */
const { acquireLockRow, renewLockRow, releaseLockRow } = require("./models/PullLock");

let instanceId = null;
function getInstanceId() {
  if (!instanceId) {
    instanceId = `${process.env.HOSTNAME || "host"}-${process.pid}-${Date.now().toString(36)}`;
  }
  return instanceId;
}

async function acquirePullLock(leaseMs) {
  const id       = getInstanceId();
  const expiresAt = new Date(Date.now() + leaseMs);
  const winner   = await acquireLockRow(id, expiresAt);
  return winner ? { holder: winner } : null;
}

async function renewPullLock(leaseMs) {
  const id       = getInstanceId();
  const expiresAt = new Date(Date.now() + leaseMs);
  return renewLockRow(id, expiresAt);
}

async function releasePullLock() {
  await releaseLockRow(getInstanceId());
}

// Test seam: allows unit tests to inject a fake implementation.
function __setModelForTest(_model) {
  // no-op in the MySQL version — tests mock at the mysql2 pool level
}

module.exports = { acquirePullLock, renewPullLock, releasePullLock, getInstanceId, __setModelForTest };
