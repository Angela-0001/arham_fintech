/**
 * db.test.js — tests the fail-fast behaviour for missing MySQL config in production.
 */

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('connectDB', () => {
  it('throws in production when no MySQL config is present', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MYSQL_URI', '');
    vi.stubEnv('MYSQL_HOST', '');
    vi.stubEnv('MYSQL_USER', '');
    vi.resetModules();
    const { connectDB } = require('../db');
    await expect(connectDB()).rejects.toThrow('FATAL: MySQL config must be set in production');
  });

  it('resolves gracefully in development when no MySQL config is present', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MYSQL_URI', '');
    vi.stubEnv('MYSQL_HOST', '');
    vi.stubEnv('MYSQL_USER', '');
    vi.resetModules();
    const { connectDB } = require('../db');
    await expect(connectDB()).resolves.toBeUndefined();
  });
});
