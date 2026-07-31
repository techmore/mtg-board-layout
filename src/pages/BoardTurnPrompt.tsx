import { useState, useEffect } from 'react'
import type { BoardCard } from '../types/card'
import type { TurnPrompt } from '../stores/gameStore'
import { CARD_BACK_URL } from '../constants'

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="turn-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.72)',
      }}
    >
      <div
        style={{
          width: 'min(620px, 100%)',
          maxHeight: 'calc(100vh - 40px)',
          overflow: 'auto',
          padding: 22,
          borderRadius: 12,
          background: '#161b22',
          border: '1px solid rgba(255,211,61,0.65)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        {turnPrompt.reason === 'etb' ? (
          <>
            <h2 id="turn-prompt-title" style={{ margin: '0 0 8px', color: '#ffd33d', fontSize: '1.1rem' }}>
              Check enters-tapped condition
            </h2>
            <p style={{ margin: '0 0 18px', color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.45 }}>
              {turnPrompt.cardId
                ? `${cards.find((card) => card.id === turnPrompt.cardId)?.name ?? 'This card'} has a conditional enters-tapped rule.`
                : 'This card has a conditional enters-tapped rule.'}{' '}
              Choose how it enters the battlefield.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={cancelTurnPrompt} style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid #484f58', background: 'transparent', color: '#d0d7de', cursor: 'pointer', fontWeight: 700 }}>
                Keep in Hand
              </button>
              <button type="button" onClick={() => { if (turnPrompt.cardId) resolveConditionalEntry(turnPrompt.cardId, false) }} disabled={!turnPrompt.cardId} style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid rgba(88,166,255,0.65)', background: 'rgba(88,166,255,0.16)', color: '#79c0ff', cursor: turnPrompt.cardId ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
                Enter Untapped
              </button>
              <button type="button" onClick={() => { if (turnPrompt.cardId) resolveConditionalEntry(turnPrompt.cardId, true) }} disabled={!turnPrompt.cardId} style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid rgba(210,153,34,0.7)', background: 'rgba(210,153,34,0.16)', color: '#ffd33d', cursor: turnPrompt.cardId ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
                Enter Tapped
              </button>
            </div>
          </>
        ) : turnPrompt.reason === 'land' ? (
          <>
            <h2 id="turn-prompt-title" style={{ margin: '0 0 8px', color: '#ff7b72', fontSize: '1.1rem' }}>
              Second land this turn
            </h2>
            <p style={{ margin: '0 0 18px', color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.45 }}>
              {turnPrompt.cardId
                ? `${cards.find((card) => card.id === turnPrompt.cardId)?.name ?? 'This land'} is still in your hand.`
                : 'This land is still in your hand.'}{' '}
              You already played a land this turn. Override the land-drop limit and end the turn?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={cancelTurnPrompt} style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid #484f58', background: 'transparent', color: '#d0d7de', cursor: 'pointer', fontWeight: 700 }}>
                Keep in Hand
              </button>
              <button type="button" onClick={() => { if (turnPrompt.cardId) overrideLandPlay(turnPrompt.cardId) }} disabled={!turnPrompt.cardId} style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid rgba(248,81,73,0.7)', background: turnPrompt.cardId ? 'rgba(248,81,73,0.2)' : 'rgba(248,81,73,0.08)', color: turnPrompt.cardId ? '#ffaba5' : '#8b949e', cursor: turnPrompt.cardId ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
                Override &amp; End Turn
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="turn-prompt-title" style={{ margin: '0 0 8px', color: '#ffd33d', fontSize: '1.1rem' }}>
              Discard before ending turn
            </h2>
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
              <button type="button" onClick={cancelTurnPrompt} style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid #484f58', background: 'transparent', color: '#d0d7de', cursor: 'pointer', fontWeight: 700 }}>
                Cancel
              </button>
              <button type="button" disabled={!selectedDiscardId} onClick={() => { if (selectedDiscardId) discardForTurn(selectedDiscardId) }} style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid rgba(255,211,61,0.7)', background: selectedDiscardId ? '#d29922' : 'rgba(210,153,34,0.25)', color: selectedDiscardId ? '#000' : '#8b949e', cursor: selectedDiscardId ? 'pointer' : 'not-allowed', fontWeight: 800 }}>
                Discard Selected
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
