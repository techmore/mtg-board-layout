import { useToastStore } from '../stores/toastStore'

const KIND_STYLES: Record<string, { background: string; border: string; color: string }> = {
  info: { background: 'rgba(22,27,34,0.96)', border: '1px solid rgba(88,166,255,0.45)', color: '#d0d7de' },
  success: { background: 'rgba(22,27,34,0.96)', border: '1px solid rgba(63,185,80,0.5)', color: '#56d364' },
  error: { background: 'rgba(22,27,34,0.96)', border: '1px solid rgba(248,81,73,0.55)', color: '#ff7b72' },
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 320,
      }}
    >
      {toasts.map((toast) => {
        const style = KIND_STYLES[toast.kind]
        return (
          <div
            key={toast.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: style.background,
              border: style.border,
              boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
              fontSize: '0.8rem',
              color: style.color,
              animation: 'toastIn 0.18s ease-out',
            }}
          >
            <style>{`
              @keyframes toastIn {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
            <span style={{ lineHeight: 1.4 }}>{toast.text}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'none',
                border: 'none',
                color: '#8b949e',
                cursor: 'pointer',
                fontSize: '0.9rem',
                padding: '0 2px',
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
