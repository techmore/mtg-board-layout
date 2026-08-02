import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { modeToLabel } from 'mtg-protocol'
import type { RoomPlayerInfo, RoomJoinOptions, ServerEvent } from 'mtg-protocol'
import { deckToRoomCards } from '../multiplayer/roomCards'
import { useRoomSession } from '../multiplayer/useRoom'
import { useDeckStore } from '../stores/deckStore'
import { useToastStore } from '../stores/toastStore'
import { getServerUrlFromSearchParams } from '../multiplayer/serverUrl'

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const decks = useDeckStore((state) => state.decks)
  const { state, error, isConnecting, connect, lastEvent, sendAction, leave, serverUrl } = useRoomSession()
  const initialName = searchParams.get('name') ?? ''
  const initialDeck = searchParams.get('deck') ?? ''
  const [copied, setCopied] = useState(false)
  const selectedDeck = decks.find((deck) => deck.id === initialDeck) ?? decks[0]
  const requestedServerUrl = getServerUrlFromSearchParams(searchParams)

  const joinOptions = useMemo<RoomJoinOptions>(() => ({
    playerName: initialName || 'Player',
    deckId: selectedDeck?.id ?? initialDeck,
    cards: selectedDeck ? deckToRoomCards(selectedDeck) : [],
  }), [initialName, initialDeck, selectedDeck])

  useEffect(() => {
    if (roomId) void connect(roomId, joinOptions, requestedServerUrl).catch(() => undefined)
  }, [connect, joinOptions, requestedServerUrl, roomId])

  useEffect(() => {
    if ((lastEvent as ServerEvent | null)?.type === 'gameStarted') navigate(`/board?roomId=${roomId}`)
  }, [lastEvent, navigate, roomId])

  const shareUrl = window.location.origin + '/game/' + roomId + '?server=' + encodeURIComponent(serverUrl)
  const players = state?.players ?? []
  const myId = state?.myPlayerId
  const me = players.find((player) => player.sessionId === myId)
  const isHost = state?.hostId === myId
  const maxPlayers = state?.gameMode === '1v1' ? 2 : 4
  const allPlayersReady = players.length === maxPlayers && players.every((player) => player.ready)

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      useToastStore.getState().push('Invite link copied', 'success')
      window.setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }

  if (isConnecting || !state) {
    return <div style={centerStyle}>{error ? `Failed to connect: ${error}` : 'Connecting to room…'}</div>
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>Game Room</div>
          <div style={{ color: '#8b949e', fontSize: '0.8rem', marginTop: 4 }}>{modeToLabel(state.gameMode)}</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, letterSpacing: '4px', color: '#ffd33d', marginTop: 8 }}>{state.roomId}</div>
        </div>

        <div style={sectionStyle}>
          <div style={labelStyle}>Share this link to invite players</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={shareUrl} style={linkInputStyle} onClick={(event) => event.currentTarget.select()} />
            <button onClick={handleCopy} style={copyBtnStyle(copied)}>{copied ? 'Copied!' : 'Copy'}</button>
          </div>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={sectionStyle}>
          <div style={labelStyle}>Players ({players.length}/{maxPlayers})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {players.map((player) => <PlayerRow key={player.id} player={player} isMe={player.sessionId === myId} />)}
            {players.length === 0 && <div style={{ color: '#484f58', textAlign: 'center', padding: 12 }}>Waiting for players…</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { leave(); navigate('/') }} style={secondaryBtnStyle}>Leave</button>
          <button onClick={() => sendAction({ type: 'ready' })} style={readyBtnStyle(me?.ready ?? false)}>
            {me?.ready ? 'Ready ✓' : 'Ready Up'}
          </button>
          {isHost && (
            <button onClick={() => sendAction({ type: 'startGame' })} disabled={!allPlayersReady} style={primaryBtnStyle(allPlayersReady)}>
              Start Game
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function PlayerRow({ player, isMe }: { player: RoomPlayerInfo; isMe: boolean }) {
  return <div style={rowStyle(isMe)}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: player.connected ? '#3fb950' : '#484f58' }} />
      <span style={{ fontWeight: isMe ? 700 : 400 }}>{player.name}{isMe && <span style={{ color: '#8b949e', fontSize: '0.7rem', marginLeft: 6 }}>(you)</span>}</span>
    </div>
    <div style={badgeStyle(player.ready)}>{player.ready ? 'Ready' : 'Not Ready'}</div>
  </div>
}

const centerStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#8b949e' }
const pageStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#e6edf3' }
const cardStyle: React.CSSProperties = { width: 'min(560px, 92vw)', display: 'flex', flexDirection: 'column', gap: 20 }
const sectionStyle: React.CSSProperties = { padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid #30363d' }
const labelStyle: React.CSSProperties = { fontSize: '0.75rem', color: '#8b949e', marginBottom: 8, fontWeight: 600 }
const linkInputStyle: React.CSSProperties = { flex: 1, padding: '12px 14px', borderRadius: 8, border: '1px solid #30363d', background: '#161b22', color: '#58a6ff', fontSize: '0.9rem', fontFamily: 'monospace', textAlign: 'center', userSelect: 'all' }
const copyBtnStyle = (copied: boolean): React.CSSProperties => ({ padding: '12px 16px', borderRadius: 8, border: `1px solid ${copied ? 'rgba(63,185,80,0.4)' : 'rgba(88,166,255,0.4)'}`, background: copied ? 'rgba(63,185,80,0.15)' : 'rgba(88,166,255,0.12)', color: copied ? '#3fb950' : '#58a6ff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 })
const errorStyle: React.CSSProperties = { color: '#f85149', fontSize: '0.8rem', textAlign: 'center', padding: 8, background: 'rgba(248,81,73,0.1)', borderRadius: 8 }
const rowStyle = (isMe: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, background: isMe ? 'rgba(88,166,255,0.08)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isMe ? 'rgba(88,166,255,0.3)' : 'rgba(255,255,255,0.06)'}` })
const badgeStyle = (ready: boolean): React.CSSProperties => ({ padding: '3px 10px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: ready ? 'rgba(63,185,80,0.15)' : 'rgba(255,255,255,0.04)', color: ready ? '#3fb950' : '#484f58' })
const secondaryBtnStyle: React.CSSProperties = { flex: 1, padding: 12, borderRadius: 8, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }
const primaryBtnStyle = (enabled: boolean): React.CSSProperties => ({ flex: 2, padding: 12, borderRadius: 8, border: 'none', background: enabled ? '#238636' : 'rgba(35,134,54,0.3)', color: enabled ? '#fff' : '#8b949e', cursor: enabled ? 'pointer' : 'not-allowed', fontSize: '0.85rem', fontWeight: 700 })
const readyBtnStyle = (isReady: boolean): React.CSSProperties => ({ flex: 2, padding: 12, borderRadius: 8, border: 'none', background: isReady ? 'rgba(210,153,34,0.3)' : '#238636', color: isReady ? '#ffd33d' : '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 })
