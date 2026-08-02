import { useGameStore } from '../../stores/gameStore'

export function AuraPrompt() {
  const auraPrompt = useGameStore((s) => s.auraPrompt)
  const attachAuraTo = useGameStore((s) => s.attachAuraTo)
  const declineAura = useGameStore((s) => s.declineAura)

  if (!auraPrompt) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aura-prompt-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 86,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.7)',
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          padding: 22,
          borderRadius: 12,
          background: '#161b22',
          border: '1px solid rgba(63,185,80,0.5)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div
          id="aura-prompt-title"
          style={{
            fontSize: '0.9rem',
            fontWeight: 800,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: '#56d364',
            marginBottom: 6,
          }}
        >
          Enchant
        </div>
        <div style={{ color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 14 }}>
          Choose a creature for <strong>{auraPrompt.auraName}</strong> to enchant:
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {auraPrompt.candidates.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => attachAuraTo(auraPrompt.auraCardId, candidate.id)}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid rgba(63,185,80,0.45)',
                background: 'rgba(63,185,80,0.1)',
                color: '#e6edf3',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              {candidate.name} <span style={{ color: '#8b949e', marginLeft: 6 }}>{candidate.power}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => declineAura(auraPrompt.auraCardId)}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid #484f58',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            No target — send {auraPrompt.auraName} to the graveyard
          </button>
        </div>
      </div>
    </div>
  )
}
