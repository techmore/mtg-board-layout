import type { EffectHistoryEntry, ManaLogEntry, ManaUsageKind } from '../../types/card'
import { colorAccent } from './cardHelpers'

export function ManaUsageLog({
  turn,
  entries,
  effectHistory,
  usageKind,
  usageLabel,
  onUsageKindChange,
  onUsageLabelChange,
  onClose,
}: {
  turn: number
  entries: ManaLogEntry[]
  effectHistory: EffectHistoryEntry[]
  usageKind: ManaUsageKind
  usageLabel: string
  onUsageKindChange: (kind: ManaUsageKind) => void
  onUsageLabelChange: (label: string) => void
  onClose: () => void
}) {
  const currentTurnEntries = entries.filter((entry) => entry.turn === turn)
  const generated = currentTurnEntries
    .filter((entry) => entry.direction === 'generated')
    .reduce((total, entry) => total + entry.amount, 0)
  const spent = currentTurnEntries
    .filter((entry) => entry.direction === 'spent')
    .reduce((total, entry) => total + entry.amount, 0)
  const turns = [...new Set(entries.map((entry) => entry.turn))].sort((a, b) => b - a)
  const effectTurns = [...new Set(effectHistory.map((entry) => entry.turn))].sort((a, b) => b - a)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Mana usage log"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 48px))',
          maxHeight: 'calc(100vh - 80px)',
          boxSizing: 'border-box',
          padding: 16,
          borderRadius: 12,
          background: '#161b22',
          border: '1px solid rgba(210,153,34,0.6)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          color: '#e6edf3',
          overflowY: 'auto',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <strong style={{ color: '#ffd33d', fontSize: '0.82rem' }}>Activity Log</strong>
        <button
          type="button"
          aria-label="Close mana usage log"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.7rem' }}>
        <label htmlFor="mana-usage-kind" style={{ color: '#8b949e', whiteSpace: 'nowrap' }}>Next use:</label>
        <select
          id="mana-usage-kind"
          value={usageKind}
          onChange={(event) => onUsageKindChange(event.target.value as ManaUsageKind)}
          style={{ flex: 1, minWidth: 0, padding: '4px 5px', borderRadius: 4, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', fontSize: '0.7rem' }}
        >
          <option value="spell">Spell</option>
          <option value="creature">Creature</option>
          <option value="ability">Ability</option>
        </select>
        <input
          value={usageLabel}
          onChange={(event) => onUsageLabelChange(event.target.value)}
          placeholder="What?"
          aria-label="Optional mana usage label"
          style={{ width: 92, padding: '4px 5px', borderRadius: 4, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', fontSize: '0.7rem' }}
        />
      </div>
      <div style={{ marginBottom: 8, padding: '6px 8px', borderRadius: 6, background: 'rgba(88,166,255,0.1)', color: '#79c0ff', fontSize: '0.68rem', lineHeight: 1.35 }}>
        Tap a mana-producing land or click a colored mana symbol to generate mana. Use the − button to record the selected use.
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, color: '#8b949e', fontSize: '0.7rem' }}>
        <span>Turn {turn}</span>
        <span style={{ color: '#56d364' }}>Generated +{generated}</span>
        <span style={{ color: '#ff7b72' }}>Used −{spent}</span>
      </div>
      <div style={{ maxHeight: 230, overflowY: 'auto', paddingRight: 2 }}>
        {turns.length === 0 ? (
          <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>No mana activity recorded yet.</div>
        ) : turns.map((entryTurn) => (
          <div key={entryTurn} style={{ marginBottom: 8 }}>
            <div style={{ color: '#8b949e', fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
              Turn {entryTurn}
              <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
            </div>
            {entries.filter((entry) => entry.turn === entryTurn).slice().reverse().map((entry) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: '0.72rem' }}>
                <span style={{ color: entry.direction === 'generated' ? '#56d364' : '#ff7b72', width: 14, textAlign: 'center', flexShrink: 0 }}>
                  {entry.direction === 'generated' ? '+' : '−'}
                </span>
                <span style={{ color: colorAccent[entry.color], fontWeight: 900, flexShrink: 0 }}>{entry.amount}{entry.color}</span>
                {entry.direction === 'generated' && entry.sourceCardName ? (
                  <span style={{ color: '#d0d7de' }}>
                    <span style={{ color: '#e6edf3', fontWeight: 600 }}>{entry.sourceCardName}</span>
                    <span style={{ color: '#6e7681' }}> generated</span>
                  </span>
                ) : entry.direction === 'spent' && entry.label ? (
                  <span style={{ color: '#d0d7de' }}>
                    <span style={{ color: '#e6edf3', fontWeight: 600 }}>{entry.label}</span>
                    <span style={{ color: '#6e7681' }}> ({entry.usage ?? 'spell'})</span>
                  </span>
                ) : (
                  <span style={{ color: '#6e7681' }}>{entry.direction === 'generated' ? 'generated' : `${entry.usage ?? 'spell'} used`}</span>
                )}
              </div>
            ))}
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 10, paddingTop: 9 }}>
          <div style={{ color: '#56d364', fontSize: '0.72rem', fontWeight: 800, marginBottom: 5 }}>Effect History</div>
          {effectTurns.length === 0 ? (
            <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>No token effects recorded yet.</div>
          ) : effectTurns.map((entryTurn) => (
            <div key={`effects-${entryTurn}`} style={{ marginBottom: 8 }}>
              <div style={{ color: '#8b949e', fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                Turn {entryTurn}
              </div>
              {effectHistory.filter((entry) => entry.turn === entryTurn).slice().reverse().map((entry) => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: '0.72rem' }}>
                  <span style={{ color: '#56d364', width: 14, textAlign: 'center', fontWeight: 900 }}>+</span>
                  <span style={{ color: '#56d364', fontWeight: 900 }}>{entry.amount}</span>
                  <span style={{ color: '#d0d7de' }}>token{entry.amount === 1 ? '' : 's'} on {entry.targetCardName}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}
