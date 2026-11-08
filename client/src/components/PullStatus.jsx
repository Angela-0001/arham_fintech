import { Spinner } from './ui/Spinner.jsx';

export function PullStatus({ pullStatus }) {
  if (!pullStatus || pullStatus.state === 'idle') return null;

  const { state, progress = 0, pulledRecords = 0, totalRecords = 0,
          batchNumber = 0, totalBatches = 0, startedAt, completedAt } = pullStatus;

  if (state !== 'running') return null;

  const eta = totalBatches && batchNumber
    ? `Batch ${batchNumber}/${totalBatches}`
    : null;

  return (
    <div style={{
      background: 'rgba(245,158,11,0.07)',
      border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: 'var(--radius)',
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      flexWrap: 'wrap',
    }}>
      <Spinner size={16} />

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>
            Pulling BSE trades… {eta && `(${eta})`}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {pulledRecords.toLocaleString()} / {totalRecords.toLocaleString()} records
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Pull progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}
        >
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #f59e0b, #4f8ef7)',
            borderRadius: 3,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', minWidth: 42 }}>
        {progress}%
      </span>
    </div>
  );
}
