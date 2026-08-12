import type { BoardCard, ManaColor } from '../types/card'
import { canPayManaCost, getCardPower, getCardToughness } from '../utils/misc'
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

export function pickAttackers(battlefield: BoardCard[], currentTurn: number, defenders: BoardCard[] = [], playerLife?: number, commanderDamage: Record<string, number> = {}): string[] {
  const candidates = battlefield
    .filter((c) => c.type === 'creature' && !c.tapped)
    .filter((c) => c.enteredAtTurn === currentTurn ? hasKeyword(c, 'haste') : true)
  if (candidates.length === 0) return []

  const threats = defenders.filter(
    (c) => c.type === 'creature' && !c.tapped && c.enteredAtTurn !== currentTurn && getCardPower(c) > 0,
  )

  // Free swing when the opponent can't block.
  if (threats.length === 0) return candidates.map((c) => c.id)

  // Fliers that no defender can block always attack.
  const flyers = candidates.filter((c) =>
    hasKeyword(c, 'flying') && !threats.some((d) => hasKeyword(d, 'flying') || hasKeyword(d, 'reach')),
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
): Record<string, string[]> {
  const blockers: Record<string, string[]> = {}
  const available = opponentBattlefield.filter(
    (c) => c.type === 'creature' && !c.tapped && c.enteredAtTurn !== currentTurn,
  )
  const used = new Set<string>()

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
    const attackerFlying = hasKeyword(attacker, 'flying')
    const attackerDeathtouch = hasKeyword(attacker, 'deathtouch')
    // A commander that reaches 21 commander damage with this swing is lethal
    // regardless of the AI's life total — block it at any cost.
    const commanderLethal = attacker.isCommander && (commanderDamage[attacker.id] ?? 0) + attPower >= 21

    const candidates = available
      .filter((b) => !used.has(b.id))
      .filter((b) => !attackerFlying || hasKeyword(b, 'flying') || hasKeyword(b, 'reach'))
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
