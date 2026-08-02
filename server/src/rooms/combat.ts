/**
 * Pure multiplayer combat math. GameRoom applies the results; keeping the
 * computation here makes it unit-testable.
 */

export interface Combatant {
  id: string
  typeLine: string
  ownerId: string
  teamId: string
}

export function parsePower(typeLine: string): number {
  return parseInt(typeLine.match(/(\d+)\//)?.[1] ?? '0', 10)
}

export function parseToughness(typeLine: string): number {
  return parseInt(typeLine.match(/\/(\d+)/)?.[1] ?? '0', 10)
}

export interface CombatResolution {
  deadAttackerIds: string[]
  deadBlockerIds: string[]
  /** damage dealt by each unblocked attacker to each opposing player */
  damage: { attackerId: string; defenderId: string; amount: number }[]
  /** attackerId -> assigned blocker ids (round-robin over declared attackers) */
  assignments: Record<string, string[]>
}

/**
 * Resolve declared combat:
 * - Blockers are assigned round-robin across the declared attackers.
 * - Each blocked attacker fights its first blocker: lethal = power >= toughness.
 * - Unblocked attackers deal their power to every player not on their team.
 */
export function resolveCombat(
  attackers: Combatant[],
  blockerIds: string[],
  allPlayers: { id: string; teamId: string; battlefield: Combatant[] }[],
  attackerOwnerId: string,
  attackerTeamId: string,
): CombatResolution {
  const result: CombatResolution = { deadAttackerIds: [], deadBlockerIds: [], damage: [], assignments: {} }
  const attackerIds = attackers.map((a) => a.id)

  const findCard = (cardId: string): Combatant | undefined =>
    allPlayers.flatMap((p) => p.battlefield).find((c) => c.id === cardId)

  // Round-robin blocker assignment in declaration order.
  const assigned: string[][] = attackerIds.map(() => [])
  blockerIds.forEach((blockerId, index) => {
    if (attackerIds.length === 0) return
    assigned[index % attackerIds.length].push(blockerId)
  })
  attackerIds.forEach((attackerId, index) => {
    result.assignments[attackerId] = assigned[index]
  })

  for (const attacker of attackers) {
    const blockers = assigned[attackerIds.indexOf(attacker.id)]
    if (blockers.length > 0) {
      const blockerId = blockers[0]
      const blocker = findCard(blockerId)
      if (!blocker) continue
      const power = parsePower(attacker.typeLine)
      const toughness = parseToughness(attacker.typeLine)
      const blockerPower = parsePower(blocker.typeLine)
      const blockerToughness = parseToughness(blocker.typeLine)
      if (power >= blockerToughness) result.deadBlockerIds.push(blockerId)
      if (blockerPower >= toughness) result.deadAttackerIds.push(attacker.id)
    } else {
      const power = parsePower(attacker.typeLine)
      if (power === 0) continue
      for (const player of allPlayers) {
        if (player.id === attackerOwnerId || player.teamId === attackerTeamId) continue
        result.damage.push({ attackerId: attacker.id, defenderId: player.id, amount: power })
      }
    }
  }

  return result
}
