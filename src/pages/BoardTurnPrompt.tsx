import { useState, useEffect } from 'react'
import type { BoardCard } from '../types/card'
import type { TurnPrompt } from '../stores/gameStore'
import { CARD_BACK_URL } from '../constants'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'

interface Props {
  turnPrompt: TurnPrompt & { id?: number }
  handCards: BoardCard[]
  cards: BoardCard[]
  cancelTurnPrompt: () => void
  resolveConditionalEntry: (cardId: string, tapped: boolean) => void
  overrideLandPlay: (cardId: string) => void
  discardForTurn: (cardId: string) => void
}

export function BoardTurnPrompt({
  turnPrompt,
  handCards,
  cards,
  cancelTurnPrompt,
  resolveConditionalEntry,
  overrideLandPlay,
  discardForTurn,
}: Props) {
  const [selectedDiscardId, setSelectedDiscardId] = useState<string | null>(null)

  useEffect(() => {
    setSelectedDiscardId(null)
  }, [turnPrompt])

  const title = turnPrompt.reason === 'etb'
    ? 'Check enters-tapped condition'
    : turnPrompt.reason === 'land'
      ? 'Second land this turn'
      : 'Discard before ending turn'
  const accent = turnPrompt.reason === 'land' ? '#ff7b72' : '#ffd33d'

  return (
    <Modal open title={title} accent={accent} width={620} onClose={cancelTurnPrompt}>
      {turnPrompt.reason === 'etb' ? (
        <>
          <p style={{ margin: '0 0 18px', color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.45 }}>
            {turnPrompt.cardId
              ? `${cards.find((card) => card.id === turnPrompt.cardId)?.name ?? 'This card'} has a conditional enters-tapped rule.`
              : 'This card has a conditional enters-tapped rule.'}{' '}
            Choose how it enters the battlefield.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={cancelTurnPrompt}>Keep in Hand</Button>
            <Button variant="primary" onClick={() => { if (turnPrompt.cardId) resolveConditionalEntry(turnPrompt.cardId, false) }} disabled={!turnPrompt.cardId}>
              Enter Untapped
            </Button>
            <Button variant="warning" onClick={() => { if (turnPrompt.cardId) resolveConditionalEntry(turnPrompt.cardId, true) }} disabled={!turnPrompt.cardId}>
              Enter Tapped
            </Button>
          </div>
        </>
      ) : turnPrompt.reason === 'land' ? (
        <>
          <p style={{ margin: '0 0 18px', color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.45 }}>
            {turnPrompt.cardId
              ? `${cards.find((card) => card.id === turnPrompt.cardId)?.name ?? 'This land'} is still in your hand.`
              : 'This land is still in your hand.'}{' '}
            You already played a land this turn. Override the land-drop limit and end the turn?
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={cancelTurnPrompt}>Keep in Hand</Button>
            <Button variant="danger" onClick={() => { if (turnPrompt.cardId) overrideLandPlay(turnPrompt.cardId) }} disabled={!turnPrompt.cardId}>
              Override &amp; End Turn
            </Button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 16px', color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.45 }}>
            You have {handCards.length} cards in hand. Choose one card to discard, or cancel to keep the turn open.
            {turnPrompt.action === 'advance' && ' Next Turn + Draw will continue after the discard.'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 20 }}>
            {handCards.map((card) => {
              const selected = selectedDiscardId === card.id
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={selected}
                  title={`Select ${card.name} to discard`}
                  onClick={() => setSelectedDiscardId(card.id)}
                  style={{
                    width: 82,
                    padding: 3,
                    borderRadius: 7,
                    border: selected ? '3px solid #ffd33d' : '2px solid rgba(255,255,255,0.18)',
                    background: selected ? 'rgba(255,211,61,0.14)' : 'rgba(255,255,255,0.04)',
                    color: '#e6edf3',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <img
                    src={card.imageUri || CARD_BACK_URL}
                    alt={card.name}
                    onError={(e) => { e.currentTarget.src = CARD_BACK_URL }}
                    style={{ width: '100%', aspectRatio: '5 / 7', objectFit: 'cover', display: 'block', borderRadius: 4 }}
                  />
                  <span style={{ display: 'block', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.62rem' }}>
                    {card.name}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="ghost" onClick={cancelTurnPrompt}>Cancel</Button>
            <Button variant="warning" onClick={() => { if (selectedDiscardId) discardForTurn(selectedDiscardId) }} disabled={!selectedDiscardId}>
              Discard Selected
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
