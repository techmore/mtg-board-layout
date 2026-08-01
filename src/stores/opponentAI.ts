import type { BoardCard, ManaColor } from '../types/card'
import { canPayManaCost, getCardPower, getCardToughness } from '../utils/misc'
import { hasKeyword } from './cardRulesLoader'

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

export function pickAttackers(battlefield: BoardCard[], currentTurn: number): string[] {
  return battlefield
    .filter((c) => c.type === 'creature' && !c.tapped)
    .filter((c) => c.enteredAtTurn === currentTurn ? hasKeyword(c, 'haste') : true)
    .map((c) => c.id)
}

export function pickBlockers(
  playerAttackers: string[],
  opponentBattlefield: BoardCard[],
  allCards: BoardCard[],
  currentTurn: number,
): Record<string, string[]> {
  const blockers: Record<string, string[]> = {}
  const available = opponentBattlefield.filter(
    (c) => c.type === 'creature' && !c.tapped && c.enteredAtTurn !== currentTurn,
  )
  const used = new Set<string>()

  for (const attId of playerAttackers) {
    const attacker = allCards.find((c) => c.id === attId)
    if (!attacker) continue
    const attPower = getCardPower(attacker)
    if (attPower === 0) continue
    const attackerFlying = hasKeyword(attacker, 'flying')
    const attackerDeathtouch = hasKeyword(attacker, 'deathtouch')

    const candidates = available
      .filter((b) => !used.has(b.id))
      .filter((b) => !attackerFlying || hasKeyword(b, 'flying') || hasKeyword(b, 'reach'))
      .sort((a, b) => {
        const aTough = getCardToughness(a)
        const bTough = getCardToughness(b)
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
      used.add(chosen.id)
      blockers[attId] = [chosen.id]
    }
  }

  return blockers
}
