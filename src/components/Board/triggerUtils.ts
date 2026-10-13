import type { BoardCard, TriggerInstance } from '../../types/card'

/** How many modes a "Choose one/two/three —" card lets its controller pick. */
export function modalChoiceCount(oracleText: string | undefined): number {
  const m = oracleText?.match(/\bchoose (one|two|three)\b/i)
  return m ? ({ one: 1, two: 2, three: 3 }[m[1].toLowerCase()] ?? 1) : 1
}

export interface ModalRun {
  /** Trigger-instance ids in this group, in stack order. */
  ids: string[]
  sourceCardId: string
  sourceCardName: string
  /** Modes still awaiting a decision (never mid-targeting). */
  instances: TriggerInstance[]
  maxChoices: number
}

/**
 * Group consecutive modal-mode instances ("Choose one/two —" spells parse as
 * several optional abilities from the same source) so the stack can present
 * them as one picker instead of independent Resolve/Skip rows.
 */
export function groupModalRuns(
  stack: TriggerInstance[],
  oracleTextOf: (sourceCardName: string) => string,
): ModalRun[] {
  const runs: ModalRun[] = []
  let index = 0
  while (index < stack.length - 1) {
    const first = stack[index]
    const second = stack[index + 1]
    const eligible = (t: TriggerInstance) =>
      t.ability.isOptional && t.selectedTargets === undefined
    if (first.sourceCardId !== second.sourceCardId || !eligible(first) || !eligible(second)) {
      index++
      continue
    }
    const instances = [first, second]
    let cursor = index + 2
    while (cursor < stack.length) {
      const next = stack[cursor]
      if (next.sourceCardId !== first.sourceCardId || !eligible(next)) break
      instances.push(next)
      cursor++
    }
    runs.push({
      ids: instances.map((t) => t.id),
      sourceCardId: first.sourceCardId,
      sourceCardName: first.sourceCardName,
      instances,
      maxChoices: Math.min(modalChoiceCount(oracleTextOf(first.sourceCardName)), instances.length),
    })
    index = cursor
  }
  return runs
}

export function targetsForEffect(kind: string, cards: BoardCard[]): BoardCard[] {
  if (kind === 'return_from_graveyard' || kind === 'cast_from_graveyard') {
    return cards.filter((card) => card.zone === 'graveyard' || card.zone === 'exile')
  }
  return cards.filter((card) => card.zone === 'battlefield')
}

export function filterMatch(filter: string | null, card: BoardCard): boolean {
  if (!filter) return true
  const low = filter.toLowerCase()
  const type = card.type.toLowerCase()

  const wantsPermanent = low.includes('permanent')
  const wantsCreature = low.includes('creature')
  const wantsLand = low.includes('land')
  const wantsEnchantment = low.includes('enchantment')
  const wantsArtifact = low.includes('artifact')
  const wantsPlaneswalker = low.includes('planeswalker')

  if (wantsPermanent) return true
  if (wantsCreature && type === 'creature') return true
  if (wantsLand && type === 'land') return true
  if (wantsEnchantment && type === 'enchantment') return true
  if (wantsArtifact && type === 'artifact') return true
  if (wantsPlaneswalker && type === 'planeswalker') return true

  const onlyOne = [wantsCreature, wantsLand, wantsEnchantment, wantsArtifact, wantsPlaneswalker].filter(Boolean).length
  if (onlyOne > 0) return false

  return true
}

export function effectLabelFor(kind: string, params: Record<string, unknown>): string {
  const labels: Record<string, (p: Record<string, unknown>) => string> = {
    draw_cards: (p) => `Draw ${(p as { amount?: number }).amount ?? 1} card(s)`,
    put_counter: (p) => `Put ${(p as { amount?: number }).amount ?? 1} ${(p as { counterKind?: string }).counterKind ?? '-1/-1'} counter(s)`,
    lose_life: (p) => `Lose ${(p as { amount?: number }).amount ?? 1} life`,
    gain_life: (p) => `Gain ${(p as { amount?: number }).amount ?? 1} life`,
    create_token: (p) => {
      const tokenName = (p as { tokenName?: string }).tokenName
      const power = (p as { tokenPower?: number }).tokenPower
      const toughness = (p as { tokenToughness?: number }).tokenToughness
      const stats = power !== undefined && toughness !== undefined ? ` ${power}/${toughness}` : ''
      return `Create${tokenName ? ` ${tokenName}` : ''}${stats} token`
    },
    destroy: () => 'Destroy target',
    add_mana: () => 'Add mana',
    exile: () => 'Exile',
    deal_damage: (p) => `Deal ${(p as { amount?: number }).amount ?? ''} damage`,
    return_from_graveyard: () => 'Return from graveyard',
    scry: (p) => `Scry ${(p as { amount?: number }).amount ?? 1}`,
    mill: (p) => `Mill ${(p as { amount?: number }).amount ?? 1} card(s)`,
    proliferate: () => 'Proliferate',
    search_library: () => 'Search library',
    sacrifice: () => 'Sacrifice',
    become_copy: () => 'Become a copy of the target',
    copy_ability: () => 'Copy an ability you resolved this turn',
    graveyard_intake_mill: () => 'Mill X = cards put into their graveyard this turn',
    monstrosity: (p) => `Monstrosity ${(p as { amount?: number }).amount ?? 1} — +1/+1 counters on this`,
    untap_self: () => 'Untap this',
  }
  const fn = labels[kind]
  if (fn) return fn(params)
  const desc = params.description as string | undefined
  return desc ?? kind
}
