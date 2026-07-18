import { useEffect, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'

function rollDie(sides: number) {
  return Math.floor(Math.random() * sides) + 1
}

export default function DiceCoinOverlay() {
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const addRoll = useGameStore((s) => s.addRoll)
  const [diceResult, setDiceResult] = useState<number | null>(null)
  const [coinResult, setCoinResult] = useState<string | null>(null)
  const [coinFlips, setCoinFlips] = useState(0)

  useEffect(() => {
    if (!overlay.type || overlay.type === 'zoom') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay({ type: null })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay.type, setOverlay])

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
    <div
      onClick={() => setOverlay({ type: null })}
      role="dialog"
      aria-modal="true"
      aria-label={isDice ? 'Dice roller' : 'Coin flip'}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1a1a2e',
          border: '1px solid #30363d',
          borderRadius: 16,
          padding: 32,
          minWidth: 300,
          textAlign: 'center',
        }}
      >
        <h3 style={{ marginBottom: 20 }}>{isDice ? 'Dice Roller' : 'Coin Flip'}</h3>

        {isDice ? (
          <>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
              {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
                <button
                  key={sides}
                  onClick={() => handleRoll(sides)}
                  style={{
                    padding: '10px 18px',
                    background: '#30363d',
                    border: '1px solid #8b949e',
                    borderRadius: 8,
                    color: '#e6edf3',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  d{sides}
                </button>
              ))}
            </div>
            {diceResult !== null && (
              <div style={{ fontSize: '3rem', fontWeight: 700, marginTop: 8 }}>{diceResult}</div>
            )}
          </>
        ) : (
          <>
            <button
              onClick={handleCoin}
              style={{
                padding: '16px 32px',
                background: '#30363d',
                border: '1px solid #8b949e',
                borderRadius: 12,
                color: '#e6edf3',
                cursor: 'pointer',
                fontSize: '1.1rem',
                marginBottom: 12,
              }}
            >
              Flip{coinFlips > 0 ? ' Again' : ''}
            </button>
            {coinResult !== null && (
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{coinResult}</div>
            )}
          </>
        )}

        <button
          onClick={() => setOverlay({ type: null })}
          style={{
            marginTop: 20,
            padding: '6px 16px',
            background: 'none',
            border: '1px solid #30363d',
            borderRadius: 6,
            color: '#8b949e',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
