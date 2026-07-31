import type { ManaColor, ManaPool, PotentialManaSource } from '../../types/card'

const MANA_COLORS: { color: ManaColor; label: string; symbol: string; accent: string }[] = [
  { color: 'W', label: 'White', symbol: 'W', accent: '#f4f1df' },
  { color: 'U', label: 'Blue', symbol: 'U', accent: '#4aa3ff' },
  { color: 'B', label: 'Black', symbol: 'B', accent: '#b6b8c3' },
  { color: 'R', label: 'Red', symbol: 'R', accent: '#f85149' },
  { color: 'G', label: 'Green', symbol: 'G', accent: '#3fb950' },
  { color: 'C', label: 'Colorless', symbol: '◇', accent: '#d0d7de' },
]

export default function ManaColorButton({
  color,
  manaPool,
  potentialMana = [],
  onAdd,
  onSpend,
  readOnly = false,
  compact = false,
}: {
  color: ManaColor
  manaPool: ManaPool
  potentialMana?: PotentialManaSource[]
  onAdd?: (color: ManaColor) => void
  onSpend?: (color: ManaColor) => void
  readOnly?: boolean
  compact?: boolean
}) {
  const mana = MANA_COLORS.find((m) => m.color === color)!
  const count = manaPool[color]
  const flexible = potentialMana.filter((source) => source.colors.includes(color)).length
  const available = count + flexible
  const displayCount = flexible > 0 ? `${count} (${flexible})` : `${count}`

  const circleSize = compact ? 21 : (readOnly ? 25 : 29)

  const circle = readOnly ? (
    <span
      aria-label={`${count} ${mana.label} mana${flexible > 0 ? ` and ${flexible} potential` : ''}`}
      title={`${count} ${mana.label} mana${flexible > 0 ? ` and ${flexible} potential` : ''}`}
      style={{
        width: circleSize,
        height: circleSize,
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: `1px solid ${mana.accent}`,
        background: available > 0 ? `${mana.accent}33` : 'rgba(255,255,255,0.05)',
        color: mana.accent,
        fontWeight: 900,
        fontSize: compact ? '0.62rem' : (readOnly ? '0.7rem' : '0.75rem'),
      }}
    >
      {mana.symbol}
    </span>
  ) : (
    <button
      type="button"
      aria-label={`Add one ${mana.label} mana`}
      title={`Add ${mana.label} mana`}
      onClick={() => onAdd?.(mana.color)}
      style={{
        width: circleSize,
        height: circleSize,
        flexShrink: 0,
        padding: 0,
        borderRadius: '50%',
        border: `1px solid ${mana.accent}`,
        background: available > 0 ? `${mana.accent}33` : 'rgba(255,255,255,0.05)',
        color: mana.accent,
        cursor: 'pointer',
        fontWeight: 900,
        fontSize: compact ? '0.62rem' : (readOnly ? '0.7rem' : '0.75rem'),
      }}
    >
      {mana.symbol}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', gap: compact ? 2 : 3 }}>
      {circle}
      <span style={{ fontSize: compact ? '0.68rem' : '0.78rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {displayCount}
      </span>
      {!readOnly && (
        <button
          type="button"
          aria-label={`Spend one ${mana.label} mana`}
          title={`Spend ${mana.label} mana`}
          disabled={available === 0}
          onClick={() => onSpend?.(mana.color)}
          style={{
            width: compact ? 16 : 21,
            height: compact ? 19 : 19,
            padding: 0,
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.16)',
            background: available === 0 ? 'transparent' : 'rgba(255,255,255,0.08)',
            color: available === 0 ? '#484f58' : '#d0d7de',
            cursor: available === 0 ? 'not-allowed' : 'pointer',
            lineHeight: 1,
            fontSize: compact ? '0.7rem' : '0.68rem',
          }}
        >
          −
        </button>
      )}
    </div>
  )
}

export { MANA_COLORS }
