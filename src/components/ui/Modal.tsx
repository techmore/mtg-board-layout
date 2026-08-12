import { useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'

interface OverlayProps {
  onClose?: () => void
  children: ReactNode
  zIndex?: number
  style?: CSSProperties
}

/** Full-screen backdrop used by modals and lightbox overlays. */
export function Overlay({ onClose, children, zIndex = 85, style }: OverlayProps) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      onMouseDown={onClose ? (event) => { if (event.target === event.currentTarget) onClose() } : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.75)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: number
  accent?: string
  closeOnBackdrop?: boolean
}

export function Modal({ open, onClose, title, children, width = 460, accent, closeOnBackdrop = true }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <Overlay onClose={closeOnBackdrop ? onClose : undefined}>
      <div
        style={{
          minHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: `min(${width}px, 100%)`,
            maxHeight: 'calc(100vh - 40px)',
            overflowY: 'auto',
            padding: 22,
            borderRadius: 12,
            background: '#161b22',
            border: `1px solid ${accent ?? 'rgba(255,255,255,0.14)'}`,
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          }}
        >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: title ? 12 : 0 }}>
          {title && (
            <div style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: accent ?? '#d0d7de' }}>
              {title}
            </div>
          )}
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '1.2rem',
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: 6,
            }}
            onMouseEnter={(event) => { event.currentTarget.style.color = '#e6edf3' }}
            onMouseLeave={(event) => { event.currentTarget.style.color = '#8b949e' }}
          >
            ×
          </button>
        </div>
        {children}
        </div>
      </div>
    </Overlay>
  )
}
