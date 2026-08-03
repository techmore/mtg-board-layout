import { useGameStore } from '../../stores/gameStore'
import { canPayManaCost } from '../../utils/misc'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function WardPrompt() {
  const wardPrompt = useGameStore((s) => s.wardPrompt)
  const manaPool = useGameStore((s) => s.manaPool)
  const payWard = useGameStore((s) => s.payWard)
  const refuseWard = useGameStore((s) => s.refuseWard)

  if (!wardPrompt) return null

  const cost = `{${wardPrompt.cost}}`
  const canPay = canPayManaCost(manaPool, cost)

  return (
    <Modal open onClose={refuseWard} title={`Ward ${wardPrompt.cost}`} accent="#ffd33d">
      <div style={{ color: '#d0d7de', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 18 }}>
        Pay {cost} to resolve <strong>{wardPrompt.spellName}</strong> targeting{' '}
        <strong>{wardPrompt.targetName}</strong>? If you don't pay, the spell is countered.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" style={{ flex: 1 }} onClick={refuseWard}>
          Counter ({wardPrompt.spellName})
        </Button>
        <Button variant="primary" style={{ flex: 1 }} onClick={payWard} disabled={!canPay}>
          Pay {cost}
        </Button>
      </div>
    </Modal>
  )
}
