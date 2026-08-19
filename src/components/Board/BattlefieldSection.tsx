import type { BoardCard } from '../../types/card'
import { BoardCardComponent } from './BoardCardComponent'

export function BattlefieldSection(
  label: string,
  cards: BoardCard[],
  onZoom: (cardId: string) => void,
  onContextMenu: (e: React.MouseEvent, cardId: string) => void,
  toggleTap: (id: string) => void,
  reorderBattlefield?: (cardId: string, direction: 'closer' | 'farther') => void,
  cardWidth = 180,
  cardHeight = 252,
  gridColumn?: string,
  gridRow?: string | number,
) {
  if (cards.length === 0) return null
  return (
    <section style={{ minWidth: 0, width: '100%', boxSizing: 'border-box', gridColumn, gridRow }}>
      <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
        {label} ({cards.length})
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          boxSizing: 'border-box',
          minWidth: 0,
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        {cards.map((card) => (
          <BoardCardComponent
            key={card.id}
            card={card}
            onZoom={onZoom}
            onContextMenu={onContextMenu}
            onToggleTap={toggleTap}
            reorderBattlefield={reorderBattlefield}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
          />
        ))}
      </div>
    </section>
  )
}
