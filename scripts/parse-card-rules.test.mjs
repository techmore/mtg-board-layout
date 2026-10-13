import { describe, expect, it } from 'vitest'
import { parseCard } from './parse-card-rules.mjs'

// Reconstructs a minimal Scryfall-shaped card for the parser.
function scryfall(name, typeLine, oracleText, manaCost = '', cmc = 0) {
  return { name, type_line: typeLine, oracle_text: oracleText, mana_cost: manaCost, cmc, id: `sf-${name}` }
}

describe('parse-card-rules — post-roadmap tail shapes', () => {
  it('parses Mirage Mirror as an activated become_copy with the full type list', () => {
    const card = parseCard(scryfall(
      'Mirage Mirror',
      'Artifact',
      '{2}: This artifact becomes a copy of target artifact, creature, enchantment, or land until end of turn.',
      '{3}',
      3,
    ))
    const [ability] = card.abilities
    expect(ability.abilityType).toBe('activated')
    expect(ability.cost).toBe('{2}')
    expect(ability.targets).toBe(1)
    expect(ability.effect.kind).toBe('become_copy')
    expect(ability.targetFilter).toBe('artifact, creature, enchantment, land')
    expect(ability.effect.params.copyTypes).toEqual(['artifact', 'creature', 'enchantment', 'land'])
  })

  it('parses Razorfield Ripper reconfigure into attach_target with payable costs', () => {
    const card = parseCard(scryfall(
      'Razorfield Ripper',
      'Artifact Creature — Equipment Rhino',
      'Whenever this creature or equipped creature attacks, you get {E} (an energy counter), then it gets +X/+X until end of turn, where X is the amount of {E} you have.\nReconfigure—Pay {2} or {E}{E}{E}. (Pay {2} or {E}{E}{E}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn\'t a creature.)',
      '{2}{W}',
      3,
    ))
    const attach = card.abilities.find((a) => a.effect.kind === 'attach_target')
    expect(attach).toBeDefined()
    expect(attach.abilityType).toBe('activated')
    expect(attach.cost).toContain('{2}')
    expect(attach.cost).toMatch(/Pay 3 \{E\}/)
    expect(attach.targetFilter).toContain('creature you control')
  })

  it('parses Abstruse Archaic as an activated copy_ability', () => {
    const card = parseCard(scryfall(
      'Abstruse Archaic',
      'Creature — Avatar',
      'Vigilance\n{1}, {T}: Copy target activated or triggered ability you control from a colorless source.',
      '{4}',
      4,
    ))
    const copy = card.abilities.find((a) => a.effect.kind === 'copy_ability')
    expect(copy).toBeDefined()
    expect(copy.abilityType).toBe('activated')
    expect(copy.cost).toContain('{T}')
    expect(copy.cost).toContain('{1}')
  })

  it('parses Fraying Sanity end-step mill keyed on graveyard intake', () => {
    const card = parseCard(scryfall(
      'Fraying Sanity',
      'Enchantment — Aura Curse',
      'Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn.',
      '{2}{U}',
      3,
    ))
    const [ability] = card.abilities
    expect(ability.triggerEvent).toBe('end_of_turn')
    expect(ability.effect.kind).toBe('graveyard_intake_mill')
  })

  it('drops reminder-text residue instead of inventing abilities', () => {
    const card = parseCard(scryfall(
      'Giggling Skitterspike',
      'Artifact Creature — Toy',
      "Indestructible\nWhenever this creature attacks, blocks, or becomes the target of a spell, it deals damage equal to its power to each opponent.\n{5}: Monstrosity 5. (If this creature isn't monstrous, put five +1/+1 counters on it and it becomes monstrous.)",
      '{4}',
      4,
    ))
    const kinds = card.abilities.map((a) => a.effect.kind)
    expect(kinds).toContain('monstrosity')
    // No phantom put_counter from the "(If this creature …" reminder fragment.
    expect(kinds).not.toContain('put_counter')
  })

  it('keeps colon-bearing functional reminders (Reconfigure unattach clause)', () => {
    const card = parseCard(scryfall(
      'Basalt Monolith',
      'Artifact',
      '{T}: Add {C}{C}. \n{3}: Untap this artifact.',
      '{3}',
      3,
    ))
    const untap = card.abilities.find((a) => a.effect.kind === 'untap_self')
    expect(untap?.cost).toBe('{3}')
  })

  it('merges two-sentence compound shapes into one ability (Chaos Warp)', () => {
    const card = parseCard(scryfall(
      'Chaos Warp',
      'Instant',
      "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield.",
      '{2}{R}',
      3,
    ))
    const warp = card.abilities.filter((a) => a.effect.kind === 'chaos_warp')
    expect(warp).toHaveLength(1)
    expect(warp[0].targets).toBe(1)
    // The follow-up sentence was absorbed — no separate battlefield-return ability.
    expect(card.abilities.some((a) => a.effect.kind === 'return_from_graveyard')).toBe(false)
  })

  it('parses Suspended Sentence as a targeted suspended_sentence spell', () => {
    const card = parseCard(scryfall(
      'Suspended Sentence',
      'Instant',
      'Destroy target creature an opponent controls. That player loses 3 life. Exile Suspended Sentence with three time counters on it.\nSuspend 3—{1}{B} (Rather than cast this card from your hand, you may pay {1}{B} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)',
      '{3}{B}',
      4,
    ))
    const sentence = card.abilities.find((a) => a.effect.kind === 'suspended_sentence')
    expect(sentence?.targets).toBe(1)
    expect(sentence?.targetFilter).toContain('creature an opponent controls')
  })
})

describe('parse-card-rules — Fabricate and Evolve keyword triggers', () => {
  const triggers = (card) => card.abilities.filter((a) => a.abilityType === 'triggered' && a.triggerEvent)

  it('Fabricate is one self-only ETB trigger (no junk condition, no counter_placed event)', () => {
    const card = parseCard(scryfall(
      'Angel of Invention',
      'Creature — Angel',
      'Flying, vigilance, lifelink\nFabricate 2 (When this creature enters, put two +1/+1 counters on it or create two 1/1 colorless Servo artifact creature tokens.)\nOther creatures you control get +1/+1.',
      '{3}{W}{W}',
      5,
    ))
    const [fabricate, ...rest] = triggers(card)
    expect(rest).toEqual([])
    expect(fabricate.triggerEvent).toBe('etb')
    expect(fabricate.triggerEvents).toBeUndefined()
    expect(fabricate.triggerCondition).toBe('this creature enters')
    expect(fabricate.effect.kind).toBe('create_token')
    expect(fabricate.effect.params.amount).toBe(2)
    // The anthem that used to be swallowed by the junk ability is parsed on its own.
    expect(card.abilities.some((a) => a.abilityType === 'static' && a.effect.kind === 'pump')).toBe(true)
  })

  it('Evolve triggers when ANOTHER creature you control enters, not on counters or on itself', () => {
    const card = parseCard(scryfall(
      'Test Evolver',
      'Creature — Beast',
      'Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)',
      '{1}{G}',
      2,
    ))
    const [evolve, ...rest] = triggers(card)
    expect(rest).toEqual([])
    expect(evolve.triggerEvent).toBe('etb')
    expect(evolve.triggerEvents).toBeUndefined()
    expect(evolve.triggerCondition).toBe('another creature you control enters')
    expect(evolve.effect.kind).toBe('put_counter')
  })
})
