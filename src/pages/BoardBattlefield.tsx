import { BattlefieldSection } from '../components/Board/BattlefieldSection'
import { BattlefieldOrderControls } from '../components/Board/BattlefieldOrderControls'
import { TokenBadge } from '../components/Board/TokenBadge'
import { CARD_BACK_URL } from '../constants'
import { counterBadgeStyle, formatCounterCount, cardRuleSummary } from '../components/Board/cardHelpers'
import type { BoardCard } from '../types/card'

interface Props {
  creatureCards: BoardCard[]
  artifactCards: BoardCard[]
  planeswalkerCards: BoardCard[]
  battleCards: BoardCard[]
  enchantmentCards: BoardCard[]
  otherPermanents: BoardCard[]
  landCards: BoardCard[]
  landStacks: Array<[string, BoardCard[]]>
  toggleTap: (cardId: string) => void
  handleRightClick: (e: React.MouseEvent, cardId: string) => void
  setOverlay: (o: { type: 'zoom' | null; cardId?: string }) => void
  reorderBattlefield: (cardId: string, direction: 'closer' | 'farther') => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnBattlefield: (e: React.DragEvent) => void
  cardLayout: ReturnType<typeof import('../layout/cardSizing').getCardLayout>
}

export function BoardBattlefield({
  creatureCards,
  artifactCards,
  planeswalkerCards,
  battleCards,
  enchantmentCards,
  otherPermanents,
  landCards,
  landStacks,
  toggleTap,
  handleRightClick,
  setOverlay,
  reorderBattlefield,
  onDragOver,
  onDropOnBattlefield,
  cardLayout,
}: Props) {
  const { boardCard } = cardLayout

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 12px',
        gap: 8,
        minHeight: 120,
        minWidth: 0,
      }}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDrop={onDropOnBattlefield}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: `repeat(3, minmax(${boardCard.width}px, 1fr))`,
          gridAutoRows: 'max-content',
          alignItems: 'start',
          gap: 12,
          overflow: 'auto',
          minWidth: boardCard.width * 3 + 24,
          minHeight: 0,
          paddingBottom: cardLayout.zonePanelHeight + 16,
          boxSizing: 'border-box',
        }}
      >
        {BattlefieldSection('Creatures', creatureCards, toggleTap, handleRightClick, setOverlay, reorderBattlefield, boardCard.width, boardCard.height, '1 / span 2', 1)}
        {BattlefieldSection('Artifacts', artifactCards, toggleTap, handleRightClick, setOverlay, undefined, boardCard.width, boardCard.height, '3', 1)}
        {BattlefieldSection('Planeswalkers', planeswalkerCards, toggleTap, handleRightClick, setOverlay, undefined, boardCard.width, boardCard.height, '1', 2)}
        {BattlefieldSection('Battles', battleCards, toggleTap, handleRightClick, setOverlay, undefined, boardCard.width, boardCard.height, '2', 2)}
        {BattlefieldSection('Enchantments', enchantmentCards, toggleTap, handleRightClick, setOverlay, undefined, boardCard.width, boardCard.height, '3', 2)}
        {BattlefieldSection('Other', otherPermanents, toggleTap, handleRightClick, setOverlay, undefined, boardCard.width, boardCard.height, '1', 3)}

        {creatureCards.length === 0 && planeswalkerCards.length === 0 && battleCards.length === 0 &&
         artifactCards.length === 0 && enchantmentCards.length === 0 && otherPermanents.length === 0 &&
         landCards.length === 0 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: 0.45, fontSize: '0.85rem' }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Battlefield</div>
            <div style={{ fontSize: '0.72rem', color: '#8b949e' }}>
              Play cards from your hand — or drag them here
            </div>
          </div>
        )}
      </div>

      {landCards.length > 0 && (
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: 8,
            width: '100%',
            boxSizing: 'border-box',
            paddingRight: cardLayout.landRowClearance,
            alignSelf: 'stretch',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'row-reverse',
            justifyContent: 'flex-start',
            alignItems: 'flex-start',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {landStacks.map(([landName, stack]) => (
            <div
              key={landName}
              style={{
                width: boardCard.height,
                height: boardCard.height + Math.max(0, stack.length - 1) * boardCard.stackOffset,
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <BattlefieldOrderControls cardId={stack[0].id} reorderBattlefield={reorderBattlefield} />
              {stack.map((card, idx) => (
                <div
                  key={card.id}
                  title={cardRuleSummary(card)}
                  style={{
                    position: 'absolute',
                    top: idx * boardCard.stackOffset,
                    left: 0,
                    width: boardCard.width,
                    height: boardCard.height,
                    cursor: 'pointer',
                    zIndex: idx,
                    transform: `translateX(${(boardCard.height - boardCard.width) / 2}px)`,
                  }}
                  onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
                  onContextMenu={(e) => handleRightClick(e, card.id)}
                >
                  <img
                    src={card.imageUri || CARD_BACK_URL}
                    alt={card.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      boxSizing: 'border-box',
                      borderRadius: 6,
                      border: '2px solid rgba(255,255,255,0.15)',
                      transform: card.tapped ? 'rotate(90deg)' : 'none',
                      transition: 'transform 0.15s',
                    }}
                  />
                  {card.counters !== 0 && (
                    <div style={counterBadgeStyle}>{formatCounterCount(card.counters)}</div>
                  )}
                  <TokenBadge count={card.tokenCount} />
                  <button
                    type="button"
                    aria-label={card.tapped ? `Untap ${card.name}` : `Tap ${card.name}`}
                    onClick={(e) => { e.stopPropagation(); toggleTap(card.id) }}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'rgba(0,0,0,0.55)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      color: card.tapped ? '#58a6ff' : '#8b949e',
                      padding: 0,
                    }}
                    title="Tap / Untap"
                  >
                    ↻
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
