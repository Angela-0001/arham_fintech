const { generateTrades } = require('../seed');

describe('generateTrades', () => {
  it('produces deterministic prices/quantities for the same seed', () => {
    // Note: timestamps depend on Date.now() so they shift between calls,
    // but the PRNG sequence (prices, quantities, symbols) is identical.
    // The sort is by timestamp, which shifts uniformly, so the ORDER is preserved.
    const a = generateTrades(2000, 5);
    const b = generateTrades(2000, 5);
    expect(a.map(t => t.tradeId)).toEqual(b.map(t => t.tradeId));
    expect(a.map(t => t.price)).toEqual(b.map(t => t.price));
    expect(a.map(t => t.quantity)).toEqual(b.map(t => t.quantity));
    expect(a.map(t => t.symbol)).toEqual(b.map(t => t.symbol));
  });

  it('produces different data for different seeds', () => {
    const a = generateTrades(2000, 5);
    const b = generateTrades(2000, 6);
    // tradeIds are the same set (index-based, stable)
    const aIds = new Set(a.map(t => t.tradeId));
    const bIds = new Set(b.map(t => t.tradeId));
    expect(aIds).toEqual(bIds);
    // but prices differ by tradeId (different PRNG sequences)
    const aMap = new Map(a.map(t => [t.tradeId, t.price]));
    const bMap = new Map(b.map(t => [t.tradeId, t.price]));
    let sameCount = 0;
    for (const id of aMap.keys()) {
      if (aMap.get(id) === bMap.get(id)) sameCount++;
    }
    expect(sameCount).toBeLessThan(2000);
  });

  it('generates stable tradeIds BSE000001..BSE002000', () => {
    const trades = generateTrades(2000, 5);
    expect(trades).toHaveLength(2000);
    // TradeIds are index-based but the array is sorted by timestamp,
    // so check the sorted set, not the array order.
    const ids = trades.map(t => t.tradeId).sort();
    expect(ids[0]).toBe('BSE000001');
    expect(ids[1999]).toBe('BSE002000');
    expect(new Set(ids).size).toBe(2000);
  });

  it('all trades have required fields', () => {
    const trades = generateTrades(10, 5);
    for (const t of trades) {
      expect(t.tradeId).toBeDefined();
      expect(t.client).toBeDefined();
      expect(t.symbol).toBeDefined();
      expect(t.tradeType).toMatch(/^(BUY|SELL)$/);
      expect(t.price).toBeGreaterThan(0);
      expect(t.quantity).toBeGreaterThan(0);
      expect(t.value).toBeCloseTo(t.price * t.quantity, 2);
      expect(t.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
