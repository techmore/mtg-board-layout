import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import ServerUrlField from '../components/ServerUrlField'
import { getServerUrlFromSearchParams, saveServerUrl } from '../multiplayer/serverUrl'
import { useDeckStore } from '../stores/deckStore'
import { createRoom, useRoomSession } from '../multiplayer/useRoom'
import { deckToRoomCards } from '../multiplayer/roomCards'
import { modeToLabel, modeToMaxPlayers } from 'mtg-protocol'
import type { GameMode, RoomCreateOptions } from 'mtg-protocol'

const modes: GameMode[] = ['1v1', '2v2', '4ffa']

export default function LobbyPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const decks = useDeckStore((s) => s.decks)
  const adopt = useRoomSession().adopt
  const hasDecks = decks.length > 0

  const [gameMode, setGameMode] = useState<GameMode>('1v1')
  const [playerName, setPlayerName] = useState('')
  const [deckId, setDeckId] = useState(hasDecks ? decks[0].id : '')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState(() => getServerUrlFromSearchParams(searchParams))
  const [serverError, setServerError] = useState<string | null>(null)

  const valid = playerName.trim().length > 0 && deckId.length > 0

  const handleCreate = async () => {
    if (!valid || creating) return
    setCreating(true)
    setError(null)
    try {
      const connectedServerUrl = saveServerUrl(serverUrl)
      setServerUrl(connectedServerUrl)
      const room = await createRoom({
        gameMode,
        playerName: playerName.trim(),
        deckId,
        cards: decks.find((deck) => deck.id === deckId) ? deckToRoomCards(decks.find((deck) => deck.id === deckId)!) : [],
      } satisfies RoomCreateOptions, connectedServerUrl)
      adopt(room, connectedServerUrl)
      navigate(`/game/${room.roomId}?name=${encodeURIComponent(playerName.trim())}&deck=${encodeURIComponent(deckId)}&mode=${gameMode}&server=${encodeURIComponent(connectedServerUrl)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game')
      setCreating(false)
    }
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
        color: '#e6edf3',
      }}
    >
      <div
        style={{
          width: 'min(480px, 90vw)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800 }}>Create a Game</div>
          <div style={{ fontSize: '0.8rem', color: '#8b949e', marginTop: 4 }}>
            Choose a mode and invite friends
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>
            Game Mode
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {modes.map((mode) => (
              <button
                key={mode}
                onClick={() => setGameMode(mode)}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  borderRadius: 8,
                  border: `2px solid ${gameMode === mode ? '#58a6ff' : '#30363d'}`,
                  background: gameMode === mode ? 'rgba(88,166,255,0.12)' : 'rgba(255,255,255,0.03)',
                  color: gameMode === mode ? '#58a6ff' : '#8b949e',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textAlign: 'center',
                  lineHeight: 1.3,
                  transition: 'background 0.12s, border-color 0.12s',
                }}
              >
                {modeToLabel(mode)}
                <div style={{ fontSize: '0.65rem', fontWeight: 400, marginTop: 4, opacity: 0.7 }}>
                  {modeToMaxPlayers(mode)} players
                </div>
              </button>
            ))}
          </div>
        </div>

        <ServerUrlField
          value={serverUrl}
          onChange={setServerUrl}
          onBlur={() => {
            try { setServerUrl(saveServerUrl(serverUrl)); setServerError(null) }
            catch (err) { setServerError(err instanceof Error ? err.message : 'Enter a valid server address.') }
          }}
          error={serverError}
        />

        <div>
          <label htmlFor="player-name" style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>
            Your Name
          </label>
          <input
            id="player-name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={24}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #30363d',
              background: '#161b22',
              color: '#e6edf3',
              fontSize: '0.9rem',
            }}
          />
        </div>

        <div>
          <label htmlFor="deck-select" style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: 6, fontWeight: 600 }}>
            Your Deck
          </label>
          {hasDecks ? (
            <select
              id="deck-select"
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #30363d',
                background: '#161b22',
                color: '#e6edf3',
                fontSize: '0.9rem',
              }}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>{deck.name}</option>
              ))}
            </select>
          ) : (
            <div style={{ color: '#8b949e', fontSize: '0.8rem', padding: '8px 0' }}>
              No decks available. Import one in the{' '}
              <span style={{ color: '#58a6ff', cursor: 'pointer' }} onClick={() => navigate('/decks')}>
                Decks
              </span>{' '}
              page first.
            </div>
          )}
        </div>

        {error && (
          <div style={{ color: '#f85149', fontSize: '0.8rem', textAlign: 'center', padding: '8px', background: 'rgba(248,81,73,0.1)', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => navigate('/')}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 8,
              border: '1px solid #30363d',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={!valid || creating}
            style={{
              flex: 2,
              padding: '12px',
              borderRadius: 8,
              border: 'none',
              background: valid && !creating ? '#238636' : 'rgba(35,134,54,0.3)',
              color: valid && !creating ? '#fff' : '#8b949e',
              cursor: valid && !creating ? 'pointer' : 'not-allowed',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {creating ? 'Creating…' : 'Create Game'}
          </button>
        </div>
      </div>
    </div>
  )
}
