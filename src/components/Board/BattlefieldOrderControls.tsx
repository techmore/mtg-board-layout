export function BattlefieldOrderControls({
  cardId,
  reorderBattlefield,
}: {
  cardId: string
  reorderBattlefield: (cardId: string, direction: 'closer' | 'farther') => void
}) {
  const buttonStyle: React.CSSProperties = {
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'rgba(13,17,23,0.85)',
    color: '#e6edf3',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 4,
        left: 4,
        zIndex: 20,
        display: 'flex',
        gap: 3,
      }}
    >
      <button
        type="button"
        aria-label="Move closer to Commander"
        title="Move closer to Commander"
        onClick={(event) => {
          event.stopPropagation()
          reorderBattlefield(cardId, 'closer')
        }}
        style={buttonStyle}
      >
        →
      </button>
      <button
        type="button"
        aria-label="Move farther from Commander"
        title="Move farther from Commander"
        onClick={(event) => {
          event.stopPropagation()
          reorderBattlefield(cardId, 'farther')
        }}
        style={buttonStyle}
      >
        ←
      </button>
    </div>
  )
}
