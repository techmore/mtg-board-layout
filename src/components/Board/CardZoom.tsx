import { useEffect } from 'react'
import { useGameStore } from '../../stores/gameStore'

export default function CardZoom() {
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const cards = useGameStore((s) => s.cards)

  useEffect(() => {
    if (overlay.type !== 'zoom') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay({ type: null })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay.type, setOverlay])

  if (overlay.type !== 'zoom' || !overlay.cardId) return null

  const card = cards.find((c) => c.id === overlay.cardId)
  if (!card) return null

  return (
    <div
      onClick={() => setOverlay({ type: null })}
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} preview`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        cursor: 'zoom-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <img
          src={card.imageUri}
          alt={card.name}
          style={{
            maxWidth: '100%',
            maxHeight: '85vh',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        />
        <div
          style={{
            marginTop: 8,
            color: '#e6edf3',
            fontSize: '1.1rem',
            fontWeight: 600,
          }}
        >
          {card.name}
        </div>
      </div>
    </div>
  )
}
