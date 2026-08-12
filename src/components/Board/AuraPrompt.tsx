import { useGameStore } from '../../stores/gameStore'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function AuraPrompt() {
  const auraPrompt = useGameStore((s) => s.auraPrompt)
  const attachAuraTo = useGameStore((s) => s.attachAuraTo)
  const declineAura = useGameStore((s) => s.declineAura)

  if (!auraPrompt) return null
  const isEquip = auraPrompt.kind === 'equip'

  return (
    <Modal open onClose={() => declineAura(auraPrompt.auraCardId)} title={isEquip ? 'Equip' : 'Enchant'} accent={isEquip ? '#79c0ff' : '#56d364'} width={520}>
      <div style={{ color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 14 }}>
        {isEquip
          ? <>Choose a creature for <strong>{auraPrompt.auraName}</strong> to equip:</>
          : <>Choose a creature for <strong>{auraPrompt.auraName}</strong> to enchant:</>}
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
          {isEquip
            ? `Leave ${auraPrompt.auraName} unattached`
            : `No target — send ${auraPrompt.auraName} to the graveyard`}
        </Button>
      </div>
    </Modal>
  )
}
