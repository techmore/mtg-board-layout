import { useGameStore } from '../../stores/gameStore'
import { getCachedCardRules, getCardRule } from '../../stores/cardRulesLoader'
import { TriggerItem } from './TriggerItem'
import { ModalPicker } from './ModalPicker'
import { groupModalRuns, type ModalRun } from './triggerUtils'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function TriggerStack() {
  const triggerStack = useGameStore((s) => s.triggerStack)
  const cards = useGameStore((s) => s.cards)
  const resolveTrigger = useGameStore((s) => s.resolveTrigger)
  const selectTarget = useGameStore((s) => s.selectTarget)
  const skipTrigger = useGameStore((s) => s.skipTrigger)
  const toggleProliferateTarget = useGameStore((s) => s.toggleProliferateTarget)
  const confirmProliferate = useGameStore((s) => s.confirmProliferate)
  const toggleScryTarget = useGameStore((s) => s.toggleScryTarget)
  const confirmScry = useGameStore((s) => s.confirmScry)
  const confirmSearchLibrary = useGameStore((s) => s.confirmSearchLibrary)
  const selectSearchLibraryTarget = useGameStore((s) => s.selectSearchLibraryTarget)
  const clearTriggerStack = useGameStore((s) => s.clearTriggerStack)

  if (triggerStack.length === 0) return null

  // Consecutive optional modes from one source ("Choose one —" spells) render
  // as a single grouped decision instead of independent rows.
  const modalRuns = groupModalRuns(triggerStack, (sourceCardName) =>
    getCardRule(sourceCardName, getCachedCardRules())?.oracleText ?? '')
  const groupedIds = new Set(modalRuns.flatMap((run: ModalRun) => run.ids))

  return (
    <Modal open onClose={clearTriggerStack} title={`Triggers (${triggerStack.length})`} accent="#79c0ff" width={480}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="ghost" size="sm" onClick={clearTriggerStack}>
          Clear All
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {triggerStack.map((trigger) => {
          if (groupedIds.has(trigger.id)) return null
          return (
            <TriggerItem
              key={trigger.id}
              trigger={trigger}
              cards={cards}
              resolveTrigger={resolveTrigger}
              selectTarget={selectTarget}
              skipTrigger={skipTrigger}
              toggleProliferateTarget={toggleProliferateTarget}
              confirmProliferate={confirmProliferate}
              toggleScryTarget={toggleScryTarget}
              confirmScry={confirmScry}
              confirmSearchLibrary={confirmSearchLibrary}
              selectSearchLibraryTarget={selectSearchLibraryTarget}
            />
          )
        })}
        {modalRuns.map((run) => (
          <ModalPicker key={run.ids.join('|')} run={run} resolveTrigger={resolveTrigger} skipTrigger={skipTrigger} />
        ))}
      </div>
    </Modal>
  )
}
