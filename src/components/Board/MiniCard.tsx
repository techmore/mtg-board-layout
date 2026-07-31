import { useState } from 'react'
import type { BoardCard } from '../../types/card'
import { CARD_BACK_URL } from '../../constants'
import { TokenBadge } from './TokenBadge'
import { CachedImg } from '../shared/CachedImg'

export function MiniCard({
  card,
  onClick,
  onContextMenu,
  width,
  height,
  variant,
}: {
  card: BoardCard
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  width: number
  height: number
  variant?: 'command'
}) {
  const [imgError, setImgError] = useState(false)
  const [fallbackError, setFallbackError] = useState(false)
  if (fallbackError) {
    return (
      <div
        style={{ position: 'relative', width, height, borderRadius: 8, background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}
        onClick={onClick}
        onContextMenu={onContextMenu}
      >
        <TokenBadge count={card.tokenCount} />
      </div>
    )
  }
  const commandStyle = variant === 'command' ? {
    border: '2px solid #484f58',
    outline: '2px solid rgba(255,255,255,0.08)',
    outlineOffset: -3,
    opacity: 0.65,
  } : {}
  return (
    <div style={{ position: 'relative', width, height }}>
      <CachedImg
        scryfallId={card.imageUri && !imgError ? card.scryfallId : undefined}
        src={card.imageUri && !imgError ? card.imageUri : CARD_BACK_URL}
        alt={card.name}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onError={() => { if (imgError) setFallbackError(true); else setImgError(true) }}
        style={{
          width,
          height,
          objectFit: 'cover',
          boxSizing: 'border-box',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          ...commandStyle,
        }}
      />
      {variant === 'command' && (
        <div
          onClick={onClick}
          style={{
            position: 'absolute',
            bottom: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '3px 10px',
            borderRadius: 4,
            background: '#238636',
            color: '#fff',
            fontSize: '0.65rem',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            lineHeight: 1.4,
          }}
        >
          Play
        </div>
      )}
      <TokenBadge count={card.tokenCount} />
    </div>
  )
}
