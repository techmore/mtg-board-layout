import type { BoardCard, ManaColor } from '../types/card'
import { canPayManaCost } from '../utils/misc'

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
    .filter((c) => c.type === 'creature' && !c.tapped && c.enteredAtTurn !== currentTurn)
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
    const attPower = parseInt(attacker.typeLine?.match(/(\d+)\//)?.[1] ?? '0')
    if (attPower === 0) continue

    const candidates = available
      .filter((b) => !used.has(b.id))
      .sort((a, b) => {
        const aTough = parseInt(a.typeLine?.match(/\/(\d+)/)?.[1] ?? '0')
        const bTough = parseInt(b.typeLine?.match(/\/(\d+)/)?.[1] ?? '0')
        const aSurvives = aTough >= attPower ? 1 : 0
        const bSurvives = bTough >= attPower ? 1 : 0
        return bSurvives - aSurvives || (parseInt(a.typeLine?.match(/(\d+)\//)?.[1] ?? '0') - parseInt(b.typeLine?.match(/(\d+)\//)?.[1] ?? '0'))
      })

    if (candidates.length > 0) {
      const chosen = candidates[0]
      used.add(chosen.id)
      blockers[attId] = [chosen.id]
    }
  }

  return blockers
}
