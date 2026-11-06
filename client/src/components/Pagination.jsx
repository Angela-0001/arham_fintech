export function Pagination({ page, totalPages, setPage, filtered, PAGE_SIZE }) {
  if (totalPages <= 1) return null;

  const btn = (label, target, disabled) => (
    <button
      key={label}
      onClick={() => setPage(target)}
      disabled={disabled}
      aria-label={`Go to page ${target}`}
      style={{
        background: page === target ? 'var(--accent)' : 'var(--surface2)',
        color: page === target ? '#fff' : 'var(--text-muted)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '5px 11px',
        fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        minWidth: 34,
      }}
    >
      {label}
    </button>
  );

  const pages = [];
  // Show at most 7 page buttons
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  let nums;
  if (totalPages <= 7) {
    nums = range(1, totalPages);
  } else if (page <= 4) {
    nums = [...range(1, 5), '…', totalPages];
  } else if (page >= totalPages - 3) {
    nums = [1, '…', ...range(totalPages - 4, totalPages)];
  } else {
    nums = [1, '…', page - 1, page, page + 1, '…', totalPages];
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
      </span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {btn('‹ Prev', page - 1, page === 1)}
        {nums.map((n, i) =>
          n === '…'
            ? <span key={`ellipsis-${i}`} style={{ padding: '5px 6px', color: 'var(--text-muted)', fontSize: 13 }}>…</span>
            : btn(n, n, page === n)
        )}
        {btn('Next ›', page + 1, page === totalPages)}
      </div>
    </div>
  );
}
