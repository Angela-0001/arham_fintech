export function Filters({ search, setSearch, filterSymbol, setFilterSymbol, filterType, setFilterType, symbols, filtered, resetFilters }) {
  const inputStyle = {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'center',
    }}>
      {/* Search */}
      <input
        type="search"
        placeholder="Search trade ID, client, symbol…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-label="Search trades"
        style={{ ...inputStyle, minWidth: 240 }}
      />

      {/* Symbol filter */}
      <select
        value={filterSymbol}
        onChange={e => setFilterSymbol(e.target.value)}
        aria-label="Filter by symbol"
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">All Symbols</option>
        {symbols.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Trade type filter */}
      <select
        value={filterType}
        onChange={e => setFilterType(e.target.value)}
        aria-label="Filter by trade type"
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">Buy &amp; Sell</option>
        <option value="BUY">Buy</option>
        <option value="SELL">Sell</option>
      </select>

      {/* Result count */}
      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
        {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
      </span>

      {/* Reset */}
      {(search || filterSymbol || filterType) && (
        <button
          onClick={resetFilters}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text-muted)',
            padding: '8px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          × Clear
        </button>
      )}
    </div>
  );
}
