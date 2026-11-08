/**
 * pullLock.test.js — unit tests for the distributed MySQL-backed pull lock.
 *
 * Uses the __setPoolForTest seam in models/PullLock.js to inject an in-memory
 * fake pool. No real DB needed. The fake mimics MySQL's conditional UPDATE
 * affectedRows=1/0 semantics.
 */
const LockModel = require('../models/PullLock');
const { acquirePullLock, renewPullLock, releasePullLock } = require('../pullLock');

let lockDoc = null; // { holder, expires_at }

function makePool() {
  return {
    async execute(sql, params = []) {
      const now = new Date();
      // INSERT IGNORE — always a no-op / success
      if (sql.includes('INSERT IGNORE')) {
        if (!lockDoc) lockDoc = { holder: null, expires_at: null };
        return [{ affectedRows: 1 }];
      }
      // UPDATE acquire: holder IS NULL OR expires_at < now
      if (sql.includes('holder IS NULL')) {
        const [holder, expiresAt] = params;
        const held    = lockDoc && lockDoc.holder != null;
        const expired = lockDoc && lockDoc.expires_at != null &&
                        new Date(lockDoc.expires_at).getTime() < now.getTime();
        if (!held || expired) {
          lockDoc = { holder, expires_at: expiresAt };
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      // UPDATE renew: SET expires_at=? WHERE … holder=?  (2 params: expiresAt, holder)
      if (sql.includes('expires_at=?') && !sql.includes('NULL') && params.length === 2) {
        const [expiresAt, holder] = params;
        if (lockDoc && lockDoc.holder === holder) {
          lockDoc.expires_at = expiresAt;
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      // UPDATE release: SET holder=NULL … WHERE … holder=?
      if (sql.includes('holder=NULL')) {
        const [holder] = params;
        if (lockDoc && lockDoc.holder === holder) {
          lockDoc = { holder: null, expires_at: null };
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      return [{ affectedRows: 0 }];
    },
  };
}

function expireLease() {
  if (lockDoc) lockDoc.expires_at = new Date(Date.now() - 1000);
}

beforeEach(() => {
  lockDoc = null;
  LockModel.__setPoolForTest(makePool());
});

afterEach(() => {
  lockDoc = null;
  LockModel.__setPoolForTest(null);
});

describe('pullLock — distributed pull-concurrency lock (MySQL)', () => {
  it('acquires the lock when free', async () => {
    const lock = await acquirePullLock(60000);
    expect(lock).not.toBeNull();
    expect(lock.holder).toBeTruthy();
  });

  it('denies a second acquire while the lock is held and not expired', async () => {
    await acquirePullLock(60000);
    const second = await acquirePullLock(60000);
    expect(second).toBeNull();
  });

  it('renews the lease while it holds the lock', async () => {
    await acquirePullLock(60000);
    const ok = await renewPullLock(60000);
    expect(ok).toBe(true);
  });

  it('release clears the lock so it can be re-acquired', async () => {
    await acquirePullLock(60000);
    await releasePullLock();
    const again = await acquirePullLock(60000);
    expect(again).not.toBeNull();
  });

  it('allows takeover once the lease has expired', async () => {
    await acquirePullLock(60000);
    expireLease();
    const takeover = await acquirePullLock(60000);
    expect(takeover).not.toBeNull();
  });

  it('renew fails when this instance does not hold the lock', async () => {
    const ok = await renewPullLock(60000);
    expect(ok).toBe(false);
  });
});
