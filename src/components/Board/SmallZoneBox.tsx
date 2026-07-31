import type { ReactNode } from 'react'

export function SmallZoneBox({
  label,
  count,
  children,
  transparent = false,
  width,
}: {
  label: string
  count: number | null
  children: ReactNode
  transparent?: boolean
  width?: number
}) {
  return (
    <div
      style={{
        background: transparent ? 'transparent' : 'rgba(0,0,0,0.25)',
        borderRadius: 10,
        border: transparent ? '1px solid transparent' : '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '6px',
        fontSize: '0.85rem',
        color: '#8b949e',
        position: 'relative',
        width,
        boxSizing: 'border-box',
        height: 'auto',
      }}
    >
      {count !== null && count > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            background: '#d29922',
            color: '#000',
            fontSize: '0.85rem',
            fontWeight: 700,
            borderRadius: '50%',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          {count}
        </div>
      )}
      {children}
      <div style={{ whiteSpace: 'nowrap', marginLeft: 'auto' }}>{label}</div>
    </div>
  )
}
