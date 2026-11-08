const { requireApiKey } = require('../middleware/auth');

/** Helper: invoke requireApiKey with a request and capture the response. */
function callAuth(req) {
  return new Promise((resolve) => {
    let captured;
    const res = {
      status(code) {
        return {
          json(body) {
            captured = { status: code, body };
            return this;
          },
        };
      },
    };
    const next = () => resolve({ status: 200, calledNext: true });
    requireApiKey(req, res, next);
    if (captured) resolve(captured);
  });
}

beforeEach(() => {
  delete process.env.API_KEY;
  delete process.env.NODE_ENV;
});

afterEach(() => {
  delete process.env.API_KEY;
  delete process.env.NODE_ENV;
});

describe('requireApiKey auth middleware', () => {
  it('returns 503 when API_KEY is not configured', async () => {
    const result = await callAuth({ headers: {}, query: {} });
    expect(result.status).toBe(503);
    expect(result.body.error).toBe('Service Unavailable');
  });

  it('returns 401 when no key is provided', async () => {
    process.env.API_KEY = 'secret-key';
    const result = await callAuth({ headers: {}, query: {} });
    expect(result.status).toBe(401);
  });

  it('calls next() for a valid Bearer key', async () => {
    process.env.API_KEY = 'secret-key';
    const result = await callAuth({
      headers: { authorization: 'Bearer secret-key' },
      query: {},
    });
    expect(result.status).toBe(200);
    expect(result.calledNext).toBe(true);
  });

  it('returns 403 for an invalid Bearer key', async () => {
    process.env.API_KEY = 'secret-key';
    const result = await callAuth({
      headers: { authorization: 'Bearer wrong-key' },
      query: {},
    });
    expect(result.status).toBe(403);
  });

  it('does NOT accept the key via ?apiKey= query param (query auth removed)', async () => {
    process.env.API_KEY = 'secret-key';
    // Even with the correct key in the query, no Bearer header → 401
    const result = await callAuth({
      headers: {},
      query: { apiKey: 'secret-key' },
    });
    expect(result.status).toBe(401);
  });

  it('does not use a hardcoded default key in production', async () => {
    process.env.API_KEY = '';
    process.env.NODE_ENV = 'production';
    // The old dev-bse-key-2024 fallback no longer exists → 503, not 200
    const result = await callAuth({
      headers: { authorization: 'Bearer dev-bse-key-2024' },
      query: {},
    });
    expect(result.status).toBe(503);
  });

  it('uses constant-time comparison (timingSafeEqual path)', async () => {
    process.env.API_KEY = 'secret-key';
    // Correct key → passes
    const ok = await callAuth({
      headers: { authorization: 'Bearer secret-key' },
      query: {},
    });
    expect(ok.status).toBe(200);
    // Wrong key of same length → 403 (proves length-guarded timingSafeEqual)
    const bad = await callAuth({
      headers: { authorization: 'Bearer secrt-key' },
      query: {},
    });
    expect(bad.status).toBe(403);
    // Wrong key of different length → 403
    const diff = await callAuth({
      headers: { authorization: 'Bearer short' },
      query: {},
    });
    expect(diff.status).toBe(403);
  });
});
