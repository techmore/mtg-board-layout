import { useEffect, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { CARD_BACK_URL } from '../../constants'

export default function GraveyardOverlay() {
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const cards = useGameStore((s) => s.cards)
  const moveCard = useGameStore((s) => s.moveCard)
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (overlay.type !== 'graveyard') return
    setImgErrors(new Set())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay({ type: null })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay.type, setOverlay])

  if (overlay.type !== 'graveyard') return null

  const gyCards = cards.filter((c) => c.zone === 'graveyard')

  return (
    <div
      onClick={() => setOverlay({ type: null })}
      role="dialog"
      aria-modal="true"
      aria-label="Graveyard"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        overflowY: 'auto',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 16,
          padding: 24,
          maxWidth: 720,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: '#e6edf3', fontSize: '1.1rem' }}>
            Graveyard ({gyCards.length})
          </h2>
          <button
            type="button"
            onClick={() => setOverlay({ type: null })}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid #484f58',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Close
          </button>
        </div>
        {gyCards.length === 0 ? (
          <div style={{ color: '#8b949e', textAlign: 'center', padding: 24, fontSize: '0.85rem' }}>
            No cards in graveyard.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 8,
            }}
          >
            {gyCards.map((card) => (
              <div
                key={card.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'rgba(13,17,23,0.6)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <img
                  src={imgErrors.has(card.id) ? CARD_BACK_URL : (card.imageUri || CARD_BACK_URL)}
                  alt={card.name}
                  onError={() => setImgErrors((prev) => new Set(prev).add(card.id))}
                  style={{
                    width: 40,
                    height: 56,
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.15)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      color: '#e6edf3',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={card.name}
                  >
                    {card.name}
                  </div>
                  <div style={{
                    color: '#8b949e',
                    fontSize: '0.65rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {card.type}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      moveCard(card.id, 'battlefield')
                      setOverlay({ type: null })
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      border: '1px solid rgba(88,166,255,0.3)',
                      background: 'rgba(88,166,255,0.1)',
                      color: '#79c0ff',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}
                    title="Return to battlefield"
                  >
                    BF
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      moveCard(card.id, 'library')
                      setOverlay({ type: null })
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      border: '1px solid rgba(210,153,34,0.3)',
                      background: 'rgba(210,153,34,0.1)',
                      color: '#d29922',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}
                    title="Move to library"
                  >
                    Lib
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      moveCard(card.id, 'exile')
                      setOverlay({ type: null })
                    }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      border: '1px solid rgba(248,81,73,0.3)',
                      background: 'rgba(248,81,73,0.1)',
                      color: '#f85149',
                      cursor: 'pointer',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                    }}
                    title="Exile"
                  >
                    Ex
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
