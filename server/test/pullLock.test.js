const { acquirePullLock, renewPullLock, releasePullLock, __setModelForTest } = require('../pullLock');

// In-memory fake of the PullLock model that mimics MongoDB's atomic
// findOneAndUpdate / updateOne semantics for the single "pull-lock" document.
let doc = null;

const fakeModel = {
  async findOneAndUpdate(filter, update, opts) {
    const now = Date.now();
    const held = doc && doc.holder != null;
    const expired = doc && doc.expiresAt != null && new Date(doc.expiresAt).getTime() < now;
    const acquirable = !doc || !held || expired;
    if (doc && !acquirable) {
      // exists, held, not expired -> upsert collides on the fixed _id -> E11000
      if (opts && opts.upsert) {
        const e = new Error('E11000 duplicate key');
        e.code = 11000;
        throw e;
      }
      return null;
    }
    doc = { _id: 'pull-lock', holder: update.$set.holder, expiresAt: update.$set.expiresAt };
    return doc;
  },
  async updateOne(filter, update) {
    if (doc && filter.holder != null && doc.holder === filter.holder) {
      if (Object.prototype.hasOwnProperty.call(update.$set, 'holder')) doc.holder = update.$set.holder;
      if (Object.prototype.hasOwnProperty.call(update.$set, 'expiresAt')) doc.expiresAt = update.$set.expiresAt;
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 0 };
  },
};

function expireLease() { if (doc) doc.expiresAt = new Date(Date.now() - 1000); }

beforeEach(() => {
  doc = null;
  __setModelForTest(fakeModel);
});

afterEach(() => {
  doc = null;
});

describe('pullLock — distributed pull-concurrency lock', () => {
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
    expireLease(); // simulate the holder crashing / lease lapsing
    const takeover = await acquirePullLock(60000);
    expect(takeover).not.toBeNull();
  });

  it('renew fails when this instance does not hold the lock', async () => {
    const ok = await renewPullLock(60000);
    expect(ok).toBe(false);
  });
});
