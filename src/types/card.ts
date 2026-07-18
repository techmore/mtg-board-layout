export interface ScryfallCard {
  id: string
  name: string
  mana_cost: string
  cmc: number
  type_line: string
  oracle_text: string
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

export interface BoardCard {
  id: string
  scryfallId: string
  name: string
  imageUri: string
  manaCost?: string
  manaValue?: number
  oracleText?: string
  entersTapped?: boolean
  zone: Zone
  tapped: boolean
  counters: number
  type: 'land' | 'creature' | 'instant' | 'sorcery' | 'enchantment' | 'artifact' | 'planeswalker' | 'battle' | 'other'
  revealed: boolean
}

export interface Token {
  id: string
  name: string
  imageUri: string
  counters: number
  tapped: boolean
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
  oracleText?: string
  entersTapped?: boolean
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
