import { MiniCard } from '../components/Board/MiniCard'
import { CARD_BACK_URL } from '../constants'
import type { BoardViewModel } from './boardViewModel'

interface Props {
  opponentViewModel: BoardViewModel
  opponentLifeTotal: number
  activePlayer: string
  setOverlay: (o: { type: 'zoom' | null; cardId?: string }) => void
  handleRightClick: (e: React.MouseEvent, cardId: string) => void
  cardWidth: number
  cardHeight: number
}

function OpponentBattlefieldSection({ label, cards, cardWidth, cardHeight, setOverlay, handleRightClick }: {
  label: string
  cards: { id: string }[]
  cardWidth: number
  cardHeight: number
  setOverlay: (o: { type: 'zoom' | null; cardId?: string }) => void
  handleRightClick: (e: React.MouseEvent, cardId: string) => void
}) {
  if (cards.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: '0.6rem', color: '#8b949e', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
        {label} ({cards.length})
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {cards.map((card) => (
          <MiniCard
            key={card.id}
            card={card as any}
            width={Math.round(cardWidth * 0.5)}
            height={Math.round(cardHeight * 0.5)}
            onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
            onContextMenu={(e) => handleRightClick(e, card.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function BoardOpponentZone({
  opponentViewModel,
  opponentLifeTotal,
  activePlayer,
  setOverlay,
  handleRightClick,
  cardWidth,
  cardHeight,
}: Props) {
  const miniWidth = Math.round(cardWidth * 0.5)
  const miniHeight = Math.round(cardHeight * 0.5)
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.25)',
        minHeight: 0,
        borderBottom: '2px solid rgba(255,255,255,0.1)',
        overflow: 'hidden',
        animation: activePlayer === 'opponent' ? 'turnPulse 2s ease-in-out infinite' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexShrink: 0 }}>
        <span style={{ color: '#f85149', fontSize: '0.75rem', fontWeight: 700 }}>Opponent</span>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: opponentLifeTotal <= 0 ? '#f85149' : opponentLifeTotal <= 5 ? '#d29922' : '#e6edf3', minWidth: 24 }}>
          {opponentLifeTotal}
        </span>
        <span style={{ color: '#8b949e', fontSize: '0.65rem' }}>Hand ({opponentViewModel.handCards.length})</span>
        <span style={{ color: '#8b949e', fontSize: '0.65rem' }}>GY ({opponentViewModel.graveyardCards.length})</span>
        <span style={{ color: '#8b949e', fontSize: '0.65rem' }}>Library ({opponentViewModel.libraryCards.length})</span>
      </div>

      {opponentViewModel.handCards.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0, marginBottom: 6 }}>
          {opponentViewModel.handCards.slice(0, 7).map((card) => (
            <img
              key={card.id}
              src={CARD_BACK_URL}
              alt="Opponent's hand"
              onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
              onContextMenu={(e) => handleRightClick(e, card.id)}
              style={{
                width: miniWidth,
                height: miniHeight,
                objectFit: 'cover',
                borderRadius: 4,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <OpponentBattlefieldSection label="Creatures" cards={opponentViewModel.creatureCards} cardWidth={cardWidth} cardHeight={cardHeight} setOverlay={setOverlay} handleRightClick={handleRightClick} />
        <OpponentBattlefieldSection label="Planeswalkers" cards={opponentViewModel.planeswalkerCards} cardWidth={cardWidth} cardHeight={cardHeight} setOverlay={setOverlay} handleRightClick={handleRightClick} />
        <OpponentBattlefieldSection label="Artifacts" cards={opponentViewModel.artifactCards} cardWidth={cardWidth} cardHeight={cardHeight} setOverlay={setOverlay} handleRightClick={handleRightClick} />
        <OpponentBattlefieldSection label="Enchantments" cards={opponentViewModel.enchantmentCards} cardWidth={cardWidth} cardHeight={cardHeight} setOverlay={setOverlay} handleRightClick={handleRightClick} />
        <OpponentBattlefieldSection label="Lands" cards={opponentViewModel.landCards} cardWidth={cardWidth} cardHeight={cardHeight} setOverlay={setOverlay} handleRightClick={handleRightClick} />
        <OpponentBattlefieldSection label="Battles" cards={opponentViewModel.battleCards} cardWidth={cardWidth} cardHeight={cardHeight} setOverlay={setOverlay} handleRightClick={handleRightClick} />
      </div>
    </div>
  )
}
