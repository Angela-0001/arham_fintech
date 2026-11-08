import { Badge } from './ui/Badge.jsx';

const COLS = [
  { field: 'tradeId',    label: 'Trade ID',   align: 'left'  },
  { field: 'timestamp',  label: 'Time',        align: 'left'  },
  { field: 'symbol',     label: 'Symbol',      align: 'left'  },
  { field: 'client',     label: 'Client',      align: 'left'  },
  { field: 'tradeType',  label: 'Type',        align: 'center'},
  { field: 'series',     label: 'Series',      align: 'center'},
  { field: 'quantity',   label: 'Qty',         align: 'right' },
  { field: 'price',      label: 'Price (₹)',   align: 'right' },
  { field: 'value',      label: 'Value (₹)',   align: 'right' },
];

function SortArrow({ field, sortField, sortDir }) {
  if (sortField !== field) return <span style={{ opacity: 0.25, marginLeft: 4 }}>↕</span>;
  return <span style={{ marginLeft: 4, color: '#4f8ef7' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtNum(n) {
  return new Intl.NumberFormat('en-IN').format(n);
}

export function TradesTable({ trades, sortField, sortDir, onSort }) {
  const thStyle = (align) => ({
    padding: 0,
    textAlign: align,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  });

  // The sort button fills the cell so the whole header is clickable and
  // keyboard-operable (tab + Enter/Space).
  const sortBtnStyle = (align) => ({
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
    padding: '10px 14px',
    border: 'none',
    background: 'inherit',
    color: 'inherit',
    font: 'inherit',
    textTransform: 'inherit',
    letterSpacing: 'inherit',
    cursor: 'pointer',
    userSelect: 'none',
  });

  const tdStyle = (align, extra = {}) => ({
    padding: '10px 14px',
    textAlign: align,
    borderBottom: '1px solid rgba(46,50,80,0.5)',
    fontSize: 13,
    ...extra,
  });

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {COLS.map(col => (
                <th
                  key={col.field}
                  scope="col"
                  style={thStyle(col.align)}
                  aria-sort={sortField === col.field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    style={sortBtnStyle(col.align)}
                    aria-label={`Sort by ${col.label}`}
                    onClick={() => onSort(col.field)}
                  >
                    {col.label}
                    <SortArrow field={col.field} sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={COLS.length} style={{ ...tdStyle('center'), color: 'var(--text-muted)', padding: '48px 0' }}>
                  No trades yet — start a pull to load data.
                </td>
              </tr>
            )}
            {trades.map((trade, i) => (
              <tr
                key={trade.tradeId}
                style={{
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,142,247,0.07)'}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'}
              >
                <td style={tdStyle('left', { fontFamily: 'monospace', color: 'var(--accent)', fontSize: 12 })}>
                  {trade.tradeId}
                </td>
                <td style={tdStyle('left', { color: 'var(--text-muted)', fontSize: 12 })}>
                  {fmtTime(trade.timestamp)}
                </td>
                <td style={tdStyle('left', { fontWeight: 700 })}>
                  {trade.symbol}
                </td>
                <td style={tdStyle('left', { color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>
                  {trade.client}
                </td>
                <td style={tdStyle('center')}>
                  <Badge variant={trade.tradeType.toLowerCase()}>
                    {trade.tradeType}
                  </Badge>
                </td>
                <td style={tdStyle('center', { color: 'var(--text-muted)', fontSize: 12 })}>
                  {trade.series}
                </td>
                <td style={tdStyle('right', { fontVariantNumeric: 'tabular-nums' })}>
                  {fmtNum(trade.quantity)}
                </td>
                <td style={tdStyle('right', { fontVariantNumeric: 'tabular-nums' })}>
                  {fmtNum(trade.price)}
                </td>
                <td style={tdStyle('right', { fontWeight: 600, fontVariantNumeric: 'tabular-nums' })}>
                  {fmtNum(trade.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
