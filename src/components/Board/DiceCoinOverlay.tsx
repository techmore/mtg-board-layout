import { useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { rollDie } from '../../utils/misc'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export default function DiceCoinOverlay() {
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const addRoll = useGameStore((s) => s.addRoll)
  const [diceResult, setDiceResult] = useState<number | null>(null)
  const [coinResult, setCoinResult] = useState<string | null>(null)
  const [coinFlips, setCoinFlips] = useState(0)

  if (!overlay.type || overlay.type === 'zoom') return null

  const isDice = overlay.type === 'dice'

  const handleRoll = (sides: number) => {
    const result = rollDie(sides)
    setDiceResult(result)
    setCoinResult(null)
    addRoll(`d${sides}: ${result}`)
  }

  const handleCoin = () => {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails'
    setCoinResult(result)
    setDiceResult(null)
    setCoinFlips((n) => n + 1)
    addRoll(`Coin: ${result}`)
  }

  return (
    <Modal open onClose={() => setOverlay({ type: null })} title={isDice ? 'Dice Roller' : 'Coin Flip'} width={360}>
      <div style={{ textAlign: 'center', padding: '6px 0' }}>
        {isDice ? (
          <>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
                <Button key={sides} onClick={() => handleRoll(sides)}>
                  d{sides}
                </Button>
              ))}
            </div>
            {diceResult !== null && (
              <div style={{ fontSize: '3rem', fontWeight: 700, marginTop: 8, color: '#e6edf3' }}>{diceResult}</div>
            )}
          </>
        ) : (
          <>
            <Button onClick={handleCoin} style={{ padding: '16px 32px', fontSize: '1.1rem', marginBottom: 12 }}>
              Flip{coinFlips > 0 ? ' Again' : ''}
            </Button>
            {coinResult !== null && (
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#e6edf3' }}>{coinResult}</div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
