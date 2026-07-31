#!/usr/bin/env node

/**
 * Deterministic card rule parser. No LLM — pure pattern matching.
 * Scans Oracle text for keywords, triggers, activated abilities, ETBs, etc.
 *
 * Usage:
 *   node scripts/parse-card-rules.mjs [--deck blight-curse] [--resume]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, 'rules-output')
mkdirSync(OUTPUT_DIR, { recursive: true })

const SCRYFALL_COLLECTION = 'https://api.scryfall.com/cards/collection'

const args = process.argv.slice(2)
const getFlag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i+1] : undefined }
const hasFlag = (f) => args.includes(f)
const DECK_NAME = getFlag('--deck') ?? 'blight-curse'
const RESUME = hasFlag('--resume')
const FORCE = hasFlag('--force')
const OUTPUT_FILE = resolve(OUTPUT_DIR, `${DECK_NAME}.json`)

// ─── Deck data ─────────────────────────────────────────────────────────────
const prebuiltDecks = {
  'blight-curse': {
    commander: 'Auntie Ool, Cursewretch',
    partners: ['The Reaper, King No More'],
    cards: [
      "Wickersmith's Tools", 'Sinister Gnarlbark', "Eventide's Shadow",
      'Aberrant Return', 'Dread Tiller', 'Grave Venerations',
      'Oft-Nabbed Goat', 'Village Pillagers', "Puca's Covenant",
      'Ferrafor, Young Yew', 'Tree of Perdition', 'Vernal Fen',
      'Festering Thicket', 'Necroskitter', 'Ignoble Hierarch',
      'Nesting Grounds', 'Massacre Girl, Known Killer', 'Grave Titan',
      "Vraska, Betrayal's Sting", 'The Scorpion God', 'Liliana, Death Wielder',
      'Chimil, the Inner Sun', 'Carnifex Demon', 'Puppeteer Clique',
      'Dusk Urchins', "Black Sun's Zenith", 'Painful Truths', 'Persist',
      'Midnight Banshee', 'Chain Reaction', 'Archfiend of Ifnir',
      'Channeler Initiate', 'Hapatra, Vizier of Poisons', 'Glissa Sunslayer',
      'Everlasting Torment', "Assassin's Trophy", 'Grim Poppet',
      'Canyon Slough', 'Sheltered Thicket', 'Exotic Orchard',
      'Smoldering Marsh', 'Cinder Glade', 'Dragonskull Summit',
      'Rootbound Crag', 'Woodland Cemetery', 'Lasting Tarfire',
      'Burning Curiosity', "Hoarder's Greed", 'Blowfly Infestation',
      'Fire Covenant', 'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Cathartic Reunion', 'Skinrender', 'Soul Snuffers', 'Incremental Blight',
      'Infernal Grasp', 'Evolution Sage', 'Devoted Druid',
      'Flourishing Defenses', 'Harmonize', 'Putrefy', 'Binding the Old Gods',
      'Kulrath Knight', 'Contagion Clasp', 'Savage Lands', 'Ifnir Deadlands',
      "Night's Whisper", 'Wickerbough Elder', 'Terminate',
      "Commander's Sphere", 'Cathartic Pyre', 'Evolving Wilds',
      'Terramorphic Expanse', 'Path of Ancestry', 'Riveteers Overlook',
      'Rakdos Carnarium', 'Gruul Turf', 'Golgari Rot Farm',
      'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp',
      'Mountain', 'Mountain', 'Mountain', 'Mountain',
      'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest',
    ],
  },
  'dance-of-the-elements': {
    commander: 'Ashling, the Limitless',
    partners: ['Mass of Mysteries'],
    cards: [
      'Elemental Spectacle', 'Endurance', 'Fury', 'Haunting Voyage',
      'Avenger of Zendikar', 'Cavalier of Thorns', 'Selvala, Heart of the Wilds',
      'Titan of Industry', 'Muldrotha, the Gravetide', 'Omnath, Locus of Rage',
      'Yarok, the Desecrated', 'Omnath, Locus of the Roil', 'Timeless Lotus',
      'Blasphemous Act', 'Kindred Summons', 'Bane of Progress', 'Realmwalker',
      'Horde of Notions', 'Maelstrom Wanderer', 'Jegantha, the Wellspring',
      'Chromatic Lantern', 'Primal Beyond', 'Exotic Orchard', 'Path to Exile',
      'Mulldrifter', 'Reality Shift', 'Shriekmaw', 'Crib Swap', 'Sol Ring',
      'Command Tower', 'Arcane Signet', 'Risen Reef', 'Fellwar Stone',
      "Kodama's Reach", 'Cultivate', 'Path of Ancestry',
      'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
    ],
  },
  'cairos-monument': {
    commander: 'Cairo, the Eternal',
    cards: [
      'Soul Warden', 'Soul Attendant', "Ajani's Chosen", 'Serra Ascendant',
      'Archangel of Thune', 'Resplendent Angel', 'Righteous Valkyrie',
      'Angelic Field Marshal', 'Lyra Dawnbringer', 'Baneslayer Angel',
      'Sigarda, Host of Herons', 'Avacyn, Angel of Hope', 'Elesh Norn, Grand Cenobite',
      'Land Tax', 'Smothering Tithe', 'Sol Ring', 'Arcane Signet',
      'Command Tower', 'Path to Exile', 'Swords to Plowshares',
      'Wrath of God', 'Day of Judgment', 'Settle the Wreckage',
      'Plains', 'Island',
    ],
  },
  'enduring-enchantments': {
    commander: 'Anikthea, Hand of Erebos',
    cards: [
      'Eidolon of Countless Battles', 'Doomwake Giant', 'Nylea, God of the Hunt',
      'Erebos, God of the Dead', 'Thassa, God of the Sea', 'Heliod, God of the Sun',
      'Purphoros, God of the Forge', 'Sphere of Safety', 'Ghostly Prison',
      'Propaganda', 'Starfield Mystic', 'Mesa Enchantress', 'Verduran Enchantress',
      "Enchantress's Presence", 'Argothian Enchantress', 'Sigil of the Empty Throne',
      'Luminarch Ascension', 'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Swamp', 'Forest', 'Plains',
    ],
  },
  'sauron-dark-lord': {
    commander: 'Sauron, the Dark Lord',
    cards: [
      'Saruman of Many Colors', 'Saruman the White', 'The Witch-King, Bringer of Ruin',
      'Mordor Siege', 'Nazgûl', 'Lord of the Nazgûl', 'Ringwraiths',
      'Call of the Ring', 'The One Ring', 'Orcish Bowmasters',
      'Gollum, Scheming Guide', 'Mirkwood Bats', 'Palantír of Orthanc',
      'Sol Ring', 'Arcane Signet', 'Command Tower', 'Swamp', 'Island',
      'Mountain',
    ],
  },
  'food-fellowship': {
    commander: 'Frodo Baggins',
    partners: ['Samwise Gamgee'],
    cards: [
      "Peregrin Took", 'Merry, Warden of Isengard', "Pippin, Warden of Isengard",
      "Rosie Cotton of South Lane", 'Bill the Pony', 'Gaffer Gamgee',
      "Second Breakfast", 'Feasting Hobbit', 'Hobbit Feet',
      "Banquet Guests", 'Tea Time', "Frodo's Adventuring Party",
      'Sol Ring', 'Arcane Signet', 'Command Tower',
      "Plains", "Forest", "Island",
    ],
  },
  'creative-energy': {
    commander: 'Satya, Aetherflux Genius',
    cards: [
      'The Aetherspark', 'Amped Raptor', 'Aragorn, Company Leader',
      'Drannith Magistrate', 'Dockside Extortionist', 'Goldspan Dragon',
      'Jaxis, the Troublemaker', 'Kiki-Jiki, Mirror Breaker',
      'Laelia, the Blade Reforged', 'Mana Echoes', 'Professional Face-Breaker',
      'Splinter Twin', 'Storm-Kiln Artist', 'Underworld Breach',
      'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Mountain', 'Island', 'Plains',
    ],
  },
  'eldrazi-incursion': {
    commander: 'Ulalek, Fused Atrocity',
    cards: [
      'Azlask, the Swelling Scourge', 'Emrakul, the Promised End',
      'Kozilek, Butcher of Truth', 'Ulamog, the Ceaseless Hunger',
      'Ulamog, the Infinite Gyre', 'It That Betrays', 'Pathrazer of Ulamog',
      'Artisan of Kozilek', 'Spawnsire of Ulamog', 'Breaker of Armies',
      'Desolation Twin', 'Eldrazi Conscription', 'Eye of Ugin',
      'Eldrazi Temple', 'Sol Ring', 'Wastes',
    ],
  },
  'squirrel-mob': {
    commander: 'Hazel of the Rootbloom',
    cards: [
      'Chatterfang, Squirrel General', 'Squirrel Sovereign', 'Squirrel Nest',
      'Druid Class', 'Acorn Harvest', 'Squirrel Mob', 'Verdant Command',
      'Scurry Oak', 'Deepwood Denizen', 'Hardshell Escort',
      'Memorial to Unity', 'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Squirrel Sanctuary', 'Forest', 'Plains', 'Swamp',
    ],
  },
  'jump-scare': {
    commander: 'Zimone, Mystery Unraveler',
    cards: [
      'Yedora, Grave Gardener', 'Sakura-Tribe Elder', 'Scute Swarm',
      'Avenger of Zendikar', 'Rampaging Baloths', 'Omnath, Locus of Rage',
      'Lotus Cobra', 'Tireless Tracker', 'Tireless Provisioner',
      'Aesi, Tyrant of Gyre Strait', 'Tatyova, Benthic Druid',
      'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Sylvan Library', 'Cultivate', "Kodama's Reach",
      'Forest', 'Island',
    ],
  },
  'endless-punishment': {
    commander: 'Valgavoth, Harrower of Souls',
    cards: [
      'Tinybones, Bauble Burglar', 'Sheoldred, the Apocalypse',
      'Megrim', 'Liliana, Dreadhorde General', 'Torment of Hailfire',
      'Painful Quandary', 'Underworld Dreams', 'Fate Unraveler',
      'Rise of the Dark Realms', 'Exquisite Blood', 'Sanguine Bond',
      'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Nykthos, Shrine to Nyx', 'Cabal Coffers', 'Urborg, Tomb of Yawgmoth',
      'Swamp', 'Mountain',
    ],
  },
  'eldrazi-unbound': {
    commander: 'Zhulodok, Void Gorger',
    cards: [
      "Ulamog, the Ceaseless Hunger", "Kozilek, Butcher of Truth",
      "Emrakul, the Aeons Torn", "It That Betrays", "Pathrazer of Ulamog",
      "Artisan of Kozilek", "Void Winnower", "Sire of Stagnation",
      "Endbringer", "Bane of Bala Ged", "Oblivion Sower",
      "Hedron Archive", "Dreamstone Hedron", "Sol Ring",
      "Eye of Ugin", "Eldrazi Temple", "Wastes",
    ],
  },
  'grave-danger': {
    commander: 'The Wise Mothman',
    cards: [
      'Radstorm', 'Soul-Scar Mage', 'The Master, Multiplied',
      'Niv-Mizzet, Parun', 'The Locust God', 'The Scarab God',
      'Bruvac the Grandiloquent', 'Maddening Cacophony',
      'Fleet Swallower', 'Traumatize', 'Sol Ring', 'Arcane Signet',
      'Command Tower', 'Island', 'Mountain', 'Swamp',
    ],
  },
  'mutant-menace': {
    commander: 'Mr. House, President and CEO',
    cards: [
      'The Master, Multiplied', 'Aligned Hedron Network', 'Chaos Warp',
      'Generous Gift', 'Swords to Plowshares', 'Cyclonic Rift',
      'Dice Chamber', 'Magnetic Theft', 'Sol Ring', 'Arcane Signet',
      'Command Tower', 'Mountain', 'Plains',
    ],
  },
  'glory-dog': {
    commander: 'Dogmeat, Ever Loyal',
    cards: [
      'Sword of Feast and Famine', 'Sword of Fire and Ice',
      'Sword of Body and Mind', 'Colossus Hammer',
      'Sigarda, Host of Herons', 'Sram, Senior Edificer',
      'Danitha Capashen, Paragon', 'Puresteel Paladin',
      'Stoneforge Mystic', 'Steelshaper Apprentice',
      'Kor Spiritdancer', 'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Plains', 'Mountain',
    ],
  },
  'necron-dynasties': {
    commander: 'Imotekh the Stormlord',
    cards: [
      'Anrakyr the Traveller', 'Illuminor Szeras', 'Orikan the Diviner',
      'The Silent King', 'Trazyn the Infinite', 'Canoptek Tomb Sentinel',
      'Canoptek Scarab Swarm', 'Doomstalker', 'Lokhust Heavy Destroyers',
      'Warhammer 40k', 'Sol Ring', 'Arcane Signet', 'Command Tower',
      'Swamp', 'Mountain',
    ],
  },
}

function getUniqueCards(deckName) {
  const d = prebuiltDecks[deckName]
  if (!d) { console.error(`Unknown deck "${deckName}"`); process.exit(1) }
  const set = new Set(); set.add(d.commander)
  if (d.partners) d.partners.forEach(p => set.add(p))
  d.cards.forEach(c => set.add(c))
  return { deck: d, cards: [...set] }
}

const BASIC_COLORS = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' }

// ─── Scryfall ──────────────────────────────────────────────────────────────
async function fetchScryfall(names) {
  const map = new Map()
  for (let i = 0; i < names.length; i += 75) {
    const batch = names.slice(i, i + 75)
    let fetched = false
    let lastError
    for (let a = 0; a < 3; a++) {
      let timeout
      try {
        const controller = new AbortController()
        timeout = setTimeout(() => controller.abort(), 15_000)
        const res = await fetch(SCRYFALL_COLLECTION, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'MTGBoardLayout/1.0' },
          body: JSON.stringify({ identifiers: batch.map(n => ({ name: n })) }),
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Scryfall returned HTTP ${res.status}`)
        const d = await res.json()
        d.data.forEach(c => map.set(c.name, c))
        fetched = true
        break
      } catch (error) {
        lastError = error
        await new Promise(r => setTimeout(r, 2000))
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    }
    if (!fetched) {
      throw new Error(`Scryfall fetch failed for batch starting with "${batch[0]}": ${lastError?.message ?? 'unknown error'}`)
    }
  }
  return map
}

function validateOutput(output, ordered) {
  const missing = ordered.filter(name => !output[name])
  if (missing.length > 0) {
    const msg = `Rule extraction incomplete; missing ${missing.length} card(s): ${missing.join(', ')}`
    if (FORCE) { console.error(`WARN: ${msg}`); return }
    throw new Error(msg)
  }

  const invalid = ordered.filter(name => {
    const entry = output[name]
    return typeof entry.cardName !== 'string' ||
      !Array.isArray(entry.abilities) ||
      !Array.isArray(entry.keywords) ||
      !Object.prototype.hasOwnProperty.call(entry, 'manaProduction') ||
      typeof entry.oracleText !== 'string'
  })
  if (invalid.length > 0) {
    throw new Error(`Rule extraction produced invalid entries: ${invalid.join(', ')}`)
  }
}

// ─── Parser ────────────────────────────────────────────────────────────────
const KEYWORDS = [
  'deathtouch', 'first strike', 'double strike', 'flying', 'haste', 'hexproof',
  'indestructible', 'lifelink', 'menace', 'reach', 'trample', 'vigilance',
  'ward', 'flash', 'defender', 'exalted', 'persist', 'undying', 'infect',
  'wither', 'prowess', 'fear', 'intimidate', 'shadow', 'banding', 'totem armor',
]

function parseKeywords(typeLine, oracleText) {
  const text = (typeLine + ' ' + oracleText).toLowerCase()
  const found = new Set()
  for (const kw of KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i')
    if (regex.test(text)) found.add(kw === 'hexproof' && text.includes('hexproof from') ? 'hexproof from' : kw)
  }
  return [...found]
}

function classifyType(typeLine) {
  const tl = typeLine.toLowerCase()
  if (tl.includes('land')) return 'land'
  if (tl.includes('creature')) return 'creature'
  if (tl.includes('instant')) return 'instant'
  if (tl.includes('sorcery')) return 'sorcery'
  if (tl.includes('enchantment')) return 'enchantment'
  if (tl.includes('artifact')) return 'artifact'
  if (tl.includes('planeswalker')) return 'planeswalker'
  if (tl.includes('battle')) return 'battle'
  return 'other'
}

function parseSubtypes(typeLine) {
  const parts = typeLine.split(/[–—−]/)
  if (parts.length < 2) return []
  return parts[1].trim().split(/\s+/).filter(Boolean)
}

// Entry tap rules
function parseEntryTap(oracleText) {
  const text = oracleText.replace(/\s+/g, ' ')
  const sentences = text.split(/[.;\n]/).map(s => s.trim()).filter(Boolean)
  const entersClause = sentences.find(s => /\benters?\b.*\b(tapped|with a stun counter)\b/i.test(s))
  if (!entersClause) return { entryTapRule: null, conditionalEntryText: null }
  const isConditional = /\b(unless|if|may|you decide whether)\b/i.test(entersClause) || /you may have.*enter.*tapped/i.test(entersClause)
  return {
    entryTapRule: isConditional ? 'conditional' : 'always',
    conditionalEntryText: isConditional ? entersClause.trim() : null,
  }
}

// Mana production
const MANA_COLORS = ['W', 'U', 'B', 'R', 'G', 'C']
function parseManaProduction(oracleText) {
  const addClauses = oracleText.match(/\badd\b[^.\n]*/gi) ?? []
  if (addClauses.length === 0) return null
  const colors = new Set()
  for (const clause of addClauses) {
    if (/any color|any combination/i.test(clause)) { MANA_COLORS.forEach(c => colors.add(c)); break }
    const symbols = clause.match(/\{([WUBRGC])\}/gi) ?? []
    symbols.forEach(s => colors.add(s.replace(/[{}]/g, '')))
  }
  if (colors.size === 0) return null
  const amount = Math.max(...addClauses.map(c => {
    const n = c.match(/\b(one|two|three|four|five)\b/i)
    if (n) return ({ one: 1, two: 2, three: 3, four: 4, five: 5 })[n[1].toLowerCase()]
    const syms = c.match(/\{[WUBRGC]\}/gi) ?? []
    return syms.length || 1
  }))
  return { colors: [...colors], amount }
}

// ─── Ability parsing ───────────────────────────────────────────────────────
const TRIGGER_PATTERNS = [
  { event: 'etb', patterns: [/\bwhen(?:ever)?\s+(this|~|[a-z ]+)\s+enters?\b/i, /\bwhen(?:ever)?\s+.*\benters?\s+the\s+battlefield\b/i] },
  { event: 'dies', patterns: [/\bwhen(?:ever)?\s+.*\b(dies|die|dies|is put into a graveyard|leaves the battlefield)\b/i] },
  { event: 'upkeep', patterns: [/\bat\s+the\s+beginning\s+of\s+(your|each|the)\s+upkeep\b/i] },
  { event: 'draw_step', patterns: [/\bat\s+the\s+beginning\s+of\s+(your|each|the)\s+draw\s+step\b/i] },
  { event: 'end_of_turn', patterns: [/\bat\s+(the\s+)?beginning\s+of\s+(your|each|the)\s+end\s+(step|of\s+turn)\b/i, /\bat\s+the\s+beginning\s+of\s+(your|next|each)\s+end\s+step\b/i] },
  { event: 'combat_damage', patterns: [/\bwhen(?:ever)?\s+.*\b(combat damage|deals combat damage|attacks and isn't blocked)\b/i] },
  { event: 'attack', patterns: [/\bwhen(?:ever)?\s+.*\battacks?\b/i] },
  { event: 'counter_placed', patterns: [/\bwhen(?:ever)?\s+.*\b(counter|counters)\s+(are\s+)?(is\s+)?put\s+on\b/i, /\bwhen(?:ever)?\s+.*\bput\b.{0,20}\b(counter|counters)\b/i] },
  { event: 'landfall', patterns: [/\bwhen(?:ever)?\s+a\s+land\s+enters?\b/i, /\blandfall\b/i] },
  { event: 'card_drawn', patterns: [/\bwhen(?:ever)?\s+.*\bdraw\b/i] },
  { event: 'life_gain', patterns: [/\bwhen(?:ever)?\s+.*\bgains?\s+life\b/i] },
  { event: 'life_loss', patterns: [/\bwhen(?:ever)?\s+.*\bloses?\s+life\b/i] },
  { event: 'sacrifice', patterns: [/\bwhen(?:ever)?\s+.*\bsacrifice\b/i] },
  { event: 'discard', patterns: [/\bwhen(?:ever)?\s+.*\bdiscard\b/i] },
  { event: 'cast', patterns: [/\bwhen(?:ever)?\s+.*\bcast\b/i] },
  { event: 'graveyard', patterns: [/\bwhen(?:ever)?\s+.*\b(graveyard|dies|die|dies)\b/i] },
]

const EFFECT_PATTERNS = [
  { kind: 'create_token', regex: /\bcreate\b[^.]*\btoken\b/i },
  { kind: 'put_counter', regex: /\bput\b[^.]*\b(counter|counters)\b/i },
  { kind: 'add_mana', regex: /\badd\b[^.,;]*\b(mana|one mana|two mana|any color|any combination)\b/i },
  { kind: 'add_mana', regex: /\badd\b[^.,;]*\{/i },
  { kind: 'deal_damage', regex: /\bdeals?\b[^.]*\bdamage\b/i },
  { kind: 'destroy', regex: /\bdestroy\b[^]*?(?=\.|$)/i },
  { kind: 'exile', regex: /\bexile\b[^]*?(?=\.|$)/i },
  { kind: 'draw_cards', regex: /\bdraw\b[^.]*\bcard(s)?\b/i },
  { kind: 'lose_life', regex: /\bloses?\b[^.]*\blife\b/i },
  { kind: 'gain_life', regex: /\bgains?\b[^.]*\blife\b/i },
  { kind: 'search_library', regex: /\bsearch\b[^.]*\blibrary\b/i },
  { kind: 'return_from_graveyard', regex: /\b(return|put)\b[^.]*\b(from|to)\b[^.]*\b(battlefield|hand|graveyard)\b/i },
  { kind: 'counter_target', regex: /\bcounter\b[^.]*\bspell\b/i },
  { kind: 'sacrifice', regex: /\bsacrifice\b[^.,;]*\./i },
  { kind: 'scry', regex: /\bscry\b\s*\d*/i },
  { kind: 'proliferate', regex: /\bproliferate\b/i },
  { kind: 'fight', regex: /\bfight\b/i },
]

function parseEffect(sentence) {
  for (const ep of EFFECT_PATTERNS) {
    const m = sentence.match(ep.regex)
    if (m) {
      const params = {}
      // Counter placement detection
      if (/(counter|counters)/i.test(sentence) && /\bput\b/i.test(sentence)) {
        const c = sentence.match(/\bput\b[^.]*?((?:X\s+|two\s+|three\s+|four\s+|five\s+)?[-−]?\d\s*[/]\s*\d|a\s+[-−]?\d\s*[/]\s*\d)/i)
        if (c) {
          const normalized = c[1].replace(/[−]/g, '-').replace(/\s+/g, '').toLowerCase()
          params.counterKind = normalized.includes('x') ? 'X' : normalized.startsWith('-') ? '-1/-1' : normalized.startsWith('+') ? '+1/+1' : '-1/-1'
          const n = sentence.match(/\bput\b[^.]*?\b(two|three|four|five|X)\b/i)
          if (n) params.amount = ({ two: 2, three: 3, four: 4, five: 5, x: 'X' })[n[1].toLowerCase()] ?? 1
          else params.amount = 1
        }
      }
      // Token creation
      if (ep.kind === 'create_token') {
        const pt = sentence.match(/(\d+)\s*[/]\s*(\d+)\s+/)
        if (pt) { params.tokenPower = parseInt(pt[1]); params.tokenToughness = parseInt(pt[2]) }
        const tn = sentence.match(/token\s*(?:named\s+["“]?(\w+(?:\s+\w+)*)["”]?)?/i)
        if (tn && tn[1]) params.tokenName = tn[1]
        else {
          const desc = sentence.match(/create\b[^.]*?(?:(?:a|an?|another|two|three|X|a number of)\s+)?(?:\d+\/\d+\s+)?(\w+(?:\s+\w+)?)\s+(?:white|blue|black|red|green|colorless)?\s*token/i)
          if (desc) params.tokenName = desc[1].trim()
        }
        const n = sentence.match(/\bcreate\b[^.]*\b(two|three|X|a number of)\b/i)
        if (n) params.amount = ({ two: 2, three: 3, x: 'X', 'a number of': 0 })[n[1].toLowerCase()] ?? 1
        else if (/\bcreate a\b/i.test(sentence) || /\bcreate an?\b/i.test(sentence)) params.amount = 1
      }
      // Draw / Life amount
      if (['draw_cards', 'lose_life', 'gain_life', 'scry'].includes(ep.kind)) {
        const n = sentence.match(/\b(one|two|three|four|five|X)\b/i)
        if (n) params.amount = ({ one: 1, two: 2, three: 3, four: 4, five: 5, x: 'X' })[n[1].toLowerCase()] ?? 1
        else { const d = sentence.match(/\b(\d+)\b/); if (d) params.amount = parseInt(d[1]) }
        if (!params.amount) params.amount = 1
      }
      // Destroy / Exile target
      if (['destroy', 'exile'].includes(ep.kind)) {
        const perm = sentence.match(/\b(target\s+\w+(?:\s+\w+)?)/i)
        if (perm) params.targetHint = perm[1]
      }
      return { kind: ep.kind, params }
    }
  }
  return { kind: 'other', params: {} }
}

function parseTargets(sentence) {
  if (/\btarget\s+(creature|player|opponent|artifact|enchantment|land|planeswalker|permanent|spell)/i.test(sentence)) {
    const filters = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'permanent', 'spell', 'player', 'opponent']
    for (const f of filters) {
      if (new RegExp(`target\\s+${f}`, 'i').test(sentence)) {
        // Check for "target creature an opponent controls" or "target artifact or enchantment"
        let extra = sentence.match(new RegExp(`target\\s+${f}([^.,;]*)`, 'i'))
        let filter = extra ? (f + ' ' + extra[1].trim()).trim() : f
        // Count targets: "target" vs "up to one target" vs "any number of targets"
        const isDistribute = /\bdistribute\b/i.test(sentence)
        const count = /\b(up to|any number of|each)\b/i.test(sentence) ? (isDistribute ? 0 : 1) : 1
        return { targets: count, targetFilter: filter }
      }
    }
  }
  return { targets: 0, targetFilter: null }
}

function parseCost(sentence) {
  const costParts = []
  const tapMatch = sentence.match(/\{T\}/)
  if (tapMatch) costParts.push('{T}')
  const manaMatch = sentence.match(/((?:\{[^}]+\}\s*)+)/)
  if (manaMatch) {
    const manaCost = manaMatch[1].trim()
    if (!costParts.includes('{T}') || manaCost !== '{T}') costParts.push(manaCost)
  }
  const sacMatch = sentence.match(/\bsacrifice\b[^.,;]*/i)
  if (sacMatch && sentence.indexOf('sacrifice') < (sentence.length / 2)) costParts.push('Sacrifice')
  const lifeMatch = sentence.match(/\bpay\s+(\d+)\s+life\b/i)
  if (lifeMatch) costParts.push(`Pay ${lifeMatch[1]} life`)
  const discardMatch = sentence.match(/\bdiscard\b[^.,;]*/i)
  if (discardMatch && sentence.indexOf('discard') < (sentence.length / 2)) costParts.push('Discard')
  return costParts.length > 0 ? costParts.join(', ') : null
}

function isActivated(sentence) {
  return /:\s*\w/i.test(sentence) && (/\{T\}/.test(sentence) || /\bpay\b/i.test(sentence) || /\bsacrifice\b/i.test(sentence))
}

function parseAbilities(oracleText, typeLine) {
  const abilities = []
  const text = oracleText.replace(/\s+/g, ' ')

  // Handle planeswalker loyalty separately
  if (classifyType(typeLine) === 'planeswalker') {
    const loyaltyAbilities = text.match(/([+\-−]\d+):\s*([^.\n]+)/g)
    if (loyaltyAbilities) {
      for (const la of loyaltyAbilities) {
        const m = la.match(/([+\-−]\d+):\s*(.+)/)
        if (m) {
          const effect = parseEffect(m[2])
          const tgt = parseTargets(m[2])
          abilities.push({
            abilityType: 'activated',
            triggerEvent: null,
            triggerCondition: null,
            isOptional: false,
            cost: m[1] === '0' ? '{0}' : m[1],
            targets: tgt.targets,
            targetFilter: tgt.targetFilter,
            effect,
          })
        }
      }
    }
    return abilities
  }

  const sentences = text.split(/[.;\n]/).map(s => s.trim()).filter(Boolean)

  for (const sentence of sentences) {
    // Skip reminder text in parentheses
    const cleanSentence = sentence.replace(/\([^)]*\)/g, '').trim()
    if (!cleanSentence) continue

    const isStatic = /\bcan't\b.*\b(attack|block)\b/i.test(cleanSentence) ||
      /\b(has|have|g(et|ain)s?)\s+(\+?\+?\d|deathtouch|flying|first strike|trample|haste|lifelink)/i.test(cleanSentence) ||
      /\bcan't be\b/i.test(cleanSentence)
    if (isStatic) {
      const effect = parseEffect(cleanSentence)
      const tgt = parseTargets(cleanSentence)
      abilities.push({
        abilityType: 'static',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: /\b(may|you may)\b/i.test(cleanSentence),
        cost: null,
        targets: tgt.targets,
        targetFilter: tgt.targetFilter,
        effect,
      })
      continue
    }

    // Activated ability (cost: effect)
    if (isActivated(cleanSentence)) {
      const cost = parseCost(cleanSentence)
      const effect = parseEffect(cleanSentence)
      const tgt = parseTargets(cleanSentence)
      abilities.push({
        abilityType: 'activated',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: /\b(may|you may)\b/i.test(cleanSentence),
        cost,
        targets: tgt.targets,
        targetFilter: tgt.targetFilter,
        effect,
      })
      continue
    }

    // Triggered ability
    let matched = false
    for (const tp of TRIGGER_PATTERNS) {
      if (tp.patterns.some(p => p.test(cleanSentence))) {
        const effect = parseEffect(cleanSentence)
        const tgt = parseTargets(cleanSentence)
        // Extract condition from trigger
        const cond = cleanSentence.replace(/^(when(?:ever)?|at\s+the\s+beginning\s+of\s+)/i, '').replace(/,.*$/, '').trim()
        abilities.push({
          abilityType: 'triggered',
          triggerEvent: tp.event,
          triggerCondition: cond || null,
          isOptional: /\b(may|you may)\b/i.test(cleanSentence),
          cost: null,
          targets: tgt.targets,
          targetFilter: tgt.targetFilter,
          effect,
        })
        matched = true
        break
      }
    }
    if (matched) continue

    // Spell ability (instant/sorcery text, or default)
    const effect = parseEffect(cleanSentence)
    const tgt = parseTargets(cleanSentence)
    const c = parseCost(cleanSentence)
    if (effect.kind !== 'other' || tgt.targets > 0) {
      abilities.push({
        abilityType: classifyType(typeLine) === 'instant' || classifyType(typeLine) === 'sorcery' ? 'spell' : 'triggered',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: /\b(may|you may)\b/i.test(cleanSentence),
        cost: !isActivated(cleanSentence) ? null : c,
        targets: tgt.targets,
        targetFilter: tgt.targetFilter,
        effect,
      })
    }
  }

  return abilities
}

function parseCard(scryfall) {
  const oracleText = scryfall.oracle_text ?? scryfall.card_faces?.[0]?.oracle_text ?? ''
  const fullOracle = oracleText
  const typeLine = scryfall.type_line ?? scryfall.card_faces?.[0]?.type_line ?? ''
  const manaCost = scryfall.mana_cost ?? scryfall.card_faces?.[0]?.mana_cost ?? ''
  const manaValue = scryfall.cmc ?? 0
  const cardType = classifyType(typeLine)
  const subtypes = parseSubtypes(typeLine)
  const keywords = parseKeywords(typeLine, oracleText)
  const entryTap = parseEntryTap(oracleText)
  const manaProduction = parseManaProduction(oracleText)
  const abilities = parseAbilities(oracleText, typeLine)

  return {
    cardName: scryfall.name,
    manaCost,
    manaValue,
    typeLine,
    cardType,
    subtypes,
    keywords,
    manaProduction,
    entryTapRule: cardType === 'land' ? entryTap.entryTapRule : null,
    conditionalEntryText: entryTap.conditionalEntryText,
    abilities,
    oracleText: fullOracle,
    scryfallId: scryfall.id,
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const { deck, cards: uniqueCards } = getUniqueCards(DECK_NAME)
  const ordered = [...new Set([deck.commander, ...(deck.partners ?? []), ...uniqueCards])]

  console.log(`Deck: ${DECK_NAME}\nUnique cards: ${ordered.length}`)
  console.log('Fetching Scryfall data...')
  const scryfall = await fetchScryfall(ordered)

  let output = {}
  if (existsSync(OUTPUT_FILE)) {
    output = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
    if (RESUME) console.log(`Resuming — ${Object.keys(output).length} already extracted`)
  }

  let count = 0
  for (const name of ordered) {
    if (RESUME && output[name]) continue
    const sc = scryfall.get(name)
    if (!sc) { console.log(`  SKIP  "${name}" — no Scryfall data`); continue }

    // Basic lands
    const tl = (sc.type_line ?? '').toLowerCase()
    if (tl.includes('basic') && tl.includes('land')) {
      const color = BASIC_COLORS[sc.name]
      output[name] = {
        cardName: sc.name, manaCost: '', manaValue: 0, typeLine: sc.type_line,
        cardType: 'land', subtypes: [sc.name], keywords: [],
        manaProduction: color ? { colors: [color], amount: 1 } : null,
        entryTapRule: 'never', conditionalEntryText: null,
        abilities: [], oracleText: '',
        scryfallId: sc.id,
      }
    } else {
      output[name] = parseCard(sc)
    }
    count++
    if (count % 25 === 0) console.log(`  ${count}/${ordered.length}...`)
  }

  validateOutput(output, ordered)
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`\nDone. ${Object.keys(output).length}/${ordered.length} cards → ${OUTPUT_FILE}`)

  // Stats
  const byType = {}
  let totalAbilities = 0
  for (const entry of Object.values(output)) {
    byType[entry.cardType] = (byType[entry.cardType] || 0) + 1
    totalAbilities += entry.abilities?.length ?? 0
  }
  console.log(`\nTypes: ${JSON.stringify(byType)}`)
  console.log(`Total abilities extracted: ${totalAbilities}`)
}

main().catch(err => { console.error(err); process.exit(1) })
