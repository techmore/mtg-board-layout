import type { ManaColor, ManaPool, PotentialManaSource } from '../../types/card'
import ManaColorButton, { MANA_COLORS } from './ManaColorButton'

const ALL_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C']

export default function ManaPoolArtifact({
  manaPool,
  potentialMana = [],
  onAdd,
  onSpend,
  onClear,
  onToggleLog,
  manaLogOpen = false,
  compact = false,
  readOnly = false,
}: {
  manaPool: ManaPool
  potentialMana?: PotentialManaSource[]
  onAdd: (color: ManaColor) => void
  onSpend: (color: ManaColor) => void
  onClear: () => void
  onToggleLog?: () => void
  manaLogOpen?: boolean
  compact?: boolean
  readOnly?: boolean
}) {
  const total = MANA_COLORS.reduce((sum, mana) => sum + manaPool[mana.color], 0) + potentialMana.length

  if (compact) {
    return (
      <section
        aria-label="Mana Pool"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
          width: readOnly ? '100%' : 'auto',
          boxSizing: 'border-box',
          padding: '4px 6px',
          borderRadius: 8,
          background: 'rgba(31,38,48,0.96)',
          border: '1px solid rgba(210,153,34,0.65)',
          boxShadow: '0 3px 10px rgba(0,0,0,0.28)',
          color: '#e6edf3',
          fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        }}
      >
        <strong style={{ color: '#ffd33d', fontSize: '0.68rem', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
          Mana
        </strong>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, flex: 1, minWidth: 0 }}>
          {ALL_COLORS.map((color) => (
            <ManaColorButton
              key={color}
              color={color}
              manaPool={manaPool}
              potentialMana={potentialMana}
              onAdd={onAdd}
              onSpend={onSpend}
              readOnly={readOnly}
              compact
            />
          ))}
        </div>
        <span style={{ color: '#ffd33d', fontSize: '0.7rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
          {total}
        </span>
        {onToggleLog && (
          <button
            type="button"
            aria-label="Open activity log"
            aria-expanded={manaLogOpen}
            title="Open activity log"
            onClick={onToggleLog}
            style={{
              width: 22,
              height: 20,
              padding: 0,
              borderRadius: 4,
              border: `1px solid ${manaLogOpen ? 'rgba(88,166,255,0.7)' : 'rgba(255,255,255,0.16)'}`,
              background: manaLogOpen ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.06)',
              color: manaLogOpen ? '#79c0ff' : '#d0d7de',
              cursor: 'pointer',
              lineHeight: 1,
              fontSize: '0.72rem',
            }}
          >
            ▤
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            aria-label="Empty mana pool"
            title="Empty mana pool"
            onClick={onClear}
            disabled={total === 0}
            style={{
              width: 19,
              height: 19,
              padding: 0,
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.14)',
              background: total === 0 ? 'transparent' : 'rgba(248,81,73,0.12)',
              color: total === 0 ? '#484f58' : '#fdaeb7',
              cursor: total === 0 ? 'not-allowed' : 'pointer',
              lineHeight: 1,
              fontSize: '0.72rem',
            }}
          >
            ×
          </button>
        )}
      </section>
    )
  }

  return (
    <section
      aria-label="Mana Pool"
      style={{
        width: compact ? 172 : 250,
        boxSizing: 'border-box',
        padding: compact ? 8 : 11,
        borderRadius: 12,
        background: 'linear-gradient(145deg, rgba(31,38,48,0.96), rgba(13,17,23,0.96))',
        border: '1px solid rgba(210,153,34,0.65)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45), inset 0 1px rgba(255,255,255,0.08)',
        color: '#e6edf3',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: compact ? 6 : 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden="true" style={{ color: '#ffd33d', fontSize: compact ? '1rem' : '1.15rem' }}>✦</span>
          <strong style={{ fontSize: compact ? '0.75rem' : '0.85rem', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            Mana Pool
          </strong>
        </div>
        <span style={{ color: '#ffd33d', fontSize: compact ? '0.75rem' : '0.85rem', fontWeight: 800 }}>
          {total} total
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: compact ? 3 : 4 }}>
        {ALL_COLORS.map((color) => (
          <ManaColorButton
            key={color}
            color={color}
            manaPool={manaPool}
            potentialMana={potentialMana}
            onAdd={onAdd}
            onSpend={onSpend}
            readOnly={readOnly}
          />
        ))}
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={onClear}
          disabled={total === 0}
          style={{
            width: '100%',
            marginTop: compact ? 7 : 9,
            padding: compact ? '3px 6px' : '4px 6px',
            borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.14)',
            background: total === 0 ? 'transparent' : 'rgba(248,81,73,0.12)',
            color: total === 0 ? '#484f58' : '#fdaeb7',
            cursor: total === 0 ? 'not-allowed' : 'pointer',
            fontSize: compact ? '0.62rem' : '0.68rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}
        >
          Empty Pool
        </button>
      )}
    </section>
  )
}
