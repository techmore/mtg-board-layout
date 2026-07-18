import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { prebuiltDecks } from '../data/prebuiltDecks'
import { fetchDeckCards } from '../services/deckImport'
import { useDeckStore } from '../stores/deckStore'
import { useGameStore } from '../stores/gameStore'

const links = [
  { to: '/board', label: 'Board' },
  { to: '/decks', label: 'Decks' },
  { to: '/tools', label: 'Tools' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  const navigate = useNavigate()
  const decks = useDeckStore((s) => s.decks)
  const importDeck = useDeckStore((s) => s.importDeck)
  const setImporting = useDeckStore((s) => s.setImporting)
  const boardCards = useGameStore((s) => s.cards)
  const loadDeck = useGameStore((s) => s.loadDeck)
  const drawCards = useGameStore((s) => s.drawCards)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const advanceTurn = useGameStore((s) => s.advanceTurn)
  const broadcasting = useGameStore((s) => s.broadcasting)
  const setBroadcasting = useGameStore((s) => s.setBroadcasting)
  const autoImportStarted = useRef(false)
  const broadcastWindow = useRef<Window | null>(null)
  const broadcastWatch = useRef<number | null>(null)
  const [autoImportError, setAutoImportError] = useState<string | null>(null)
  const [broadcastError, setBroadcastError] = useState<string | null>(null)

  const stopBroadcast = useCallback(() => {
    if (broadcastWatch.current) window.clearInterval(broadcastWatch.current)
    broadcastWatch.current = null
    if (broadcastWindow.current && !broadcastWindow.current.closed) broadcastWindow.current.close()
    broadcastWindow.current = null
    setBroadcasting(false)
  }, [setBroadcasting])

  useEffect(() => () => stopBroadcast(), [stopBroadcast])

  const toggleBroadcast = () => {
    if (broadcasting) {
      stopBroadcast()
      return
    }

    setBroadcastError(null)
    const publicWindow = window.open(
      '/broadcast',
      'mtg-board-broadcast',
      'popup=yes,width=1280,height=720,resizable=yes,scrollbars=no',
    )
    if (!publicWindow) {
      setBroadcastError('The public broadcast window was blocked. Allow pop-ups and try again.')
      return
    }
    broadcastWindow.current = publicWindow
    publicWindow.focus()
    setBroadcasting(true)
    broadcastWatch.current = window.setInterval(() => {
      if (publicWindow.closed) stopBroadcast()
    }, 500)
  }

  useEffect(() => {
    if (boardCards.length > 0 || autoImportStarted.current) return
    if (decks.some((deck) => deck.id === 'blight-curse')) return
    const blight = prebuiltDecks.find((d) => d.id === 'blight-curse')
    if (!blight) return

    autoImportStarted.current = true
    setAutoImportError(null)
    setImporting(blight.id)
    ;(async () => {
      try {
        const { cards, notFound } = await fetchDeckCards(blight)
        if (notFound.length > 0) console.warn('Cards not found:', notFound)
        const commanders = [blight.commander, ...(blight.partners ?? [])]
        importDeck(blight.name, cards, blight.format, commanders, notFound.length === 0 && blight.complete, blight.id)
        loadDeck(commanders, cards)
        drawCards(7)
        navigate('/board', { replace: true })
      } catch (error) {
        console.error('Auto-import failed:', error)
        setAutoImportError('Automatic deck import failed. Open Decks to retry.')
      } finally {
        setImporting(null)
      }
    })()
  }, [boardCards.length, decks, drawCards, importDeck, loadDeck, navigate, setImporting])

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#0d1117',
      }}
    >
      <nav
        style={{
          width: 200,
          background: '#161b22',
          borderRight: '1px solid #30363d',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 0',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '0 16px 16px',
            fontWeight: 700,
            fontSize: '1.1rem',
            color: '#e6edf3',
            borderBottom: '1px solid #30363d',
            marginBottom: 8,
          }}
        >
          MTG Board
        </div>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            style={({ isActive }) => ({
              padding: '10px 16px',
              color: isActive ? '#58a6ff' : '#8b949e',
              textDecoration: 'none',
              fontWeight: isActive ? 600 : 400,
              borderRight: isActive ? '2px solid #58a6ff' : '2px solid transparent',
              background: isActive ? 'rgba(88,166,255,0.08)' : 'transparent',
            })}
          >
            {link.label}
          </NavLink>
        ))}

        <div style={{ flex: 1 }} />

        {autoImportError && (
          <div
            role="alert"
            style={{
              margin: '0 8px 8px',
              padding: '8px',
              background: 'rgba(248,81,73,0.15)',
              border: '1px solid rgba(248,81,73,0.35)',
              borderRadius: 6,
              color: '#f85149',
              fontSize: '0.7rem',
              lineHeight: 1.3,
            }}
          >
            {autoImportError}
          </div>
        )}

        <button
          onClick={toggleBroadcast}
          title={broadcasting ? 'Close the public broadcast window' : 'Open the public board window for streaming'}
          style={{
            margin: '0 8px 8px',
            padding: '9px 8px',
            background: broadcasting ? 'rgba(248,81,73,0.2)' : 'rgba(88,166,255,0.12)',
            border: `1px solid ${broadcasting ? 'rgba(248,81,73,0.55)' : 'rgba(88,166,255,0.35)'}`,
            borderRadius: 6,
            color: broadcasting ? '#ff7b72' : '#79c0ff',
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: 700,
          }}
        >
          {broadcasting ? '● Close Public View' : '○ Open Public View'}
        </button>

        {(broadcasting || broadcastError) && (
          <div
            role={broadcastError ? 'alert' : 'status'}
            style={{
              margin: '0 8px 8px',
              color: broadcastError ? '#f85149' : '#3fb950',
              fontSize: '0.65rem',
              lineHeight: 1.3,
            }}
          >
            {broadcastError ?? 'Public window active. Add it to OBS as Window Capture, then use OBS Virtual Camera in SpellTable.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, padding: '0 8px', marginBottom: 8 }}>
          <button
            title="Roll Dice"
            onClick={() => setOverlay({ type: 'dice' })}
            style={{
              flex: 1,
              background: 'none',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#e6edf3',
              cursor: 'pointer',
              padding: '8px 0',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            🎲 Dice
          </button>
          <button
            title="Flip Coin"
            onClick={() => setOverlay({ type: 'coin' })}
            style={{
              flex: 1,
              background: 'none',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#e6edf3',
              cursor: 'pointer',
              padding: '8px 0',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            🪙 Flip
          </button>
        </div>

        <button
          title="Next Turn"
          onClick={advanceTurn}
          style={{
            margin: '0 8px',
            padding: '10px 0',
            background: '#238636',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          Next Turn
        </button>
      </nav>
      <Outlet />
    </div>
  )
}
