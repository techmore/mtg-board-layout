import { useGameStore } from '../../stores/gameStore'
import { TriggerItem } from './TriggerItem'

export function TriggerStack() {
  const triggerStack = useGameStore((s) => s.triggerStack)
  const cards = useGameStore((s) => s.cards)
  const resolveTrigger = useGameStore((s) => s.resolveTrigger)
  const selectTarget = useGameStore((s) => s.selectTarget)
  const toggleProliferateTarget = useGameStore((s) => s.toggleProliferateTarget)
  const confirmProliferate = useGameStore((s) => s.confirmProliferate)
  const toggleScryTarget = useGameStore((s) => s.toggleScryTarget)
  const confirmScry = useGameStore((s) => s.confirmScry)
  const confirmSearchLibrary = useGameStore((s) => s.confirmSearchLibrary)
  const selectSearchLibraryTarget = useGameStore((s) => s.selectSearchLibraryTarget)
  const clearTriggerStack = useGameStore((s) => s.clearTriggerStack)

  if (triggerStack.length === 0) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trigger-stack-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.6)',
      }}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          maxHeight: 'calc(100vh - 40px)',
          overflow: 'auto',
          padding: 20,
          borderRadius: 12,
          background: '#161b22',
          border: '1px solid rgba(88,166,255,0.5)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 id="trigger-stack-title" style={{ margin: 0, color: '#79c0ff', fontSize: '1rem' }}>
            Triggers ({triggerStack.length})
          </h2>
          <button
            type="button"
            onClick={clearTriggerStack}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid #484f58',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            Clear All
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {triggerStack.map((trigger) => (
            <TriggerItem
              key={trigger.id}
              trigger={trigger}
              cards={cards}
              resolveTrigger={resolveTrigger}
              selectTarget={selectTarget}
              toggleProliferateTarget={toggleProliferateTarget}
              confirmProliferate={confirmProliferate}
              toggleScryTarget={toggleScryTarget}
              confirmScry={confirmScry}
              confirmSearchLibrary={confirmSearchLibrary}
              selectSearchLibraryTarget={selectSearchLibraryTarget}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
