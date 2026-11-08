/**
 * db.test.js — tests the fail-fast behavior for missing MONGO_URI in production.
 */

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('connectDB', () => {
  it('throws in production when MONGO_URI is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MONGO_URI', '');
    vi.resetModules();
    const { connectDB } = require('../db');
    await expect(connectDB()).rejects.toThrow('FATAL: MONGO_URI must be set in production.');
  });

  it('resolves gracefully in development when MONGO_URI is missing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MONGO_URI', '');
    vi.resetModules();
    const { connectDB } = require('../db');
    await expect(connectDB()).resolves.toBeUndefined();
  });
});
