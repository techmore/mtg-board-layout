import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Top-center pill showing whose turn it is, the current turn's elapsed time,
 * and each player's total accumulated turn time.
 */
export function TurnTimerPill() {
  const activePlayer = useGameStore((s) => s.activePlayer)
  const turnPlayerMs = useGameStore((s) => s.turnPlayerMs)
  const turnOpponentMs = useGameStore((s) => s.turnOpponentMs)
  const opponentName = useGameStore((s) => s.opponentName)
  const addTurnTime = useGameStore((s) => s.addTurnTime)

  const segmentStartRef = useRef(Date.now())
  const prevPlayerRef = useRef(activePlayer)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (prevPlayerRef.current !== activePlayer) {
      const delta = Date.now() - segmentStartRef.current
      addTurnTime(prevPlayerRef.current, delta)
      segmentStartRef.current = Date.now()
      prevPlayerRef.current = activePlayer
    }
  }, [activePlayer, addTurnTime])

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Date.now() - segmentStartRef.current)
    }, 1000)
    return () => {
      window.clearInterval(id)
      addTurnTime(prevPlayerRef.current, Date.now() - segmentStartRef.current)
    }
  }, [addTurnTime])

  const isPlayerTurn = activePlayer === 'player'
  const segment = formatTime(elapsed)
  const youTotal = formatTime(turnPlayerMs + (isPlayerTurn ? elapsed : 0))
  const oppTotal = formatTime(turnOpponentMs + (!isPlayerTurn ? elapsed : 0))

  return (
    <div
      title="Current turn timer and each player's total turn time"
      style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 14px',
        borderRadius: 999,
        background: 'rgba(13,17,23,0.88)',
        border: `1px solid ${isPlayerTurn ? 'rgba(88,166,255,0.55)' : 'rgba(248,81,73,0.55)'}`,
        boxShadow: '0 3px 12px rgba(0,0,0,0.45)',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes turnDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.7); }
        }
      `}</style>
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: isPlayerTurn ? '#58a6ff' : '#f85149',
          animation: 'turnDotPulse 1.2s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      <strong
        role="status"
        aria-live="polite"
        style={{
          color: isPlayerTurn ? '#79c0ff' : '#ff7b72',
          fontSize: '0.78rem',
          fontWeight: 800,
          letterSpacing: '0.4px',
          whiteSpace: 'nowrap',
        }}
      >
        {isPlayerTurn ? 'YOUR TURN' : `${(opponentName ?? 'OPPONENT').toUpperCase()}'S TURN`}
      </strong>
      <span
        aria-hidden="true"
        style={{
          color: '#e6edf3',
          fontSize: '0.85rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {segment}
      </span>
      <span
        aria-hidden="true"
        style={{
          color: '#8b949e',
          fontSize: '0.66rem',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        You {youTotal} · {(opponentName ?? 'Opponent')} {oppTotal}
      </span>
    </div>
  )
}
