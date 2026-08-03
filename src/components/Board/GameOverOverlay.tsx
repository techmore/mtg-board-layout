import { useGameStore } from '../../stores/gameStore'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function GameOverOverlay() {
  const gameOver = useGameStore((s) => s.gameOver)
  const redeal = useGameStore((s) => s.redeal)
  const setGameOver = useGameStore((s) => s.setGameOver)

  if (!gameOver) return null

  const playerWon = gameOver.winner === 'player'

  return (
    <Modal open onClose={() => setGameOver(null)} width={420} accent={playerWon ? 'rgba(63,185,80,0.65)' : 'rgba(248,81,73,0.65)'}>
      <div style={{ textAlign: 'center', padding: '6px 0' }}>
        <div style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '1px', color: playerWon ? '#3fb950' : '#f85149' }}>
          {playerWon ? 'YOU WIN' : 'YOU LOSE'}
        </div>
        <div style={{ margin: '12px 0 22px', color: '#8b949e', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {playerWon ? 'The opponent has been defeated.' : 'Your life total reached zero.'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" style={{ flex: 1 }} onClick={() => setGameOver(null)}>
            Keep Looking
          </Button>
          <Button variant={playerWon ? 'primary' : 'danger'} style={{ flex: 1 }} onClick={() => redeal()}>
            Play Again
          </Button>
        </div>
      </div>
    </Modal>
  )
}
