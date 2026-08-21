import type { GameState } from './gameStore'
import type { CardEffect, Token, TriggerInstance, BoardCard } from '../types/card'
import { CARD_BACK_URL } from '../constants'
import { canPayManaCost, getCardPower, getCardToughness, getCreaturePower, getCreatureToughness } from '../utils/misc'
import { hasKeyword, getCardRule, getCachedCardRules } from './cardRulesLoader'
import { attachAuras, updateCard, withGraveyardIntake } from './gameRules'
import { filterMatch } from '../components/Board/triggerUtils'
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
    case 'experience_counter': {
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      get().gainExperience(1, owner)
      break
    }
    case 'shuffle_into_library': {
      // "When {this} is put into a graveyard from anywhere, shuffle it into its
      // owner's library" (Worldspine Wurm).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (source) get().moveCard(source.id, 'library')
      break
    }
    case 'switch_power_toughness':
      // Targeted — resolved in applyTargetedEffect.
      break
    case 'gains_keyword': {
      // "Whenever a creature you control with power 2 or less attacks, it gains
      // skulk until end of turn" (MacCready) — the triggering attacker gets the
      // keyword boost until end of turn.
      const attacker = state.cards.find((c) => c.id === trigger.sourceCardId)
      const keyword = params.keyword as string | undefined
      if (attacker && keyword) {
        set({
          cards: updateCard(state.cards, attacker.id, {
            keywordBoosts: [...new Set([...(attacker.keywordBoosts ?? []), keyword])],
          }),
        })
      }
      break
    }
    case 'x_pump': {
      // "gets +X/+0 until end of turn, where X is the greatest power among
      // creatures you control" (Orcish Siegemaster).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      let x = 0
      if (params.x_source === 'greatest_power') {
        x = Math.max(0, ...state.cards
          .filter((c) => (c.owner ?? 'player') === owner && c.zone === 'battlefield' && c.type === 'creature')
          .map((c) => getCardPower(c)))
      } else if (params.x_source === 'counters') {
        x = source?.counters ?? 1
      } else if (params.x_source === 'energy') {
        x = owner === 'player' ? state.energyCounters : state.opponentEnergyCounters
      } else if (params.x_source === 'auras') {
        x = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'battlefield' && c.enchantsCardId === source?.id).length || 1
      } else if (params.x_source === 'experience') {
        x = owner === 'player' ? state.experienceCounters : state.opponentExperienceCounters
      }
      const power = params.power === 'x' ? x : typeof params.power === 'number' ? params.power : parseInt(String(params.power), 10) || 0
      const toughness = params.toughness === 'x' ? x : typeof params.toughness === 'number' ? params.toughness : parseInt(String(params.toughness), 10) || 0
      if (source && params.scope === 'own_creatures') {
        // Team X-pump ("Creatures you control get +X/+X … where X is the
        // number of experience counters" — Azlask).
        set({
          cards: state.cards.map((c) =>
            c.zone === 'battlefield' && c.type === 'creature' && (c.owner ?? 'player') === owner
              ? { ...c, powerBoost: (c.powerBoost ?? 0) + power, toughnessBoost: (c.toughnessBoost ?? 0) + toughness }
              : c,
          ),
        })
      } else if (source) {
        set({ cards: updateCard(state.cards, source.id, { powerBoost: (source.powerBoost ?? 0) + power, toughnessBoost: (source.toughnessBoost ?? 0) + toughness }) })
      }
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
    case 'amass': {
      // "Amass Orcs N" — put N +1/+1 counters on an Army you control, or create
      // a 0/0 black Orc Army creature token with N counters.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const amount = numericAmount(params)
      const existingArmy = state.tokens.find((t) => (t.owner ?? 'player') === owner && /\barmy\b/i.test(t.name))
      if (existingArmy) {
        set({ tokens: state.tokens.map((t) => t.id === existingArmy.id ? { ...t, counters: t.counters + amount } : t) })
      } else {
        const token: Token = {
          id: crypto.randomUUID(),
          name: 'Orc Army',
          imageUri: CARD_BACK_URL,
          counters: amount,
          tapped: false,
          power: amount,
          toughness: amount,
          type: 'creature',
          owner,
        }
        get().addToken(token)
      }
      break
    }
    case 'investigate': {
      // Investigate — create a Clue token (an artifact you can sacrifice to
      // draw. The sacrifice-to-draw is a manual action via the token UI).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const token: Token = {
        id: crypto.randomUUID(),
        name: 'Clue',
        imageUri: CARD_BACK_URL,
        counters: 0,
        tapped: false,
        owner: (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player',
      }
      get().addToken(token)
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
          cards[index] = { ...top, zone: 'battlefield' as const, tapped: false, revealed: false, facedown: true, typeLine: 'Creature 2/2', type: 'creature', enteredAtTurn: state.turn, counters: 0, manifestOriginal: { typeLine: top.typeLine, type: top.type } }
        }
        nextId = cards.find((c) => (c.owner ?? 'player') === owner && c.zone === 'library')?.id
      }
      set({ cards })
      break
    }
    case 'untap_enchanted': {
      // Untap each enchanted permanent you control (Preston Garvey).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      set({
        cards: state.cards.map((c) =>
          (c.owner ?? 'player') === sourceOwner && c.zone === 'battlefield' && c.enchantsCardId ? { ...c, tapped: false } : c,
        ),
      })
      break
    }
    case 'target_player_mill': {
      // "Target player mills N cards" (The Mouth of Sauron) — mill the
      // opponent's library.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const targetOwner = sourceOwner === 'player' ? 'opponent' : 'player'
      const amount = numericAmount(params)
      const lib = state.cards.filter((c) => (c.owner ?? 'player') === targetOwner && c.zone === 'library')
      const milledIds = new Set(lib.slice(0, Math.min(amount, lib.length)).map((c) => c.id))
      if (milledIds.size > 0) {
        const nextCards = state.cards.map((c) =>
          milledIds.has(c.id) ? { ...c, zone: 'graveyard' as const, revealed: true } : c)
        set({ cards: nextCards, ...withGraveyardIntake(state, nextCards) })
      }
      break
    }
    case 'untap_target': {
      // "Untap up to two target lands" (Pip-Boy 3000) — handled via
      // applyTargetedEffect (targeted).
      break
    }
    case 'tap_x_myr': {
      // "Whenever this creature attacks, you may tap X untapped Myr you
      // control" (Myr Battlesphere) — simplified: tap all your untapped Myr
      // creatures.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const myr = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'battlefield' && c.type === 'creature' && !c.tapped && /myr/i.test(c.name))
      if (myr.length > 0) {
        set({ cards: state.cards.map((c) => myr.some((m) => m.id === c.id) ? { ...c, tapped: true } : c) })
      }
      break
    }
    case 'each_player_mill': {
      // Each player mills a card (Raul, Trouble Shooter).
      const mill = (owner: 'player' | 'opponent') => {
        const lib = state.cards.find((c) => (c.owner ?? 'player') === owner && c.zone === 'library')
        return lib
      }
      const targets = [mill('player'), mill('opponent')].filter((c): c is BoardCard => Boolean(c))
      if (targets.length > 0) {
        const ids = new Set(targets.map((c) => c.id))
        const nextCards = state.cards.map((c) =>
          ids.has(c.id) ? { ...c, zone: 'graveyard' as const, revealed: true } : c)
        set({ cards: nextCards, ...withGraveyardIntake(state, nextCards) })
      }
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
    case 'sacrifice_n_permanents':
    case 'exile_n_permanents': {
      // "Whenever this creature attacks, defending player sacrifices/exiles N
      // permanents" (Eldrazi Conscription / Bane of Bala Ged).
      const amount = numericAmount(params)
      const attacker = state.cards.find((c) => c.id === trigger.sourceCardId)
      const attackerOwner = attacker?.owner ?? 'player'
      const defenders = state.cards
        .filter((c) => c.zone === 'battlefield' && (c.owner ?? 'player') !== attackerOwner)
        .sort((a, b) => (a.type === 'land' ? 10 : 0) + getCardPower(a) / 1000 - ((b.type === 'land' ? 10 : 0) + getCardPower(b) / 1000))
      const victims = defenders.slice(0, amount)
      for (const victim of victims) {
        get().moveCard(victim.id, effect.kind === 'exile_n_permanents' ? 'exile' : 'graveyard')
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
    case 'discover':
    case 'cascade': {
      // Discover N (Chimil) / Cascade: reveal from the top of the source
      // owner's library until a card with mana value <= N, exile the rest,
      // then free-cast the found card's spell.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = (source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
      const n = effect.kind === 'discover' ? numericAmount(params) : 5
      const library = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'library')
      const foundIndex = library.findIndex((c) => (c.manaValue ?? 0) <= n)
      const exileCount = foundIndex >= 0 ? foundIndex : library.length
      for (let i = 0; i < exileCount; i++) {
        const exiled = library[i]
        if (exiled) set({ cards: get().cards.map((c) => c.id === exiled.id ? { ...c, zone: 'exile' as const, revealed: true } : c) })
      }
      if (foundIndex >= 0) {
        const found = library[foundIndex]
        const free = get().cards.find((c) => c.id === found?.id)
        if (free) {
          set({ cards: get().cards.map((c) => c.id === free.id ? { ...c, zone: 'battlefield' as const, tapped: false, revealed: true, enteredAtTurn: state.turn } : c) })
          enqueueSpellAbilities(set as unknown as Parameters<typeof enqueueSpellAbilities>[0], get, free)
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
    case 'copy_spell': {
      // "When you cast this spell, copy it" (Brass Knuckles) — re-enqueue the
      // source spell's abilities and resolve them.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const rule = source ? getCardRule(source.name, getCachedCardRules()) : undefined
      const spellAbilities = (rule?.abilities ?? []).filter((a) => a.abilityType === 'spell')
      if (spellAbilities.length > 0) {
        const copyInstances: TriggerInstance[] = spellAbilities.map((ability) => ({
          id: crypto.randomUUID(),
          sourceCardId: trigger.sourceCardId,
          sourceCardName: trigger.sourceCardName,
          ability,
          event: 'cast' as const,
          context: {},
        }))
        set({
          triggerStack: [...state.triggerStack, ...copyInstances],
        })
        for (const inst of copyInstances) get().resolveTrigger(inst.id)
      }
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
      const milled = new Set(library.slice(0, amount).map((c) => c.id))
      if (milled.size > 0) {
        const nextCards = state.cards.map((c) =>
          milled.has(c.id) ? { ...c, zone: 'graveyard' as const, revealed: true } : c)
        set({ cards: nextCards, ...withGraveyardIntake(state, nextCards) })
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
    case 'monstrosity': {
      // "{5}{B}{G}: Monstrosity 4" — pay to put that many +1/+1 counters on
      // this creature.
      const amount = numericAmount(params)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (source) {
        for (let i = 0; i < amount; i++) get().addCounter(source.id)
        useToastStore.getState().push(`${source.name} becomes monstrous (+${amount}/+${amount}).`, 'info')
      }
      break
    }
    case 'untap_self': {
      // "{3}: Untap this artifact" (Basalt Monolith).
      set({ cards: updateCard(state.cards, trigger.sourceCardId, { tapped: false }) })
      break
    }
    case 'copy_ability': {
      // Abstruse Archaic: "{1}, {T}: Copy target activated or triggered ability
      // you control from a colorless source." Ability instances aren't cards,
      // so targeting is deterministic: re-resolve the most recent ability
      // resolved THIS TURN by the same side from a colorless source.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const snap = state.lastResolvedAbility
      const snapSource = snap ? state.cards.find((c) => c.id === snap.sourceCardId) : undefined
      const colorless = Boolean(snapSource && !/\{[WUBRG]\}/i.test(snapSource.manaCost ?? ''))
      if (!snap || snap.turn !== state.turn || snap.owner !== owner || !colorless || snap.ability.effect.kind === 'copy_ability') {
        useToastStore.getState().push(`${trigger.sourceCardName}: no copyable colorless-source ability resolved this turn.`, 'error')
        break
      }
      const synthetic: TriggerInstance = {
        id: crypto.randomUUID(),
        sourceCardId: snap.sourceCardId,
        sourceCardName: snap.sourceCardName,
        ability: snap.ability,
        event: 'cast',
        context: {},
      }
      set({ triggerStack: [...get().triggerStack, synthetic] })
      useToastStore.getState().push(
        `${trigger.sourceCardName} copies ${snap.sourceCardName}'s ability (${snap.ability.effect.kind}).`,
        'info',
      )
      if (synthetic.ability.targets > 0) {
        // Deterministic target for the copy: first valid battlefield card.
        const candidate = get().cards.find((c) =>
          c.zone === 'battlefield' &&
          c.id !== snap.sourceCardId &&
          filterMatch(snap.ability.targetFilter, c) &&
          !(hasKeyword(c, 'hexproof') && (c.owner ?? 'player') !== owner))
        if (!candidate) {
          set({ triggerStack: get().triggerStack.filter((t) => t.id !== synthetic.id) })
          useToastStore.getState().push('The copied ability has no legal target and fizzles.', 'error')
        } else {
          get().selectTarget(synthetic.id, candidate.id, true)
        }
      } else {
        get().resolveTrigger(synthetic.id)
      }
      break
    }
    case 'graveyard_intake_mill': {
      // Fraying Sanity: "enchanted player mills X cards, where X is the number
      // of cards put into their graveyard from anywhere this turn". The curse
      // enchants the opposing side.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player')
      const enchanted = sourceOwner === 'player' ? 'opponent' : 'player'
      const intake = (state.graveyardIntake ?? { player: 0, opponent: 0 })[enchanted]
      if (intake <= 0) {
        useToastStore.getState().push(`Fraying Sanity: no cards entered ${enchanted === 'player' ? "your" : "the opponent's"} graveyard this turn.`, 'info')
        break
      }
      const lib = state.cards.filter((c) => (c.owner ?? 'player') === enchanted && c.zone === 'library')
      const milledIds = new Set(lib.slice(0, Math.min(intake, lib.length)).map((c) => c.id))
      const nextCards = state.cards.map((c) =>
        milledIds.has(c.id) ? { ...c, zone: 'graveyard' as const, revealed: true } : c)
      set({ cards: nextCards, ...withGraveyardIntake(state, nextCards) })
      useToastStore.getState().push(
        `Fraying Sanity mills ${milledIds.size} card(s) ${enchanted === 'player' ? 'from your library' : "from the opponent's library"} (X=${intake}).`,
        'info',
      )
      break
    }
    case 'ring_tempts': {
      // "The Ring tempts you": increment the side's temptation count and choose
      // (or keep) a Ring-bearer — the strongest creature the side controls.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const cur = get().ring ?? {}
      const mine = cur[owner] ?? { temptations: 0, bearerId: null }
      const creatures = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature' && (c.owner ?? 'player') === owner)
      const bearer = creatures.find((c) => c.id === mine.bearerId)
        ?? [...creatures].sort((a, b) => getCardPower(b) - getCardPower(a))[0]
      set({
        ring: { ...cur, [owner]: { temptations: mine.temptations + 1, bearerId: bearer?.id ?? null } },
      })
      useToastStore.getState().push(
        `The Ring tempts ${owner === 'player' ? 'you' : 'the opponent'} (${mine.temptations + 1})${bearer ? ` — ${bearer.name} is the Ring-bearer` : ''}.`,
        'info',
      )
      break
    }
    case 'force_attack': {
      // "Creatures your opponents control attack this turn if able" (Bident of
      // Thassa activation; Kardur's ETB lasts until the controller's next turn).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const duration = /until your next turn/i.test(trigger.ability.triggerCondition || params.description as string || '') ? 2 : 1
      set({ forceAttack: { victims: sourceOwner === 'player' ? 'opponent' : 'player', untilTurn: state.turn + duration } })
      break
    }
    case 'parity_ban': {
      // "Whenever you attack, choose odd or even. Creatures with mana value of
      // that quality can't block this turn." Deterministic: ban the parity that
      // covers more opposing creatures.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const foes = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature' && (c.owner ?? 'player') !== sourceOwner)
      const even = foes.filter((c) => (c.manaValue ?? 0) % 2 === 0).length
      const odd = foes.length - even
      set({ parityBan: { parity: odd > even ? 'odd' : 'even', untilTurn: state.turn } })
      useToastStore.getState().push(`Twins of Discord: creatures with ${odd > even ? 'odd' : 'even'} mana value can't block this turn.`, 'info')
      break
    }
    case 'first_spell_damage': {
      // Vial Smasher / The Lord of Pain: on the first spell each turn, deal
      // damage equal to that spell's mana value to an opposing player.
      const event = trigger.context.gameEvent as { type?: string; cardId?: string } | undefined
      const castCard = event?.cardId ? state.cards.find((c) => c.id === event.cardId) : undefined
      const mv = castCard?.manaValue ?? 1
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      if (sourceOwner === 'player') {
        set({ opponentLifeTotal: Math.max(0, get().opponentLifeTotal - mv) })
        if (get().opponentLifeTotal <= 0 && !get().gameOver) {
          set({ turnAnnouncement: { id: Date.now(), text: 'OPPONENT DEFEATED' }, gameOver: { winner: 'player' } })
        }
      } else {
        get().setLife(Math.max(0, get().lifeTotal - mv))
        if (get().lifeTotal <= 0 && !get().gameOver) {
          set({ turnAnnouncement: { id: Date.now(), text: 'YOU DEFEATED' }, gameOver: { winner: 'opponent' } })
        }
      }
      useToastStore.getState().push(`${trigger.sourceCardName} deals ${mv} damage to ${sourceOwner === 'player' ? 'the opponent' : 'you'}.`, 'info')
      break
    }
    case 'graveyard_to_library': {
      // Endurance: "up to one target player puts all the cards from their
      // graveyard on the bottom of their library."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const grave = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'graveyard')
      for (const card of grave) get().moveCard(card.id, 'library')
      if (grave.length > 0) useToastStore.getState().push(`${grave.length} card(s) put on the bottom of the library.`, 'info')
      break
    }
    case 'loot_optional': {
      // Veronica: "you may discard a card. If you do, draw a card." Auto-do
      // when there is a spare card.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const hand = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'hand')
      if (hand.length >= 2) {
        get().moveCard(hand[hand.length - 1].id, 'graveyard')
        get().drawCards(1)
      }
      break
    }
    case 'discard_hand_draw': {
      // Sauron: "you may discard your hand. If you do, draw four cards."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const hand = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'hand')
      const draw = typeof params.amount === 'number' ? params.amount : 4
      if (hand.length >= draw) {
        for (const card of hand) get().moveCard(card.id, 'graveyard')
        get().drawCards(draw)
      }
      break
    }
    case 'animate_self': {
      // "This permanent becomes an X/Y … creature [with keywords] until end of
      // turn" (Cacophony Unleashed 6/6 menace+deathtouch; Bespoke Battlewagon
      // keeps its printed P/T). Reverts at the turn handoff via originalType.
      const card = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (card && card.zone === 'battlefield') {
        set({
          cards: updateCard(state.cards, card.id, {
            originalType: card.type,
            type: 'creature',
            powerBoost: typeof params.power === 'number' ? params.power : 0,
            toughnessBoost: typeof params.toughness === 'number' ? params.toughness : 0,
            keywordBoosts: Array.isArray(params.keywords) ? params.keywords as string[] : [],
          }),
        })
      }
      break
    }
    case 'untap_x_lands': {
      // Shriekwood Devourer: "untap up to X lands, where X is the greatest
      // power among those creatures."
      const attackers = state.combatState.attackers
        .map((id) => state.cards.find((c) => c.id === id))
        .filter((c): c is BoardCard => Boolean(c))
      const x = Math.max(0, ...attackers.map((a) => getCardPower(a)))
      const lands = state.cards
        .filter((c) => (c.owner ?? 'player') === ((state.cards.find((s) => s.id === trigger.sourceCardId)?.owner ?? 'player')) && c.zone === 'battlefield' && c.type === 'land' && c.tapped)
        .slice(0, x)
      set({ cards: state.cards.map((c) => lands.some((l) => l.id === c.id) ? { ...c, tapped: false } : c) })
      break
    }
    case 'sacrifice_small_make_tokens': {
      // Angelic Aberration: "sacrifice any number of creatures each with base
      // power or toughness 1 or less. Create that many 4/4 … Eldrazi Angel
      // tokens with flying and vigilance."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const small = state.cards.filter((c) =>
        c.zone === 'battlefield' && c.type === 'creature' && (c.owner ?? 'player') === owner &&
        getCreaturePower(c.typeLine) <= 1 && getCreatureToughness(c.typeLine) <= 1)
      for (const victim of small) get().moveCard(victim.id, 'graveyard')
      for (let i = 0; i < small.length; i++) {
        get().addToken({
          id: crypto.randomUUID(), name: 'Eldrazi Angel', imageUri: CARD_BACK_URL, counters: 0, tapped: false,
          power: 4, toughness: 4, type: 'creature', owner,
        })
      }
      if (small.length > 0) useToastStore.getState().push(`Sacrificed ${small.length} small creature(s); created ${small.length} 4/4 Eldrazi Angel token(s).`, 'info')
      break
    }
    case 'quest_death_tokens': {
      // Yes Man: "When Yes Man leaves the battlefield, its owner creates a
      // tapped 1/1 white Soldier creature token for each quest counter on it."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const n = source?.questCounters ?? 0
      for (let i = 0; i < n; i++) {
        get().addToken({
          id: crypto.randomUUID(), name: 'Soldier', imageUri: CARD_BACK_URL, counters: 0,
          tapped: true, power: 1, toughness: 1, type: 'creature', owner,
        })
      }
      if (n > 0) useToastStore.getState().push(`Yes Man's Wild Card: created ${n} tapped 1/1 Soldier token(s).`, 'info')
      break
    }
    case 'yes_man_give': {
      // Yes Man: "Target opponent gains control of Yes Man. When they do, you
      // draw two cards and put a quest counter on Yes Man." (Player targets
      // resolve as the opposing side.)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (!source) break
      const newOwner: 'player' | 'opponent' = (source.owner ?? 'player') === 'player' ? 'opponent' : 'player'
      set({
        cards: state.cards.map((c) =>
          c.id === source.id ? { ...c, owner: newOwner, questCounters: (c.questCounters ?? 0) + 1 } : c,
        ),
      })
      if ((source.owner ?? 'player') === 'player') get().drawCards(2)
      useToastStore.getState().push('Yes Man defects to the opponent — you draw two cards.', 'info')
      break
    }
    case 'forge_of_heroes': {
      // Forge of Heroes: "Choose target commander that entered this turn. Put a
      // +1/+1 counter on it if it's a creature and a loyalty counter if it's a
      // planeswalker." (Commander targets resolve deterministically.)
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const commander = state.cards.find((c) => c.isCommander && c.enteredAtTurn === state.turn && c.zone === 'battlefield' && (c.owner ?? 'player') === owner)
      if (commander) {
        get().addCounter(commander.id, commander.type === 'planeswalker' ? ('+1/+1' as const) : '+1/+1')
        useToastStore.getState().push(`Forge of Heroes puts a counter on ${commander.name}.`, 'info')
      }
      break
    }
    case 'skyclave_return': {
      // Skyclave Apparition death trigger: "the exiled card's owner creates an
      // X/X blue Illusion creature token, where X is the mana value of the
      // exiled card."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const mv = source?.exiledWithMV
      if (!mv) break
      const tokenOwner = (source?.exiledCardOwner ?? 'player') as 'player' | 'opponent'
      get().addToken({
        id: crypto.randomUUID(), name: 'Illusion', imageUri: CARD_BACK_URL, counters: 0,
        tapped: false, power: mv, toughness: mv, type: 'creature', owner: tokenOwner,
      })
      useToastStore.getState().push(`Skyclave Apparition's bargain: the exiled card's owner creates a ${mv}/${mv} Illusion token.`, 'info')
      break
    }
    case 'partner_tutor': {
      // Merry/Pippin: "Partner with X (When this creature enters, target player
      // may put X into their hand from their library, then shuffle.)"
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const partnerName = (source?.oracleText ?? '').match(/Partner with ([^.(]+)/i)?.[1]?.trim()
      if (!partnerName || !source) break
      const partner = state.cards.find((c) => (c.owner ?? 'player') === (source.owner ?? 'player') && c.zone === 'library' && c.name.toLowerCase() === partnerName.toLowerCase())
      if (partner) {
        get().moveCard(partner.id, 'hand')
        useToastStore.getState().push(`Partner: ${partner.name} put into hand from the library.`, 'info')
      }
      break
    }
    case 'populate': {
      // Cayth modal "Choose one — Populate / Proliferate": proliferate when
      // there are counters to grow, otherwise populate (copy the strongest
      // token you control).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const countered = state.cards.filter((c) =>
        c.zone === 'battlefield' && (c.owner ?? 'player') === owner &&
        (c.type === 'planeswalker' || (c.counters ?? 0) > 0))
      if (countered.length > 0) {
        set({
          cards: state.cards.map((c) =>
            c.zone === 'battlefield' && (c.owner ?? 'player') === owner && (c.type === 'planeswalker' || (c.counters ?? 0) > 0)
              ? { ...c, counters: (c.counters ?? 0) + 1 }
              : c,
          ),
        })
        useToastStore.getState().push('Cayth: proliferate — each permanent with counters grows.', 'info')
        break
      }
      const tokens = state.tokens.filter((t) => (t.owner ?? 'player') === owner)
      const best = [...tokens].sort((a, b) => (b.power ?? 0) + (b.toughness ?? 0) - ((a.power ?? 0) + (a.toughness ?? 0)))[0]
      if (best) {
        get().addToken({ ...best, id: crypto.randomUUID() })
        useToastStore.getState().push(`Populate: copied ${best.name} token.`, 'info')
      } else {
        useToastStore.getState().push('Populate: no token to copy.', 'error')
      }
      break
    }
    case 'manifest_flip': {
      // Ugin's Mastery: turn a face-down creature face up (only worthwhile when
      // attacking with total power 6+; the trigger condition is checked here).
      const attackers = state.combatState.attackers
        .map((id) => state.cards.find((c) => c.id === id))
        .filter((c): c is BoardCard => Boolean(c))
      const totalPower = attackers.reduce((sum, a) => sum + getCardPower(a), 0)
      if (totalPower < 6) break
      const facedown = state.cards
        .filter((c) => c.zone === 'battlefield' && c.facedown && (c.owner ?? 'player') === ((state.cards.find((s) => s.id === trigger.sourceCardId)?.owner ?? 'player')))
        .sort((a, b) => (b.manaValue ?? 0) - (a.manaValue ?? 0))[0]
      if (!facedown?.manifestOriginal) break
      set({
        cards: updateCard(state.cards, facedown.id, {
          facedown: false,
          typeLine: facedown.manifestOriginal.typeLine,
          type: facedown.manifestOriginal.type,
          manifestOriginal: undefined,
        }),
      })
      useToastStore.getState().push(`${facedown.name} turned face up.`, 'info')
      break
    }
    case 'enable_graveyard_cast': {
      // Desdemona / Ghost Ark / Filigree Racer: escape/unearth/jump-start is
      // granted until end of turn. The AI casts its best eligible card
      // immediately; the player gets a window and chooses what to cast
      // (right-click a graveyard card).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const filter = String(params.cardFilter ?? '')
      if (owner === 'player') {
        set({ graveyardCast: { owner, untilTurn: state.turn, filter } })
        useToastStore.getState().push(
          `${source?.name ?? 'The effect'}: your graveyard cards may be cast this turn — right-click one.`,
          'info',
        )
        break
      }
      const eligible = state.cards.filter((c) => {
        if ((c.owner ?? 'player') !== owner || c.zone !== 'graveyard') return false
        if (/artifact creature/i.test(filter)) return c.type === 'creature' && /artifact/i.test(c.typeLine)
        if (/instant or sorcery/i.test(filter)) return c.type === 'instant' || c.type === 'sorcery'
        return c.type === 'creature' || c.type === 'artifact' || ((c.manaValue ?? 99) <= 3)
      })
      const pick = [...eligible].sort((a, b) => (b.manaValue ?? 0) - (a.manaValue ?? 0))[0]
      if (!pick) break
      if (pick.type === 'instant' || pick.type === 'sorcery') {
        get().moveCard(pick.id, 'exile')
        enqueueSpellAbilities(set as Parameters<typeof enqueueSpellAbilities>[0], get, { ...pick, zone: 'exile' })
        useToastStore.getState().push(`${pick.name} cast from the graveyard.`, 'info')
      } else {
        set({ cards: updateCard(get().cards, pick.id, { zone: 'battlefield', tapped: true, enteredAtTurn: state.turn }) })
        useToastStore.getState().push(`${pick.name} returned from the graveyard to the battlefield.`, 'info')
      }
      break
    }
    case 'anrakyr_life_cast': {
      // Anrakyr: "cast an artifact spell from your hand or graveyard by paying
      // life equal to its mana value rather than paying its mana cost."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const pool = owner === 'player'
        ? state.cards.filter((c) => (c.owner ?? 'player') === 'player' && (c.zone === 'hand' || c.zone === 'graveyard') && /artifact/i.test(c.typeLine) && c.type !== 'creature')
        : state.cards.filter((c) => (c.owner ?? 'player') === 'opponent' && (c.zone === 'hand' || c.zone === 'graveyard') && /artifact/i.test(c.typeLine) && c.type !== 'creature')
      const life = owner === 'player' ? get().lifeTotal : get().opponentLifeTotal
      const pick = [...pool].filter((c) => (c.manaValue ?? 99) > 0 && (c.manaValue ?? 99) < life - 5)
        .sort((a, b) => (b.manaValue ?? 0) - (a.manaValue ?? 0))[0]
      if (!pick) break
      const cost = pick.manaValue ?? 1
      if (owner === 'player') get().setLife(Math.max(0, get().lifeTotal - cost))
      else set({ opponentLifeTotal: Math.max(0, get().opponentLifeTotal - cost) })
      set({ cards: updateCard(get().cards, pick.id, { zone: 'battlefield', tapped: false, enteredAtTurn: state.turn }) })
      useToastStore.getState().push(`${trigger.sourceCardName} pays ${cost} life to deploy ${pick.name}.`, 'info')
      break
    }
    case 'three_dog_aura_copies': {
      // Three Dog: pay {2} and sacrifice an attached Aura → copy it onto each
      // other attacking creature.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (!source) break
      const aura = state.cards.find((c) => c.enchantsCardId === source.id && /aura/i.test(c.typeLine))
      const others = state.combatState.attackers.filter((id) => id !== source.id)
      if (!aura || others.length === 0 || !canPayManaCost(get().manaPool, '{2}')) break
      get().spendManaCost('{2}', 'Three Dog aura copies')
      get().moveCard(aura.id, 'graveyard')
      let nextCards = get().cards
      for (const attackerId of others) {
        const copy: BoardCard = { ...aura, id: crypto.randomUUID(), enchantsCardId: attackerId, zone: 'battlefield' }
        nextCards = [...nextCards, copy]
      }
      set({ cards: nextCards })
      useToastStore.getState().push(`Copied ${aura.name} onto ${others.length} other attacking creature(s).`, 'info')
      break
    }
    case 'lobelia_drain': {
      // Lobelia modal (auto-picked): each opponent loses 2 life, you gain 2.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      if (owner === 'player') {
        set({ opponentLifeTotal: Math.max(0, get().opponentLifeTotal - 2) })
        get().setLife(get().lifeTotal + 2)
      } else {
        get().setLife(Math.max(0, get().lifeTotal - 2))
        set({ opponentLifeTotal: get().opponentLifeTotal + 2 })
      }
      break
    }
    case 'arcane_lighthouse_strip': {
      // Arcane Lighthouse: creatures your opponents control lose hexproof and
      // shroud until end of turn.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      set({ keywordsStrippedUntil: { owner: owner === 'player' ? 'opponent' : 'player', turn: state.turn } })
      useToastStore.getState().push("Opposing creatures lose hexproof and shroud until end of turn.", 'info')
      break
    }
    case 'energy_reanimate': {
      // Jolted Awake: gain {E}{E}, then pay MV energy to return an artifact or
      // creature from the graveyard to the battlefield.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      get().gainEnergy(2, owner)
      const energy = owner === 'player' ? get().energyCounters : get().opponentEnergyCounters
      const eligible = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'graveyard' && (c.type === 'creature' || c.type === 'artifact'))
      const pick = [...eligible].filter((c) => (c.manaValue ?? 0) <= energy).sort((a, b) => (b.manaValue ?? 0) - (a.manaValue ?? 0))[0]
      if (!pick) break
      get().spendEnergy(pick.manaValue ?? 0, owner)
      set({ cards: updateCard(get().cards, pick.id, { zone: 'battlefield', tapped: false, enteredAtTurn: state.turn }) })
      useToastStore.getState().push(`${pick.name} returned from the graveyard.`, 'info')
      break
    }
    case 'bounce_n_nonland': {
      // Aether Gale: "Return six target nonland permanents to their owners'
      // hands." Deterministic: the six most valuable opposing nonland permanents.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const victims = state.cards
        .filter((c) => c.zone === 'battlefield' && c.type !== 'land' && (c.owner ?? 'player') !== owner)
        .sort((a, b) => (b.manaValue ?? 0) - (a.manaValue ?? 0))
        .slice(0, typeof params.count === 'number' ? params.count : 6)
      for (const victim of victims) get().moveCard(victim.id, 'hand')
      if (victims.length > 0) useToastStore.getState().push(`Returned ${victims.length} nonland permanent(s) to their owners' hands.`, 'info')
      break
    }
    case 'destroy_equal_toughness': {
      // V.A.T.S.: destroy any number of target creatures with equal toughness —
      // deterministic: the largest equal-toughness group among opposing creatures.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const foes = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature' && (c.owner ?? 'player') !== owner)
      const byTough = new Map<number, BoardCard[]>()
      for (const foe of foes) {
        const t = getCreatureToughness(foe.typeLine)
        byTough.set(t, [...(byTough.get(t) ?? []), foe])
      }
      const bestGroup = [...byTough.values()].sort((a, b) => b.length - a.length)[0] ?? []
      for (const victim of bestGroup) get().moveCard(victim.id, 'graveyard')
      if (bestGroup.length > 0) useToastStore.getState().push(`V.A.T.S. destroyed ${bestGroup.length} creature(s) with equal toughness.`, 'info')
      break
    }
    case 'war_in_heaven_reanimate': {
      // The War in Heaven III: return up to three creature cards with total MV
      // ≤ 8 from the graveyard to the battlefield (greedy by MV).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const eligible = state.cards
        .filter((c) => (c.owner ?? 'player') === owner && c.zone === 'graveyard' && c.type === 'creature')
        .sort((a, b) => (b.manaValue ?? 0) - (a.manaValue ?? 0))
      let budget = 8
      let taken = 0
      for (const card of eligible) {
        if (taken >= 3) break
        const mv = card.manaValue ?? 0
        if (mv <= budget) {
          budget -= mv
          taken++
          set({ cards: updateCard(get().cards, card.id, { zone: 'battlefield', tapped: false, enteredAtTurn: state.turn }) })
        }
      }
      if (taken > 0) useToastStore.getState().push(`The War in Heaven returned ${taken} creature(s) to the battlefield.`, 'info')
      break
    }
    case 'benthic_copy': {
      // Benthic Anomaly: for each opponent choose a creature they control;
      // create a colorless Eldrazi token copying one with combined P/T (solo:
      // the single strongest opposing creature).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const best = state.cards
        .filter((c) => c.zone === 'battlefield' && c.type === 'creature' && (c.owner ?? 'player') !== owner)
        .sort((a, b) => getCardPower(b) - getCardPower(a))[0]
      if (!best) break
      get().addToken({
        id: crypto.randomUUID(),
        name: `${best.name}`,
        imageUri: CARD_BACK_URL,
        counters: 0,
        tapped: false,
        power: getCardPower(best),
        toughness: getCreatureToughness(best.typeLine),
        type: 'creature',
        owner,
      })
      useToastStore.getState().push(`Benthic Anomaly creates a copy of ${best.name} as a colorless Eldrazi.`, 'info')
      break
    }
    case 'disorienting_ramp': {
      // Disorienting Choice: the chosen controller keeps their permanent (the
      // AI declines to exile), so search your library for that many land cards
      // and put them onto the battlefield tapped.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const land = state.cards.find((c) => (c.owner ?? 'player') === owner && c.zone === 'library' && c.type === 'land')
      if (land) {
        set({ cards: updateCard(get().cards, land.id, { zone: 'battlefield', tapped: true, enteredAtTurn: state.turn }) })
        useToastStore.getState().push(`Disorienting Choice: ${land.name} put onto the battlefield tapped.`, 'info')
      }
      break
    }
    case 'slithermuse_draw': {
      // Slithermuse: choose an opponent; if they have more cards in hand than
      // you, draw the difference.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const mine = state.cards.filter((c) => (c.owner ?? 'player') === owner && c.zone === 'hand').length
      const theirs = state.cards.filter((c) => (c.owner ?? 'player') !== owner && c.zone === 'hand').length
      if (theirs > mine) get().drawCards(theirs - mine)
      break
    }
    case 'poison_diff': {
      // Vraska −9: "If target player has fewer than nine poison counters, they
      // get a number of poison counters equal to the difference."
      const poison = get().poisonCounters ?? { player: 0, opponent: 0 }
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const owner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const victim = owner === 'player' ? 'opponent' : 'player'
      const current = poison[victim]
      if (current < 9) {
        const added = 9 - current
        const next = { ...poison, [victim]: current + added }
        set({ poisonCounters: next })
        useToastStore.getState().push(`${victim === 'player' ? 'You get' : 'The opponent gets'} ${added} poison counter(s).`, 'info')
        if (next[victim] >= 10) {
          set({
            turnAnnouncement: { id: Date.now(), text: victim === 'player' ? 'YOU DEFEATED — poison' : 'OPPONENT DEFEATED — poison' },
            gameOver: { winner: victim === 'player' ? 'opponent' : 'player' },
          })
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

  // Snapshot for ability-copy effects (Abstruse Archaic): remember this
  // instance as the most recent ability resolved this turn.
  {
    const src = state.cards.find((c) => c.id === trigger.sourceCardId)
    set({
      lastResolvedAbility: {
        sourceCardId: trigger.sourceCardId,
        sourceCardName: trigger.sourceCardName,
        owner: (src?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player',
        turn: state.turn,
        ability: trigger.ability,
      },
    })
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
        set({ cards: updateCard(state.cards, cardId, { cantBeBlockedThisTurn: true }) })
      }
      break
    }
    case 'move_counter': {
      // "Move a counter from target permanent you control onto a second target
      // permanent" — resolve as: move one +1/+1 counter from the source to the
      // chosen target (the "second" target).
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (source && source.counters > 0) {
        // Move from the source card to the targeted permanent.
        set({
          cards: updateCard(updateCard(state.cards, trigger.sourceCardId, { counters: source.counters - 1 }), cardId, {
            counters: (state.cards.find((c) => c.id === cardId)?.counters ?? 0) + 1,
          }),
        })
      } else if (source && source.type === 'land') {
        // Diamond City: move a shield counter (modeled as +1/+1) from this land
        // onto the target creature.
        if ((source.counters ?? 0) > 0) {
          set({
            cards: updateCard(updateCard(state.cards, trigger.sourceCardId, { counters: source.counters - 1 }), cardId, {
              counters: (state.cards.find((c) => c.id === cardId)?.counters ?? 0) + 1,
            }),
          })
        } else {
          // No counter to move — gain one on the target (approximation).
          set({ cards: updateCard(state.cards, cardId, { counters: (state.cards.find((c) => c.id === cardId)?.counters ?? 0) + 1 }) })
        }
      }
      break
    }
    case 'exchange_life_toughness': {
      // "Exchange target opponent's life total with this creature's toughness"
      // (Tree of Perdition). Player-targeting isn't modeled, so this resolves
      // against the opponent's life total.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (!source) break
      const toughness = getCardToughness(source)
      if ((source.owner ?? 'player') === 'opponent') set({ lifeTotal: toughness })
      else set({ opponentLifeTotal: toughness })
      break
    }
    case 'tap_target': {
      const target = state.cards.find((c) => c.id === cardId)
      if (target && target.zone === 'battlefield') {
        set({ cards: updateCard(state.cards, cardId, { tapped: true }) })
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
    case 'detach_reattach': {
      // "Attach this Equipment/Aura to target creature you control" and
      // "attach this Aura to that creature" (Prison Term). Re-attach the source
      // permanent to the chosen target.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (source) {
        set({
          cards: updateCard(state.cards, source.id, { enchantsCardId: cardId }),
        })
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
    case 'regenerate': {
      // "Regenerate target X" — grant indestructible until end of turn (the
      // app's regeneration model).
      const target = state.cards.find((c) => c.id === cardId)
      if (target && target.zone === 'battlefield') {
        set({
          cards: updateCard(state.cards, target.id, {
            keywordBoosts: [...new Set([...(target.keywordBoosts ?? []), 'indestructible'])],
          }),
        })
      }
      break
    }
    case 'attach_target': {
      // "Attach target Aura/Equipment to target creature you control" —
      // re-attach the source permanent to the chosen creature.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (source) {
        set({
          cards: updateCard(state.cards, source.id, { enchantsCardId: cardId }),
        })
      }
      break
    }
    case 'become_copy': {
      // Mirage Mirror: "{2}: This artifact becomes a copy of target artifact,
      // creature, enchantment, or land until end of turn." Swap the printed
      // identity — combat stats follow typeLine and rules lookups follow name,
      // so the copy's abilities/production work — and restore at the turn
      // handoff via cloneOriginal.
      const mirror = state.cards.find((c) => c.id === trigger.sourceCardId)
      const target = state.cards.find((c) => c.id === cardId)
      if (!mirror || !target || mirror.id === target.id || target.zone !== 'battlefield') break
      set({
        cards: updateCard(state.cards, mirror.id, {
          cloneOriginal: mirror.cloneOriginal ?? {
            name: mirror.name,
            typeLine: mirror.typeLine,
            subtypes: [...mirror.subtypes],
            oracleText: mirror.oracleText,
            manaProduction: mirror.manaProduction,
          },
          name: target.name,
          typeLine: target.typeLine,
          subtypes: [...target.subtypes],
          oracleText: target.oracleText,
          manaProduction: target.manaProduction,
        }),
      })
      useToastStore.getState().push(`${mirror.name} became a copy of ${target.name} until end of turn.`, 'info')
      break
    }
    case 'skyclave_exile': {
      // Skyclave Apparition ETB: exile up to one target nonland, nontoken
      // permanent you don't control with MV ≤ 4; remember its MV + owner so the
      // death trigger can create the Illusion token.
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const target = state.cards.find((c) => c.id === cardId)
      if (!source || !target) break
      if ((target.manaValue ?? 0) > 4 || target.type === 'land') break
      set({
        cards: state.cards.map((c) =>
          c.id === cardId
            ? { ...c, zone: 'exile' as const }
            : c.id === source.id
              ? { ...c, exiledWithMV: target.manaValue ?? 0, exiledCardOwner: target.owner ?? 'player' }
              : c,
        ),
      })
      break
    }
    case 'cryptek_mark': {
      // Cryptek: "When that creature dies this turn, return it to the
      // battlefield tapped under your control."
      set({ cards: updateCard(state.cards, cardId, { reanimateOnDeathTurn: state.turn }) })
      break
    }
    case 'star_athlete_choice': {
      // Star Athlete: "Its controller may sacrifice it. If they don't, this
      // creature deals 5 damage to that player." The AI sacrifices only weak
      // or token permanents; otherwise it takes the 5.
      const target = state.cards.find((c) => c.id === cardId)
      if (!target) break
      const owner = (target.owner ?? 'player') as 'player' | 'opponent'
      const weak = target.tokenCount !== undefined || (getCreatureToughness(target.typeLine) <= 2 && target.type === 'creature')
      if (weak && (owner === 'opponent' || true)) {
        get().moveCard(target.id, 'graveyard')
        useToastStore.getState().push(`${target.name}'s controller sacrifices it.`, 'info')
      } else {
        if (owner === 'player') get().setLife(Math.max(0, get().lifeTotal - 5))
        else set({ opponentLifeTotal: Math.max(0, get().opponentLifeTotal - 5) })
        useToastStore.getState().push(`${trigger.sourceCardName} deals 5 damage to ${owner === 'player' ? 'you' : 'the opponent'}.`, 'info')
      }
      break
    }
    case 'chaos_warp': {
      // Chaos Warp: "The owner of target permanent shuffles it into their
      // library, then reveals the top card … If it's a permanent card, they put
      // it onto the battlefield."
      const target = state.cards.find((c) => c.id === cardId)
      if (!target) break
      const owner = (target.owner ?? 'player') as 'player' | 'opponent'
      get().moveCard(target.id, 'library')
      const top = get().cards.find((c) => (c.owner ?? 'player') === owner && c.zone === 'library')
      if (top && top.type !== 'instant' && top.type !== 'sorcery') {
        set({ cards: updateCard(get().cards, top.id, { zone: 'battlefield', tapped: false, enteredAtTurn: state.turn }) })
        useToastStore.getState().push(`Chaos Warp reveals ${top.name} — onto the battlefield.`, 'info')
      } else if (top) {
        useToastStore.getState().push(`Chaos Warp reveals ${top.name} — not a permanent, stays on top.`, 'info')
      }
      break
    }
    case 'confiscation_energy': {
      // Confiscation Coup: "You get {E}{E}{E}{E}, then you may pay an amount of
      // {E} equal to that permanent's mana value. If you do, gain control of it."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const sourceOwner = ((source?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player') as 'player' | 'opponent'
      const target = state.cards.find((c) => c.id === cardId)
      if (!target) break
      get().gainEnergy(4, sourceOwner)
      const energy = sourceOwner === 'player' ? get().energyCounters : get().opponentEnergyCounters
      const mv = target.manaValue ?? 0
      if (energy >= mv) {
        get().spendEnergy(mv, sourceOwner)
        set({
          cards: state.cards.map((c) =>
            c.id === cardId ? { ...c, owner: sourceOwner, originalOwner: c.owner ?? 'player', controlUntilTurnEnd: undefined } : c,
          ),
        })
        useToastStore.getState().push(`Confiscation Coup: gained control of ${target.name}.`, 'info')
      }
      break
    }
    case 'tyrite_sanctum': {
      // Tyrite Sanctum: "Target legendary creature becomes a God in addition to
      // its other types. Put a +1/+1 counter on it."
      const target = state.cards.find((c) => c.id === cardId)
      if (target?.zone === 'battlefield') {
        get().addCounter(cardId, '+1/+1')
        useToastStore.getState().push(`${target.name} becomes a God in addition to its other types.`, 'info')
      }
      break
    }
    case 'suspended_sentence': {
      // Suspended Sentence: "Destroy target creature an opponent controls. That
      // player loses 3 life. Exile Suspended Sentence with three time counters
      // on it." The suspend recast ticks at the owner's upkeep
      // (processSuspendedCards) and free-recasts at zero.
      const target = state.cards.find((c) => c.id === cardId)
      if (target?.zone === 'battlefield') {
        get().moveCard(target.id, 'graveyard')
        const owner = (target.owner ?? 'player') as 'player' | 'opponent'
        if (owner === 'player') get().setLife(Math.max(0, get().lifeTotal - 3))
        else set({ opponentLifeTotal: Math.max(0, get().opponentLifeTotal - 3) })
      }
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      if (source) {
        const word = source.oracleText?.match(/exile [^.]*?with (\w+) time counters/i)?.[1]
        const amount = word ? ({ one: 1, two: 2, three: 3, four: 4, five: 5 }[word.toLowerCase()] ?? 3) : 3
        // Base on fresh state — the destroy above already moved cards.
        set({
          cards: updateCard(get().cards, source.id, {
            zone: 'exile',
            revealed: true,
            suspendTimeCounters: amount,
          }),
        })
        useToastStore.getState().push(`${source.name} is suspended — exiled with ${amount} time counters.`, 'info')
      }
      break
    }
    case 'black_gate': {
      // The Black Gate: "Choose a player with the most life … Target creature
      // can't be blocked by creatures that player controls this turn." Solo:
      // the single opposing side IS the most-life player, so the chosen
      // creature becomes unblockable this turn.
      const target = state.cards.find((c) => c.id === cardId)
      if (target?.zone === 'battlefield') {
        set({ cards: updateCard(state.cards, target.id, { cantBeBlockedThisTurn: true }) })
        useToastStore.getState().push(`${target.name} can't be blocked by the player with the most life this turn.`, 'info')
      }
      break
    }
    case 'animate_target_temp': {
      // Destiny Spinner: "Target land you control becomes an X/X Elemental
      // creature with trample and haste until end of turn, where X is the
      // number of enchantments you control."
      const source = state.cards.find((c) => c.id === trigger.sourceCardId)
      const target = state.cards.find((c) => c.id === cardId)
      if (!target || target.zone !== 'battlefield' || !source) break
      const owner = (source.owner ?? 'player') as 'player' | 'opponent'
      const x = state.cards.filter((c) => c.zone === 'battlefield' && c.type === 'enchantment' && (c.owner ?? 'player') === owner).length
      set({
        cards: updateCard(state.cards, target.id, {
          originalType: target.type,
          type: 'creature',
          powerBoost: x,
          toughnessBoost: x,
          keywordBoosts: ['trample', 'haste'],
        }),
      })
      useToastStore.getState().push(`${target.name} becomes a ${x}/${x} Elemental creature with trample and haste.`, 'info')
      break
    }
    case 'roll_dice': {
      // "Roll a six-sided die" / "Roll X six-sided dice" — roll and toast.
      const sides = 6
      const count = numericAmount(params) || 1
      let total = 0
      for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1
      useToastStore.getState().push(`🎲 Rolled ${count}d${sides}: ${total}`, 'info')
      break
    }
    case 'untap_target': {
      const target = state.cards.find((c) => c.id === cardId)
      if (target && target.zone === 'battlefield') {
        set({ cards: updateCard(state.cards, target.id, { tapped: false }) })
      }
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
    case 'double_equipped_power': {
      // "Double equipped creature's power until end of turn" (Junk Jet). The
      // equipped creature is the target.
      const target = state.cards.find((c) => c.id === cardId)
      if (target && target.zone === 'battlefield') {
        const base = getCreaturePower(target.typeLine ?? '')
        set({
          cards: updateCard(state.cards, target.id, { powerBoost: (target.powerBoost ?? 0) + base }),
        })
      }
      break
    }
    case 'switch_power_toughness': {
      const target = state.cards.find((c) => c.id === cardId)
      if (target && target.type === 'creature') {
        const baseP = getCreaturePower(target.typeLine ?? '')
        const baseT = getCreatureToughness(target.typeLine ?? '')
        set({
          cards: updateCard(state.cards, target.id, {
            powerBoost: (target.powerBoost ?? 0) + (baseT - baseP),
            toughnessBoost: (target.toughnessBoost ?? 0) + (baseP - baseT),
          }),
        })
      }
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
  // Snapshot for ability-copy effects (Abstruse Archaic) — targeted abilities
  // resolve here, so record them the same way.
  {
    const src = state.cards.find((c) => c.id === trigger.sourceCardId)
    set({
      lastResolvedAbility: {
        sourceCardId: trigger.sourceCardId,
        sourceCardName: trigger.sourceCardName,
        owner: (src?.owner ?? 'player') === 'opponent' ? 'opponent' : 'player',
        turn: state.turn,
        ability: trigger.ability,
      },
    })
  }
  set({
    triggerStack: get().triggerStack.filter((t) => t.id !== trigger.id),
  })
  get().checkStateBasedActions()
}

/**
 * Suspend ticking (Suspended Sentence): at the beginning of the owner's upkeep,
 * remove a time counter from each of their suspended cards. When the last is
 * removed, cast it without paying its mana cost — deterministically destroying
 * the strongest opposing creature and draining 3, which re-suspends it (the
 * loop ends only when no legal target exists).
 */
export function processSuspendedCards(get: () => GameState, set: (partial: Partial<GameState>) => void, owner: 'player' | 'opponent') {
  const state = get()
  const suspended = state.cards.filter((c) => c.zone === 'exile' && (c.owner ?? 'player') === owner && (c.suspendTimeCounters ?? 0) > 0)
  for (const card of suspended) {
    const remaining = (card.suspendTimeCounters ?? 0) - 1
    if (remaining > 0) {
      set({ cards: updateCard(get().cards, card.id, { suspendTimeCounters: remaining }) })
      useToastStore.getState().push(`Suspend: ${card.name} — ${remaining} time counter(s) left.`, 'info')
      continue
    }
    // Last counter removed: free-cast it. Find the strongest opposing creature.
    const enemyOwner = owner === 'player' ? 'opponent' : 'player'
    const target = [...get().cards]
      .filter((c) => c.zone === 'battlefield' && c.type === 'creature' && (c.owner ?? 'player') === enemyOwner)
      .sort((a, b) => getCardPower(b) - getCardPower(a))[0]
    if (!target) {
      // No legal target: the cast can't be made; leave it exiled at zero and
      // retry on a later upkeep.
      set({ cards: updateCard(get().cards, card.id, { suspendTimeCounters: 0 }) })
      continue
    }
    const current = get()
    get().moveCard(target.id, 'graveyard')
    if (enemyOwner === 'player') get().setLife(Math.max(0, get().lifeTotal - 3))
    else set({ opponentLifeTotal: Math.max(0, current.opponentLifeTotal - 3) })
    const word = card.oracleText?.match(/exile [^.]*?with (\w+) time counters/i)?.[1]
    const amount = word ? ({ one: 1, two: 2, three: 3, four: 4, five: 5 }[word.toLowerCase()] ?? 3) : 3
    set({ cards: updateCard(get().cards, card.id, { suspendTimeCounters: amount }) })
    useToastStore.getState().push(
      `Suspend recast: ${card.name} destroys ${target.name}, drains 3, and suspends again with ${amount} time counters.`,
      'info',
    )
  }
}

/**
 * Whether a card can be cast through the active graveyard-cast window
 * (escape/unearth/jump-start): same-side graveyard card matching the
 * effect's filter.
 */
export function graveyardCastEligible(card: BoardCard, filter: string, owner: 'player' | 'opponent'): boolean {
  if ((card.owner ?? 'player') !== owner || card.zone !== 'graveyard') return false
  if (/artifact creature/i.test(filter)) return card.type === 'creature' && /artifact/i.test(card.typeLine)
  if (/instant or sorcery/i.test(filter)) return card.type === 'instant' || card.type === 'sorcery'
  return card.type === 'creature' || card.type === 'artifact' || ((card.manaValue ?? 99) <= 3)
}

/** Player-facing cast from the graveyard through the active until-EOT window. */
export function castFromGraveyardImpl(get: () => GameState, set: (partial: Partial<GameState>) => void, cardId: string) {
  const state = get()
  const window = state.graveyardCast
  if (!window || window.untilTurn < state.turn) return
  const card = state.cards.find((c) => c.id === cardId)
  if (!card || !graveyardCastEligible(card, window.filter, window.owner)) return
  if (card.type === 'instant' || card.type === 'sorcery') {
    get().moveCard(cardId, 'exile')
    enqueueSpellAbilities(set as unknown as Parameters<typeof enqueueSpellAbilities>[0], get, { ...card, zone: 'exile' })
    useToastStore.getState().push(`${card.name} cast from the graveyard (jump-start).`, 'info')
  } else {
    set({ cards: updateCard(get().cards, cardId, { zone: 'battlefield', tapped: true, enteredAtTurn: state.turn }) })
    get().emitGameEvent({ type: 'etb', cardId, cardName: card.name })
    useToastStore.getState().push(`${card.name} returned from the graveyard to the battlefield.`, 'info')
  }
}

export function payWardImpl(get: () => GameState, set: (partial: Partial<GameState>) => void) {  const state = get()
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
