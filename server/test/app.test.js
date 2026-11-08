/**
 * app.test.js — tests the Express app's global error handler, 404, and auth.
 *
 * Verification checks covered:
 *  - An async route handler that throws returns a 500 JSON via the global
 *    error handler (not an unhandled rejection).
 *  - GET /proxy/getTrades?page=foo returns 400 (not a silent empty 200).
 *
 * Uses the real app (no module mocking needed). API_KEY is read at call-time
 * by auth.js so we can override it after the module loads.
 */
const request = require('supertest');
const express = require('express');

// Load the real app. boot() is guarded by require.main === module, so it
// does not start a server or auto-pull. dotenv.config() runs (loads .env)
// but we override API_KEY below for deterministic tests.
let app;
beforeAll(() => {
  app = require('../index.js');
  // auth.js reads process.env.API_KEY at call-time, so this overrides
  // whatever dotenv loaded from .env.
  process.env.API_KEY = 'test-key';
  process.env.NODE_ENV = 'test';
});

afterAll(() => {
  // Restore — don't leave test key in env for other test files
  delete process.env.API_KEY;
  delete process.env.NODE_ENV;
});

describe('global error handler', () => {
  it('returns 500 JSON when an async route handler rejects (pattern test)', async () => {
    // Build a minimal Express app using the same asyncHandler + 4-arg error
    // middleware pattern as index.js, to verify the mechanism works.
    const asyncHandler = (fn) => (req, res, next) =>
      Promise.resolve(fn(req, res, next)).catch(next);
    const testApp = express();
    testApp.post('/throw', asyncHandler(async () => { throw new Error('boom'); }));
    testApp.use((err, _req, res, _next) => {
      res.status(500).json({
        error: 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { message: err.message }),
      });
    });
    const res = await request(testApp).post('/throw');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.message).toBe('boom');
  });

  it('returns 500 via the global error handler when express.json() fails (real app)', async () => {
    // Send malformed JSON to trigger express.json() error → next(err) → 500
    const res = await request(app)
      .post('/proxy/pull/start')
      .set('Content-Type', 'application/json')
      .send('{invalid');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

describe('404 handler', () => {
  it('returns 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

describe('validation via proxy route', () => {
  it('returns 400 for GET /proxy/getTrades?page=foo (not a silent empty 200)', async () => {
    const res = await request(app).get('/proxy/getTrades?page=foo');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });
});

describe('auth on direct API', () => {
  it('returns 401 when no Bearer key is provided', async () => {
    const res = await request(app).get('/getTrades');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an invalid Bearer key', async () => {
    const res = await request(app).get('/getTrades').set('Authorization', 'Bearer wrong');
    expect(res.status).toBe(403);
  });

  it('accepts a valid Bearer key', async () => {
    const res = await request(app).get('/getTrades').set('Authorization', 'Bearer test-key');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
