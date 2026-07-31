import { tokenBadgeStyle } from './cardHelpers'

export function TokenBadge({ count }: { count?: number }) {
  if (!count || count < 1) return null
  return <div style={tokenBadgeStyle} aria-label={`${count} tokens`}>{count}</div>
}
