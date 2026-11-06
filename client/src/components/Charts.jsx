/**
 * Charts.jsx
 * Fix #7 — chart data only recomputes when trades.length changes,
 * not on every delta update during a pull.
 */
import { useMemo, useRef } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from 'recharts';

const BARS = ['#4f8ef7','#7c3aed','#f59e0b','#22c55e','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#8b5cf6'];

const card = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', padding: '16px 20px',
  flex: 1, minWidth: 280,
};
const title = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
};
const tip = { background: '#1a1d27', border: '1px solid #2e3250', borderRadius: 8, fontSize: 12, color: '#e8eaf6' };

const RECOMPUTE_EVERY = 100; // only recompute charts every 100 new trades (Fix #7)

export function Charts({ trades }) {
  const lastComputedCount = useRef(0);
  const cachedData = useRef({ buySell: [], topSymbols: [], valueByDate: [] });

  // Fix #7: only recompute if count changed by ≥ RECOMPUTE_EVERY or pull completed
  const chartData = useMemo(() => {
    if (!trades.length) return cachedData.current;
    if (Math.abs(trades.length - lastComputedCount.current) < RECOMPUTE_EVERY && lastComputedCount.current > 0) {
      return cachedData.current;
    }
    lastComputedCount.current = trades.length;

    const buySell = [
      { name: 'Buy',  value: trades.filter(t => t.tradeType === 'BUY').length  },
      { name: 'Sell', value: trades.filter(t => t.tradeType === 'SELL').length },
    ];

    const symCount = {};
    trades.forEach(t => { symCount[t.symbol] = (symCount[t.symbol] || 0) + 1; });
    const topSymbols = Object.entries(symCount)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count }));

    const dateVal = {};
    trades.forEach(t => {
      const d = t.tradeDate || t.timestamp?.split('T')[0];
      if (d) dateVal[d] = (dateVal[d] || 0) + t.value;
    });
    const valueByDate = Object.entries(dateVal)
      .sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
      .map(([date, value]) => ({ date: date.slice(5), value: Math.round(value / 1e6) }));

    cachedData.current = { buySell, topSymbols, valueByDate };
    return cachedData.current;
  }, [trades]);

  if (!trades.length) return null;
  const { buySell, topSymbols, valueByDate } = chartData;

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>

      <div style={card}>
        <div style={title}>Buy vs Sell Volume</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={buySell} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
              dataKey="value" paddingAngle={3}
              label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
              labelLine={false}>
              <Cell fill="#22c55e" /><Cell fill="#ef4444" />
            </Pie>
            <Tooltip contentStyle={tip} formatter={v => [v.toLocaleString(), 'Trades']} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...card, minWidth: 340, flex: 2 }}>
        <div style={title}>Top 10 Symbols by Trades</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={topSymbols} margin={{ top: 0, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" vertical={false} />
            <XAxis dataKey="symbol" tick={{ fill: '#7b82a8', fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: '#7b82a8', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tip} cursor={{ fill: 'rgba(79,142,247,0.1)' }} />
            <Bar dataKey="count" radius={[4,4,0,0]}>
              {topSymbols.map((_, i) => <Cell key={i} fill={BARS[i % BARS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ ...card, minWidth: 340, flex: 2 }}>
        <div style={title}>Trade Value by Date (₹M)</div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={valueByDate} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#4f8ef7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4f8ef7" stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3250" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: '#7b82a8', fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: '#7b82a8', fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tip} formatter={v => [`₹${v.toLocaleString()}M`, 'Value']} />
            <Area type="monotone" dataKey="value" stroke="#4f8ef7" strokeWidth={2}
              fill="url(#vg)" dot={false} activeDot={{ r: 4, fill: '#4f8ef7' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
