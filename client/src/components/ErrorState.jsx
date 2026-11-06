/**
 * ErrorState.jsx — shown when server is unreachable (Fix #5)
 */
export function ErrorState({ onRetry }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: 16, textAlign: 'center', padding: 24,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'rgba(239,68,68,0.1)',
        border: '2px solid rgba(239,68,68,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28,
      }}>⚡</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          Server Unreachable
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 340 }}>
          Cannot connect to the BSE API server at{' '}
          <code style={{ color: 'var(--accent)' }}>
            {import.meta.env.VITE_API_URL || 'http://localhost:4000'}
          </code>.
          Make sure the server is running.
        </div>
      </div>
      <button
        onClick={onRetry}
        style={{
          background: 'linear-gradient(135deg, #4f8ef7, #7c3aed)',
          color: '#fff', border: 'none', borderRadius: 8,
          padding: '10px 24px', fontSize: 13, fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        ↺ Retry Connection
      </button>
    </div>
  );
}
