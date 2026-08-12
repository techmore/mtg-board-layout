import type { DeckCard, EntryTapRule } from '../types/card'

export interface CardDatabaseEntry {
  name: string
  typeLine: string
  power?: string
  toughness?: string
  imageUri: string
  oracleText?: string
  entryTapRule: EntryTapRule
  entersTapped: boolean
  fetchesLandTapped?: boolean
}

function imageFor(name: string): string {
  return 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name) + '&format=image'
}

/**
 * Stable local metadata for cards with gameplay features that must survive
 * saved-deck migrations and Scryfall outages. Generic card metadata still
 * refreshes from Scryfall; add more entries here as card-specific features are
 * implemented.
 */
export const CARD_DATABASE: Record<string, CardDatabaseEntry> = {
  'Savage Lands': {
    name: 'Savage Lands',
    typeLine: 'Land',
    imageUri: imageFor('Savage Lands'),
    oracleText: 'Savage Lands enters the battlefield tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Cinder Glade': {
    name: 'Cinder Glade',
    typeLine: 'Land — Mountain Forest',
    imageUri: imageFor('Cinder Glade'),
    oracleText: 'This land enters tapped unless you control two or more basic lands.',
    entryTapRule: 'conditional',
    entersTapped: false,
  },
  'Golgari Rot Farm': {
    name: 'Golgari Rot Farm',
    typeLine: 'Land',
    imageUri: imageFor('Golgari Rot Farm'),
    oracleText: 'Golgari Rot Farm enters the battlefield tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Path of Ancestry': {
    name: 'Path of Ancestry',
    typeLine: 'Land',
    imageUri: imageFor('Path of Ancestry'),
    oracleText: 'Path of Ancestry enters the battlefield tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Smoldering Marsh': {
    name: 'Smoldering Marsh',
    typeLine: 'Land — Swamp Mountain',
    imageUri: imageFor('Smoldering Marsh'),
    oracleText: 'This land enters tapped unless you control two or more basic lands.',
    entryTapRule: 'conditional',
    entersTapped: false,
  },
  'Gruul Turf': {
    name: 'Gruul Turf',
    typeLine: 'Land',
    imageUri: imageFor('Gruul Turf'),
    oracleText: 'This land enters tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Rakdos Carnarium': {
    name: 'Rakdos Carnarium',
    typeLine: 'Land',
    imageUri: imageFor('Rakdos Carnarium'),
    oracleText: 'This land enters tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Woodland Cemetery': {
    name: 'Woodland Cemetery',
    typeLine: 'Land',
    imageUri: imageFor('Woodland Cemetery'),
    oracleText: 'This land enters tapped unless you control a Swamp or a Forest.',
    entryTapRule: 'conditional',
    entersTapped: false,
  },
  'Sheltered Thicket': {
    name: 'Sheltered Thicket',
    typeLine: 'Land — Mountain Forest',
    imageUri: imageFor('Sheltered Thicket'),
    oracleText: 'This land enters tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Dragonskull Summit': {
    name: 'Dragonskull Summit',
    typeLine: 'Land',
    imageUri: imageFor('Dragonskull Summit'),
    oracleText: 'Dragonskull Summit enters the battlefield tapped unless you control a Swamp or a Mountain.',
    entryTapRule: 'conditional',
    entersTapped: false,
  },
  'Rootbound Crag': {
    name: 'Rootbound Crag',
    typeLine: 'Land',
    imageUri: imageFor('Rootbound Crag'),
    oracleText: 'This land enters tapped unless you control a Mountain or a Forest.',
    entryTapRule: 'conditional',
    entersTapped: false,
  },
  'Canyon Slough': {
    name: 'Canyon Slough',
    typeLine: 'Land — Swamp Mountain',
    imageUri: imageFor('Canyon Slough'),
    oracleText: 'This land enters tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Vernal Fen': {
    name: 'Vernal Fen',
    typeLine: 'Land',
    imageUri: imageFor('Vernal Fen'),
    oracleText: 'This land enters tapped unless you control two or more basic lands.',
    entryTapRule: 'conditional',
    entersTapped: false,
  },
  'Festering Thicket': {
    name: 'Festering Thicket',
    typeLine: 'Land — Swamp Forest',
    imageUri: imageFor('Festering Thicket'),
    oracleText: 'This land enters tapped.',
    entryTapRule: 'always',
    entersTapped: true,
  },
  'Riveteers Overlook': {
    name: 'Riveteers Overlook',
    typeLine: 'Land',
    imageUri: imageFor('Riveteers Overlook'),
    oracleText: 'When this land enters, sacrifice it. When you do, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    entryTapRule: 'never',
    entersTapped: false,
    fetchesLandTapped: true,
  },
  'Evolving Wilds': {
    name: 'Evolving Wilds',
    typeLine: 'Land',
    imageUri: imageFor('Evolving Wilds'),
    oracleText: 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    entryTapRule: 'never',
    entersTapped: false,
    fetchesLandTapped: true,
  },
  'Terramorphic Expanse': {
    name: 'Terramorphic Expanse',
    typeLine: 'Land',
    imageUri: imageFor('Terramorphic Expanse'),
    oracleText: 'Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',
    entryTapRule: 'never',
    entersTapped: false,
    fetchesLandTapped: true,
  },
  'Ifnir Deadlands': {
    name: 'Ifnir Deadlands',
    typeLine: 'Land — Desert',
    imageUri: imageFor('Ifnir Deadlands'),
    entryTapRule: 'never',
    entersTapped: false,
  },
  'Nesting Grounds': {
    name: 'Nesting Grounds',
    typeLine: 'Land',
    imageUri: imageFor('Nesting Grounds'),
    entryTapRule: 'never',
    entersTapped: false,
  },
}

const databaseByName = new Map(
  Object.values(CARD_DATABASE).map((entry) => [entry.name.toLowerCase(), entry]),
)

export function getCardDatabaseEntry(name: string): CardDatabaseEntry | undefined {
  return databaseByName.get(name.trim().toLowerCase())
}

export function databaseEntryToDeckCard(entry: CardDatabaseEntry, quantity: number): DeckCard {
  return {
    scryfallId: '',
    name: entry.name,
    manaCost: '',
    typeLine: entry.typeLine,
    power: entry.power,
    toughness: entry.toughness,
    oracleText: entry.oracleText,
    entryTapMode: 'automatic',
    entryTapRule: entry.entryTapRule,
    entersTapped: entry.entersTapped,
    imageUri: entry.imageUri,
    quantity,
  }
}
