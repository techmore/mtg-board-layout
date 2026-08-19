/**
 * Pure multiplayer combat math. GameRoom applies the results; keeping the
 * computation here makes it unit-testable.
 *
 * v2: damage accumulates across combats (a 3/3 with 2 damage marked survives),
 * and keywords affect resolution (flying/reach blocking, first strike/double
 * strike damage order, trample overflow, lifelink, deathtouch, indestructible,
 * vigilance attack legality).
 *
 * Keyword and P/T parsing comes from the shared `mtg-protocol/combat` module so
 * the server resolves them identically to the client's rules cache.
 */

import { canBlock, computeStaticPump, getStaticKeywords, parseKeywords, parsePower, parseToughness } from 'mtg-protocol/combat'

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
  enchantsCardId?: string
  cantBeBlockedThisTurn?: boolean
}

export { parseKeywords, parsePower, parseToughness }

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

  // Static anthem pumps ("creatures you control get +1/+1") modify every
  // combatant's effective P/T, matching the client's combat math.
  const allBattlefield = allPlayers.flatMap((p) => p.battlefield)
  const pumpSources = allBattlefield.map((c) => ({
    id: c.id, name: '', typeLine: c.typeLine, oracleText: c.oracleText, ownerId: c.ownerId, type: 'creature',
    enchantsCardId: c.enchantsCardId,
  }))
  const pumpCard = (c: Combatant) => ({ id: c.id, typeLine: c.typeLine, ownerId: c.ownerId, type: 'creature' as const })
  const effectivePower = (c: Combatant) => parsePower(c) + computeStaticPump(pumpSources, pumpCard(c)).power
  const effectiveToughness = (c: Combatant) => parseToughness(c) + computeStaticPump(pumpSources, pumpCard(c)).toughness

  // Keywords from the card's own text plus static anthems ("creatures you
  // control have haste").
  const keywordsFor = (c: Combatant): Set<string> => {
    const set = parseKeywords(c.oracleText)
    for (const keyword of getStaticKeywords({ ...pumpCard(c), oracleText: c.oracleText }, pumpSources)) set.add(keyword)
    return set
  }

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
  // Menace: an attacker with menace can only be blocked by two or more
  // creatures. (Applied by the caller before resolution is ideal, but we
  // enforce here for robustness: an illegal blocker assignment is ignored.)
  const validBlockers = new Map<string, string[]>()
  for (const attacker of attackers) {
    const aKeywords = keywordsFor(attacker)
    const valid = (assigned[attackerIds.indexOf(attacker.id)] ?? []).filter((blockerId) => {
      const blocker = findCard(blockerId)
      if (!blocker) return false
      if ((attacker as unknown as { cantBeBlockedThisTurn?: boolean }).cantBeBlockedThisTurn) return false
      if (!canBlock(blocker, allBattlefield)) return false
      // Skulk: can't be blocked by creatures with greater power.
      if (aKeywords.has('skulk') && parsePower(blocker) > parsePower(attacker)) return false
      if (aKeywords.has('flying')) {
        const bKeywords = keywordsFor(blocker)
        return bKeywords.has('flying') || bKeywords.has('reach')
      }
      return true
    })
    // Menace requires two or more blockers, as does a custom "can't be blocked
    // except by N or more creatures"; a single illegal assignment makes the
    // attacker unblocked.
    const exceptMatch = attacker.oracleText.match(/can't be blocked except by (\w+) or more creatures/i)
    const exceptCount = exceptMatch ? ({ two: 2, three: 3, four: 4, five: 5, six: 6 })[exceptMatch[1].toLowerCase()] ?? 2 : 0
    const minBlockers = Math.max(aKeywords.has('menace') ? 2 : 0, exceptCount)
    if (minBlockers > 0 && valid.length < minBlockers) {
      validBlockers.set(attacker.id, [])
    } else {
      validBlockers.set(attacker.id, valid)
    }
  }

  const damageTo = new Map<string, number>()
  const deathtouchHit = new Set<string>()
  const addDamage = (cardId: string, amount: number) => {
    damageTo.set(cardId, (damageTo.get(cardId) ?? 0) + amount)
  }

  const fast = (card: Combatant | undefined) => {
    if (!card) return false
    const k = keywordsFor(card)
    return k.has('first strike') || k.has('double strike')
  }
  const dealsInRegularStep = (card: Combatant | undefined) => {
    if (!card) return false
    const k = keywordsFor(card)
    return !(k.has('first strike') && !k.has('double strike'))
  }

  const blockedAttackers = attackers.filter((a) => (validBlockers.get(a.id) ?? []).length > 0)
  const unblocked = attackers.filter((a) => (validBlockers.get(a.id) ?? []).length === 0)

  const anyFast = blockedAttackers.some((a) => fast(a)) ||
    blockedAttackers.some((a) => fast(findCard((validBlockers.get(a.id) ?? [])[0])))

  // Damage pass helper: the attacker allocates damage across all its blockers
  // (lethal first, spilling to the next), and every blocker hits back.
  const dealPair = (attacker: Combatant, attackerDeals: boolean, blockerDeals: boolean) => {
    const blockers = (validBlockers.get(attacker.id) ?? [])
      .map((id) => findCard(id))
      .filter((c): c is Combatant => Boolean(c))
    if (blockers.length === 0) return
    const aPower = effectivePower(attacker)
    const aKeywords = keywordsFor(attacker)

    if (attackerDeals && aPower > 0) {
      let remaining = aPower
      for (const blocker of blockers) {
        if (remaining <= 0) break
        // Lethal accounts for damage already marked so trample spills more.
        const need = aKeywords.has('deathtouch')
          ? 1
          : Math.max(0, effectiveToughness(blocker) - blocker.damage)
        const dealt = Math.min(remaining, need)
        if (dealt > 0) {
          addDamage(blocker.id, dealt)
          if (aKeywords.has('deathtouch')) deathtouchHit.add(blocker.id)
        }
        remaining -= dealt
      }
      if (aKeywords.has('lifelink')) result.lifeGain.push({ ownerId: attacker.ownerId, amount: aPower })
      // Trample: damage left over after all blockers spills to the defending
      // player(s).
      if (aKeywords.has('trample') && remaining > 0) {
        for (const player of allPlayers) {
          if (!isOpponent(player)) continue
          result.playerDamage.push({ attackerId: attacker.id, defenderId: player.id, amount: remaining })
        }
      }
    }
    if (blockerDeals) {
      for (const blocker of blockers) {
        const bPower = effectivePower(blocker)
        if (bPower <= 0) continue
        addDamage(attacker.id, bPower)
        const bKeywords = keywordsFor(blocker)
        if (bKeywords.has('deathtouch')) deathtouchHit.add(attacker.id)
        if (bKeywords.has('lifelink')) result.lifeGain.push({ ownerId: blocker.ownerId, amount: bPower })
      }
    }
  }

  // First-strike damage step: any combatant with first/double strike deals;
  // blockers with first strike hit before regular attackers.
  if (anyFast) {
    for (const attacker of blockedAttackers) {
      const blockers = (validBlockers.get(attacker.id) ?? [])
        .map((id) => findCard(id))
        .filter((c): c is Combatant => Boolean(c))
      const attackerFast = fast(attacker)
      const blockerFast = blockers.some((b) => fast(b))
      if (!attackerFast && !blockerFast) continue
      dealPair(attacker, attackerFast, blockerFast)
    }
    // Intermediate deaths: blockers/attackers killed by first-strike damage stop
    // before the regular step (indestructible survives).
    const midDead = new Set<string>()
    for (const attacker of blockedAttackers) {
      const blockers = (validBlockers.get(attacker.id) ?? [])
        .map((id) => findCard(id))
        .filter((c): c is Combatant => Boolean(c))
      const aKeywords = keywordsFor(attacker)
      const aDamage = damageTo.get(attacker.id) ?? 0
      if (!aKeywords.has('indestructible') && (aDamage >= effectiveToughness(attacker) || (deathtouchHit.has(attacker.id) && aDamage >= 1))) midDead.add(attacker.id)
      for (const blocker of blockers) {
        const bKeywords = keywordsFor(blocker)
        const bDamage = damageTo.get(blocker.id) ?? 0
        if (!bKeywords.has('indestructible') && (bDamage >= effectiveToughness(blocker) || (deathtouchHit.has(blocker.id) && bDamage >= 1))) midDead.add(blocker.id)
      }
    }
    // Regular step: survivors deal (non-first-strikers + double strikers again).
    for (const attacker of blockedAttackers) {
      if (midDead.has(attacker.id)) continue
      if (!dealsInRegularStep(attacker)) continue
      const blockers = (validBlockers.get(attacker.id) ?? [])
        .map((id) => findCard(id))
        .filter((c): c is Combatant => Boolean(c))
      const liveBlockers = blockers.filter((b) => !midDead.has(b.id))
      if (liveBlockers.length > 0) {
        // Normal blocked exchange with the surviving blockers.
        dealPair(attacker, dealsInRegularStep(attacker), liveBlockers.some((b) => dealsInRegularStep(b)))
      } else if (keywordsFor(attacker).has('trample')) {
        // All blockers died in the first-strike step: a trampler may assign all
        // its damage to the player (CR 510.1c); other attackers stay blocked
        // and deal no combat damage.
        const power = effectivePower(attacker)
        if (power > 0) {
          for (const player of allPlayers) {
            if (!isOpponent(player)) continue
            result.playerDamage.push({ attackerId: attacker.id, defenderId: player.id, amount: power })
          }
          if (keywordsFor(attacker).has('lifelink')) result.lifeGain.push({ ownerId: attacker.ownerId, amount: power })
        }
      }
    }
  } else {
    for (const attacker of blockedAttackers) {
      const blockers = (validBlockers.get(attacker.id) ?? [])
        .map((id) => findCard(id))
        .filter((c): c is Combatant => Boolean(c))
      dealPair(attacker, true, blockers.length > 0)
    }
  }

  // Unblocked attackers deal to every opposing player.
  for (const attacker of unblocked) {
    const power = effectivePower(attacker)
    if (power === 0) continue
    for (const player of allPlayers) {
      if (!isOpponent(player)) continue
      result.playerDamage.push({ attackerId: attacker.id, defenderId: player.id, amount: power })
    }
    const aKeywords = keywordsFor(attacker)
    if (aKeywords.has('lifelink')) result.lifeGain.push({ ownerId: attacker.ownerId, amount: power })
  }

  // Deaths: accumulated damage >= toughness (or a deathtouch hit), unless
  // indestructible. Note this uses the PREVIOUS damage too (accumulated).
  for (const attacker of attackers) {
    const k = keywordsFor(attacker)
    const total = attacker.damage + (damageTo.get(attacker.id) ?? 0)
    if (!k.has('indestructible') && (total >= effectiveToughness(attacker) || (deathtouchHit.has(attacker.id) && total >= 1))) {
      result.deadIds.push(attacker.id)
    }
  }
  for (const attacker of blockedAttackers) {
    const blockers = validBlockers.get(attacker.id) ?? []
    for (const blockerId of blockers) {
      const blocker = findCard(blockerId)
      if (!blocker) continue
      const k = keywordsFor(blocker)
      const total = blocker.damage + (damageTo.get(blocker.id) ?? 0)
      if (!k.has('indestructible') && (total >= effectiveToughness(blocker) || (deathtouchHit.has(blocker.id) && total >= 1))) {
        result.deadIds.push(blockerId)
      }
    }
  }

  for (const [cardId, amount] of damageTo) {
    if (amount > 0) result.cardDamage.push({ cardId, amount })
  }

  return result
}
