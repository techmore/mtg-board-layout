import { useGameStore, PHASES } from '../../stores/gameStore'
import type { Phase } from '../../stores/gameStore'
import { BoardBtn } from './BoardBtn'

const PHASE_LABELS: Record<Phase, string> = {
  beginning: 'Beginning',
  precombat_main: 'Main 1',
  combat: 'Combat',
  postcombat_main: 'Main 2',
  ending: 'Ending',
}

export function PhaseSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const currentPhase = useGameStore((s) => s.currentPhase)
  const advancePhase = useGameStore((s) => s.advancePhase)
  const triggerStack = useGameStore((s) => s.triggerStack)
  const turn = useGameStore((s) => s.turn)

  return (
    <div
      style={{
        position: 'fixed',
        left: 200,
        top: 0,
        bottom: 0,
        width: collapsed ? 10 : 140,
        background: 'rgba(13,17,23,0.92)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 50,
        transition: 'width 0.15s',
        zIndex: 80,
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          position: 'absolute',
          top: 10,
          right: 2,
          background: 'none',
          border: 'none',
          color: '#8b949e',
          cursor: 'pointer',
          fontSize: '0.85rem',
          padding: '4px 6px',
        }}
      >
        {collapsed ? '\u25B6' : '\u25C0'}
      </button>

      {!collapsed && (
        <>
          <div style={{ padding: '8px 10px', fontSize: '0.65rem', color: '#8b949e', letterSpacing: 1, textTransform: 'uppercase' }}>
            Turn {turn}
          </div>
          <div style={{ padding: '0 10px 8px', fontSize: '0.65rem', color: '#8b949e', letterSpacing: 1, textTransform: 'uppercase' }}>
            Phases
          </div>

          {PHASES.map((phase) => {
            const active = phase === currentPhase
            return (
              <div
                key={phase}
                style={{
                  padding: '6px 10px',
                  fontSize: '0.75rem',
                  color: active ? '#e6edf3' : '#6e7681',
                  background: active ? 'rgba(88,166,255,0.12)' : 'transparent',
                  borderLeft: active ? '2px solid #58a6ff' : '2px solid transparent',
                  cursor: 'default',
                  transition: 'background 0.1s',
                }}
              >
                {PHASE_LABELS[phase]}
              </div>
            )
          })}

          <div style={{ flex: 1 }} />

          <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <BoardBtn onClick={advancePhase}>
              Next phase
              {triggerStack.length > 0 && (
                <span style={{ marginLeft: 6, color: '#f0883e' }}>
                  ({triggerStack.length})
                </span>
              )}
            </BoardBtn>
            <div style={{ fontSize: '0.6rem', color: '#6e7681', marginTop: 4, textAlign: 'center' }}>
              or press Space
            </div>
          </div>
        </>
      )}
    </div>
  )
}
