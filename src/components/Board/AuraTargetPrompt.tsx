import { useGameStore } from '../../stores/gameStore'

export function AuraTargetPrompt() {
  const prompt = useGameStore((s) => s.auraTargetPrompt)
  const cards = useGameStore((s) => s.cards)
  const resolveAuraTarget = useGameStore((s) => s.resolveAuraTarget)
  const cancelAuraTarget = useGameStore((s) => s.cancelAuraTarget)

  if (!prompt) return null

  const targets = cards.filter((c) => c.zone === 'battlefield' && (c.owner ?? 'player') === 'player' && c.type === 'creature')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="aura-target-title"
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
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          padding: 22,
          borderRadius: 12,
          background: '#161b22',
          border: '1px solid rgba(88,166,255,0.5)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          textAlign: 'center',
        }}
      >
        <div
          id="aura-target-title"
          style={{
            fontSize: '0.9rem',
            fontWeight: 800,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: '#79c0ff',
            marginBottom: 10,
          }}
        >
          Enchant a creature
        </div>
        <div style={{ color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 18 }}>
          Choose which creature <strong>{prompt.auraName}</strong> enchants.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              onClick={() => resolveAuraTarget(target.id)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(88,166,255,0.4)',
                background: 'rgba(88,166,255,0.1)',
                color: '#e6edf3',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}
            >
              {target.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={cancelAuraTarget}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #484f58',
            background: 'transparent',
            color: '#8b949e',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
