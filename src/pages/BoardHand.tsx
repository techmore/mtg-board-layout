import { HoverZoomCard } from '../components/Board/HoverZoomCard'
import { useGameStore } from '../stores/gameStore'
import type { BoardCard } from '../types/card'
import type { CardStack } from './boardViewModel'

interface Props {
  handCards: BoardCard[]
  handStacks: Array<[string, CardStack]>
  handExpanded: boolean
  setHandExpanded: (v: boolean) => void
  dragCardId: React.MutableRefObject<string | null>
  setOverlay: (o: { type: 'zoom' | null; cardId?: string }) => void
  handleRightClick: (e: React.MouseEvent, cardId: string) => void
  cardLayout: ReturnType<typeof import('../layout/cardSizing').getCardLayout>
}

export function BoardHand({
  handCards,
  handStacks,
  handExpanded,
  setHandExpanded,
  dragCardId,
  setOverlay,
  handleRightClick,
  cardLayout,
}: Props) {
  return (
    <div
      style={{
        height: cardLayout.handHeight,
        flexShrink: 0,
        minHeight: 0,
        background: '#10151d',
        borderTop: '2px solid rgba(255,255,255,0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: cardLayout.handGap,
        padding: handExpanded ? '34px 16px 10px' : '28px 16px 8px',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexWrap: 'nowrap',
        position: 'relative',
        transition: 'height 0.12s, gap 0.12s',
      }}
    >
      <button
        type="button"
        aria-label={handExpanded ? 'Collapse hand' : 'Expand hand'}
        onClick={() => setHandExpanded(!handExpanded)}
        style={{
          position: 'absolute',
          left: 4,
          top: 2,
          width: 22,
          height: 22,
          borderRadius: 4,
          background: handExpanded ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '0.75rem',
          color: handExpanded ? '#58a6ff' : '#8b949e',
          transition: 'background 0.12s, color 0.12s',
          zIndex: 10,
          padding: 0,
        }}
        title={handExpanded ? 'Collapse hand' : 'Expand hand'}
      >
        {handExpanded ? '▼' : '▲'}
      </button>
      {handCards.length === 0 ? (
        <span style={{ opacity: 0.3, fontSize: '0.85rem' }}>Your Hand (private)</span>
      ) : (
        handStacks.map(([key, stack]) => (
          <HoverZoomCard
            key={key}
            card={stack.card}
            count={stack.count}
            setOverlay={setOverlay}
            handleRightClick={handleRightClick}
            setDragCardId={dragCardId}
            cardHeight={cardLayout.handCardHeight}
            stackOffset={cardLayout.handStackOffset}
            onClick={() => useGameStore.getState().castSpell(stack.card.id)}
          />
        ))
      )}
    </div>
  )
}
