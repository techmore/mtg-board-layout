import { useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { CARD_BACK_URL } from '../../constants'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export default function GraveyardOverlay() {
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const cards = useGameStore((s) => s.cards)
  const moveCard = useGameStore((s) => s.moveCard)
  const [imgErrors, setImgErrors] = useState<Set<string>>(new Set())

  if (overlay.type !== 'graveyard') return null

  const gyCards = cards.filter((c) => c.zone === 'graveyard')

  return (
    <Modal open onClose={() => setOverlay({ type: null })} title={`Graveyard (${gyCards.length})`} width={760}>
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
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      moveCard(card.id, 'battlefield')
                      setOverlay({ type: null })
                    }}
                    title="Return to battlefield"
                  >
                    BF
                  </Button>
                  <Button
                    size="sm"
                    variant="warning"
                    onClick={() => {
                      moveCard(card.id, 'library')
                      setOverlay({ type: null })
                    }}
                    title="Move to library"
                  >
                    Lib
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      moveCard(card.id, 'exile')
                      setOverlay({ type: null })
                    }}
                    title="Exile"
                  >
                    Ex
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
    </Modal>
  )
}
