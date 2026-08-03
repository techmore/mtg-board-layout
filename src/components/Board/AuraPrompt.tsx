import { useGameStore } from '../../stores/gameStore'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function AuraPrompt() {
  const auraPrompt = useGameStore((s) => s.auraPrompt)
  const attachAuraTo = useGameStore((s) => s.attachAuraTo)
  const declineAura = useGameStore((s) => s.declineAura)

  if (!auraPrompt) return null

  return (
    <Modal open onClose={() => declineAura(auraPrompt.auraCardId)} title="Enchant" accent="#56d364" width={520}>
      <div style={{ color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 14 }}>
        Choose a creature for <strong>{auraPrompt.auraName}</strong> to enchant:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {auraPrompt.candidates.map((candidate) => (
          <Button
            key={candidate.id}
            variant="primary"
            onClick={() => attachAuraTo(auraPrompt.auraCardId, candidate.id)}
          >
            {candidate.name} <span style={{ color: '#8b949e', marginLeft: 6 }}>{candidate.power}</span>
          </Button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={() => declineAura(auraPrompt.auraCardId)}>
          No target — send {auraPrompt.auraName} to the graveyard
        </Button>
      </div>
    </Modal>
  )
}
