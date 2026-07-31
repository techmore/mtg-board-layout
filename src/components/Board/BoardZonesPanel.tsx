import { MiniCard } from './MiniCard'
import { SmallZoneBox } from './SmallZoneBox'
import { CardBack } from './CardBack'
import { emptySlotStyle } from './cardHelpers'
import type { BoardCard } from '../../types/card'

export function BoardZonesPanel({
  commandCards,
  libraryCards,
  graveyardCards,
  exileCards,
  handCount,
  cardLayout,
  moveCard,
  handleRightClick,
  setOverlay,
}: {
  commandCards: BoardCard[]
  libraryCards: BoardCard[]
  graveyardCards: BoardCard[]
  exileCards: BoardCard[]
  handCount: number
  cardLayout: ReturnType<typeof import('../../layout/cardSizing').getCardLayout>
  moveCard: (cardId: string, zone: 'battlefield') => void
  handleRightClick: (e: React.MouseEvent, cardId: string) => void
  setOverlay: (o: { type: 'zoom' | 'graveyard' | null; cardId?: string }) => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        display: 'flex',
        gap: 4,
        alignItems: 'flex-end',
        padding: 0,
        background: 'transparent',
        borderRadius: 0,
        border: 'none',
      }}
    >
      <SmallZoneBox label="Cmd" count={null} width={cardLayout.zoneBoxWidth}>
        {commandCards.length > 0 ? (
          commandCards.slice(0, 1).map((card) => (
            <MiniCard
              key={card.id}
              card={card}
              width={cardLayout.boardCard.width}
              height={cardLayout.boardCard.height}
              variant="command"
              onClick={() => moveCard(card.id, 'battlefield')}
              onContextMenu={(e) => handleRightClick(e, card.id)}
            />
          ))
        ) : (
          <div style={{ ...emptySlotStyle, width: cardLayout.boardCard.width, height: cardLayout.boardCard.height }} />
        )}
      </SmallZoneBox>
      <div style={{ position: 'relative', width: cardLayout.zoneBoxWidth, flexShrink: 0 }}>
        <div
          aria-label={`Hand: ${handCount} cards`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            width: '100%',
            boxSizing: 'border-box',
            padding: '5px 8px',
            marginBottom: 4,
            background: 'rgba(13,17,23,0.72)',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.2)',
            color: '#e6edf3',
            fontSize: '0.75rem',
          }}
        >
          <span>Hand</span>
          <span
            style={{
              background: '#d29922',
              color: '#000',
              fontSize: '0.8rem',
              fontWeight: 700,
              borderRadius: 999,
              minWidth: 22,
              height: 22,
              padding: '0 5px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {handCount}
          </span>
        </div>
        <SmallZoneBox label="Lib" count={libraryCards.length} width={cardLayout.zoneBoxWidth}>
          <CardBack width={cardLayout.boardCard.width} height={cardLayout.boardCard.height} />
        </SmallZoneBox>
      </div>
      <SmallZoneBox label="GY" count={graveyardCards.length} transparent width={cardLayout.zoneBoxWidth}>
        <div
          onClick={() => setOverlay({ type: 'graveyard' })}
          style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
        >
          {graveyardCards.length > 0 ? (
            graveyardCards.slice(0, 1).map((card) => (
              <MiniCard
                key={card.id}
                card={card}
                width={cardLayout.boardCard.width}
                height={cardLayout.boardCard.height}
                onClick={() => setOverlay({ type: 'graveyard' })}
                onContextMenu={(e) => handleRightClick(e, card.id)}
              />
            ))
          ) : (
            <div style={{
              width: cardLayout.boardCard.width,
              height: cardLayout.boardCard.height,
              borderRadius: 8,
              border: '1px dashed rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#484f58',
              fontSize: '0.7rem',
            }}>
              Empty
            </div>
          )}
        </div>
      </SmallZoneBox>
      <SmallZoneBox label="Ex" count={exileCards.length} transparent width={cardLayout.zoneBoxWidth}>
        {exileCards.slice(0, 1).map((card) => (
          <MiniCard
            key={card.id}
            card={card}
            width={cardLayout.boardCard.width}
            height={cardLayout.boardCard.height}
            onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
            onContextMenu={(e) => handleRightClick(e, card.id)}
          />
        ))}
      </SmallZoneBox>
    </div>
  )
}
