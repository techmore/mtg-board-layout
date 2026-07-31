import type { ReactNode } from 'react'

export function BoardBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        color: '#e6edf3',
        cursor: 'pointer',
        fontSize: '0.75rem',
      }}
    >
      {children}
    </button>
  )
}
