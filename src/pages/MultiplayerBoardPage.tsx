import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CardData, RoomJoinOptions, RoomPlayerInfo } from 'mtg-protocol'
import { deckToRoomCards } from '../multiplayer/roomCards'
import { useRoomSession } from '../multiplayer/useRoom'
import { useDeckStore } from '../stores/deckStore'
import { formatCounterCount } from '../components/Board/cardHelpers'

export default function MultiplayerBoardPage() {
  const [searchParams] = useSearchParams()
  const roomId = searchParams.get('roomId') ?? ''
  const decks = useDeckStore((state) => state.decks)
  const { state, privateState, error, isConnecting, connect, sendAction, leave } = useRoomSession()
  const deck = decks[0]
  const joinOptions = useMemo<RoomJoinOptions>(() => ({
    playerName: 'Player',
    deckId: deck?.id ?? '',
    cards: deck ? deckToRoomCards(deck) : [],
  }), [deck])

  useEffect(() => {
    if (roomId && state?.roomId !== roomId) void connect(roomId, joinOptions).catch(() => undefined)
  }, [connect, joinOptions, roomId, state?.roomId])

  if (isConnecting || !state) return <main style={pageStyle}><div>Connecting to multiplayer board…{error ? ` ${error}` : ''}</div></main>

  const me = state.players.find((player) => player.sessionId === state.myPlayerId)
  if (!me) return <main style={pageStyle}><div>Waiting for your player state…</div></main>

  const opponents = state.players.filter((player) => player.sessionId !== state.myPlayerId)
  const isMyTurn = state.activePlayerId === me.id
  const adjustLife = (amount: number) => sendAction({ type: 'setLife', value: me.lifeTotal + amount })
  const moveSeat = (x: number, y: number) => sendAction({ type: 'setPosition', x: me.positionX + x, y: me.positionY + y })

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div><strong>Multiplayer Board</strong><span style={mutedStyle}> Room {state.roomId} · Turn {state.turn}</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={isMyTurn ? activeBadgeStyle : mutedStyle}>{isMyTurn ? 'Your turn' : 'Waiting'}</span>
          <button onClick={() => { leave(); window.location.assign('/') }} style={smallButtonStyle}>Leave</button>
        </div>
      </header>

      <section style={opponentsStyle}>
        {opponents.length === 0 ? <div style={mutedStyle}>Waiting for opponents…</div> : opponents.map((player) => <PlayerPanel key={player.id} player={player} opponent />)}
      </section>

      <section style={positionedTableStyle(me.positionX, me.positionY)}>
        <h2 style={sectionTitle}>Your battlefield</h2>
        <CardRow cards={me.battlefield} empty="No permanents yet" onCard={(card) => sendAction({ type: 'tapCard', cardId: card.id })} />
        <div style={zoneSummaryStyle}>
          <span>Command {me.command.length}</span>
          <span>Graveyard {me.graveyard.length}</span>
          <span>Exile {me.exile.length}</span>
          <span>Library {privateState.libraryCount}</span>
        </div>
      </section>

      <section style={controlsStyle}>
        <div style={controlGroupStyle}>
          <strong>Life {me.lifeTotal}</strong>
          <button onClick={() => adjustLife(-1)} style={smallButtonStyle}>−</button>
          <button onClick={() => adjustLife(1)} style={smallButtonStyle}>+</button>
        </div>
        <div style={controlGroupStyle}>
          <strong>Mana</strong>
          {(['W', 'U', 'B', 'R', 'G', 'C'] as const).map((color) => <button key={color} onClick={() => sendAction({ type: 'addMana', color })} style={smallButtonStyle}>{color} {me.mana[color]}</button>)}
          <button onClick={() => sendAction({ type: 'clearManaPool' })} style={smallButtonStyle}>Clear</button>
        </div>
        <div style={controlGroupStyle}>
          <button onClick={() => sendAction({ type: 'drawCards', count: 1 })} disabled={!isMyTurn} style={smallButtonStyle}>Draw</button>
          <button onClick={() => sendAction({ type: 'endTurn' })} disabled={!isMyTurn} style={primaryButtonStyle}>{isMyTurn ? 'End Turn' : 'Opponent Turn'}</button>
        </div>
        <div style={controlGroupStyle}>
          <strong>Seat</strong>
          <button onClick={() => moveSeat(0, -24)} style={smallButtonStyle}>↑</button>
          <button onClick={() => moveSeat(-24, 0)} style={smallButtonStyle}>←</button>
          <button onClick={() => moveSeat(24, 0)} style={smallButtonStyle}>→</button>
          <button onClick={() => moveSeat(0, 24)} style={smallButtonStyle}>↓</button>
          <span style={mutedStyle}>{me.positionX}, {me.positionY}</span>
        </div>
      </section>

      <section style={handStyle}>
        <h2 style={sectionTitle}>Your hand ({privateState.hand.length})</h2>
        <CardRow cards={privateState.hand} empty="Your hand is empty" onCard={(card) => sendAction({ type: 'playCard', cardId: card.id })} />
      </section>
    </main>
  )
}

function PlayerPanel({ player, opponent }: { player: RoomPlayerInfo; opponent?: boolean }) {
  return <div style={positionedPanelStyle(player.positionX, player.positionY)}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <strong>{player.name}{opponent ? '' : ' (you)'}</strong>
      <span style={mutedStyle}>Life {player.lifeTotal} · Hand {player.handCount}</span>
    </div>
    <CardRow cards={player.battlefield} empty="No permanents" />
  </div>
}

function CardRow({ cards, empty, onCard }: { cards: CardData[]; empty: string; onCard?: (card: CardData) => void }) {
  if (cards.length === 0) return <div style={mutedStyle}>{empty}</div>
  return <div style={cardRowStyle}>{cards.map((card) => <button key={card.id} onClick={() => onCard?.(card)} style={cardButtonStyle(card.tapped)} title={onCard ? 'Click to play or tap' : card.name}>
    {card.imageUri ? <img src={card.imageUri} alt={card.name} style={cardImageStyle} /> : <span>{card.name}</span>}
    <span style={cardNameStyle}>{card.name}{card.counters !== 0 ? ` ${formatCounterCount(card.counters)}` : ''}</span>
  </button>)}</div>
}

const pageStyle: React.CSSProperties = { minHeight: '100%', boxSizing: 'border-box', padding: 18, background: '#0d1117', color: '#e6edf3', overflow: 'auto' }
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #30363d' }
const opponentsStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 14 }
const playerPanelStyle: React.CSSProperties = { padding: 12, border: '1px solid #30363d', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }
const positionedPanelStyle = (x: number, y: number): React.CSSProperties => ({ ...playerPanelStyle, transform: 'translate(' + x + 'px, ' + y + 'px)' })
const tableStyle: React.CSSProperties = { padding: 14, minHeight: 220, border: '1px solid #30363d', borderRadius: 10, background: 'rgba(35,134,54,0.08)' }
const positionedTableStyle = (x: number, y: number): React.CSSProperties => ({ ...tableStyle, transform: 'translate(' + x + 'px, ' + y + 'px)' })
const handStyle: React.CSSProperties = { marginTop: 14, padding: 14, border: '1px solid #30363d', borderRadius: 10, background: 'rgba(88,166,255,0.07)' }
const controlsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 14, padding: 12, border: '1px solid #30363d', borderRadius: 10 }
const controlGroupStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }
const cardRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }
const cardButtonStyle = (tapped: boolean): React.CSSProperties => ({ width: 112, padding: 4, border: `1px solid ${tapped ? '#d29922' : '#30363d'}`, borderRadius: 7, background: tapped ? 'rgba(210,153,34,0.15)' : '#161b22', color: '#e6edf3', cursor: 'pointer', transform: tapped ? 'rotate(7deg)' : undefined })
const cardImageStyle: React.CSSProperties = { width: '100%', aspectRatio: '488 / 680', objectFit: 'cover', borderRadius: 5, display: 'block' }
const cardNameStyle: React.CSSProperties = { display: 'block', padding: '4px 2px 1px', fontSize: '0.65rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const sectionTitle: React.CSSProperties = { margin: '0 0 10px', fontSize: '0.85rem' }
const zoneSummaryStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, color: '#8b949e', fontSize: '0.75rem' }
const mutedStyle: React.CSSProperties = { color: '#8b949e', fontSize: '0.78rem' }
const activeBadgeStyle: React.CSSProperties = { color: '#3fb950', fontWeight: 700, fontSize: '0.78rem' }
const smallButtonStyle: React.CSSProperties = { padding: '6px 9px', borderRadius: 6, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', cursor: 'pointer', fontSize: '0.72rem' }
const primaryButtonStyle: React.CSSProperties = { ...smallButtonStyle, background: '#238636', borderColor: '#2ea043', fontWeight: 700 }
