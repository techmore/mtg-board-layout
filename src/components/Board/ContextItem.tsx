export function ContextItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 16px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        color: '#e6edf3',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: 'transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(88,166,255,0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}
