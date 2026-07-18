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

export interface BoardCard {
  id: string
  scryfallId: string
  name: string
  imageUri: string
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
  createdAt: number
  updatedAt: number
}

export interface DeckCard {
  scryfallId: string
  name: string
  manaCost: string
  typeLine: string
  imageUri: string
  quantity: number
}
