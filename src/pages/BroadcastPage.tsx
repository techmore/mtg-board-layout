import { useEffect, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import type { BoardCard, Token } from '../types/card'
import ManaPoolArtifact from '../components/Board/ManaPoolArtifact'
import { CARD_BACK_URL } from '../constants'
import { formatCounterCount } from '../components/Board/cardHelpers'
const STREAM_CARD_WIDTH = 148
const STREAM_SIDEBAR_WIDTH = 192
const STREAM_ZONE_HEIGHT = 108

export default function BroadcastPage() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'MTG Stream — Public Board'
    return () => { document.title = previousTitle }
  }, [])

  const cards = useGameStore((s) => s.cards)
  const tokens = useGameStore((s) => s.tokens)
  const lifeTotal = useGameStore((s) => s.lifeTotal)
  const turn = useGameStore((s) => s.turn)
  const manaPool = useGameStore((s) => s.manaPool)
  const potentialMana = useGameStore((s) => s.potentialMana)
  const turnAnnouncement = useGameStore((s) => s.turnAnnouncement)
  const clearTurnAnnouncement = useGameStore((s) => s.clearTurnAnnouncement)
  const backgroundImage = useGameStore((s) => s.backgroundImage)
  const showOpponent = useGameStore((s) => s.showOpponent)
  const opponentName = useGameStore((s) => s.opponentName)
  const opponentLifeTotal = useGameStore((s) => s.opponentLifeTotal)
  const activePlayer = useGameStore((s) => s.activePlayer)
  const commanderDamage = useGameStore((s) => s.commanderDamage)
  const opponentCards = cards.filter((c) => (c.owner ?? 'player') === 'opponent')
  const opponentBattlefield = opponentCards.filter((c) => c.zone === 'battlefield')
  const opponentCommand = opponentCards.filter((c) => c.zone === 'command')
  const opponentGraveyard = opponentCards.filter((c) => c.zone === 'graveyard')
  const opponentExile = opponentCards.filter((c) => c.zone === 'exile')
  const aiCommanderDamage = opponentCommand.reduce((sum, c) => sum + (commanderDamage[c.id] ?? 0), 0)
  const playerCommanderDamage = cards
    .filter((c) => (c.owner ?? 'player') === 'player' && c.isCommander)
    .reduce((sum, c) => sum + (commanderDamage[c.id] ?? 0), 0)
  const opponentHandCount = opponentCards.filter((c) => c.zone === 'hand').length

  useEffect(() => {
    if (!turnAnnouncement) return
    const announcementId = turnAnnouncement.id
    const timeout = window.setTimeout(() => clearTurnAnnouncement(announcementId), 2800)
    return () => window.clearTimeout(timeout)
  }, [clearTurnAnnouncement, turnAnnouncement])

  const battlefieldCards = cards.filter((card) => card.zone === 'battlefield')
  const commandCards = cards.filter((card) => card.zone === 'command')
  const libraryCards = cards.filter((card) => card.zone === 'library')
  const graveyardCards = cards.filter((card) => card.zone === 'graveyard')
  const exileCards = cards.filter((card) => card.zone === 'exile')
  const battlefieldCount = battlefieldCards.length + tokens.length

  return (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        aspectRatio: '16 / 9',
        minWidth: 960,
        minHeight: 540,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: backgroundImage
          ? `url(${backgroundImage}) center/cover no-repeat`
          : 'url(/unofficial_magic_the_gathering.webp) center/cover no-repeat',
        backgroundPosition: 'center 62%',
        backgroundColor: '#39231e',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        position: 'relative',
      }}
    >
      {turnAnnouncement && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 54,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            padding: '9px 18px',
            borderRadius: 999,
            background: 'rgba(13,17,23,0.94)',
            border: '1px solid rgba(88,166,255,0.8)',
            color: '#79c0ff',
            fontSize: '0.9rem',
            fontWeight: 800,
            letterSpacing: '0.6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {turnAnnouncement.text}
        </div>
      )}
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
        <strong style={{ fontSize: '0.85rem', letterSpacing: '0.4px' }}>MTG Stream · Public Board</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.7rem', fontWeight: 700 }}>
          <span style={{ color: lifeTotal <= 0 ? '#f85149' : lifeTotal <= 5 ? '#d29922' : '#e6edf3' }}>
            LIFE {lifeTotal}
          </span>
          {aiCommanderDamage > 0 && (
            <span
              title="Commander damage dealt to the player (21 loses)"
              style={{ color: aiCommanderDamage >= 18 ? '#ff7b72' : '#ffd33d' }}
            >
              CD {aiCommanderDamage}/21
            </span>
          )}
          {playerCommanderDamage > 0 && (
            <span title="Commander damage dealt to the opponent (21 loses)" style={{ color: '#56d364' }}>
              YOUR CD {playerCommanderDamage}/21
            </span>
          )}
          <span style={{ color: '#79c0ff' }}>TURN {turn}</span>
          <span style={{ color: activePlayer === 'opponent' ? '#f85149' : '#3fb950' }}>
            {activePlayer === 'opponent' ? `● ${(opponentName ?? 'OPPONENT').toUpperCase()}'S TURN` : '● YOUR TURN'}
          </span>
          <span style={{ color: '#3fb950' }}>● HAND HIDDEN</span>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {showOpponent && (
            <div
              style={{
                height: '22%',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                padding: '6px 14px',
                background: 'rgba(0,0,0,0.32)',
                borderBottom: '1px solid rgba(255,255,255,0.12)',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, fontSize: '0.7rem', fontWeight: 700 }}>
                <span style={{ color: '#f85149' }}>{opponentName ?? 'Opponent'}</span>
                <span style={{ color: opponentLifeTotal <= 0 ? '#f85149' : opponentLifeTotal <= 5 ? '#d29922' : '#e6edf3' }}>
                  LIFE {opponentLifeTotal}
                </span>
                <span style={{ color: '#8b949e' }}>CMD {opponentCommand.length}</span>
                <span style={{ color: '#8b949e' }}>GY {opponentGraveyard.length}</span>
                <span style={{ color: '#8b949e' }}>EX {opponentExile.length}</span>
                <span style={{ color: '#8b949e' }}>HAND {opponentHandCount} (hidden)</span>
              </div>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexWrap: 'wrap', gap: 5, alignContent: 'flex-start', overflow: 'hidden' }}>
                {opponentBattlefield.map((card) => <PublicCard key={card.id} card={card} width={84} />)}
                {opponentBattlefield.length === 0 && (
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>Opponent has no permanents</span>
                )}
              </div>
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
              Battlefield ({battlefieldCount})
              {tokens.length > 0 && ` · ${tokens.length} token${tokens.length === 1 ? '' : 's'}`}
            </div>
            {battlefieldCount === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem' }}>
                Battlefield empty
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 8 }}>
                {battlefieldCards.map((card) => <PublicCard key={card.id} card={card} />)}
                {tokens.map((token) => <PublicToken key={token.id} token={token} />)}
              </div>
            )}
          </div>
        </section>

        <aside
          style={{
            width: STREAM_SIDEBAR_WIDTH,
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
          <ManaPoolArtifact
            manaPool={manaPool}
            potentialMana={potentialMana}
            onAdd={() => undefined}
            onSpend={() => undefined}
            onClear={() => undefined}
            compact
            readOnly
          />
          <PublicZone label="Command" count={null} card={commandCards[0]} />
          <PublicZone label="Library" count={libraryCards.length} back />
          <PublicZone label="Graveyard" count={graveyardCards.length} card={graveyardCards[0]} />
          <PublicZone label="Exile" count={exileCards.length} card={exileCards[0]} />
        </aside>
      </div>
    </main>
  )
}

function PublicCard({ card, width = STREAM_CARD_WIDTH }: { card: BoardCard; width?: number }) {
  const [imgError, setImgError] = useState(false)
  return (
    <div style={{ width, flexShrink: 0, position: 'relative' }}>
      <img
        src={imgError ? CARD_BACK_URL : (card.imageUri || CARD_BACK_URL)}
        alt={card.name}
        onError={() => setImgError(true)}
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
      {card.counters !== 0 && (
        <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#d29922', color: '#000', fontSize: '0.65rem', fontWeight: 700 }}>
          {formatCounterCount(card.counters)}
        </span>
      )}
      {(card.damage ?? 0) > 0 && (
        <span style={{ position: 'absolute', top: -4, left: -4, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#f85149', color: '#fff', fontSize: '0.65rem', fontWeight: 800 }}>
          {card.damage}
        </span>
      )}
    </div>
  )
}

function PublicToken({ token }: { token: Token }) {
  return (
    <div style={{ width: STREAM_CARD_WIDTH, flexShrink: 0, position: 'relative' }}>
      {token.imageUri ? (
        <img
          src={token.imageUri}
          alt={token.name}
          style={{
            width: '100%',
            aspectRatio: '5 / 7',
            objectFit: 'cover',
            display: 'block',
            borderRadius: 6,
            border: token.tapped ? '3px solid #58a6ff' : '1px solid rgba(255,255,255,0.2)',
            transform: token.tapped ? 'rotate(90deg)' : 'none',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            aspectRatio: '5 / 7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 8,
            boxSizing: 'border-box',
            borderRadius: 6,
            border: token.tapped ? '3px solid #58a6ff' : '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.08)',
            color: '#e6edf3',
            fontSize: '0.72rem',
            textAlign: 'center',
          }}
        >
          {token.name}
        </div>
      )}
      <div style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#e6edf3', fontSize: '0.62rem', textAlign: 'center' }}>
        {token.name}
      </div>
      {token.power !== undefined && token.toughness !== undefined && (
        <div style={{ position: 'absolute', bottom: -4, right: -4, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', borderRadius: 4, background: '#238636', color: '#fff', fontSize: '0.65rem', fontWeight: 700, boxSizing: 'border-box' }}>
          {token.power}/{token.toughness}
        </div>
      )}
      {token.counters > 0 && (
        <span style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#d29922', color: '#000', fontSize: '0.65rem', fontWeight: 700 }}>
          {token.counters}
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
        <img src={card.imageUri || CARD_BACK_URL} alt={card.name} style={zoneImageStyle} />
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
  height: STREAM_ZONE_HEIGHT,
  objectFit: 'contain',
  display: 'block',
  borderRadius: 5,
  background: 'rgba(0,0,0,0.2)',
}
