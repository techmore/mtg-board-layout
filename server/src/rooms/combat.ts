/**
 * Pure multiplayer combat math. GameRoom applies the results; keeping the
 * computation here makes it unit-testable.
 *
 * v2: damage accumulates across combats (a 3/3 with 2 damage marked survives),
 * and keywords affect resolution (flying/reach blocking, first strike/double
 * strike damage order, trample overflow, lifelink, deathtouch, indestructible,
 * vigilance attack legality).
 */

export interface Combatant {
  id: string
  typeLine: string
  power?: string
  toughness?: string
  oracleText: string
  ownerId: string
  teamId: string
  damage: number
  tapped: boolean
}

/** P/T from the explicit field first; the type line is a fallback for
 * clients that never sent it. Accepts a bare type line for compatibility
 * with older call sites. */
export function parsePower(combatant: Pick<Combatant, 'typeLine' | 'power'> | string): number {
  const source = typeof combatant === 'string' ? { typeLine: combatant } : combatant
  if (source.power) {
    const n = parseInt(source.power, 10)
    if (!Number.isNaN(n)) return n
  }
  return parseInt(source.typeLine.match(/(\d+)\//)?.[1] ?? '0', 10)
}

export function parseToughness(combatant: Pick<Combatant, 'typeLine' | 'toughness'> | string): number {
  const source = typeof combatant === 'string' ? { typeLine: combatant } : combatant
  if (source.toughness) {
    const n = parseInt(source.toughness, 10)
    if (!Number.isNaN(n)) return n
  }
  return parseInt(source.typeLine.match(/\/(\d+)/)?.[1] ?? '0', 10)
}

/** Keywords are read from the oracle text's first line ("Flying, trample ..."). */
export function parseKeywords(oracleText: string): Set<string> {
  const keywords = new Set<string>()
  const firstLine = oracleText.split('\n')[0] ?? ''
  for (const keyword of ['flying', 'trample', 'first strike', 'double strike', 'lifelink', 'deathtouch', 'indestructible', 'reach', 'vigilance', 'haste']) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(firstLine)) keywords.add(keyword)
  }
  return keywords
}

export interface CombatResolution {
  /** damage to add to each involved card (attacker or blocker) */
  cardDamage: { cardId: string; amount: number }[]
  /** cards that die after the damage steps (damage >= toughness, deathtouch, non-indestructible) */
  deadIds: string[]
  /** unblocked / trampled damage dealt to each opposing player */
  playerDamage: { attackerId: string; defenderId: string; amount: number }[]
  /** lifelink gains by the attacker's owner */
  lifeGain: { ownerId: string; amount: number }[]
  /** attackerId -> assigned blocker ids (round-robin over declared attackers) */
  assignments: Record<string, string[]>
}

export function resolveCombat(
  attackers: Combatant[],
  blockerIds: string[],
  allPlayers: { id: string; teamId: string; battlefield: Combatant[] }[],
  attackerOwnerId: string,
  attackerTeamId: string,
): CombatResolution {
  const result: CombatResolution = { cardDamage: [], deadIds: [], playerDamage: [], lifeGain: [], assignments: {} }
  const attackerIds = attackers.map((a) => a.id)

  // Opposing players: everyone except the attacker, and (in team modes with a
  // real teamId like 'team1'/'team2') the attacker's teammates. In 1v1/4ffa
  // every player's teamId is '' — never treat '' as a shared team, or nobody
  // would ever take damage.
  const isOpponent = (player: { id: string; teamId: string }) =>
    player.id !== attackerOwnerId && (attackerTeamId === '' || player.teamId !== attackerTeamId)

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

  // Flying/reach block legality: non-flying/reach blockers can't block fliers.
  // (Applied by the caller before resolution is ideal, but we enforce here for
  // robustness: an illegal blocker assignment is ignored.)
  const validBlockers = new Map<string, string[]>()
  for (const attacker of attackers) {
    const aKeywords = parseKeywords(attacker.oracleText)
    const valid = (assigned[attackerIds.indexOf(attacker.id)] ?? []).filter((blockerId) => {
      const blocker = findCard(blockerId)
      if (!blocker || blocker.tapped) return false
      if (aKeywords.has('flying')) {
        const bKeywords = parseKeywords(blocker.oracleText)
        return bKeywords.has('flying') || bKeywords.has('reach')
      }
      return true
    })
    validBlockers.set(attacker.id, valid)
  }

  const damageTo = new Map<string, number>()
  const deathtouchHit = new Set<string>()
  const addDamage = (cardId: string, amount: number) => {
    damageTo.set(cardId, (damageTo.get(cardId) ?? 0) + amount)
  }

  const fast = (card: Combatant | undefined) => {
    if (!card) return false
    const k = parseKeywords(card.oracleText)
    return k.has('first strike') || k.has('double strike')
  }
  const dealsInRegularStep = (card: Combatant | undefined) => {
    if (!card) return false
    const k = parseKeywords(card.oracleText)
    return !(k.has('first strike') && !k.has('double strike'))
  }

  const blockedAttackers = attackers.filter((a) => (validBlockers.get(a.id) ?? []).length > 0)
  const unblocked = attackers.filter((a) => (validBlockers.get(a.id) ?? []).length === 0)

  const anyFast = blockedAttackers.some((a) => fast(a)) ||
    blockedAttackers.some((a) => fast(findCard((validBlockers.get(a.id) ?? [])[0])))

  // Damage pass helper: attacker deals to its first blocker (and vice versa).
  const dealPair = (attacker: Combatant, attackerDeals: boolean, blockerDeals: boolean) => {
    const blockers = validBlockers.get(attacker.id) ?? []
    const blocker = findCard(blockers[0])
    if (!blocker) return
    const aPower = parsePower(attacker)
    const bToughness = parseToughness(blocker)
    const bPower = parsePower(blocker)
    const aKeywords = parseKeywords(attacker.oracleText)

    if (attackerDeals && aPower > 0) {
      addDamage(blocker.id, aPower)
      if (aKeywords.has('deathtouch')) deathtouchHit.add(blocker.id)
      if (aKeywords.has('lifelink')) result.lifeGain.push({ ownerId: attacker.ownerId, amount: aPower })
      // Trample: excess spills to the defending player(s).
      if (aKeywords.has('trample')) {
        const excess = aPower - bToughness
        if (excess > 0) {
          for (const player of allPlayers) {
            if (!isOpponent(player)) continue
            result.playerDamage.push({ attackerId: attacker.id, defenderId: player.id, amount: excess })
          }
        }
      }
    }
    if (blockerDeals && bPower > 0) {
      addDamage(attacker.id, bPower)
      const bKeywords = parseKeywords(blocker.oracleText)
      if (bKeywords.has('deathtouch')) deathtouchHit.add(attacker.id)
      if (bKeywords.has('lifelink')) result.lifeGain.push({ ownerId: blocker.ownerId, amount: bPower })
    }
  }

  // First-strike damage step: any combatant with first/double strike deals;
  // blockers with first strike hit before regular attackers.
  if (anyFast) {
    for (const attacker of blockedAttackers) {
      const blockers = validBlockers.get(attacker.id) ?? []
      const blocker = findCard(blockers[0])
      const attackerFast = fast(attacker)
      const blockerFast = blocker ? fast(blocker) : false
      if (!attackerFast && !blockerFast) continue
      dealPair(attacker, attackerFast, blockerFast)
    }
    // Intermediate deaths: blockers/attackers killed by first-strike damage stop
    // before the regular step (indestructible survives).
    const midDead = new Set<string>()
    for (const attacker of blockedAttackers) {
      const blocker = findCard((validBlockers.get(attacker.id) ?? [])[0])
      if (!blocker) continue
      const bKeywords = parseKeywords(blocker.oracleText)
      const aKeywords = parseKeywords(attacker.oracleText)
      const bDamage = damageTo.get(blocker.id) ?? 0
      const aDamage = damageTo.get(attacker.id) ?? 0
      if (!bKeywords.has('indestructible') && (bDamage >= parseToughness(blocker) || (deathtouchHit.has(blocker.id) && bDamage >= 1))) midDead.add(blocker.id)
      if (!aKeywords.has('indestructible') && (aDamage >= parseToughness(attacker) || (deathtouchHit.has(attacker.id) && aDamage >= 1))) midDead.add(attacker.id)
    }
    // Regular step: survivors deal (non-first-strikers + double strikers again).
    for (const attacker of blockedAttackers) {
      const blocker = findCard((validBlockers.get(attacker.id) ?? [])[0])
      if (midDead.has(attacker.id)) continue
      if (!dealsInRegularStep(attacker)) continue
      if (blocker && midDead.has(blocker.id)) continue
      dealPair(attacker, dealsInRegularStep(attacker), blocker ? dealsInRegularStep(blocker) : false)
    }
  } else {
    for (const attacker of blockedAttackers) {
      const blocker = findCard((validBlockers.get(attacker.id) ?? [])[0])
      dealPair(attacker, true, Boolean(blocker))
    }
  }

  // Unblocked attackers deal to every opposing player.
  for (const attacker of unblocked) {
    const power = parsePower(attacker)
    if (power === 0) continue
    for (const player of allPlayers) {
      if (!isOpponent(player)) continue
      result.playerDamage.push({ attackerId: attacker.id, defenderId: player.id, amount: power })
    }
    const aKeywords = parseKeywords(attacker.oracleText)
    if (aKeywords.has('lifelink')) result.lifeGain.push({ ownerId: attacker.ownerId, amount: power })
  }

  // Deaths: accumulated damage >= toughness (or a deathtouch hit), unless
  // indestructible. Note this uses the PREVIOUS damage too (accumulated).
  for (const attacker of attackers) {
    const k = parseKeywords(attacker.oracleText)
    const total = attacker.damage + (damageTo.get(attacker.id) ?? 0)
    if (!k.has('indestructible') && (total >= parseToughness(attacker) || (deathtouchHit.has(attacker.id) && total >= 1))) {
      result.deadIds.push(attacker.id)
    }
  }
  for (const attacker of blockedAttackers) {
    const blockers = validBlockers.get(attacker.id) ?? []
    for (const blockerId of blockers) {
      const blocker = findCard(blockerId)
      if (!blocker) continue
      const k = parseKeywords(blocker.oracleText)
      const total = blocker.damage + (damageTo.get(blocker.id) ?? 0)
      if (!k.has('indestructible') && (total >= parseToughness(blocker) || (deathtouchHit.has(blocker.id) && total >= 1))) {
        result.deadIds.push(blockerId)
      }
    }
  }

  for (const [cardId, amount] of damageTo) {
    if (amount > 0) result.cardDamage.push({ cardId, amount })
  }

  return result
}
