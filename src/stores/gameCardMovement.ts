import type { BoardCard } from '../types/card'
import type { GameState } from './gameStore'
import { pushUndo, prepareCardPlay, generatedManaState, attachAuras, isAura, withGraveyardIntake } from './gameRules'
import { getCardPower } from '../utils/misc'

type SetFn = (partial: GameState | Partial<GameState> | ((state: GameState) => Partial<GameState>)) => void

export function createCardMovement(set: SetFn, get: () => GameState): Pick<GameState, 'moveCard' | 'addCard' | 'reorderBattlefield' | 'toggleTap' | 'addCounter' | 'removeCounter' | 'addDamage' | 'removeCard' | 'revealCard'> {
  return {
    addCard: (card) =>
      set((state) => ({ ...pushUndo(state), cards: [...state.cards, card] })),

    moveCard: (cardId, zone) => {
      const cardBefore = get().cards.find((c) => c.id === cardId)
      const wasOnBattlefield = cardBefore?.zone === 'battlefield'
      set((state) => {
        const current = state.cards.find((card) => card.id === cardId)
        if (!current) return {}
        const preparation = zone === 'battlefield'
          ? prepareCardPlay(current, state)
          : null
        const updated = {
          ...current,
          zone,
          tapped: preparation?.entersBattlefield ? preparation.entersTapped : false,
          revealed: zone !== 'hand' && zone !== 'library',
          damage: zone === 'battlefield' ? current.damage ?? 0 : 0,
          powerBoost: zone === 'battlefield' ? current.powerBoost ?? 0 : 0,
          toughnessBoost: zone === 'battlefield' ? current.toughnessBoost ?? 0 : 0,
          keywordBoosts: zone === 'battlefield' ? current.keywordBoosts : undefined,
          counters: current.type === 'planeswalker' && zone === 'battlefield' && current.counters === 0 ? 5 : current.counters,
        }
        if (preparation?.blockReason === 'land') {
          return {
            ...pushUndo(state),
            turnPrompt: { id: Date.now(), action: 'end', reason: 'land', cardId },
          }
        }
        if (preparation?.blockReason === 'etb') {
          return {
            ...pushUndo(state),
            turnPrompt: { id: Date.now(), action: 'end', reason: 'etb', cardId },
          }
        }
        const nextLandPlaysThisTurn = state.landPlaysThisTurn + (preparation?.isLandPlay ? 1 : 0)
        const undo = pushUndo(state)

        const commanderTax = preparation?.commanderTax ?? current.commanderTax ?? 0
        const nextManaPool = preparation?.manaPoolAfterPlay ?? state.manaPool

        const applyUpdated = (cards: BoardCard[]) => cards.map((c) =>
          c.id === cardId ? { ...updated, commanderTax } : c
        )

        if (zone === 'battlefield' && current.zone !== 'battlefield') {
          return {
            ...undo,
            manaPool: nextManaPool,
            cards: attachAuras(applyUpdated([...state.cards.filter((card) => card.id !== cardId), updated]), { deferUnattached: true }),
            landPlaysThisTurn: nextLandPlaysThisTurn,
          }
        }

        const nextCards = attachAuras(applyUpdated(state.cards), { deferUnattached: true })
        return { ...undo, manaPool: nextManaPool, cards: nextCards, landPlaysThisTurn: nextLandPlaysThisTurn, ...withGraveyardIntake(state, nextCards) }
      })
      // Player aura entry: let the player choose what the aura enchants.
      if (zone === 'battlefield' && cardBefore && isAura(cardBefore)) {
        const state = get()
        const aura = state.cards.find((c) => c.id === cardId)
        if (aura && aura.zone === 'battlefield' && !aura.enchantsCardId) {
          const owner = aura.owner ?? 'player'
          const candidates = state.cards.filter(
            (c) => c.zone === 'battlefield' && (c.owner ?? 'player') === owner && c.type === 'creature' && c.id !== aura.id,
          )
          if (candidates.length > 0) {
            set({
              auraPrompt: {
                kind: 'aura' as const,
                auraCardId: cardId,
                auraName: aura.name,
                candidates: candidates
                  .sort((a, b) => getCardPower(b) - getCardPower(a))
                  .map((c) => ({ id: c.id, name: c.name, power: getCardPower(c) })),
              },
            })
          } else {
            set({ cards: get().cards.map((c) => c.id === cardId ? { ...c, zone: 'graveyard' as const, revealed: true } : c) })
          }
        }
      }
      if (zone === 'battlefield' && cardBefore && cardBefore.zone !== 'battlefield') {
        get().emitGameEvent({ type: 'etb', cardId, cardName: cardBefore.name })
        // Landfall triggers fire whenever a land enters the battlefield
        // (Lotus Cobra, Evolution Sage, ...).
        if (cardBefore.type === 'land') {
          get().emitGameEvent({ type: 'landfall', cardId, cardName: cardBefore.name })
        }
      }
      if (zone === 'graveyard' && wasOnBattlefield) {
        get().emitGameEvent({ type: 'dies', cardId, cardName: cardBefore!.name })
      }
    },

    reorderBattlefield: (cardId, direction) =>
      set((state) => {
        const target = state.cards.find((card) => card.id === cardId && card.zone === 'battlefield')
        if (!target) return {}

        const category = target.type === 'land' || target.type === 'creature' ? target.type : null
        if (!category) return {}
        const groupKey = (card: BoardCard) => card.type === 'land'
          ? `land:${card.name.toLowerCase()}`
          : `card:${card.id}`
        const groups = new Map<string, BoardCard[]>()
        state.cards
          .filter((card) => card.zone === 'battlefield' && card.type === category)
          .forEach((card) => {
            const key = groupKey(card)
            const group = groups.get(key)
            if (group) group.push(card)
            else groups.set(key, [card])
          })

        const orderedGroups = Array.from(groups.values())
        const targetGroupIndex = orderedGroups.findIndex((group) => group.some((card) => card.id === target.id))
        const nextGroupIndex = direction === 'closer' ? targetGroupIndex - 1 : targetGroupIndex + 1
        if (targetGroupIndex < 0 || nextGroupIndex < 0 || nextGroupIndex >= orderedGroups.length) return {}
        const undo = pushUndo(state)

        ;[orderedGroups[targetGroupIndex], orderedGroups[nextGroupIndex]] = [orderedGroups[nextGroupIndex], orderedGroups[targetGroupIndex]]
        const orderedCategory = orderedGroups.flat()
        let categoryIndex = 0
        return {
          ...undo,
          cards: state.cards.map((card) => card.zone === 'battlefield' && card.type === category
            ? orderedCategory[categoryIndex++]
            : card),
        }
      }),

    toggleTap: (cardId) =>
      set((state) => {
        const card = state.cards.find((candidate) => candidate.id === cardId)
        if (!card) return {}

        const production = card.zone === 'battlefield' && card.type !== 'planeswalker' ? card.manaProduction : undefined
        if (!card.tapped && production && production.colors.length > 1) {
          const potentialMana = Array.from({ length: production.amount }, () => ({
            id: crypto.randomUUID(),
            colors: [...production.colors],
            sourceCardId: card.id,
            sourceCardName: card.name,
          }))
          return {
            ...pushUndo(state),
            cards: state.cards.map((candidate) => candidate.id === cardId ? { ...candidate, tapped: true } : candidate),
            potentialMana: [...state.potentialMana, ...potentialMana],
          }
        }

        const tapped = !card.tapped
        const next = {
          cards: state.cards.map((candidate) => candidate.id === cardId ? { ...candidate, tapped } : candidate),
        }
        if (tapped && production?.colors.length === 1) {
          return {
            ...pushUndo(state),
            ...next,
            ...generatedManaState(state, production.colors[0], production.amount, { cardId: card.id, cardName: card.name }),
          }
        }
        if (!tapped && production && production.colors.length > 1) {
          return {
            ...pushUndo(state),
            ...next,
            potentialMana: state.potentialMana.filter((p) => p.sourceCardId !== card.id),
          }
        }
        if (!tapped && production?.colors.length === 1) {
          return {
            ...pushUndo(state),
            ...next,
            manaPool: {
              ...state.manaPool,
              [production.colors[0]]: Math.max(0, state.manaPool[production.colors[0]] - production.amount),
            },
          }
        }
        return { ...pushUndo(state), ...next }
      }),

    addCounter: (cardId, kind = '+1/+1') => {
      const card = get().cards.find((c) => c.id === cardId)
      set((state) => ({
        ...pushUndo(state),
        cards: state.cards.map((c) =>
          c.id === cardId
            ? kind === '-1/-1'
              ? { ...c, minusCounters: (c.minusCounters ?? 0) + 1 }
              : { ...c, counters: c.counters + 1 }
            : c
        ),
      }))
      if (card) get().emitGameEvent({ type: 'counter_placed', cardId, cardName: card.name, kind })
    },

    removeCounter: (cardId) => {
      const card = get().cards.find((c) => c.id === cardId)
      set((state) => ({
        ...pushUndo(state),
        cards: state.cards.map((c) =>
          c.id === cardId
            ? (c.minusCounters ?? 0) > 0
              ? { ...c, minusCounters: (c.minusCounters ?? 0) - 1 }
              : { ...c, counters: c.counters - 1 }
            : c
        ),
      }))
      if (card && card.zone === 'battlefield' && (card.type === 'creature' || card.type === 'planeswalker')) {
        get().checkStateBasedActions()
      }
    },

    addDamage: (cardId, amount) =>
      set((state) => ({
        ...pushUndo(state),
        cards: state.cards.map((c) =>
          c.id === cardId ? { ...c, damage: (c.damage ?? 0) + amount } : c
        ),
      })),

    removeCard: (cardId) =>
      set((state) => ({ ...pushUndo(state), cards: state.cards.filter((c) => c.id !== cardId) })),

    revealCard: (cardId) =>
      set((state) => ({
        ...pushUndo(state),
        cards: state.cards.map((c) =>
          c.id === cardId ? { ...c, revealed: !c.revealed } : c
        ),
      })),
  }
}
