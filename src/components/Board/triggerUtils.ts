import type { BoardCard } from '../../types/card'

export function targetsForEffect(kind: string, cards: BoardCard[]): BoardCard[] {
  if (kind === 'return_from_graveyard') {
    return cards.filter((card) => card.zone === 'graveyard')
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
  }
  const fn = labels[kind]
  if (fn) return fn(params)
  const desc = params.description as string | undefined
  return desc ?? kind
}
