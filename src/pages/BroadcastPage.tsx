import { useGameStore } from '../stores/gameStore'
import type { BoardCard } from '../types/card'

const CARD_BACK_URL = '/sleeve_weathered_cardback.webp'

export default function BroadcastPage() {
  const cards = useGameStore((s) => s.cards)
  const backgroundImage = useGameStore((s) => s.backgroundImage)
  const showOpponent = useGameStore((s) => s.showOpponent)

  const battlefieldCards = cards.filter((card) => card.zone === 'battlefield')
  const commandCards = cards.filter((card) => card.zone === 'command')
  const libraryCards = cards.filter((card) => card.zone === 'library')
  const graveyardCards = cards.filter((card) => card.zone === 'graveyard')
  const exileCards = cards.filter((card) => card.zone === 'exile')

  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        minWidth: 960,
        minHeight: 540,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: backgroundImage
          ? `url(${backgroundImage}) center/cover no-repeat`
          : 'url(/unofficial_magic_the_gathering.webp) center/cover no-repeat',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      }}
    >
      <header
        style={{
          height: 42,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          background: 'rgba(0,0,0,0.72)',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <strong style={{ fontSize: '0.85rem', letterSpacing: '0.4px' }}>MTG Board · Public Broadcast</strong>
        <span style={{ color: '#3fb950', fontSize: '0.7rem', fontWeight: 700 }}>
          ● HAND HIDDEN
        </span>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {showOpponent && (
            <div
              style={{
                height: '18%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                color: '#8b949e',
                fontSize: '0.8rem',
              }}
            >
              Opponent&apos;s Board
            </div>
          )}

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: 14,
              background: 'rgba(0,0,0,0.18)',
            }}
          >
            <div style={{ marginBottom: 8, color: '#d0d7de', fontSize: '0.7rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              Battlefield ({battlefieldCards.length})
            </div>
            {battlefieldCards.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem' }}>
                Battlefield empty
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 8 }}>
                {battlefieldCards.map((card) => <PublicCard key={card.id} card={card} />)}
              </div>
            )}
          </div>
        </section>

        <aside
          style={{
            width: 176,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 10,
            overflow: 'auto',
            background: 'rgba(0,0,0,0.58)',
            borderLeft: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <PublicZone label="Command" count={null} card={commandCards[0]} />
          <PublicZone label="Library" count={libraryCards.length} back />
          <PublicZone label="Graveyard" count={graveyardCards.length} card={graveyardCards[0]} />
          <PublicZone label="Exile" count={exileCards.length} card={exileCards[0]} />
        </aside>
      </div>
    </main>
  )
}

function PublicCard({ card }: { card: BoardCard }) {
  return (
    <div style={{ width: 132, flexShrink: 0, position: 'relative' }}>
      <img
        src={card.imageUri}
        alt={card.name}
        style={{
          width: '100%',
          aspectRatio: '5 / 7',
          objectFit: 'cover',
          display: 'block',
          borderRadius: 6,
          border: card.tapped ? '3px solid #58a6ff' : '1px solid rgba(255,255,255,0.2)',
          transform: card.tapped ? 'rotate(90deg)' : 'none',
        }}
      />
      <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e6edf3', fontSize: '0.62rem', textAlign: 'center' }}>
        {card.name}
      </div>
      {card.counters > 0 && (
        <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#d29922', color: '#000', fontSize: '0.65rem', fontWeight: 700 }}>
          {card.counters}
        </span>
      )}
    </div>
  )
}

function PublicZone({ label, count, card, back = false }: { label: string; count: number | null; card?: BoardCard; back?: boolean }) {
  return (
    <div style={{ position: 'relative', padding: 6, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
      {count !== null && <div style={{ marginBottom: 4, color: '#d29922', fontSize: '0.7rem', fontWeight: 700 }}>{count} cards</div>}
      {card ? (
        <img src={card.imageUri} alt={card.name} style={zoneImageStyle} />
      ) : back ? (
        <img src={CARD_BACK_URL} alt="Library" style={zoneImageStyle} />
      ) : (
        <div style={{ ...zoneImageStyle, border: '1px dashed rgba(255,255,255,0.2)' }} />
      )}
      <div style={{ marginTop: 5, color: '#8b949e', fontSize: '0.7rem', textAlign: 'center' }}>{label}</div>
    </div>
  )
}

const zoneImageStyle: React.CSSProperties = {
  width: '100%',
  height: 110,
  objectFit: 'contain',
  display: 'block',
  borderRadius: 5,
  background: 'rgba(0,0,0,0.2)',
}
