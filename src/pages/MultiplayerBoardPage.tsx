import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { CardData, ChatMessageEvent, CoinFlippedEvent, DiceRolledEvent, GameEndedEvent, RoomJoinOptions, RoomPlayerInfo } from 'mtg-protocol'
import { deckToRoomCards } from '../multiplayer/roomCards'
import { createRoom, useRoomSession } from '../multiplayer/useRoom'
import { getServerUrlFromSearchParams } from '../multiplayer/serverUrl'
import { useDeckStore } from '../stores/deckStore'
import { useToastStore } from '../stores/toastStore'
import { formatCounterCount } from '../components/Board/cardHelpers'

interface ChatEntry {
  id: number
  playerName: string
  text: string
}

export default function MultiplayerBoardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomId = searchParams.get('roomId') ?? ''
  const decks = useDeckStore((state) => state.decks)
  const { state, privateState, lastEvent, error, isConnecting, connect, sendAction, leave, adopt, serverUrl } = useRoomSession()
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [gameWinnerId, setGameWinnerId] = useState<string | null>(null)
  const [combatMode, setCombatMode] = useState<'none' | 'attack' | 'block'>('none')
  const [combatSelection, setCombatSelection] = useState<string[]>([])
  const [zoomCard, setZoomCard] = useState<CardData | null>(null)
  const [lastRoll, setLastRoll] = useState<string | null>(null)
  const myTimeRef = useRef(0)
  const oppTimeRef = useRef(0)
  const [, setTimerTick] = useState(0)
  const activeIsMe = state !== null && state.activePlayerId === state.myPlayerId
  const handleRematch = async () => {
    try {
      const room = await createRoom({
        gameMode: state?.gameMode ?? '1v1',
        playerName: me?.name ?? 'Player',
        deckId: selectedDeck?.id ?? '',
        cards: selectedDeck ? deckToRoomCards(selectedDeck) : [],
      }, serverUrl)
      adopt(room, serverUrl)
      navigate(`/game/${room.roomId}?name=${encodeURIComponent(me?.name ?? 'Player')}&deck=${encodeURIComponent(selectedDeck?.id ?? '')}&mode=${state?.gameMode ?? '1v1'}&server=${encodeURIComponent(serverUrl)}`)
    } catch {
      useToastStore.getState().push('Could not start a rematch — check the server', 'error')
    }
  }

  useEffect(() => {
    if (!zoomCard) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomCard(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [zoomCard])

  const requestedServerUrl = getServerUrlFromSearchParams(searchParams)
  const initialName = searchParams.get('name') ?? ''
  const initialDeck = searchParams.get('deck') ?? ''
  const selectedDeck = decks.find((deck) => deck.id === initialDeck) ?? decks[0]

  const joinOptions = useMemo<RoomJoinOptions>(() => ({
    playerName: initialName || 'Player',
    deckId: selectedDeck?.id ?? initialDeck,
    cards: selectedDeck ? deckToRoomCards(selectedDeck) : [],
  }), [initialName, initialDeck, selectedDeck])

  useEffect(() => {
    if (roomId && state?.roomId !== roomId) void connect(roomId, joinOptions, requestedServerUrl).catch(() => undefined)
  }, [connect, joinOptions, requestedServerUrl, roomId, state?.roomId])

  useEffect(() => {
    setMessages([])
  }, [roomId])

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'chatMessage') return
    const event = lastEvent as ChatMessageEvent
    setMessages((current) => [...current, { id: Date.now() + current.length, playerName: event.playerName, text: event.text }])
  }, [lastEvent])

  useEffect(() => {
    if (!lastEvent || lastEvent.type !== 'gameEnded') return
    setGameWinnerId((lastEvent as GameEndedEvent).winnerId ?? null)
  }, [lastEvent])

  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'diceRolled') {
      const event = lastEvent as DiceRolledEvent
      const name = state?.players.find((p) => p.id === event.playerId)?.name ?? 'Player'
      setLastRoll(`${name} rolled d20: ${event.result}`)
    } else if (lastEvent.type === 'coinFlipped') {
      const event = lastEvent as CoinFlippedEvent
      const name = state?.players.find((p) => p.id === event.playerId)?.name ?? 'Player'
      setLastRoll(`${name} flipped: ${event.result}`)
    }
  }, [lastEvent, state?.players])

  // Per-player turn timers (accumulated while each player is active). Stop
  // accruing once the game has finished so totals freeze.
  const finishedRef = useRef(false)
  useEffect(() => {
    finishedRef.current = state?.status === 'finished'
  }, [state?.status])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (finishedRef.current) return
      if (activeIsMe) myTimeRef.current += 1000
      else oppTimeRef.current += 1000
      setTimerTick((t) => t + 1)
    }, 1000)
    return () => window.clearInterval(id)
  }, [activeIsMe])

  useEffect(() => {
    setMessages([])
    setLastRoll(null)
    myTimeRef.current = 0
    oppTimeRef.current = 0
  }, [roomId])

  if (isConnecting || !state) return <main style={pageStyle}><div>Connecting to multiplayer board…{error ? ` ${error}` : ''}</div></main>

  const me = state.players.find((player) => player.sessionId === state.myPlayerId)
  if (!me) return <main style={pageStyle}><div>Waiting for your player state…</div></main>

  const opponents = state.players.filter((player) => player.sessionId !== state.myPlayerId)
  const isMyTurn = state.activePlayerId === me.id
  const finished = state.status === 'finished'
  const winnerId = finished ? (gameWinnerId ?? state.players[0]?.id ?? null) : null
  const winner = winnerId ? state.players.find((player) => player.id === winnerId) : undefined
  const winnerNames = finished && winner
    ? state.players.filter((p) => p.teamId === winner.teamId).map((p) => p.name).join(' & ')
    : undefined
  const combatActive = state.combatActive && !finished
  const opponentAttacking = combatActive && state.attackers.length > 0 && !isMyTurn
  const myBlockedIds = state.blockers
  const adjustLife = (amount: number) => sendAction({ type: 'setLife', value: me.lifeTotal + amount })
  const moveSeat = (x: number, y: number) => sendAction({ type: 'setPosition', x: me.positionX + x, y: me.positionY + y })
  const sendChat = () => {
    const text = chatInput.trim()
    if (!text) return
    sendAction({ type: 'chatMessage', text })
    setChatInput('')
  }
  const toggleCombatSelection = (cardId: string) => {
    setCombatSelection((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId],
    )
  }
  const cardInCombat = (cardId: string) => {
    if (state.attackers.includes(cardId)) return 'attack'
    if (myBlockedIds.includes(cardId)) return 'block'
    return 'none'
  }

  return (
    <main style={pageStyle}>
      {finished && (
        <div
          role="status"
          style={{
            marginBottom: 14,
            padding: '12px 18px',
            borderRadius: 10,
            background: 'rgba(210,153,34,0.14)',
            border: '1px solid rgba(210,153,34,0.5)',
            color: '#ffd33d',
            fontSize: '0.9rem',
            fontWeight: 800,
            textAlign: 'center',
            letterSpacing: '0.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span>          GAME OVER — {winnerNames ? `${winnerNames} win${winnerNames.includes(' & ') ? '' : 's'}` : 'The game has ended'}</span>
          <button
            onClick={handleRematch}
            style={{ ...smallButtonStyle, background: '#238636', borderColor: '#2ea043', color: '#fff', fontWeight: 700 }}
          >
            Play Again
          </button>
        </div>
      )}
      <header style={headerStyle}>
        <div><strong>Multiplayer Board</strong><span style={mutedStyle}> Room {state.roomId} · Turn {state.turn}</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={isMyTurn ? activeBadgeStyle : mutedStyle}>
            {isMyTurn ? 'Your turn' : `${state.players.find((p) => p.id === state.activePlayerId)?.name ?? 'Another player'}'s turn`}
          </span>
          <span
            title="Current turn stage"
            style={{
              color: state.combatActive ? '#f0883e' : '#8b949e',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
            }}
          >
            {state.combatActive ? '⚔ Combat' : 'Main'}
          </span>
          <span style={{ ...mutedStyle, fontVariantNumeric: 'tabular-nums' }} title="Turn timers (total per player)">
            ⏱ You {formatTime(myTimeRef.current)} · {opponents.length > 1 ? `Opponents ${formatTime(oppTimeRef.current)}` : `${opponents[0]?.name ?? 'Opponent'} ${formatTime(oppTimeRef.current)}`}
          </span>
          <button onClick={() => { leave(); window.location.assign('/') }} style={smallButtonStyle}>Leave</button>
        </div>
      </header>

      <section style={opponentsStyle}>
        {opponents.length === 0 ? <div style={mutedStyle}>Waiting for opponents…</div> : opponents.map((player) => <PlayerPanel key={player.id} player={player} opponent active={state.activePlayerId === player.id} myTeamId={me.teamId} onZoom={setZoomCard} />)}
      </section>

      <section style={positionedTableStyle(me.positionX, me.positionY)}>
        <h2 style={sectionTitle}>Your battlefield</h2>
        {me.command.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={mutedStyle}>Command zone (click to cast)</div>
            <CardRow cards={me.command} empty="" onCard={(card) => sendAction({ type: 'playCard', cardId: card.id })} onZoom={setZoomCard} />
          </div>
        )}
        {opponentAttacking && (
          <div style={{ ...combatBannerStyle, background: 'rgba(248,81,73,0.14)', borderColor: 'rgba(248,81,73,0.5)', color: '#ff7b72' }}>
            ⚔ DEFEND — click your creatures to block ({state.attackers.length} attacking)
          </div>
        )}
        {combatMode === 'attack' && (
          <div style={{ ...combatBannerStyle, background: 'rgba(88,166,255,0.12)', borderColor: 'rgba(88,166,255,0.5)', color: '#79c0ff' }}>
            Click creatures to declare as attackers ({combatSelection.length} selected)
          </div>
        )}
        <CardRow
          cards={me.battlefield}
          empty="No permanents yet"
          onCard={(card) => {
            if (combatMode === 'attack' || combatMode === 'block') toggleCombatSelection(card.id)
            else sendAction({ type: 'tapCard', cardId: card.id })
          }}
          onZoom={setZoomCard}
          combatStatus={cardInCombat}
          selectedIds={combatMode === 'none' ? undefined : combatSelection}
        />
        {me.tokens.length > 0 && (
          <div style={tokenRowStyle}>
            {me.tokens.map((token) => (
              <div key={token.id} style={tokenStyle(token.tapped)} title={token.name}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700 }}>{token.name}</span>
                <span style={mutedStyle}>
                  {token.tapped ? '⤓ ' : ''}{token.counters !== 0 ? `${token.counters}` : ''}
                </span>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button onClick={() => sendAction({ type: 'toggleTokenTap', tokenId: token.id })} style={tinyButtonStyle}>⤓</button>
                  <button onClick={() => sendAction({ type: 'addTokenCounter', tokenId: token.id })} style={tinyButtonStyle}>+1</button>
                  <button onClick={() => sendAction({ type: 'removeTokenCounter', tokenId: token.id })} style={tinyButtonStyle}>−1</button>
                  <button onClick={() => sendAction({ type: 'removeToken', tokenId: token.id })} style={{ ...tinyButtonStyle, color: '#f85149' }}>×</button>
                </div>
              </div>
            ))}
          </div>
        )}
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
          <button onClick={() => sendAction({ type: 'drawCards', count: 1 })} disabled={!isMyTurn || finished} style={smallButtonStyle}>Draw</button>
          <button onClick={() => sendAction({ type: 'endTurn' })} disabled={!isMyTurn || finished} style={primaryButtonStyle}>{isMyTurn ? 'End Turn' : 'Opponent Turn'}</button>
        </div>
        <div style={controlGroupStyle}>
          {!combatActive && isMyTurn && !finished && (
            <button
              onClick={() => { setCombatMode('attack'); setCombatSelection([]) }}
              style={smallButtonStyle}
            >
              Start Combat
            </button>
          )}
          {combatMode === 'attack' && (
            <>
              <button
                onClick={() => {
                  if (combatSelection.length === 0) return
                  sendAction({ type: 'declareAttackers', attackerIds: combatSelection })
                  setCombatMode('none')
                  setCombatSelection([])
                }}
                disabled={combatSelection.length === 0}
                style={primaryButtonStyle}
              >
                Declare Attackers ({combatSelection.length})
              </button>
              <button
                onClick={() => { setCombatMode('none'); setCombatSelection([]) }}
                style={smallButtonStyle}
              >
                Cancel
              </button>
            </>
          )}
          {opponentAttacking && (
            <button
              onClick={() => { setCombatMode(combatMode === 'block' ? 'none' : 'block'); setCombatSelection([]) }}
              style={combatMode === 'block' ? primaryButtonStyle : smallButtonStyle}
            >
              {combatMode === 'block' ? 'Cancel Blocking' : 'Choose Blockers'}
            </button>
          )}
          {combatMode === 'block' && (
            <button
              onClick={() => {
                sendAction({ type: 'declareBlockers', blockerIds: combatSelection })
                setCombatMode('none')
                setCombatSelection([])
              }}
              disabled={combatSelection.length === 0}
              style={primaryButtonStyle}
            >
              Declare Blockers ({combatSelection.length})
            </button>
          )}
          {combatActive && (
            <button
              onClick={() => { setCombatMode('none'); setCombatSelection([]); sendAction({ type: 'resolveCombat' }) }}
              style={smallButtonStyle}
            >
              Resolve Combat
            </button>
          )}
        </div>
        <div style={controlGroupStyle}>
          <strong>Token</strong>
          {(['Treasure', 'Soldier', 'Spirit', 'Goat'] as const).map((name) => (
            <button
              key={name}
              onClick={() => sendAction({
                type: 'addToken',
                token: { id: crypto.randomUUID(), name, imageUri: '', counters: 0, tapped: false },
              })}
              style={smallButtonStyle}
            >
              +{name}
            </button>
          ))}
        </div>
        <div style={controlGroupStyle}>
          <strong>Roll</strong>
          <button onClick={() => sendAction({ type: 'rollDice' })} style={smallButtonStyle}>d20</button>
          <button onClick={() => sendAction({ type: 'flipCoin' })} style={smallButtonStyle}>Coin</button>
          {lastRoll && <span style={mutedStyle}>{lastRoll}</span>}
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

      <section style={chatStyle}>
        <h2 style={sectionTitle}>Chat</h2>
        <div style={chatLogStyle}>
          {messages.length === 0
            ? <div style={mutedStyle}>No messages yet.</div>
            : messages.map((message) => (
              <div key={message.id} style={chatEntryStyle}>
                <span style={chatNameStyle}>{message.playerName}:</span> {message.text}
              </div>
            ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
            placeholder="Message the table…"
            maxLength={500}
            style={chatInputStyle}
          />
          <button onClick={sendChat} disabled={chatInput.trim().length === 0} style={smallButtonStyle}>Send</button>
        </div>
      </section>

      <section style={handStyle}>
        <h2 style={sectionTitle}>Your hand ({privateState.hand.length})</h2>
        <CardRow cards={privateState.hand} empty="Your hand is empty" onCard={(card) => sendAction({ type: 'playCard', cardId: card.id })} onZoom={setZoomCard} />
      </section>

      <section style={controlsStyle}>
        <div style={controlGroupStyle}>
          <strong>Random</strong>
          <button onClick={() => sendAction({ type: 'rollDice' })} style={smallButtonStyle}>🎲 d20</button>
          <button onClick={() => sendAction({ type: 'flipCoin' })} style={smallButtonStyle}>🪙 Flip</button>
          {lastRoll && <span style={mutedStyle}>{lastRoll}</span>}
        </div>
      </section>

      {zoomCard && (
        <div
          onClick={() => setZoomCard(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1500,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            cursor: 'zoom-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 'min(760px, 92vw)',
              maxHeight: '92vh',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}
          >
            {zoomCard.imageUri ? (
              <img src={zoomCard.imageUri} alt={zoomCard.name} style={{ maxWidth: 'min(280px, 50vw)', maxHeight: '70vh', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} />
            ) : (
              <div style={{ width: 200, height: 280, borderRadius: 10, background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>No image</div>
            )}
            <div style={{ width: 'min(360px, 100%)', background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{zoomCard.name}</div>
              <div style={{ color: '#8b949e', fontSize: '0.78rem' }}>{zoomCard.typeLine}</div>
              <div style={{ color: '#d0d7de', fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-line', maxHeight: 300, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                {zoomCard.oracleText || 'No card text available.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function PlayerPanel({ player, opponent, active, onZoom, myTeamId }: { player: RoomPlayerInfo; opponent?: boolean; active?: boolean; onZoom: (card: CardData) => void; myTeamId?: string }) {
  const is2v2 = player.teamId === 'team1' || player.teamId === 'team2'
  const sameTeam = is2v2 && myTeamId !== undefined && myTeamId === player.teamId
  const maxCommanderDamage = Math.max(0, ...Object.values(player.commanderDamage ?? {}))
  return <div style={{ ...positionedPanelStyle(player.positionX, player.positionY), outline: active ? '2px solid #58a6ff' : undefined, outlineOffset: -2 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <strong>
        {player.name}{opponent ? '' : ' (you)'}
        {is2v2 && <span style={{ ...mutedStyle, marginLeft: 6, color: sameTeam ? '#3fb950' : '#f85149', fontWeight: 700 }}>{sameTeam ? '★ teammate' : '☆ enemy'}</span>}
      </strong>
      <span style={mutedStyle}>Life {player.lifeTotal} · Hand {player.handCount}</span>
    </div>
    {maxCommanderDamage > 0 && (
      <div style={{ ...mutedStyle, marginTop: 4 }}>
        <span
          title="Highest commander damage dealt to this player (21 loses)"
          style={{
            color: maxCommanderDamage >= 18 ? '#ff7b72' : '#ffd33d',
            fontWeight: 700,
            fontSize: '0.68rem',
          }}
        >
          CD {maxCommanderDamage}/21
        </span>
      </div>
    )}
    <CardRow cards={player.battlefield} empty="No permanents" onZoom={onZoom} />
    {player.tokens.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {player.tokens.map((token) => (
          <span key={token.id} style={{ ...tokenStyle(token.tapped), fontSize: '0.6rem', padding: '2px 7px' }} title={token.name}>
            {token.name}{token.counters !== 0 ? ` ${token.counters}` : ''}{token.tapped ? ' ⤓' : ''}
          </span>
        ))}
      </div>
    )}
  </div>
}

function CardRow({ cards, empty, onCard, onZoom, combatStatus, selectedIds }: {
  cards: CardData[]
  empty: string
  onCard?: (card: CardData) => void
  onZoom?: (card: CardData) => void
  combatStatus?: (cardId: string) => 'attack' | 'block' | 'none'
  selectedIds?: string[]
}) {
  if (cards.length === 0) return <div style={mutedStyle}>{empty}</div>
  return <div style={cardRowStyle}>{cards.map((card) => {
    const status = combatStatus?.(card.id) ?? 'none'
    const selected = selectedIds?.includes(card.id) ?? false
    return (
      <div key={card.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <button
          onClick={() => onCard?.(card)}
          style={{
            ...cardButtonStyle(card.tapped),
            borderColor: selected ? '#58a6ff' : status === 'attack' ? 'rgba(248,81,73,0.7)' : status === 'block' ? 'rgba(88,166,255,0.7)' : undefined,
            boxShadow: selected ? '0 0 0 2px rgba(88,166,255,0.5)' : undefined,
          }}
          title={status === 'attack' ? `${card.name} (attacking)` : status === 'block' ? `${card.name} (blocking)` : onCard ? 'Click to play or tap' : card.name}
        >
          {card.imageUri ? <img src={card.imageUri} alt={card.name} style={cardImageStyle} /> : <span>{card.name}</span>}
          <span style={cardNameStyle}>
            {card.name}{card.counters !== 0 ? ` ${formatCounterCount(card.counters)}` : ''}
            {card.damage ? ` ✕${card.damage}` : ''}
            {status === 'attack' ? ' ⚔' : status === 'block' ? ' 🛡' : ''}
          </span>
        </button>
        {onZoom && (
          <button
            onClick={() => onZoom(card)}
            title={`Inspect ${card.name}`}
            aria-label={`Inspect ${card.name}`}
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 20,
              height: 20,
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(13,17,23,0.8)',
              color: '#d0d7de',
              cursor: 'pointer',
              fontSize: '0.68rem',
              padding: 0,
              lineHeight: 1,
            }}
          >
            👁
          </button>
        )}
      </div>
    )
  })}</div>
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
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
const chatStyle: React.CSSProperties = { marginTop: 14, padding: 14, border: '1px solid #30363d', borderRadius: 10, background: 'rgba(255,255,255,0.02)' }
const chatLogStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto', marginBottom: 10, fontSize: '0.78rem' }
const chatEntryStyle: React.CSSProperties = { lineHeight: 1.4 }
const chatNameStyle: React.CSSProperties = { color: '#58a6ff', fontWeight: 700 }
const chatInputStyle: React.CSSProperties = { flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', fontSize: '0.78rem' }
const tokenRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }
const tokenStyle = (tapped: boolean): React.CSSProperties => ({
  display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
  padding: '6px 10px', borderRadius: 7,
  border: `1px solid ${tapped ? 'rgba(210,153,34,0.6)' : 'rgba(88,166,255,0.3)'}`,
  background: tapped ? 'rgba(210,153,34,0.12)' : 'rgba(88,166,255,0.08)',
  color: '#e6edf3',
})
const tinyButtonStyle: React.CSSProperties = { padding: '1px 6px', borderRadius: 4, border: '1px solid #30363d', background: 'rgba(255,255,255,0.04)', color: '#d0d7de', cursor: 'pointer', fontSize: '0.62rem' }
const combatBannerStyle: React.CSSProperties = { marginBottom: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid', fontSize: '0.78rem', fontWeight: 700 }
const mutedStyle: React.CSSProperties = { color: '#8b949e', fontSize: '0.78rem' }
const activeBadgeStyle: React.CSSProperties = { color: '#3fb950', fontWeight: 700, fontSize: '0.78rem' }
const smallButtonStyle: React.CSSProperties = { padding: '6px 9px', borderRadius: 6, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', cursor: 'pointer', fontSize: '0.72rem' }
const primaryButtonStyle: React.CSSProperties = { ...smallButtonStyle, background: '#238636', borderColor: '#2ea043', fontWeight: 700 }
