import { useState } from 'react'
import type { BoardCard } from '../../types/card'
import { CARD_BACK_URL } from '../../constants'

export function CastSpellStack({
  cards,
  baseWidth,
  baseHeight,
  rightOffset = 0,
  bottomOffset = 0,
  onClick,
  onContextMenu,
}: {
  cards: BoardCard[]
  baseWidth: number
  baseHeight: number
  rightOffset?: number
  bottomOffset?: number
  onClick: (cardId: string) => void
  onContextMenu: (event: React.MouseEvent, cardId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [imgError, setImgError] = useState(false)
  if (cards.length === 0) return null

  const width = Math.max(230, Math.round(baseWidth * 1.35))
  const height = Math.max(322, Math.round(baseHeight * 1.35))
  const spread = expanded ? Math.min(58, Math.max(34, Math.round(width * 0.22))) : 0
  const panelWidth = width + Math.max(0, cards.length - 1) * spread

  return (
    <div
      aria-label={`Spells cast this turn: ${cards.length}`}
      style={{
        position: 'absolute',
        right: rightOffset,
        bottom: bottomOffset,
        width: panelWidth,
        height: height + 38,
        zIndex: 26,
        pointerEvents: 'auto',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          padding: '5px 9px',
          borderRadius: 6,
          background: 'rgba(13,17,23,0.9)',
          border: '1px solid rgba(88,166,255,0.5)',
          color: '#79c0ff',
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        Spells this turn · {cards.length}
      </div>
      {cards.map((card, index) => (
        <div
          key={card.id}
          title={`${card.name} · ${card.type === 'instant' ? 'Instant' : 'Sorcery'}`}
          style={{
            position: 'absolute',
            top: 34,
            right: (cards.length - 1 - index) * spread,
            width,
            height,
            zIndex: index + 1,
            cursor: 'pointer',
            transition: 'right 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease',
            transform: expanded ? `translateY(${-Math.min(index * 8, 32)}px)` : 'none',
            boxShadow: expanded ? '0 10px 26px rgba(0,0,0,0.55)' : '0 4px 14px rgba(0,0,0,0.45)',
          }}
          onClick={() => onClick(card.id)}
          onContextMenu={(event) => onContextMenu(event, card.id)}
        >
          <img
            src={imgError ? CARD_BACK_URL : (card.imageUri || CARD_BACK_URL)}
            alt={card.name}
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              borderRadius: 9,
              border: '2px solid rgba(121,192,255,0.7)',
              boxSizing: 'border-box',
            }}
          />
        </div>
      ))}
    </div>
  )
}
