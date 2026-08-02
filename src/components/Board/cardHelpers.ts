import type { ManaLogEntry } from '../../types/card'
import { getCardKeywords } from '../../stores/cardRulesLoader'

export function cardRuleSummary(card: {
  name: string
  manaCost?: string
  manaValue?: number
  entersTapped?: boolean
  enchantsCardName?: string
}) {
  const mana = card.manaCost ? `Mana cost: ${card.manaCost}` : card.manaValue !== undefined ? `Mana value: ${card.manaValue}` : 'Mana cost unknown'
  const enchants = card.enchantsCardName ? ` · Enchanting ${card.enchantsCardName}` : ''
  const keywords = [...getCardKeywords(card)]
  const keywordText = keywords.length > 0 ? ` · ${keywords.join(', ')}` : ''
  return `${card.name} · ${mana}${card.entersTapped ? ' · Enters battlefield tapped' : ''}${enchants}${keywordText}`
}

export const counterBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -4,
  right: -4,
  background: '#d29922',
  color: '#000',
  fontSize: '0.7rem',
  fontWeight: 700,
  borderRadius: '50%',
  minWidth: 18,
  padding: '0 3px',
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

export function formatCounterCount(count: number) {
  if (count === 0) return ''
  return count > 0 ? `+${count}` : `−${Math.abs(count)}`
}

export const tokenBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 20,
  right: -4,
  background: '#3fb950',
  color: '#071a0c',
  fontSize: '0.7rem',
  fontWeight: 800,
  borderRadius: 999,
  minWidth: 20,
  height: 20,
  padding: '0 5px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',
  border: '2px solid #10151d',
}

export const emptySlotStyle: React.CSSProperties = {
  width: 160,
  height: 224,
  borderRadius: 8,
  border: '1px dashed rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.02)',
  boxSizing: 'border-box',
  flexShrink: 0,
}

export const colorAccent: Record<ManaLogEntry['color'], string> = {
  W: '#f4f1df',
  U: '#4aa3ff',
  B: '#b6b8c3',
  R: '#f85149',
  G: '#3fb950',
  C: '#d0d7de',
}
