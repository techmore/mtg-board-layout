import { useGameStore, PHASES } from '../../stores/gameStore'
import type { Phase } from '../../stores/gameStore'

const PHASE_LABELS: Record<Phase, string> = {
  beginning: 'Begin',
  precombat_main: 'Main 1',
  combat: 'Combat',
  postcombat_main: 'Main 2',
  ending: 'End',
}

export function PhaseBar() {
  const currentPhase = useGameStore((s) => s.currentPhase)
  const advancePhase = useGameStore((s) => s.advancePhase)
  const triggerStack = useGameStore((s) => s.triggerStack)
  const turn = useGameStore((s) => s.turn)
  const activePlayer = useGameStore((s) => s.activePlayer)
  const showOpponent = useGameStore((s) => s.showOpponent)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      {showOpponent && (
        <span style={{
          color: activePlayer === 'player' ? '#56d364' : '#8b949e',
          fontSize: '0.65rem',
          fontWeight: 700,
          marginRight: 2,
          padding: '2px 5px',
          borderRadius: 3,
          background: activePlayer === 'player' ? 'rgba(86,211,100,0.12)' : 'transparent',
          border: activePlayer === 'player' ? '1px solid rgba(86,211,100,0.3)' : '1px solid transparent',
        }}>
          P
        </span>
      )}
      <span style={{ color: '#8b949e', fontSize: '0.7rem', fontWeight: 600, marginRight: 4, whiteSpace: 'nowrap' }}>
        T{turn}
      </span>
      {PHASES.map((phase) => {
        const active = phase === currentPhase
        return (
          <div
            key={phase}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '3px 6px',
              borderRadius: 4,
              background: active ? 'rgba(88,166,255,0.15)' : 'transparent',
              color: active ? '#79c0ff' : '#6e7681',
              fontSize: '0.7rem',
              fontWeight: active ? 700 : 400,
              whiteSpace: 'nowrap',
              border: active ? '1px solid rgba(88,166,255,0.3)' : '1px solid transparent',
              transition: 'all 0.1s',
            }}
          >
            {active ? '\u25CF' : '\u25CB'} {PHASE_LABELS[phase]}
          </div>
        )
      })}
      <button
        onClick={advancePhase}
        title={activePlayer === 'opponent' ? "Opponent's turn — resolve combat to continue" : "Next phase (Space)"}
        disabled={activePlayer === 'opponent'}
        style={{
          marginLeft: 2,
          padding: '3px 8px',
          borderRadius: 4,
          border: activePlayer === 'opponent' ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(88,166,255,0.35)',
          background: activePlayer === 'opponent' ? 'rgba(255,255,255,0.03)' : 'rgba(88,166,255,0.12)',
          color: activePlayer === 'opponent' ? '#484f58' : '#79c0ff',
          cursor: activePlayer === 'opponent' ? 'default' : 'pointer',
          fontSize: '0.7rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {activePlayer === 'opponent' ? '\u23F3' : '\u25B6'}
        {triggerStack.length > 0 && (
          <span style={{ color: '#f0883e', fontSize: '0.65rem' }}>
            ({triggerStack.length})
          </span>
        )}
      </button>
    </div>
  )
}
