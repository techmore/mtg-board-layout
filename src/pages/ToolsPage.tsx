import { useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { rollDie } from '../utils/misc'

export default function ToolsPage() {
  const [diceResult, setDiceResult] = useState<number | null>(null)
  const [coinResult, setCoinResult] = useState<string | null>(null)
  const addRoll = useGameStore((s) => s.addRoll)

  const handleRoll = (sides: number) => {
    const result = rollDie(sides)
    setDiceResult(result)
    addRoll(`d${sides}: ${result}`)
  }

  const handleCoin = () => {
    const result = Math.random() < 0.5 ? 'Heads' : 'Tails'
    setCoinResult(result)
    addRoll(`Coin: ${result}`)
  }

  return (
    <div style={{ flex: 1, padding: 24, color: '#e6edf3', minHeight: 0 }}>
      <h2 style={{ marginBottom: 16 }}>Tools</h2>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Dice</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[4, 6, 8, 10, 12, 20, 100].map((sides) => (
            <button
              key={sides}
              onClick={() => handleRoll(sides)}
              style={{
                padding: '8px 16px',
                background: '#30363d',
                border: '1px solid #8b949e',
                borderRadius: 6,
                color: '#e6edf3',
                cursor: 'pointer',
              }}
            >
              d{sides}
            </button>
          ))}
        </div>
        {diceResult !== null && <p style={{ marginTop: 8, fontSize: '1.5rem' }}>{diceResult}</p>}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Coin</h3>
        <button
          onClick={handleCoin}
          style={{
            padding: '8px 16px',
            background: '#30363d',
            border: '1px solid #8b949e',
            borderRadius: 6,
            color: '#e6edf3',
            cursor: 'pointer',
          }}
        >
          Flip Coin
        </button>
        {coinResult && <p style={{ marginTop: 8, fontSize: '1.5rem' }}>{coinResult}</p>}
      </section>
    </div>
  )
}
