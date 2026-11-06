import { Spinner } from './ui/Spinner.jsx';
import { Badge } from './ui/Badge.jsx';

export function Header({ pullStatus, connected, onTriggerPull }) {
  const isRunning = pullStatus?.state === 'running';
  const progress  = pullStatus?.progress ?? 0;

  return (
    <header style={{
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'linear-gradient(135deg, #4f8ef7, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700, color: '#fff',
          flexShrink: 0,
        }}>B</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>
            BSE Trades Dashboard
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Arham Fintech — Live Feed
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>

        {/* SSE connection indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: connected ? 'var(--green)' : '#ef4444',
            boxShadow: connected ? '0 0 6px var(--green)' : 'none',
            display: 'inline-block',
          }} />
          {connected ? 'Live' : 'Reconnecting…'}
        </div>

        {/* Pull progress */}
        {isRunning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size={14} />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 140 }}>
              <div style={{
                height: 4, background: 'var(--border)', borderRadius: 2,
                overflow: 'hidden', width: 120, marginBottom: 2,
              }}>
                <div style={{
                  height: '100%', width: `${progress}%`,
                  background: 'linear-gradient(90deg, #4f8ef7, #7c3aed)',
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <span>Pulling {progress}% · {(pullStatus?.pulledRecords || 0).toLocaleString()} recs</span>
            </div>
          </div>
        )}

        {pullStatus?.state === 'completed' && (
          <Badge variant="success">Pull complete</Badge>
        )}

        {/* Trigger pull button */}
        <button
          onClick={onTriggerPull}
          disabled={isRunning}
          aria-label="Start new BSE data pull"
          style={{
            background: isRunning ? 'var(--surface2)' : 'linear-gradient(135deg, #4f8ef7, #7c3aed)',
            color: isRunning ? 'var(--text-muted)' : '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: isRunning ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {isRunning ? <><Spinner size={12} /> Pulling…</> : '↻ New Pull'}
        </button>
      </div>
    </header>
  );
}
