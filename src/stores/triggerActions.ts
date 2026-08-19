import type { GameState } from './gameStore'
import type { CardEffect, Token, TriggerInstance, BoardCard } from '../types/card'
import { CARD_BACK_URL } from '../constants'
import { canPayManaCost, getCardPower, getCreaturePower } from '../utils/misc'
import { hasKeyword, getCardRule, getCachedCardRules } from './cardRulesLoader'
import { attachAuras } from './gameRules'
import { enqueueSpellAbilities } from './spellResolution'
import { useToastStore } from './toastStore'

/** True when a trigger instance belongs to the AI (source card is opponent-owned). */
function aiOwned(trigger: { sourceCardId: string }, state: { cards: { id: string; owner?: 'player' | 'opponent' }[] }): boolean {
  return state.cards.find((c) => c.id === trigger.sourceCardId)?.owner === 'opponent'
}

/** Parser amounts can be strings like "X"; never let them reach arithmetic. */
function numericAmount(params: Record<string, unknown>): number {
  const amount = params.amount
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : 1
}

export function resolveTrigger(get: () => GameState, set: (partial: Partial<GameState>) => void, triggerId: string) {
  const state = get()
  const trigger = state.triggerStack.find((t) => t.id === triggerId)
  if (!trigger) return

  const needsTarget = trigger.ability.targets > 0

  if (needsTarget) {
    if (trigger.selectedTargets !== undefined) {
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: undefined } : t,
        ),
      })
    } else {
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
    }
    return
  }

  const effect = trigger.ability.effect
  const params = effect.params as Record<string, unknown>

  switch (effect.kind) {
    case 'draw_cards': {
      const amount = numericAmount(params)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if ((source?.owner ?? 'player') === 'opponent') {
        let remaining = Math.max(0, Math.floor(amount))
        set({
          cards: state.cards.map((c) => {
            if (remaining > 0 && (c.owner ?? 'player') === 'opponent' && c.zone === 'library') {
              remaining--
              return { ...c, zone: 'hand' as const }
            }
            return c
          }),
        })
      } else {
        get().drawCards(amount)
      }
      break
    }
    case 'gain_life': {
      const amount = numericAmount(params)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if ((source?.owner ?? 'player') === 'opponent') {
        get().setOpponentLife(state.opponentLifeTotal + amount)
      } else {
        get().setLife(state.lifeTotal + amount)
      }
      break
    }
    case 'lose_life': {
      const amount = numericAmount(params)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if ((source?.owner ?? 'player') === 'opponent') {
        get().setOpponentLife(state.opponentLifeTotal - amount)
      } else {
        get().setLife(state.lifeTotal - amount)
      }
      break
    }
    case 'create_token': {
      const tokenName = (params.tokenName as string) ?? 'Token'
      const amount = numericAmount(params)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      for (let i = 0; i < amount; i++) {
        const token: Token = {
          id: crypto.randomUUID(),
          name: tokenName,
          imageUri: CARD_BACK_URL,
          counters: 0,
          tapped: false,
          power: params.tokenPower as number | undefined,
          toughness: params.tokenToughness as number | undefined,
          type: 'creature',
          owner: (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player',
        }
        get().addToken(token)
      }
      break
    }
      case 'put_counter': {
        if (trigger.ability.targets > 0) break
        const kind = params.counterKind === '-1/-1' ? ('-1/-1' as const) : ('+1/+1' as const)
        const amount = numericAmount(params)
        const scope = (params.scope as string | undefined) ?? 'all'
        const source = state.cards.find((c) => c.id === trigger.sourceCardId)
        const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
        const victims = state.cards.filter((c) => {
          if (c.zone !== 'battlefield' || c.type !== 'creature') return false
          const owner = c.owner ?? 'player'
          if (scope === 'own') return owner === sourceOwner
          if (scope === 'opponent') return owner !== sourceOwner
          if (scope === 'others') return c.id !== trigger.sourceCardId
          return true
        })
        for (const victim of victims) {
          for (let i = 0; i < amount; i++) get().addCounter(victim.id, kind)
        }
        break
      }
      case 'double_counters':
      case 'remove_counters': {
        if (trigger.ability.targets > 0) break
        // Untargeted counter manipulation targets the source card itself
        // ("double the counters on Lily Bowen", "remove a time counter from it").
        const self = state.cards.find((c) => c.id === trigger.sourceCardId)
        if (!self) break
        const amount = numericAmount(params)
        set({
          cards: state.cards.map((c) => {
            if (c.id !== self.id) return c
            if (effect.kind === 'double_counters') {
              return { ...c, counters: c.counters * 2, minusCounters: (c.minusCounters ?? 0) * 2 }
            }
            if (params.amount === 'all') return { ...c, counters: 0, minusCounters: 0 }
            let remaining = amount
            const minus = Math.max(0, (c.minusCounters ?? 0) - remaining)
            remaining -= (c.minusCounters ?? 0) - minus
            return { ...c, minusCounters: minus, counters: Math.max(0, c.counters - remaining) }
          }),
        })
        break
      }
      case 'pump': {
        // With no explicit targets the parser encodes mass pumps ("all creatures
        // get +1/+1 until end of turn").
        if (trigger.ability.targets > 0) break
        const power = (params.power as number) ?? 0
        const toughness = (params.toughness as number) ?? 0
        const scope = (params.scope as string | undefined) ?? 'all'
        const source = state.cards.find((c) => c.id === trigger.sourceCardId)
        const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
        const victims = state.cards.filter((c) => {
          if (c.zone !== 'battlefield' || c.type !== 'creature') return false
          const owner = c.owner ?? 'player'
          if (scope === 'own') return owner === sourceOwner
          if (scope === 'opponent') return owner !== sourceOwner
          if (scope === 'others') return c.id !== trigger.sourceCardId
          return true
        })
        set({
          cards: state.cards.map((c) =>
            victims.some((v) => v.id === c.id)
              ? { ...c, powerBoost: (c.powerBoost ?? 0) + power, toughnessBoost: (c.toughnessBoost ?? 0) + toughness }
              : c,
          ),
        })
        break
      }
    case 'keyword_pump': {
      // "Creatures you control gain deathtouch until end of turn" — a temporary
      // keyword grant on the affected creatures.
      if (trigger.ability.targets > 0) break
      const keyword = params.keyword as string | undefined
      if (!keyword) break
      const scope = (params.scope as string | undefined) ?? 'all'
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const victims = state.cards.filter((c) => {
        if (c.zone !== 'battlefield' || c.type !== 'creature') return false
        const owner = c.owner ?? 'player'
        if (scope === 'own') return owner === sourceOwner
        if (scope === 'opponent') return owner !== sourceOwner
        if (scope === 'others') return c.id !== trigger.sourceCardId
        return true
      })
      if (victims.length === 0) break
      set({
        cards: state.cards.map((c) =>
          victims.some((v) => v.id === c.id)
            ? { ...c, keywordBoosts: [...new Set([...(c.keywordBoosts ?? []), keyword])] }
            : c,
        ),
      })
      break
    }
    case 'add_energy': {
      const amount = numericAmount(params)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      get().gainEnergy(amount, owner)
      break
    }
    case 'gain_monarch': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      set({ monarch: (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player' })
      break
    }
    case 'gain_rad':
    case 'lose_rad': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const scope = (params.scope as string) ?? 'opponent'
      const raw = params.amount
      const amount = raw === 'power' ? getCardPower(source ?? ({} as BoardCard)) : typeof raw === 'number' ? raw : 1
      const apply = (owner: 'player' | 'opponent') => {
        if (effect.kind === 'gain_rad') get().gainRad(amount, owner)
        else get().loseRad(999, owner)
      }
      if (scope === 'each') { apply('player'); apply('opponent') }
      else if (scope === 'you') apply(sourceOwner)
      else apply(sourceOwner === 'player' ? 'opponent' : 'player')
      break
    }
    case 'static_noop':
      // "can't be countered/regenerated/prevented" — vacuously true in this app.
      break
    case 'static_restriction':
      // Plain "can't attack or block" restrictions are enforced by the combat
      // engines reading the Oracle text; nothing to resolve here.
      break
    case 'static_keyword':
      // Static keyword anthems ("creatures you control have haste") are
      // evaluated by the combat engines; nothing to resolve here.
      break
    case 'return_all_other': {
      const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature' && c.id !== trigger.sourceCardId)
      for (const victim of victims) get().moveCard(victim.id, 'hand')
      break
    }
    case 'double_power': {
      const card = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (card && card.zone === 'battlefield') {
        const base = getCreaturePower(card.typeLine ?? '')
        set({
          cards: state.cards.map((c) =>
            c.id === trigger.sourceCardId ? { ...c, powerBoost: (c.powerBoost ?? 0) + base } : c,
          ),
        })
      }
      break
    }
    case 'mass_sacrifice': {
      // "Each player sacrifices a creature" / "Each opponent sacrifices a
      // creature" / "You may sacrifice a creature". Each affected side
      // sacrifices its weakest eligible permanent (the default "of their
      // choice"; the player can undo).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const scope = (params.scope as string) ?? 'all'
      const kind = (params.kind as string) ?? 'creature'
      const eligible = (c: BoardCard) => {
        if (c.zone !== 'battlefield') return false
        if (kind === 'permanent') return true
        if (kind === 'creature_or_planeswalker') return c.type === 'creature' || c.type === 'planeswalker'
        return c.type === 'creature'
      }
      const sacrificeFor = (owner: 'player' | 'opponent') => {
        if (kind === 'token') {
          const token = state.tokens.find((t) => (t.owner ?? 'player') === owner)
          if (token) get().removeToken(token.id)
          return
        }
        const victims = state.cards
          .filter((c) => (c.owner ?? 'player') === owner && eligible(c))
          .sort((a, b) => (a.type === 'land' ? 10 : 0) + getCardPower(a) / 1000 - ((b.type === 'land' ? 10 : 0) + getCardPower(b) / 1000))
        const victim = victims[0]
        if (victim) {
          get().moveCard(victim.id, 'graveyard')
          get().emitGameEvent({ type: 'sacrifice', cardId: victim.id, cardName: victim.name })
        }
      }
      const affectsPlayer = scope === 'all' || (scope === 'opponent' ? sourceOwner !== 'player' : sourceOwner === 'player')
      const affectsOpponent = scope === 'all' || (scope === 'opponent' ? sourceOwner !== 'opponent' : sourceOwner === 'opponent')
      if (affectsPlayer) sacrificeFor('player')
      if (affectsOpponent) sacrificeFor('opponent')
      break
    }
    case 'manifest': {
      // Manifest the top card of the source owner's library as a face-down 2/2
      // creature. "Manifest dread" mills one card, then manifests the next;
      // "twice" repeats. (Turning face up is not modeled.)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const dread = (params.dread as number) ?? 0
      const cards = [...state.cards]
      const steps = dread === 0 ? 1 : dread * 2
      let nextId = cards.find((c) => (c.owner ?? 'player') === owner && c.zone === 'library')?.id
      for (let i = 0; i < steps; i++) {
        if (!nextId) break
        const index = cards.findIndex((c) => c.id === nextId)
        if (index < 0) break
        const top = cards[index]
        if (dread > 0 && i % 2 === 0) {
          cards[index] = { ...top, zone: 'graveyard' as const, revealed: true }
        } else {
          cards[index] = { ...top, zone: 'battlefield' as const, tapped: false, revealed: false, facedown: true, typeLine: 'Creature 2/2', type: 'creature', enteredAtTurn: state.turn, counters: 0 }
        }
        nextId = cards.find((c) => (c.owner ?? 'player') === owner && c.zone === 'library')?.id
      }
      set({ cards })
      break
    }
    case 'untap_lands':
    case 'untap_creatures': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const targetType = effect.kind === 'untap_lands' ? 'land' : 'creature'
      set({
        cards: state.cards.map((c) =>
          c.zone === 'battlefield' && c.type === targetType && (c.owner ?? 'player') === sourceOwner
            ? { ...c, tapped: false }
            : c,
        ),
      })
      break
    }
    case 'gain_control': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      // "Target opponent gains control of ~" (player-target): the source card
      // swaps to the other side.
      if (trigger.ability.targets > 0 && /opponent|player/i.test(trigger.ability.targetFilter ?? '')) {
        const newOwner = sourceOwner === 'player' ? 'opponent' : 'player'
        if (source) {
          set({
            cards: state.cards.map((c) =>
              c.id === source.id ? { ...c, owner: newOwner, originalOwner: sourceOwner, controlUntilTurnEnd: params.temporary ? true : undefined } : c,
            ),
          })
        }
        break
      }
      if (trigger.ability.targets > 0) break
      // Untargeted (rare): the source swaps to the other side.
      if (source) {
        const newOwner = sourceOwner === 'player' ? 'opponent' : 'player'
        set({
          cards: state.cards.map((c) =>
            c.id === source.id ? { ...c, owner: newOwner, originalOwner: sourceOwner, controlUntilTurnEnd: params.temporary ? true : undefined } : c,
          ),
        })
      }
      break
    }
    case 'optional_pay': {
      // "You may pay {cost}. If you do, <effect>" (or "If the player doesn't,
      // <effect>" for the opponent-pays variants). The AI never pays optional
      // costs; the player auto-pays when affordable (undoable).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const payerIsSelf = (params.payer as string) !== 'opponent'
      const payer = payerIsSelf ? sourceOwner : (sourceOwner === 'player' ? 'opponent' : 'player')
      const cost = (params.cost as string) ?? ''
      const then = params.then as CardEffect | undefined
      const thenIfNotPaid = params.thenIfNotPaid === true
      let paid = false
      if (payer === 'opponent') {
        paid = false // the AI declines optional costs
      } else if (/^pay\s+\d+\s+life$/i.test(cost)) {
        const life = parseInt(cost.replace(/\D/g, ''), 10)
        if (state.lifeTotal >= life) {
          get().setLife(state.lifeTotal - life)
          paid = true
        }
      } else if (cost && canPayManaCost(state.manaPool, cost)) {
        get().spendManaCost(cost, `Optional (${trigger.sourceCardName})`)
        paid = true
      }
      if (then && ((paid && !thenIfNotPaid) || (!paid && thenIfNotPaid))) {
        const synthetic: TriggerInstance = {
          id: crypto.randomUUID(),
          sourceCardId: trigger.sourceCardId,
          sourceCardName: trigger.sourceCardName,
          ability: { ...trigger.ability, effect: then, targets: 0 },
          event: 'cast',
          context: {},
        }
        set({ triggerStack: [...get().triggerStack, synthetic] })
        get().resolveTrigger(synthetic.id)
      }
      break
    }
    case 'sacrifice':
      get().moveCard(trigger.sourceCardId, 'graveyard')
      break
    case 'deal_damage': {
      // With no explicit targets the parser encodes mass effects (e.g. "deals 3
      // damage to each creature").
      if (trigger.ability.targets > 0) break
      const amount = numericAmount(params)
      const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
      for (const victim of victims) get().addDamage(victim.id, amount)
      // Mass damage can be lethal: run state-based actions so creatures die
      // immediately instead of lingering with damage marked.
      get().checkStateBasedActions()
      break
    }
    case 'destroy': {
      if (trigger.ability.targets > 0) break
      const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
      for (const victim of victims) get().moveCard(victim.id, 'graveyard')
      break
    }
    case 'exile': {
      if (trigger.ability.targets > 0) break
      const victims = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
      for (const victim of victims) get().moveCard(victim.id, 'exile')
      break
    }
    case 'equip': {
      // Untargeted equip (reminder text stripped): auto-attach to the
      // strongest friendly creature, like aura auto-attach.
      if (trigger.ability.targets > 0) break
      set({ cards: attachAuras(state.cards, { preferredTargetId: trigger.sourceCardId }) })
      break
    }
    case 'annihilator': {
      // Whenever this creature attacks, defending player sacrifices N
      // permanents. The defender's weakest nonland permanents go first.
      const amount = numericAmount(params)
      const attacker = state.cards.find((c) => c.id === trigger.sourceCardId)
      const attackerOwner = attacker?.owner ?? 'player'
      const defenders = state.cards.filter((c) => c.zone === 'battlefield' && (c.owner ?? 'player') !== attackerOwner)
      // Nonlands first (weakest creature first), lands last.
      const sortKey = (c: BoardCard) => (c.type === 'land' ? 10 : 0) + getCardPower(c) / 1000
      const sacrifices = [...defenders].sort((a, b) => sortKey(a) - sortKey(b)).slice(0, amount)
      for (const sacrificed of sacrifices) {
        get().moveCard(sacrificed.id, 'graveyard')
        get().emitGameEvent({ type: 'sacrifice', cardId: sacrificed.id, cardName: sacrificed.name })
      }
      break
    }
    case 'storm': {
      // Copy the spell once for each spell cast before it this turn. Each
      // copy is the source card's spell abilities re-enqueued on the stack.
      const count = 'gameEvent' in trigger.context
        ? (trigger.context.gameEvent as { count?: number }).count
        : undefined
      const copies = Math.max(0, (count ?? 1) - 1)
      if (copies > 0) {
        const source = state.cards.find((c) => c.id === trigger.sourceCardId)
        const rule = source ? getCardRule(source.name, getCachedCardRules()) : undefined
        const spellAbilities = (rule?.abilities ?? []).filter((a) => a.abilityType === 'spell')
        if (spellAbilities.length > 0) {
          const copyInstances: TriggerInstance[] = Array.from({ length: copies }, () => spellAbilities.map((ability) => ({
            id: crypto.randomUUID(),
            sourceCardId: trigger.sourceCardId,
            sourceCardName: trigger.sourceCardName,
            ability,
            event: 'cast' as const,
            context: {},
          }))).flat()
          set({
            triggerStack: [...state.triggerStack, ...copyInstances],
          })
        }
      }
      break
    }
    case 'return_from_graveyard': {
      const zone = (params.zone as string) ?? 'battlefield'
      // Untargeted reanimation triggers ("put that card onto the battlefield
      // under your control") return the card that died, not the source.
      const event = trigger.context.gameEvent as { type?: string; cardId?: string } | undefined
      const cardId = event?.type === 'dies' && event.cardId ? event.cardId : trigger.sourceCardId
      get().moveCard(cardId, zone as 'battlefield' | 'hand')
      break
    }
    case 'scry':
      if (aiOwned(trigger, state)) {
        get().confirmScry(triggerId)
        return
      }
      // Enter scry mode via selectedTargets
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
      return
    case 'search_library':
      if (aiOwned(trigger, state)) {
        // The AI never names a card: the trigger simply resolves with no search.
        get().confirmSearchLibrary(triggerId)
        return
      }
      // Enter search mode via selectedTargets (single-select from library)
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
      return
    case 'proliferate':
      if (aiOwned(trigger, state)) {
        // The AI proliferates its own counters first: planeswalkers and
        // creatures already carrying counters.
        const source = state.cards.find((c) => c.id === trigger.sourceCardId)
        const sourceOwner = source?.owner ?? 'player'
        const targets = state.cards
          .filter((c) => c.zone === 'battlefield' && (c.owner ?? 'player') === sourceOwner)
          .filter((c) => c.type === 'planeswalker' || (c.counters ?? 0) > 0)
          .slice(0, 3)
          .map((c) => c.id)
        set({
          triggerStack: state.triggerStack.map((t) =>
            t.id === triggerId ? { ...t, selectedTargets: targets } : t,
          ),
        })
        get().confirmProliferate(triggerId)
        return
      }
      // Enter multi-select mode via selectedTargets like targeting
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? { ...t, selectedTargets: [] } : t,
        ),
      })
      return
    case 'mill': {
      const amount = numericAmount(params)
      const owner = state.cards.find((c) => c.id === trigger.sourceCardId)?.owner ?? 'player'
      const library = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'library')
      const milled = library.slice(0, amount).map((c) => ({ ...c, zone: 'graveyard' as const, revealed: true }))
      if (milled.length > 0) {
        set({
          cards: state.cards.map((c) => {
            const target = milled.find((m) => m.id === c.id)
            return target ?? c
          }),
        })
      }
      break
    }
    case 'add_mana': {
      const card = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (card?.manaProduction) {
        for (const color of card.manaProduction.colors) {
          get().addMana(color, { cardId: card.id, cardName: card.name })
        }
      }
      break
    }
    case 'other': {
      useToastStore.getState().push(
        `"${trigger.sourceCardName}" ability is not implemented yet — it had no effect.`,
        'error',
      )
      break
    }
    default:
      break
  }

  const triggerStack = get().triggerStack.filter((t) => t.id !== triggerId)
  if (triggerStack.length !== get().triggerStack.length) {
    set({ triggerStack })
  }
}

export function selectTarget(get: () => GameState, set: (partial: Partial<GameState>) => void, triggerId: string, cardId: string, bypassWard = false) {
  const state = get()
  const trigger = state.triggerStack.find((t) => t.id === triggerId)
  if (!trigger) return
  const needed = trigger.ability.targets
  const have = trigger.selectedTargets?.length ?? 0
  if (have >= needed) return

  const updated = {
    ...trigger,
    selectedTargets: [...(trigger.selectedTargets ?? []), cardId],
  }

  if (updated.selectedTargets.length >= needed) {
    // Ward: a targeted permanent with ward counters the spell unless its
    // controller pays. Defer resolution until the payer decides.
    const target = state.cards.find((c) => c.id === cardId)
    const source = state.cards.find((c) => c.id === trigger.sourceCardId)
    const wardCost = target && hasKeyword(target, 'ward') ? 2 : 0
    const wardTriggers = wardCost > 0 && !bypassWard && (source?.owner ?? 'player') !== (target?.owner ?? 'player')
    if (wardTriggers && target) {
      set({
        triggerStack: state.triggerStack.map((t) =>
          t.id === triggerId ? updated : t,
        ),
        wardPrompt: {
          triggerId,
          targetCardId: cardId,
          cost: wardCost,
          spellName: trigger.sourceCardName,
          targetName: target.name,
        },
      })
      return
    }
    applyTargetedEffect(get, set, state, trigger, cardId)
  } else {
    set({
      triggerStack: state.triggerStack.map((t) =>
        t.id === triggerId ? updated : t,
      ),
    })
  }
}

function applyTargetedEffect(get: () => GameState, set: (partial: Partial<GameState>) => void, state: GameState, trigger: TriggerInstance, cardId: string) {
  const effect = trigger.ability.effect
  const params = effect.params as Record<string, unknown>
  switch (effect.kind) {
    case 'equip': {
      // Attach the equipment to the chosen creature.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (source) {
        const target = state.cards.find((c) => c.id === cardId)
        set({
          cards: state.cards.map((c) =>
            c.id === source.id
              ? { ...c, enchantsCardId: target?.id, enchantsCardName: target?.name }
              : c,
          ),
        })
      }
      break
    }
    case 'put_counter': {
      const kind = params.counterKind === '-1/-1' ? ('-1/-1' as const) : ('+1/+1' as const)
      get().addCounter(cardId, kind)
      break
    }
    case 'cant_be_blocked': {
      const card = state.cards.find((c) => c.id === cardId)
      if (card && card.zone === 'battlefield') {
        set({ cards: state.cards.map((c) => c.id === cardId ? { ...c, cantBeBlockedThisTurn: true } : c) })
      }
      break
    }
    case 'move_counter': {
      // "Move a counter from target permanent you control onto a second target
      // permanent" — resolve as: move one +1/+1 counter from the source to the
      // chosen target (the "second" target).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = source?.owner ?? 'player'
      if (source && source.counters > 0) {
        // Move from the source card to the targeted permanent.
        set({
          cards: state.cards.map((c) => {
            if (c.id === trigger.sourceCardId) return { ...c, counters: c.counters - 1 }
            if (c.id === cardId) return { ...c, counters: (c.counters ?? 0) + 1 }
            return c
          }),
        })
      } else if (source && source.type === 'land') {
        // Diamond City: move a shield counter (modeled as +1/+1) from this land
        // onto the target creature.
        if ((source.counters ?? 0) > 0) {
          set({
            cards: state.cards.map((c) => {
              if (c.id === trigger.sourceCardId) return { ...c, counters: c.counters - 1 }
              if (c.id === cardId) return { ...c, counters: (c.counters ?? 0) + 1 }
              return c
            }),
          })
        } else {
          // No counter to move — gain one on the target (approximation).
          set({ cards: state.cards.map((c) => c.id === cardId ? { ...c, counters: (c.counters ?? 0) + 1 } : c) })
        }
      }
      break
    }
    case 'exchange_life_toughness': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const target = state.cards.find((c) => c.id === cardId)
      if (source && target) {
        const toughness = getCardToughness(source)
        const targetLife = target.owner === 'player' ? state.lifeTotal : state.opponentLifeTotal
        // Set the target's life to the source creature's toughness.
        if (target.owner === 'opponent') {
          set({ opponentLifeTotal: toughness })
          set({ cards: state.cards.map((c) => c.id === source.id ? { ...c, damage: Math.max(0, targetLife - source.damage ?? 0) } : c) })
        } else {
          set({ lifeTotal: toughness })
        }
      }
      break
    }
    case 'tap_target': {
      const target = state.cards.find((c) => c.id === cardId)
      if (target && target.zone === 'battlefield') {
        set({ cards: state.cards.map((c) => c.id === cardId ? { ...c, tapped: true } : c) })
      }
      break
    }
    case 'fight': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const target = state.cards.find((c) => c.id === cardId)
      if (source && target && source.zone === 'battlefield' && target.zone === 'battlefield') {
        const sourcePower = getCardPower(source)
        const targetPower = getCardPower(target)
        if (sourcePower > 0) get().addDamage(target.id, sourcePower)
        if (targetPower > 0) get().addDamage(source.id, targetPower)
      }
      break
    }
    case 'cast_from_graveyard': {
      // Free-cast the chosen graveyard/exiled card: move it to the battlefield
      // and enqueue its spell abilities.
      const card = state.cards.find((c) => c.id === cardId)
      if (!card || (card.zone !== 'graveyard' && card.zone !== 'exile')) break
      set({
        cards: state.cards.map((c) =>
          c.id === cardId ? { ...c, zone: 'battlefield' as const, tapped: false, revealed: true, enteredAtTurn: state.turn } : c,
        ),
      })
      const cast = get().cards.find((c) => c.id === cardId)
      if (cast) enqueueSpellAbilities(set as unknown as Parameters<typeof enqueueSpellAbilities>[0], get, cast)
      break
    }
    case 'double_counters': {
      set({
        cards: state.cards.map((c) =>
          c.id === cardId ? { ...c, counters: c.counters * 2, minusCounters: (c.minusCounters ?? 0) * 2 } : c,
        ),
      })
      break
    }
    case 'gain_control': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      set({
        cards: state.cards.map((c) =>
          c.id === cardId ? { ...c, owner: sourceOwner, originalOwner: (c.owner ?? 'player') === sourceOwner ? c.originalOwner : c.owner ?? 'player', controlUntilTurnEnd: params.temporary ? true : undefined } : c,
        ),
      })
      break
    }
    case 'remove_counters': {
      const target = state.cards.find((c) => c.id === cardId)
      if (target) {
        set({
          cards: state.cards.map((c) => {
            if (c.id !== cardId) return c
            if (params.amount === 'all') return { ...c, counters: 0, minusCounters: 0 }
            let remaining = numericAmount(params)
            const minus = Math.max(0, (c.minusCounters ?? 0) - remaining)
            remaining -= (c.minusCounters ?? 0) - minus
            return { ...c, minusCounters: minus, counters: Math.max(0, c.counters - remaining) }
          }),
        })
      }
      break
    }
    case 'pump': {
      const power = (params.power as number) ?? 0
      const toughness = (params.toughness as number) ?? 0
      set({
        cards: state.cards.map((c) =>
          c.id === cardId
            ? { ...c, powerBoost: (c.powerBoost ?? 0) + power, toughnessBoost: (c.toughnessBoost ?? 0) + toughness }
            : c,
        ),
      })
      break
    }
    case 'destroy': {
      const target = state.cards.find((c) => c.id === cardId)
      if (target) get().moveCard(cardId, 'graveyard')
      break
    }
    case 'deal_damage': {
      const amount = numericAmount(params)
      const target = state.cards.find((c) => c.id === cardId)
      if (target) get().addDamage(cardId, amount)
      break
    }
    case 'return_from_graveyard': {
      const zone = (params.zone as string) ?? 'battlefield'
      get().moveCard(cardId, zone as 'battlefield' | 'hand')
      break
    }
    case 'exile':
      get().moveCard(cardId, 'exile')
      break
  }
  set({
    triggerStack: get().triggerStack.filter((t) => t.id !== trigger.id),
  })
  get().checkStateBasedActions()
}

export function payWardImpl(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  const state = get()
  const prompt = state.wardPrompt
  if (!prompt) return
  const trigger = state.triggerStack.find((t) => t.id === prompt.triggerId)
  if (!trigger) {
    set({ wardPrompt: null })
    return
  }
  const cost = `{${prompt.cost}}`
  if (!canPayManaCost(state.manaPool, cost)) {
    // Cannot pay — the spell is countered.
    set({
      wardPrompt: null,
      triggerStack: state.triggerStack.filter((t) => t.id !== prompt.triggerId),
    })
    return
  }
  get().spendManaCost(cost, `Ward (${prompt.spellName})`)
  applyTargetedEffect(get, set, get(), trigger, prompt.targetCardId)
  set({ wardPrompt: null })
}

export function refuseWardImpl(get: () => GameState, set: (partial: Partial<GameState>) => void) {
  const state = get()
  const prompt = state.wardPrompt
  if (!prompt) return
  set({
    wardPrompt: null,
    triggerStack: state.triggerStack.filter((t) => t.id !== prompt.triggerId),
  })
}
