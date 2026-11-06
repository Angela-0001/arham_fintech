/**
 * LoadingState.jsx — skeleton shown on first load (Fix #5)
 */
import { Spinner } from './ui/Spinner.jsx';

export function LoadingState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: 12,
    }}>
      <Spinner size={36} />
      <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Connecting to BSE API…
      </div>
    </div>
  );
}
