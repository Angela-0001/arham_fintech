const { validateTradeQuery } = require('../middleware/validate');

/** Helper: invoke the middleware with a query object and capture the result. */
function runValidation(query) {
  return new Promise((resolve) => {
    const req = { query: { ...query } };
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
    const next = () => resolve({ status: 200, query: req.query });
    validateTradeQuery(req, res, next);
    // If next() was not called synchronously, captured is set from res.status().json()
    if (captured) resolve(captured);
  });
}

describe('validateTradeQuery', () => {
  it('rejects page=foo with 400', async () => {
    const result = await runValidation({ page: 'foo' });
    expect(result.status).toBe(400);
    expect(result.body.details).toContainEqual(expect.stringContaining('Invalid page'));
  });

  it('rejects pageSize=abc with 400', async () => {
    const result = await runValidation({ pageSize: 'abc' });
    expect(result.status).toBe(400);
    expect(result.body.details).toContainEqual(expect.stringContaining('Invalid pageSize'));
  });

  it('rejects page=0 with 400', async () => {
    const result = await runValidation({ page: 0 });
    expect(result.status).toBe(400);
  });

  it('rejects page=1.5 with 400 (non-integer)', async () => {
    const result = await runValidation({ page: 1.5 });
    expect(result.status).toBe(400);
  });

  it('rejects pageSize=0 with 400', async () => {
    const result = await runValidation({ pageSize: 0 });
    expect(result.status).toBe(400);
  });

  it('accepts and normalizes valid page/pageSize', async () => {
    const result = await runValidation({ page: '3', pageSize: '50' });
    expect(result.status).toBe(200);
    expect(result.query.page).toBe(3);
    expect(result.query.pageSize).toBe(50);
  });

  it('defaults page=1 and pageSize=200 when absent', async () => {
    const result = await runValidation({});
    expect(result.status).toBe(200);
    expect(result.query.page).toBe(1);
    expect(result.query.pageSize).toBe(200);
  });

  it('clamps pageSize to max 500', async () => {
    const result = await runValidation({ pageSize: '9999' });
    expect(result.status).toBe(200);
    expect(result.query.pageSize).toBe(500);
  });

  it('normalizes from date to ISO-8601', async () => {
    // Use an unambiguous ISO date to avoid timezone-dependent results
    const result = await runValidation({ from: '2024-01-01T00:00:00Z' });
    expect(result.status).toBe(200);
    expect(result.query.from).toBe('2024-01-01T00:00:00.000Z');
  });

  it('normalizes a locale date string to ISO-8601', async () => {
    const result = await runValidation({ from: '2024-06-15' });
    expect(result.status).toBe(200);
    expect(result.query.from).toMatch(/^2024-06-15T/);
    expect(new Date(result.query.from).toISOString()).toBe(result.query.from);
  });

  it('normalizes to date to ISO-8601', async () => {
    const result = await runValidation({ to: '2024-12-31T00:00:00Z' });
    expect(result.status).toBe(200);
    expect(result.query.to).toBe('2024-12-31T00:00:00.000Z');
  });

  it('rejects from > to with 400', async () => {
    const result = await runValidation({ from: '2024-12-31', to: '2024-01-01' });
    expect(result.status).toBe(400);
    expect(result.body.details).toContainEqual(expect.stringContaining('before'));
  });

  it('rejects invalid symbol with 400', async () => {
    const result = await runValidation({ symbol: 'FAKE' });
    expect(result.status).toBe(400);
  });

  it('rejects invalid tradeType with 400', async () => {
    const result = await runValidation({ tradeType: 'TRADE' });
    expect(result.status).toBe(400);
  });

  it('sanitizes client param (strips HTML)', async () => {
    const result = await runValidation({ client: '<script>alert(1)</script>Reliance' });
    expect(result.status).toBe(200);
    expect(result.query.client).not.toContain('<');
    expect(result.query.client).not.toContain('>');
  });
});
