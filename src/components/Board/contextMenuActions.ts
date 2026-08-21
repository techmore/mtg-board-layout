import type { CardAbilityDef } from '../../types/card'
import { useGameStore } from '../../stores/gameStore'
import { getCardPower } from '../../utils/misc'

export function effectKindLabel(ab: CardAbilityDef): string {
  const p = ab.effect.params as Record<string, unknown>
  switch (ab.effect.kind) {
    case 'equip': return `Equip ${(p.cost as string) ?? ''}`
    case 'put_counter': return 'Put counter'
    case 'destroy': return 'Destroy target'
    case 'draw_cards': return `Draw ${(p.amount as number) ?? 1}`
    case 'deal_damage': return 'Deal damage'
    case 'return_from_graveyard': return 'Return from GY'
    case 'search_library': return 'Search library'
    case 'proliferate': return 'Proliferate'
    case 'exile': return 'Exile'
    case 'become_copy': return 'Become a copy of target permanent'
    case 'copy_ability': return 'Copy an ability you resolved this turn'
    case 'graveyard_intake_mill': return 'Mill X = cards put into GY this turn'
    case 'monstrosity': return `Monstrosity ${(p.amount as number) ?? ''}`
    case 'untap_self': return 'Untap this'
    case 'other': return (p.description as string) ?? 'Activate'
    default: return ab.effect.kind
  }
}

export function executeActivated(ab: CardAbilityDef, cardId: string, cardName: string) {
  const cost = ab.cost ?? ''
  const get = () => useGameStore.getState()

  const manaSymbols = [...cost.matchAll(/\{[WUBRGC0-9]+\}/g)].map((m) => m[0]).join('')
  if (manaSymbols) {
    const ok = get().spendManaCost(manaSymbols)
    if (!ok) {
      window.alert(`Not enough mana in pool for ${manaSymbols}`)
      return
    }
  }

  // Energy cost: "Pay N {E}" (also "Pay {E}{E}").
  const energyCost = cost.match(/\bpay\s+(\d+)\s*\{E\}/i)?.[1]
    ?? (() => {
      const payClause = cost.match(/\bpay\b[^,;]*/i)?.[0] ?? ''
      return /{E}/i.test(payClause) ? String((payClause.match(/\{E\}/gi) ?? []).length) : undefined
    })()
  if (energyCost) {
    const ok = get().spendEnergy(parseInt(energyCost, 10))
    if (!ok) {
      window.alert(`Not enough energy (${energyCost} {E})`)
      return
    }
  }

  if (cost.includes('{T}')) {
    const card = get().cards.find((c) => c.id === cardId)
    if (card && !card.tapped) get().toggleTap(cardId)
  }
  if (cost.toLowerCase().includes('sacrifice')) {
    get().moveCard(cardId, 'graveyard')
    get().emitGameEvent({ type: 'sacrifice', cardId, cardName })
  }

  const loyaltyMatch = cost.match(/^([+\u2212−])(\d+)$/)
  if (loyaltyMatch) {
    const sign = loyaltyMatch[1]
    const amount = parseInt(loyaltyMatch[2], 10)
    const card = get().cards.find((c) => c.id === cardId)
    const currentCounters = card?.counters ?? 0

    if (sign === '+') {
      for (let i = 0; i < amount; i++) get().addCounter(cardId)
    } else {
      if (currentCounters < amount) {
        window.alert(`Not enough loyalty (${currentCounters} < ${amount})`)
        return
      }
      for (let i = 0; i < amount; i++) get().removeCounter(cardId)
    }
  }

  // Targeted activations other than equip (which has its own prompt): push a
  // targeting prompt onto the trigger stack so the shared selection UI runs,
  // ward and hexproof guards included.
  if (ab.targets > 0 && ab.effect.kind !== 'equip') {
    useGameStore.setState((state) => ({
      triggerStack: [...state.triggerStack, {
        id: crypto.randomUUID(),
        sourceCardId: cardId,
        sourceCardName: cardName,
        ability: ab,
        event: 'cast' as const,
        context: {},
        selectedTargets: [] as string[],
      }],
    }))
    return
  }

  const params = ab.effect.params as Record<string, unknown>
  switch (ab.effect.kind) {
    case 'equip': {
      // Equip: pay the cost (already handled above), then choose a creature.
      const candidates = get().cards.filter(
        (c) => c.zone === 'battlefield' && (c.owner ?? 'player') === 'player' && c.type === 'creature' && c.id !== cardId,
      )
      if (candidates.length === 0) return
      useGameStore.setState({
        auraPrompt: {
          kind: 'equip',
          auraCardId: cardId,
          auraName: cardName,
          candidates: candidates
            .sort((a, b) => getCardPower(b) - getCardPower(a))
            .map((c) => ({ id: c.id, name: c.name, power: getCardPower(c) })),
        },
      })
      break
    }
    case 'put_counter':
      get().addCounter(cardId)
      break
    case 'destroy':
      get().emitGameEvent({ type: 'dies', cardId, cardName })
      break
    case 'draw_cards':
      get().drawCards((params.amount as number) ?? 1)
      break
    case 'return_from_graveyard':
      get().emitGameEvent({ type: 'dies', cardId, cardName })
      break
    case 'search_library':
      break
    case 'proliferate':
      break
    case 'add_mana': {
      const card = get().cards.find((c) => c.id === cardId)
      if (card?.manaProduction) {
        for (const color of card.manaProduction.colors) {
          get().addMana(color, { cardId, cardName })
        }
      }
      break
    }
  }
}
