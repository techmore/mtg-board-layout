import type { BoardCard, ManaColor } from '../types/card'
import { canPayManaCost, getCardPower, getCardToughness } from '../utils/misc'
import { canAttack, canBlock } from 'mtg-protocol/combat'
import { hasKeyword, computeStaticPump } from './cardRulesLoader'

export function pickLand(hand: BoardCard[]): BoardCard | null {
  const lands = hand.filter((c) => c.type === 'land')
  return lands.length > 0 ? lands[0] : null
}

export function pickSpell(hand: BoardCard[], _battlefield: BoardCard[], manaPool: Record<ManaColor, number>): BoardCard | null {
  const playable = hand.filter((c) => c.type !== 'land' && c.manaCost && canPayManaCost(manaPool, c.manaCost))
  if (playable.length === 0) return null
  const creatures = playable.filter((c) => c.type === 'creature')
  return (creatures.length > 0 ? creatures : playable)[0]
}

export function pickCommanderCast(commandCards: BoardCard[], manaPool: Record<ManaColor, number>): { card: BoardCard; cost: string } | null {
  for (const card of commandCards) {
    if (!card.manaCost) continue
    const tax = card.commanderTax ?? 0
    const cost = card.manaCost + (tax > 0 ? `{${tax * 2}}` : '')
    if (canPayManaCost(manaPool, cost)) return { card, cost }
  }
  return null
}

export function pickAttackers(battlefield: BoardCard[], currentTurn: number, defenders: BoardCard[] = [], playerLife?: number, commanderDamage: Record<string, number> = {}, mustAttack = false): string[] {
  const candidates = battlefield
    .filter((c) => c.type === 'creature' && !c.tapped)
    .filter((c) => c.enteredAtTurn === currentTurn ? hasKeyword(c, 'haste', battlefield) : true)
    .filter((c) => canAttack(c, battlefield))
  if (candidates.length === 0) return []

  // Turn-scoped compulsion ("creatures your opponents control attack this turn
  // if able" — Bident of Thassa activation, Kardur's ETB).
  if (mustAttack) return candidates.map((c) => c.id)

  const threats = defenders.filter(
    (c) => c.type === 'creature' && !c.tapped && c.enteredAtTurn !== currentTurn && getCardPower(c) > 0,
  )

  // Must-attack compulsion ("creatures your opponents control attack this turn
  // if able"): the AI swings with everything it can.
  if (defenders.some((c) => /\battack(?:s|ed)? (?:each combat|this turn) if able\b/i.test(c.oracleText ?? ''))) {
    return candidates.map((c) => c.id)
  }

  // Free swing when the opponent can't block.
  if (threats.length === 0) return candidates.map((c) => c.id)

  // Fliers that no defender can block always attack.
  const flyers = candidates.filter((c) =>
    hasKeyword(c, 'flying', battlefield) && !threats.some((d) => hasKeyword(d, 'flying', defenders) || hasKeyword(d, 'reach', defenders)),
  )
  const ground = candidates.filter((c) => !flyers.includes(c))

  const ourPower = ground.reduce((sum, c) => sum + getCardPower(c) + computeStaticPump(battlefield, c).power, 0)
  const theirPower = threats.reduce((sum, c) => sum + getCardPower(c) + computeStaticPump(defenders, c).power, 0)

  const totalPower = ourPower + flyers.reduce((sum, c) => sum + getCardPower(c), 0)

  // Lethal by life: total attack power can end the game this turn.
  const lifeLethal = playerLife !== undefined && totalPower >= playerLife

  // Lethal by commander damage: a single commander swinging now reaches 21.
  const commanderLethal = candidates.some((c) =>
    c.isCommander && (commanderDamage[c.id] ?? 0) + getCardPower(c) >= 21,
  )

  if (lifeLethal || commanderLethal) {
    return candidates.map((c) => c.id)
  }

  // Attack on the ground only when the trade is not clearly unfavorable.
  const ids = ourPower >= theirPower ? ground.map((c) => c.id) : []
  return [...ids, ...flyers.map((c) => c.id)]
}

export function pickBlockers(
  playerAttackers: string[],
  opponentBattlefield: BoardCard[],
  allCards: BoardCard[],
  currentTurn: number,
  aiLife?: number,
  commanderDamage: Record<string, number> = {},
  aiRadCounters = 0,
  parityBan?: { parity: 'odd' | 'even'; untilTurn: number } | null,
  ring?: { player?: { temptations: number; bearerId: string | null }; opponent?: { temptations: number; bearerId: string | null } },
): Record<string, string[]> {
  const blockers: Record<string, string[]> = {}
  const aiHandSize = allCards.filter((c) => (c.owner ?? 'player') === 'opponent' && c.zone === 'hand').length
  const available = opponentBattlefield.filter(
    (c) => c.type === 'creature' && c.enteredAtTurn !== currentTurn
      && canBlock(c, allCards, { defenderRadCounters: aiRadCounters, handSize: aiHandSize })
      && !(parityBan && parityBan.untilTurn >= currentTurn && ((c.manaValue ?? 0) % 2 === 0) === (parityBan.parity === 'even')),
  )
  const used = new Set<string>()

  // "Must be blocked if able" (Frodo as Ring-bearer): assign a legal blocker
  // to that attacker first, before any trade evaluation.
  for (const attId of playerAttackers) {
    const attacker = allCards.find((c) => c.id === attId)
    if (!attacker || !/must be blocked if able/i.test(attacker.oracleText ?? '')) continue
    const legal = available.filter((b) => !used.has(b.id))
      .filter((b) => !hasKeyword(attacker, 'flying', allCards) || hasKeyword(b, 'flying', allCards) || hasKeyword(b, 'reach', allCards))
      .filter((b) => !hasKeyword(attacker, 'skulk', allCards) || getCardPower(b) <= getCardPower(attacker))
    if (legal.length > 0) {
      const chosen = legal.sort((a, b) => getCardPower(a) - getCardPower(b))[0]
      used.add(chosen.id)
      blockers[attId] = [chosen.id]
    }
  }

  const incomingPower = playerAttackers.reduce((sum, attId) => {
    const attacker = allCards.find((c) => c.id === attId)
    return sum + (attacker ? getCardPower(attacker) + computeStaticPump(allCards, attacker).power : 0)
  }, 0)
  const lethalIncoming = aiLife !== undefined && incomingPower >= aiLife

  for (const attId of playerAttackers) {
    const attacker = allCards.find((c) => c.id === attId)
    if (!attacker) continue
    const attPower = getCardPower(attacker) + computeStaticPump(allCards, attacker).power
    if (attPower === 0) continue
    const attackerFlying = hasKeyword(attacker, 'flying', allCards)
    const attackerDeathtouch = hasKeyword(attacker, 'deathtouch', allCards)
    // A commander that reaches 21 commander damage with this swing is lethal
    // regardless of the AI's life total — block it at any cost.
    const commanderLethal = attacker.isCommander && (commanderDamage[attacker.id] ?? 0) + attPower >= 21

    const candidates = available
      .filter((b) => !used.has(b.id))
      .filter((b) => !attackerFlying || hasKeyword(b, 'flying', allCards) || hasKeyword(b, 'reach', allCards))
      .filter((b) => !hasKeyword(attacker, 'skulk', allCards) || getCardPower(b) <= getCardPower(attacker))
      .filter((b) => {
        // The Ring L1: the Ring-bearer can't be blocked by greater power.
        const ringMine = ring?.[(attacker.owner ?? 'player') as 'player' | 'opponent']
        return !(ringMine && ringMine.temptations >= 1 && ringMine.bearerId === attacker.id && getCardPower(b) > getCardPower(attacker))
      })
      .sort((a, b) => {
        const aTough = getCardToughness(a) + computeStaticPump(allCards, a).toughness
        const bTough = getCardToughness(b) + computeStaticPump(allCards, b).toughness
        const aSurvives = attackerDeathtouch ? 0 : aTough >= attPower ? 1 : 0
        const bSurvives = attackerDeathtouch ? 0 : bTough >= attPower ? 1 : 0
        // Against deathtouch every blocker dies, so prefer the smallest trade.
        if (attackerDeathtouch) {
          return (getCardPower(a) - getCardPower(b))
        }
        return bSurvives - aSurvives || (getCardPower(a) - getCardPower(b))
      })

    if (candidates.length > 0) {
      const chosen = candidates[0]
      const chosenSurvives = getCardToughness(chosen) + computeStaticPump(allCards, chosen).toughness >= attPower
      // Block when the blocker survives, when lethal damage is incoming (block
      // at any cost), when the blocker trades favorably (kills the attacker),
      // or when the attacker is lethal by commander damage.
      const attackerDies = getCardPower(chosen) >= getCardToughness(attacker)
      if (lethalIncoming || commanderLethal || chosenSurvives || attackerDies) {
        used.add(chosen.id)
        blockers[attId] = [chosen.id]
      }
    }
  }

  return blockers
}
