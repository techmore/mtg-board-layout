import { CARD_BACK_URL } from '../../constants'

export function CardBack({ width, height }: { width: number; height: number }) {
  return (
    <img
      src={CARD_BACK_URL}
      alt="Card back"
      style={{
        width,
        height,
        objectFit: 'cover',
        boxSizing: 'border-box',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}
    />
  )
}
