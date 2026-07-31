import { useState } from 'react'
import type { BoardCard } from '../../types/card'
import { cardRuleSummary } from './cardHelpers'
import { canPayManaCost } from '../../utils/misc'
import { useGameStore } from '../../stores/gameStore'
import { CARD_BACK_URL } from '../../constants'
import { CachedImg } from '../shared/CachedImg'

export function HoverZoomCard({
  card,
  count = 1,
  setOverlay,
  handleRightClick,
  setDragCardId,
  cardHeight,
  stackOffset,
  onClick,
}: {
  card: Pick<BoardCard, 'id' | 'scryfallId' | 'imageUri' | 'name' | 'manaCost' | 'manaValue' | 'entersTapped' | 'type' | 'typeLine'>
  count?: number
  setOverlay: (o: { type: 'zoom' | null; cardId?: string }) => void
  handleRightClick: (e: React.MouseEvent, cardId: string) => void
  setDragCardId: React.MutableRefObject<string | null>
  cardHeight: number
  stackOffset: number
  onClick?: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const stackHeight = cardHeight + Math.max(0, count - 1) * stackOffset
  const manaPool = useGameStore((s) => s.manaPool)
  const affordable = card.manaCost ? canPayManaCost(manaPool, card.manaCost) : null

  return (
    <div
      draggable
      title={cardRuleSummary(card)}
      style={{
        position: 'relative',
        height: stackHeight,
        width: cardHeight * (5 / 7),
        cursor: 'grab',
        flexShrink: 0,
        transition: 'height 0.12s, width 0.12s',
      }}
      onDragStart={(event) => {
        setDragCardId.current = card.id
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', card.id)
      }}
      onDragEnd={() => { setDragCardId.current = null }}
      onClick={() => { if (onClick) onClick(); else setOverlay({ type: 'zoom', cardId: card.id }) }}
      onContextMenu={(e) => handleRightClick(e, card.id)}
    >
      {Array.from({ length: count }, (_, index) => (
        <CachedImg
          key={`${card.id}-${index}`}
          scryfallId={imgError ? undefined : card.scryfallId}
          src={imgError ? CARD_BACK_URL : (card.imageUri || CARD_BACK_URL)}
          alt={index === count - 1 ? card.name : ''}
          aria-hidden={index !== count - 1}
          draggable={false}
          onError={() => setImgError(true)}
          style={{
            position: 'absolute',
            top: index * stackOffset,
            left: 0,
            zIndex: index + 1,
            width: '100%',
            height: cardHeight,
            objectFit: 'cover',
            borderRadius: 6,
            border: affordable === true ? '2px solid #3fb950' : affordable === false ? '2px solid rgba(248,81,73,0.4)' : '2px solid rgba(255,255,255,0.15)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        />
      ))}
      {card.type && (
        <div
          style={{
            position: 'absolute',
            bottom: 2,
            left: 2,
            zIndex: count + 1,
            padding: '1px 4px',
            borderRadius: 3,
            background: 'rgba(0,0,0,0.6)',
            color: '#8b949e',
            fontSize: '0.5rem',
            fontWeight: 600,
            pointerEvents: 'none',
            textTransform: 'uppercase',
          }}
        >
          {card.type}
        </div>
      )}
      {card.manaCost && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: count + 1,
            padding: '1px 5px',
            borderRadius: 4,
            background: 'rgba(0,0,0,0.65)',
            color: '#ffd33d',
            fontSize: '0.55rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            pointerEvents: 'none',
          }}
        >
          {card.manaCost}
        </div>
      )}
      {(() => {
        const pt = card.typeLine?.match(/(\d+)\/(\d+)$/)
        if (!pt) return null
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: 4,
              zIndex: count + 1,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'rgba(0,0,0,0.7)',
              color: '#e6edf3',
              fontSize: '0.55rem',
              fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            {pt[1]}/{pt[2]}
          </div>
        )
      })()}
      {count > 1 && (
        <div
          aria-label={`${count} copies`}
          style={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            zIndex: 2,
            minWidth: 24,
            height: 24,
            padding: '0 6px',
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#58a6ff',
            color: '#0d1117',
            border: '2px solid #10151d',
            fontSize: '0.75rem',
            fontWeight: 800,
          }}
        >
          ×{count}
        </div>
      )}
    </div>
  )
}
