import { useState } from 'react'
import type { BoardCard } from '../../types/card'
import { BattlefieldOrderControls } from './BattlefieldOrderControls'
import { cardRuleSummary, counterBadgeStyle, formatCounterCount } from './cardHelpers'
import { TokenBadge } from './TokenBadge'
import { useGameStore } from '../../stores/gameStore'
import { canPayManaCost } from '../../utils/misc'
import { CARD_BACK_URL } from '../../constants'
import { CachedImg } from '../shared/CachedImg'

export function BoardCardComponent({
  card,
  onClick,
  onContextMenu,
  toggleTap,
  reorderBattlefield,
  cardWidth,
  cardHeight,
}: {
  card: BoardCard
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  toggleTap: () => void
  reorderBattlefield?: (cardId: string, direction: 'closer' | 'farther') => void
  cardWidth: number
  cardHeight: number
}) {
  // Tapped cards are wider after rotation. Reserve that footprint so the
  // rotated image cannot spill into a neighboring card or grid slot.
  const [imgError, setImgError] = useState(false)
  const visualWidth = card.tapped ? cardHeight : cardWidth
  const manaPool = useGameStore((s) => s.manaPool)
  const affordable = card.zone === 'hand' && card.manaCost ? canPayManaCost(manaPool, card.manaCost) : null
  const turn = useGameStore((s) => s.turn)

  return (
    <div
      title={cardRuleSummary(card)}
      style={{
        width: visualWidth,
        position: 'relative',
        cursor: 'pointer',
      }}
      onClick={(e) => {
        const combatState = useGameStore.getState().combatState
        if (combatState.active && card.type === 'creature') {
          useGameStore.getState().toggleAttacker(card.id)
          e.stopPropagation()
          return
        }
        onClick()
      }}
      onContextMenu={onContextMenu}
    >
      <div
        style={{
          width: visualWidth,
          height: cardHeight,
          position: 'relative',
        }}
      >
        <CachedImg
          scryfallId={imgError ? undefined : card.scryfallId}
          src={imgError ? CARD_BACK_URL : (card.imageUri || CARD_BACK_URL)}
          alt={card.name}
          onError={() => setImgError(true)}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: cardWidth,
            height: cardHeight,
            objectFit: 'cover',
            boxSizing: 'border-box',
            borderRadius: 8,
            border: card.tapped ? '4px solid #58a6ff' : affordable === true ? '2px solid #3fb950' : affordable === false ? '2px solid rgba(248,81,73,0.4)' : '2px solid rgba(255,255,255,0.15)',
            transform: `translate(-50%, -50%)${card.tapped ? ' rotate(90deg)' : ''}`,
            transition: 'transform 0.15s',
          }}
        />
        {reorderBattlefield && (
          <BattlefieldOrderControls cardId={card.id} reorderBattlefield={reorderBattlefield} />
        )}
        {card.counters !== 0 && (
          <div style={{
            ...counterBadgeStyle,
            background: card.type === 'planeswalker' ? '#58a6ff' : '#d29922',
            minWidth: card.type === 'planeswalker' ? 28 : 18,
          }}>
            {card.type === 'planeswalker' ? `L:${card.counters > 0 ? '+' : ''}${card.counters}` : formatCounterCount(card.counters)}
          </div>
        )}
        {card.damage !== undefined && card.damage > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              minWidth: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              padding: '0 5px',
              boxSizing: 'border-box',
              background: 'rgba(248,81,73,0.92)',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 800,
            }}
            title={`${card.damage} damage marked`}
          >
            {card.damage}✕
          </div>
        )}
        {((card.powerBoost ?? 0) !== 0 || (card.toughnessBoost ?? 0) !== 0) && (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: 4,
              minWidth: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              padding: '0 5px',
              boxSizing: 'border-box',
              background: 'rgba(63,185,80,0.92)',
              color: '#fff',
              fontSize: '0.65rem',
              fontWeight: 800,
            }}
            title="Pumped until end of turn"
          >
            {card.powerBoost! > 0 ? '+' : ''}{card.powerBoost}/{card.toughnessBoost! > 0 ? '+' : ''}{card.toughnessBoost}
          </div>
        )}
        <TokenBadge count={card.tokenCount} />
        {card.manaCost && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
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
                padding: '1px 5px',
                borderRadius: 4,
                background: 'rgba(0,0,0,0.7)',
                color: '#e6edf3',
                fontSize: '0.6rem',
                fontWeight: 700,
                pointerEvents: 'none',
              }}
            >
              {pt[1]}/{pt[2]}
            </div>
          )
        })()}
        {card.type === 'creature' && card.enteredAtTurn === turn && (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              right: 34,
              padding: '1px 5px',
              borderRadius: 4,
              fontSize: '0.55rem',
              fontWeight: 700,
              background: 'rgba(248,81,73,0.75)',
              color: '#fff',
              pointerEvents: 'none',
              letterSpacing: '0.5px',
            }}
          >
            SICK
          </div>
        )}
        {(() => {
          const combatState = useGameStore.getState().combatState
          if (!combatState.active) return null
          const isAttacker = combatState.attackers.includes(card.id)
          const isBlocker = Object.values(combatState.blockers).some((ids) => ids.includes(card.id))
          if (!isAttacker && !isBlocker) return null
          return (
            <div
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: '0.6rem',
                fontWeight: 700,
                background: isAttacker ? 'rgba(248,81,73,0.85)' : 'rgba(88,166,255,0.85)',
                color: '#fff',
                pointerEvents: 'none',
              }}
            >
              {isAttacker ? 'ATTACKING' : 'BLOCKING'}
            </div>
          )
        })()}
        <button
          type="button"
          aria-label={card.tapped ? `Untap ${card.name}` : `Tap ${card.name}`}
          onClick={(e) => { e.stopPropagation(); toggleTap() }}
          style={{
            position: 'absolute',
            bottom: 4,
            right: 4,
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: '0.8rem',
            color: card.tapped ? '#58a6ff' : '#8b949e',
            padding: 0,
          }}
          title="Tap / Untap"
        >
          ↻
        </button>
      </div>
      <div
        style={{
          fontSize: '0.85rem',
          textAlign: 'center',
          marginTop: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {card.name}
      </div>
    </div>
  )
}
