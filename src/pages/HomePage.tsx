import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ServerUrlField from '../components/ServerUrlField'
import { getStoredServerUrl, saveServerUrl } from '../multiplayer/serverUrl'

const btnBase: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '16px 24px',
  border: '1px solid #30363d',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.04)',
  color: '#e6edf3',
  cursor: 'pointer',
  fontSize: '1rem',
  fontWeight: 600,
  textAlign: 'center',
  transition: 'background 0.15s, border-color 0.15s',
}

export default function HomePage() {
  const navigate = useNavigate()
  const [joinId, setJoinId] = useState('')
  const [joining, setJoining] = useState(false)
  const [serverUrl, setServerUrl] = useState(getStoredServerUrl)
  const [serverError, setServerError] = useState<string | null>(null)

  const commitServerUrl = () => {
    try {
      const normalized = saveServerUrl(serverUrl)
      setServerUrl(normalized)
      setServerError(null)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Enter a valid server address.')
    }
  }

  const serverQuery = () => '?server=' + encodeURIComponent(saveServerUrl(serverUrl))

  const handleJoin = () => {
    const trimmed = joinId.trim().toUpperCase()
    if (!trimmed) return
    setJoining(true)
    try {
      navigate('/game/' + trimmed + serverQuery())
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Enter a valid server address.')
    } finally { setJoining(false) }
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
          width: 'min(420px, 90vw)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.5px' }}>MTG Board</div>
          <div style={{ fontSize: '0.8rem', color: '#8b949e', marginTop: 4 }}>Multiplayer Magic</div>
        </div>

        <button
          onClick={() => navigate('/board')}
          style={btnBase}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = '#58a6ff' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = '#30363d' }}
        >
          Play Solo
        </button>

        <button
          onClick={() => {
            try { navigate('/lobby' + serverQuery()) }
            catch (error) { setServerError(error instanceof Error ? error.message : 'Enter a valid server address.') }
          }}
          style={{ ...btnBase, background: 'rgba(35,134,54,0.15)', borderColor: '#238636' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(35,134,54,0.25)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(35,134,54,0.15)' }}
        >
          Play Multiplayer
        </button>

        <ServerUrlField value={serverUrl} onChange={setServerUrl} onBlur={commitServerUrl} error={serverError} />

        <div style={{ borderTop: '1px solid #21262d', margin: '8px 0' }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value.toUpperCase())}
            placeholder="Room Code (e.g. XKCD)"
            maxLength={4}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #30363d',
              background: '#161b22',
              color: '#e6edf3',
              fontSize: '1rem',
              fontWeight: 700,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          />
          <button
            onClick={handleJoin}
            disabled={joining || joinId.trim().length === 0}
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              border: '1px solid rgba(88,166,255,0.4)',
              background: joining ? 'rgba(88,166,255,0.08)' : 'rgba(88,166,255,0.15)',
              color: joining ? '#8b949e' : '#58a6ff',
              cursor: joining || joinId.trim().length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {joining ? 'Joining…' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  )
}
