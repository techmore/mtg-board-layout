export interface ScryfallCard {
  id: string
  name: string
  mana_cost: string
  cmc: number
  type_line: string
  oracle_text: string
  produced_mana?: string[]
  power?: string
  toughness?: string
  colors: string[]
  color_identity: string[]
  image_uris?: {
    small: string
    normal: string
    large: string
    png: string
    art_crop: string
    border_crop: string
  }
  card_faces?: {
    name: string
    mana_cost: string
    type_line: string
    oracle_text: string
    produced_mana?: string[]
    power?: string
    toughness?: string
    image_uris: {
      small: string
      normal: string
      large: string
      png: string
      art_crop: string
      border_crop: string
    }
  }[]
}

export type Zone = 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library' | 'command'

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

export type ManaPool = Record<ManaColor, number>

export interface ManaProduction {
  colors: ManaColor[]
  amount: number
}

export interface PotentialManaSource {
  id: string
  colors: ManaColor[]
  sourceCardId?: string
  sourceCardName?: string
}

export type EntryTapRule = 'never' | 'always' | 'conditional'
export type EntryTapMode = 'automatic' | EntryTapRule

export type CardScale = 1 | 1.25 | 1.5 | 1.75 | 2

export type ManaUsageKind = 'spell' | 'creature' | 'ability'

export interface ManaLogEntry {
  id: string
  turn: number
  direction: 'generated' | 'spent'
  color: ManaColor
  amount: number
  usage?: ManaUsageKind
  label?: string
  sourceCardId?: string
  sourceCardName?: string
}

export interface EffectHistoryEntry {
  id: string
  turn: number
  kind: 'token'
  action: 'added'
  targetCardId: string
  targetCardName: string
  amount: number
}

export interface BoardCard {
  id: string
  scryfallId: string
  name: string
  imageUri: string
  manaCost?: string
  manaValue?: number
  oracleText?: string
  typeLine: string
  subtypes: string[]
  isBasicLand: boolean
  manaProduction?: ManaProduction
  entryTapMode?: EntryTapMode
  entersTapped?: boolean
  entryTapRule?: EntryTapRule
  zone: Zone
  tapped: boolean
  counters: number
  /** −1/−1 counters (they subtract from power and toughness). */
  minusCounters?: number
  damage?: number
  /** True while damage marked by a deathtouch source (any amount is lethal). */
  deathtouchDamage?: boolean
  powerBoost?: number
  toughnessBoost?: number
  /** Temporary keywords granted "until end of turn" (gain deathtouch, haste, ...). */
  keywordBoosts?: string[]
  enchantsCardId?: string
  enchantsCardName?: string
  tokenCount?: number
  type: 'land' | 'creature' | 'instant' | 'sorcery' | 'enchantment' | 'artifact' | 'planeswalker' | 'battle' | 'other'
  revealed: boolean
  commanderTax?: number
  isCommander?: boolean
  enteredAtTurn?: number
  owner?: 'player' | 'opponent'
  /** Temporary control change ("gain control until end of turn"). */
  originalOwner?: 'player' | 'opponent'
  controlUntilTurnEnd?: boolean
  /** Manifested face-down (treated as a 2/2 creature). */
  facedown?: boolean
  /** Original type line/type of a manifested card, restored when it turns face up. */
  manifestOriginal?: { typeLine: string; type: BoardCard['type'] }
  /** Temporary animation ("becomes a creature until end of turn"): original type restored at cleanup. */
  originalType?: BoardCard['type']
  /** Clone overlay (Mirage Mirror): printed identity restored at turn handoff. */
  cloneOriginal?: { name: string; typeLine: string; subtypes: string[]; oracleText?: string; manaProduction?: ManaProduction }
  /** Quest counters (Yes Man). */
  questCounters?: number
  /** Cryptek: return to the battlefield tapped if this dies this turn. */
  reanimateOnDeathTurn?: number
  /** Skyclave Apparition: MV + owner of the permanent this exiled on ETB. */
  exiledWithMV?: number
  exiledCardOwner?: 'player' | 'opponent'
  /** "Can't be blocked this turn" (Rogue's Passage, etc.). */
  cantBeBlockedThisTurn?: boolean
}

export interface Token {
  id: string
  name: string
  imageUri: string
  counters: number
  tapped: boolean
  power?: number
  toughness?: number
  type?: 'creature' | 'other'
  owner?: 'player' | 'opponent'
}

export interface Deck {
  id: string
  name: string
  format: string
  commanderNames: string[]
  cards: DeckCard[]
  complete: boolean
  source?: DeckSource
  createdAt: number
  updatedAt: number
}

export interface DeckCard {
  scryfallId: string
  name: string
  manaCost: string
  manaValue?: number
  typeLine: string
  power?: string
  toughness?: string
  oracleText?: string
  manaProduction?: ManaProduction
  entryTapMode?: EntryTapMode
  entersTapped?: boolean
  entryTapRule?: EntryTapRule
  imageUri: string
  quantity: number
}

export interface DeckListEntry {
  name: string
  quantity: number
}

export interface DeckSource {
  type: 'builtin' | 'url' | 'text'
  url?: string
  publisher?: string
  product?: string
  releaseDate?: string
}

/** Human-editable deck data before card details are resolved from Scryfall. */
export interface DeckImportDefinition {
  id?: string
  name: string
  format: string
  commanderNames: string[]
  cards: DeckListEntry[]
  complete?: boolean
  source?: DeckSource
}

export interface BackgroundOption {
  id: string
  name: string
  dataUrl: string
}

// ─── Card Rules (from parser output) ───────────────────────────────────────

export type CardAbilityType = 'triggered' | 'activated' | 'static' | 'spell'

export type TriggerEvent =
  | 'etb' | 'dies' | 'upkeep' | 'draw_step' | 'end_of_turn'
  | 'combat_damage' | 'attack' | 'counter_placed' | 'landfall'
  | 'card_drawn' | 'life_gain' | 'life_loss' | 'sacrifice'
  | 'discard' | 'cast' | 'graveyard'

export interface CardEffect {
  kind: string
  params: Record<string, unknown>
}

export interface CardAbilityDef {
  abilityType: CardAbilityType
  triggerEvent: TriggerEvent | null
  /** Extra trigger events when one ability fires on multiple events
   *  ("Whenever ~ enters the battlefield or attacks, ..."). */
  triggerEvents?: TriggerEvent[]
  triggerCondition: string | null
  isOptional: boolean
  cost: string | null
  targets: number
  targetFilter: string | null
  effect: CardEffect
}

export interface CardRuleEntry {
  cardName: string
  manaCost: string
  manaValue: number
  typeLine: string
  cardType: string
  subtypes: string[]
  keywords: string[]
  manaProduction: ManaProduction | null
  entryTapRule: EntryTapRule | null
  conditionalEntryText: string | null
  abilities: CardAbilityDef[]
  oracleText: string
  scryfallId: string
}

// ─── Trigger Stack ─────────────────────────────────────────────────────────

export interface TriggerInstance {
  id: string
  sourceCardId: string
  sourceCardName: string
  ability: CardAbilityDef
  event: TriggerEvent
  context: Record<string, unknown>
  selectedTargets?: string[]
}

export type GameEvent =
  | { type: 'counter_placed'; cardId: string; cardName: string; kind: string }
  | { type: 'etb'; cardId: string; cardName: string }
  | { type: 'dies'; cardId: string; cardName: string }
  | { type: 'card_drawn'; count: number }
  | { type: 'life_loss'; cardId?: string; amount: number }
  | { type: 'life_gain'; cardId?: string; amount: number }
  | { type: 'sacrifice'; cardId: string; cardName: string }
  | { type: 'discard'; cardId: string; cardName: string }
  | { type: 'upkeep'; owner?: 'player' | 'opponent' }
  | { type: 'draw_step'; owner?: 'player' | 'opponent' }
  | { type: 'end_of_turn'; owner?: 'player' | 'opponent' }
  | { type: 'cast'; cardId: string; cardName: string; count?: number }
  | { type: 'attack'; cardId: string; cardName: string }
  | { type: 'combat_damage'; sourceCardId: string; sourceCardName: string; targetCardId?: string; amount: number }
  | { type: 'landfall'; cardId: string; cardName: string }
