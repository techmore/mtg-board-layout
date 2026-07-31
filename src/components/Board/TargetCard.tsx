import type { BoardCard } from '../../types/card'

export function TargetCard({ card, onClick }: { card: BoardCard; onClick: () => void }) {
  const zoneTag = card.zone === 'graveyard' ? ' (GY)' : ''
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid rgba(88,166,255,0.3)',
        background: 'rgba(13,17,23,0.6)',
        color: '#e6edf3',
        cursor: 'pointer',
        fontSize: '0.72rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: 180,
      }}
      title={`${card.name} (${card.type})${zoneTag}`}
    >
      {card.name}
      <span style={{ color: '#8b949e', marginLeft: 4, fontSize: '0.65rem' }}>
        {card.type}{zoneTag}
      </span>
    </button>
  )
}
