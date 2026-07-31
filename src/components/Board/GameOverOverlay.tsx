import { useGameStore } from '../../stores/gameStore'

export function GameOverOverlay() {
  const gameOver = useGameStore((s) => s.gameOver)
  const redeal = useGameStore((s) => s.redeal)
  const setGameOver = useGameStore((s) => s.setGameOver)

  if (!gameOver) return null

  const playerWon = gameOver.winner === 'player'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.78)',
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          padding: 28,
          borderRadius: 14,
          background: '#161b22',
          border: `1px solid ${playerWon ? 'rgba(63,185,80,0.65)' : 'rgba(248,81,73,0.65)'}`,
          boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '1px', color: playerWon ? '#3fb950' : '#f85149' }} id="game-over-title">
          {playerWon ? 'YOU WIN' : 'YOU LOSE'}
        </div>
        <div style={{ margin: '12px 0 22px', color: '#8b949e', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {playerWon ? 'The opponent has been defeated.' : 'Your life total reached zero.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => setGameOver(null)}
            style={{
              flex: 1,
              padding: '11px 0',
              borderRadius: 8,
              border: '1px solid #30363d',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            Keep Looking
          </button>
          <button
            type="button"
            onClick={() => redeal()}
            style={{
              flex: 1,
              padding: '11px 0',
              borderRadius: 8,
              border: 'none',
              background: playerWon ? '#238636' : '#da3633',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 700,
            }}
          >
            Play Again
          </button>
        </div>
      </div>
    </div>
  )
}
