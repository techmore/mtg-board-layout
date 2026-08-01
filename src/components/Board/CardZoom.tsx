import { useEffect, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { CARD_BACK_URL } from '../../constants'
import { getCachedCardRules, getCardRule } from '../../stores/cardRulesLoader'
import { getCardPower, getCardToughness } from '../../utils/misc'
import { formatCounterCount } from './cardHelpers'

export default function CardZoom() {
  const [imgError, setImgError] = useState(false)
  const overlay = useGameStore((s) => s.overlay)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const cards = useGameStore((s) => s.cards)

  useEffect(() => {
    if (overlay.type !== 'zoom') return
    setImgError(false)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay({ type: null })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [overlay.type, overlay.cardId, setOverlay])

  if (overlay.type !== 'zoom' || !overlay.cardId) return null

  const card = cards.find((c) => c.id === overlay.cardId)
  if (!card) return null

  const rule = getCardRule(card.name, getCachedCardRules())
  const oracleText = card.oracleText ?? rule?.oracleText
  const isCreature = card.type === 'creature'
  const power = getCardPower(card)
  const toughness = getCardToughness(card)
  const stateBits: string[] = []
  if (card.tapped) stateBits.push('tapped')
  if (card.counters !== 0) stateBits.push(`${formatCounterCount(card.counters)} counter(s)`)
  if ((card.damage ?? 0) > 0) stateBits.push(`${card.damage} damage`)
  if ((card.powerBoost ?? 0) !== 0 || (card.toughnessBoost ?? 0) !== 0) stateBits.push(`pumped +${card.powerBoost ?? 0}/+${card.toughnessBoost ?? 0}`)
  if ((card.tokenCount ?? 0) > 0) stateBits.push(`${card.tokenCount} token(s)`)

  return (
    <div
      onClick={() => setOverlay({ type: null })}
      role="dialog"
      aria-modal="true"
      aria-label={`${card.name} preview`}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
        overflowY: 'auto',
        zIndex: 1000,
        cursor: 'zoom-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 'min(900px, 92vw)',
          maxHeight: '92vh',
          display: 'flex',
          gap: 16,
          alignItems: 'flex-start',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <img
          src={imgError ? CARD_BACK_URL : (card.imageUri || CARD_BACK_URL)}
          alt={card.name}
          onError={() => setImgError(true)}
          style={{
            maxWidth: 'min(320px, 60vw)',
            maxHeight: '82vh',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        />
        <div
          style={{
            width: 'min(420px, 100%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 12,
            padding: 18,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ color: '#e6edf3', fontSize: '1.15rem', fontWeight: 700 }}>{card.name}</div>
            {card.manaCost && (
              <div style={{ color: '#ffd33d', fontSize: '0.9rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                {card.manaCost}
              </div>
            )}
          </div>
          <div style={{ color: '#8b949e', fontSize: '0.78rem' }}>
            {card.typeLine}
            {isCreature && (
              <span style={{ color: '#d29922', marginLeft: 8, fontWeight: 700 }}>
                {power}/{toughness}
              </span>
            )}
          </div>
          {stateBits.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {stateBits.map((bit) => (
                <span
                  key={bit}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(88,166,255,0.12)',
                    border: '1px solid rgba(88,166,255,0.3)',
                    color: '#79c0ff',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                  }}
                >
                  {bit}
                </span>
              ))}
            </div>
          )}
          {oracleText ? (
            <div
              style={{
                color: '#d0d7de',
                fontSize: '0.82rem',
                lineHeight: 1.55,
                whiteSpace: 'pre-line',
                maxHeight: 300,
                overflowY: 'auto',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                paddingTop: 10,
              }}
            >
              {oracleText}
            </div>
          ) : (
            <div style={{ color: '#8b949e', fontSize: '0.78rem', fontStyle: 'italic' }}>
              No card text available for this card.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
