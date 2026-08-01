import { useGameStore } from '../../stores/gameStore'
import { canPayManaCost } from '../../utils/misc'

export function WardPrompt() {
  const wardPrompt = useGameStore((s) => s.wardPrompt)
  const manaPool = useGameStore((s) => s.manaPool)
  const payWard = useGameStore((s) => s.payWard)
  const refuseWard = useGameStore((s) => s.refuseWard)

  if (!wardPrompt) return null

  const cost = `{${wardPrompt.cost}}`
  const canPay = canPayManaCost(manaPool, cost)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ward-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 85,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.7)',
      }}
    >
      <div
        style={{
          width: 'min(460px, 100%)',
          padding: 22,
          borderRadius: 12,
          background: '#161b22',
          border: '1px solid rgba(88,166,255,0.5)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          textAlign: 'center',
        }}
      >
        <div
          id="ward-prompt-title"
          style={{
            fontSize: '0.9rem',
            fontWeight: 800,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: '#ffd33d',
            marginBottom: 10,
          }}
        >
          Ward {wardPrompt.cost}
        </div>
        <div style={{ color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 18 }}>
          Pay {cost} to resolve <strong>{wardPrompt.spellName}</strong> targeting{' '}
          <strong>{wardPrompt.targetName}</strong>? If you don't pay, the spell is countered.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={refuseWard}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 8,
              border: '1px solid #484f58',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            Counter ({wardPrompt.spellName})
          </button>
          <button
            type="button"
            onClick={payWard}
            disabled={!canPay}
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: 8,
              border: '1px solid rgba(88,166,255,0.6)',
              background: canPay ? 'rgba(88,166,255,0.18)' : 'rgba(88,166,255,0.08)',
              color: canPay ? '#79c0ff' : '#8b949e',
              cursor: canPay ? 'pointer' : 'not-allowed',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
          >
            Pay {cost}
          </button>
        </div>
      </div>
    </div>
  )
}
