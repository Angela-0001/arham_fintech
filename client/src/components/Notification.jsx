export function Notification({ notification }) {
  if (!notification) return null;

  const colors = {
    info:    { bg: 'rgba(79,142,247,0.12)', border: '#4f8ef7', icon: 'ℹ' },
    success: { bg: 'rgba(34,197,94,0.12)',  border: '#22c55e', icon: '✓' },
    error:   { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', icon: '✕' },
  };

  const c = colors[notification.type] || colors.info;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderLeft: `4px solid ${c.border}`,
        borderRadius: 'var(--radius)',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
        color: 'var(--text)',
        maxWidth: 360,
        backdropFilter: 'blur(8px)',
        boxShadow: 'var(--shadow)',
        animation: 'slideIn 0.25s ease',
        zIndex: 200,
      }}
    >
      <span style={{ color: c.border, fontSize: 16, fontWeight: 700 }}>{c.icon}</span>
      {notification.message}
    </div>
  );
}

// Inject animation once
if (typeof document !== 'undefined') {
  const id = '__bse_slide__';
  if (!document.getElementById(id)) {
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `@keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`;
    document.head.appendChild(s);
  }
}
