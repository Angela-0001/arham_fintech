import { useMemo } from 'react';

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 18px',
      flex: 1,
      minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function StatsBar({ trades }) {
  const stats = useMemo(() => {
    if (!trades.length) return null;

    const buys  = trades.filter(t => t.tradeType === 'BUY');
    const sells = trades.filter(t => t.tradeType === 'SELL');
    const totalValue = trades.reduce((s, t) => s + t.value, 0);
    const avgPrice = trades.reduce((s, t) => s + t.price, 0) / trades.length;
    const symbols = new Set(trades.map(t => t.symbol)).size;

    return { buys: buys.length, sells: sells.length, totalValue, avgPrice, symbols };
  }, [trades]);

  if (!stats) return null;

  const fmt = (n) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const fmtCur = (n) => `₹${new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}`;

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <StatCard label="Total Trades"  value={trades.length.toLocaleString()} />
      <StatCard label="Buys"   value={fmt(stats.buys)}  color="var(--green)" />
      <StatCard label="Sells"  value={fmt(stats.sells)} color="var(--red)"   />
      <StatCard label="Symbols" value={stats.symbols}   />
      <StatCard label="Total Value" value={fmtCur(stats.totalValue)} sub="across all trades" />
      <StatCard label="Avg Price"   value={`₹${stats.avgPrice.toFixed(2)}`} />
    </div>
  );
}
