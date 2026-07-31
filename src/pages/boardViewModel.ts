import type { BoardCard } from '../types/card'
import { isLand } from '../utils/misc'

export interface CardStack {
  card: BoardCard
  count: number
}

export interface BoardViewModel {
  handCards: BoardCard[]
  handStacks: Array<[string, CardStack]>
  creatureCards: BoardCard[]
  planeswalkerCards: BoardCard[]
  battleCards: BoardCard[]
  spellCards: BoardCard[]
  artifactCards: BoardCard[]
  enchantmentCards: BoardCard[]
  landCards: BoardCard[]
  landStacks: Array<[string, BoardCard[]]>
  otherPermanents: BoardCard[]
  graveyardCards: BoardCard[]
  commandCards: BoardCard[]
  libraryCards: BoardCard[]
  exileCards: BoardCard[]
}

export function getBoardViewModel(cards: BoardCard[], owner?: 'player' | 'opponent'): BoardViewModel {
  const filtered = owner ? cards.filter((c) => (c.owner ?? 'player') === owner) : cards
  const handCards = filtered.filter((card) => card.zone === 'hand')
  const handStacks = Array.from(
    handCards.reduce((stacks, card) => {
      const key = card.scryfallId || card.name.toLowerCase()
      const stack = stacks.get(key)
      if (stack) stack.count += 1
      else stacks.set(key, { card, count: 1 })
      return stacks
    }, new Map<string, CardStack>()),
  ).sort(([, left], [, right]) => Number(isLand(right.card.type)) - Number(isLand(left.card.type)))

  const battlefieldCards = filtered.filter((card) => card.zone === 'battlefield')
  const creatureCards = battlefieldCards.filter((card) => card.type === 'creature')
  const planeswalkerCards = battlefieldCards.filter((card) => card.type === 'planeswalker')
  const battleCards = battlefieldCards.filter((card) => card.type === 'battle')
  const spellCards = battlefieldCards.filter((card) => card.type === 'instant' || card.type === 'sorcery')
  const artifactCards = battlefieldCards.filter((card) => card.type === 'artifact')
  const enchantmentCards = battlefieldCards.filter((card) => card.type === 'enchantment')
  const landCards = battlefieldCards.filter((card) => isLand(card.type))
  const landStacks = Array.from(
    landCards.reduce((stacks, card) => {
      const key = card.name.toLowerCase()
      const stack = stacks.get(key)
      if (stack) stack.push(card)
      else stacks.set(key, [card])
      return stacks
    }, new Map<string, BoardCard[]>()),
  )
  const otherPermanents = battlefieldCards.filter((card) =>
    !['creature', 'planeswalker', 'battle', 'artifact', 'enchantment', 'land', 'instant', 'sorcery'].includes(card.type),
  )

  return {
    handCards,
    handStacks,
    creatureCards,
    planeswalkerCards,
    battleCards,
    spellCards,
    artifactCards,
    enchantmentCards,
    landCards,
    landStacks,
    otherPermanents,
    graveyardCards: filtered.filter((card) => card.zone === 'graveyard'),
    commandCards: filtered.filter((card) => card.zone === 'command'),
    libraryCards: filtered.filter((card) => card.zone === 'library'),
    exileCards: filtered.filter((card) => card.zone === 'exile'),
  }
}
