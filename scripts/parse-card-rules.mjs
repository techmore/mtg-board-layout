#!/usr/bin/env node

/**
 * Deterministic card rule parser. No LLM — pure pattern matching.
 * Scans Oracle text for keywords, triggers, activated abilities, ETBs, etc.
 *
 * Usage:
 *   node scripts/parse-card-rules.mjs [--deck blight-curse] [--resume]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = resolve(__dirname, 'rules-output')
mkdirSync(OUTPUT_DIR, { recursive: true })

const SCRYFALL_COLLECTION = 'https://api.scryfall.com/cards/collection'
const SCRYFALL_SEARCH = 'https://api.scryfall.com/cards/search'

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

// Authoritative decklists live in src/data/decklists/*.json (shared with the app).
// Override the inline placeholder copies above so the parser stays in sync.
const DECKLISTS_DIR = resolve(__dirname, '../src/data/decklists')
for (const file of readdirSync(DECKLISTS_DIR).filter((f) => f.endsWith('.json'))) {
  const deck = JSON.parse(readFileSync(resolve(DECKLISTS_DIR, file), 'utf8'))
  prebuiltDecks[deck.id] = {
    commander: deck.commander,
    partners: deck.partners ?? [],
    cards: deck.cards,
  }
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
        d.data.forEach(c => { map.set(c.name, c); map.set(c.name.split(' // ')[0], c) })
        const missing = d.not_found ?? []
        for (const miss of missing) {
          const url = `${SCRYFALL_SEARCH}?q=${encodeURIComponent(`name:"${miss.name}"`)}&unique=cards`
          const sres = await fetch(url, {
            headers: { 'User-Agent': 'MTGBoardLayout/1.0' },
            signal: controller.signal,
          })
          if (sres.ok) {
            const sd = await sres.json()
            const hit = sd.data.find(c => c.name.split(' // ')[0] === miss.name || c.name.startsWith(miss.name))
            if (hit) map.set(miss.name, hit)
          }
        }
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
  'skulk', 'split second',
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
  // Granted abilities ("Treasures you control have \"{T}, Sacrifice ~: Add...\")"
  // belong to other permanents, not this card — drop quoted segments first.
  const text = oracleText.replace(/["“”][^"“”]*["“”]/g, ' ')
  const addClauses = text.match(/\badd\b[^.\n]*/gi) ?? []
  if (addClauses.length === 0) return null
  const colors = new Set()
  for (const clause of addClauses) {
    if (/any(?: one)? color|any combination/i.test(clause)) { MANA_COLORS.forEach(c => colors.add(c)); break }
    const symbols = clause.match(/\{([WUBRGC])\}/gi) ?? []
    symbols.forEach(s => colors.add(s.replace(/[{}]/g, '')))
  }
  if (colors.size === 0) return null
  const amounts = addClauses.map(c => {
    // "Add {B} or {R}" produces one mana of either color — never two.
    if (/\bor\b/i.test(c) && !/\b(one|two|three|four|five)\b/i.test(c)) return 1
    if (/\bX\b/.test(c)) return 'X'
    const n = c.match(/\b(one|two|three|four|five)\b/i)
    if (n) return ({ one: 1, two: 2, three: 3, four: 4, five: 5 })[n[1].toLowerCase()]
    const syms = c.match(/\{[WUBRGC]\}/gi) ?? []
    return syms.length || 1
  })
  const amount = amounts.includes('X') ? 'X' : Math.max(...amounts)
  return { colors: [...colors], amount }
}

// ─── Ability parsing ───────────────────────────────────────────────────────
// Owner phrase shared by upkeep/draw-step/end-step patterns: covers
// "your", "each", "the", "each opponent's", "an opponent's", "each player's".
const TURN_OWNER = "(?:your|next|each|the|(?:each|an)?\\s*(?:opponent|player)s?'?s?)"
const TRIGGER_PATTERNS = [
  { event: 'landfall', patterns: [/\bwhen(?:ever)?\s+a\s+land\b[^.,;]{0,40}\benters?\b/i, /\blandfall\b/i] },
  { event: 'etb', patterns: [/\bwhen(?:ever)?\s+(?!a\s+land\b)(this|~|[a-z0-9 ]+)\s+enters?\b/i, /\bwhen(?:ever)?\s+.*\benters?\s+the\s+battlefield\b/i] },
  { event: 'dies', patterns: [/\bwhen(?:ever)?\s+.*\b(dies|die|dies|is put into a graveyard|leaves the battlefield)\b/i] },
  { event: 'upkeep', patterns: [new RegExp(`at\\s+the\\s+beginning\\s+of\\s+${TURN_OWNER}\\s+upkeep\\b`, 'i')] },
  { event: 'draw_step', patterns: [new RegExp(`at\\s+the\\s+beginning\\s+of\\s+${TURN_OWNER}\\s+draw\\s+step\\b`, 'i')] },
  { event: 'end_of_turn', patterns: [new RegExp(`at\\s+(?:the\\s+)?beginning\\s+of\\s+${TURN_OWNER}\\s+end\\s+(?:step|of\\s+turn)\\b`, 'i'), new RegExp(`at\\s+(?:the\\s+)?end\\s+(?:step|of\\s+turn)\\b`, 'i')] },
  { event: 'combat_damage', patterns: [/\bwhen(?:ever)?\s+.*\b(combat damage|deals combat damage|attacks and isn't blocked)\b/i] },
  { event: 'attack', patterns: [/\bwhen(?:ever)?\s+.*\battacks?\b/i] },
  { event: 'counter_placed', patterns: [/\bwhen(?:ever)?\s+.*\b(counter|counters)\s+(are\s+)?(is\s+)?put\s+on\b/i, /\bwhen(?:ever)?\s+.*\bput\b.{0,20}\b(counter|counters)\b/i] },
  { event: 'card_drawn', patterns: [/\bwhen(?:ever)?\s+.*\bdraws?\b/i] },
  { event: 'life_gain', patterns: [/\bwhen(?:ever)?\s+.*\bgains?\s+life\b/i] },
  { event: 'life_loss', patterns: [/\bwhen(?:ever)?\s+.*\bloses?\s+life\b/i] },
  { event: 'sacrifice', patterns: [/\bwhen(?:ever)?\s+.*\bsacrifices?\b/i] },
  { event: 'discard', patterns: [/\bwhen(?:ever)?\s+.*\bdiscards?\b/i] },
  { event: 'cast', patterns: [/\bwhen(?:ever)?\s+.*\bcasts?\b/i] },
  { event: 'graveyard', patterns: [/\bwhen(?:ever)?\s+.*\b(graveyard|dies|die|dies)\b/i] },
]

const EFFECT_PATTERNS = [
  // ── Four-category completion: Ring, player-targeting, sub-mechanics ──
  // Placed above the greedy generic patterns (create_token, deal_damage,
  // draw_cards, search_library, return_from_graveyard) so these win.
  { kind: 'ring_tempts', regex: /\bthe Ring tempts you\b/i },
  { kind: 'force_attack', regex: /\bcreatures your opponents control attack (?:this turn|each combat) if able\b/i },
  { kind: 'quest_death_tokens', regex: /\bcreates? a tapped 1\/1 white Soldier creature token for each quest counter\b/i },
  { kind: 'skyclave_return', regex: /\bthe exiled card's owner creates an X\/X blue Illusion creature token\b/i },
  { kind: 'partner_tutor', regex: /\bPartner with [A-Z][^.]*/i },
  { kind: 'populate', regex: /\bpopulate\b/i },
  { kind: 'manifest_flip', regex: /\bturn a face-down creature you control face up\b/i },
  { kind: 'enable_graveyard_cast', regex: /\bgains? (?:escape|unearth(?: \{\d+\})?|jump-start)(?: \{\d+\})? until end of turn\b/i },
  { kind: 'anrakyr_life_cast', regex: /\bcast an artifact spell from your hand or graveyard by paying life equal to its mana value\b/i },
  { kind: 'three_dog_aura_copies', regex: /\byou may pay \{\d+\} and sacrifice an Aura attached to\b/i },
  { kind: 'lobelia_drain', regex: /\bEach opponent loses 2 life and you gain 2 life\b/i },
  { kind: 'arcane_lighthouse_strip', regex: /\bcreatures your opponents control lose hexproof and shroud\b/i },
  { kind: 'energy_reanimate', regex: /\bpay an amount of \{E\} equal to that card's mana value[\s\S]*?return it\b/i },
  { kind: 'confiscation_energy', regex: /\bpay an amount of \{E\} equal to that permanent's mana value[\s\S]*?gain control of it\b/i },
  { kind: 'graveyard_to_library', regex: /\bputs? all the cards from (?:their|your) graveyard on the bottom of (?:their|your) library\b/i },
  { kind: 'loot_optional', regex: /\byou may discard a card[\s.]*If you do, draw a card\b/i },
  { kind: 'discard_hand_draw', regex: /\byou may discard your hand[\s.]*If you do, draw\b/i },
  { kind: 'animate_self', regex: /\bbecomes an? (?:legendary )?\d+\/\d+ [\w' ]*creature\b[^.]*until end of turn/i },
  { kind: 'animate_self', regex: /\bThis Vehicle becomes an artifact creature until end of turn\b/i },
  { kind: 'untap_x_lands', regex: /\buntap up to X lands, where X is the greatest power\b/i },
  { kind: 'bounce_n_nonland', regex: /\bReturn \w+ target nonland permanents to their owners' hands\b/i },
  { kind: 'slithermuse_draw', regex: /\bdraw cards equal to the difference\b/i },
  { kind: 'poison_diff', regex: /\bfewer than nine poison counters, they get a number of poison counters equal to the difference\b/i },
  { kind: 'skyclave_exile', regex: /\bexile up to one target nonland, nontoken permanent you don't control with mana value 4 or less\b/i },
  { kind: 'cryptek_mark', regex: /\bWhen that creature dies this turn, return it to the battlefield tapped under your control\b/i },
  { kind: 'star_athlete_choice', regex: /\bIts controller may sacrifice it[\s.]*If they don't, this creature deals 5 damage\b/i },
  { kind: 'chaos_warp', regex: /\bshuffles it into their library, then reveals the top card\b/i },
  { kind: 'tyrite_sanctum', regex: /\bbecomes a God in addition to its other types[\s.]*Put a \+1\/\+1 counter on it\b/i },
  { kind: 'suspended_sentence', regex: /\bThat player loses 3 life\b/i },
  { kind: 'animate_target_temp', regex: /\bTarget land you control becomes an X\/X Elemental creature\b/i },
  { kind: 'yes_man_give', regex: /\bTarget opponent gains control of Yes Man\b/i },
  { kind: 'forge_of_heroes', regex: /\bChoose target commander that entered this turn\b/i },
  { kind: 'war_in_heaven_reanimate', regex: /\bup to three target creature cards with total mana value[\s\S]*?Return each of them to the battlefield\b/i },
  { kind: 'destroy_equal_toughness', regex: /\btarget creatures with equal toughness[\s\S]*?Destroy the chosen creatures\b/i },
  { kind: 'disorienting_ramp', regex: /\bsearch your library for up to that many land cards\b/i },
  { kind: 'first_spell_damage', regex: /\bdeals? damage equal to that spell's mana value\b/i },
  { kind: 'parity_ban', regex: /\bchoose odd or even\b/i },
  { kind: 'sacrifice_small_make_tokens', regex: /\bsacrifice any number of creatures each with base power or toughness 1 or less\b/i },
  { kind: 'black_gate', regex: /\bcan't be blocked by creatures that player controls this turn\b/i },
  // Engine-enforced conditional taxes/gates classified silently.
  { kind: 'static_restriction', regex: /\bcreatures? can't attack you or planeswalkers you control unless their controller pays \{\d+\}/i },
  { kind: 'static_restriction', regex: /\bcreatures? can't block unless their controller pays \{\d+\}/i },
  { kind: 'static_restriction', regex: /\bcan't attack or block unless you have (?:(?:\d+)|one|two|three|four|five|six|seven|eight|nine|ten) or more cards in hand\b/i },
  { kind: 'static_noop', regex: /\buntap all attacking creatures\b/i },
  { kind: 'static_restriction', regex: /\bmust be blocked if able\b/i },
  // ── Generic patterns ──
  { kind: 'create_token', regex: /\bcreate\b[^.]*\btokens?\b/i },
  { kind: 'put_counter', regex: /\bput\b[^.]*\b(counter|counters)\b/i },
  { kind: 'double_counters', regex: /\bdouble\b[^.]*\bcounters?\b/i },
  { kind: 'remove_counters', regex: /\bremove\b[^.,;]*\bcounters?\b/i },
  { kind: 'add_mana', regex: /\badd\b[^.,;]*\b(mana|one mana|two mana|any color|any combination)\b/i },
  { kind: 'add_mana', regex: /\badd\b[^.,;]*\{/i },
  { kind: 'deal_damage', regex: /\bdeals?\b[^.]*\bdamage\b/i },
  { kind: 'destroy', regex: /\bdestroy\b[^]*?(?=\.|$)/i },
  { kind: 'exile', regex: /\bexile\b[^]*?(?=\.|$)/i },
  { kind: 'draw_cards', regex: /\bdraws?\b[^.]*\bcard(s)?\b/i },
  { kind: 'lose_life', regex: /\bloses?\b[^.]*\blife\b/i },
  { kind: 'gain_life', regex: /\bgains?\b[^.]*\blife\b/i },
  { kind: 'search_library', regex: /\bsearch\b[^.]*\blibrary\b/i },
  { kind: 'return_from_graveyard', regex: /\b(return|put)\b[^.]*\b(from|to|onto)\b[^.]*\b(battlefield|hand|graveyard)\b/i },
  { kind: 'cast_from_graveyard', regex: /\b(?:cast|play)\b[^.]*\b(?:from (?:your|a) graveyard|the exiled card|from exile|exiled with)\b[^.]*\bwithout paying\b/i },
  { kind: 'detach_reattach', regex: /\battach this (?:Aura|Equipment) to\b/i },
  { kind: 'return_all_other', regex: /\breturn all other creatures\b[^.]*\bt(?:heir owners')? hands?\b/i },
  { kind: 'double_power', regex: /\bdouble its power until end of turn\b/i },
  { kind: 'double_equipped_power', regex: /\bdouble equipped creature's power\b/i },
  { kind: 'x_pump', regex: /\bgets \+x\/(?:[+-]?x|[+-]?\d+)\s+until end of turn\b/i },
  { kind: 'move_counter', regex: /\bmove (?:a |\{1\} )?(?:shield counter|counter|the counter)/i },
  { kind: 'amass', regex: /\bamass (?:orcs |an? army )?(\d+|x)/i },
  { kind: 'investigate', regex: /\binvestigate\b/i },
  { kind: 'exchange_life_toughness', regex: /\bexchange target opponent's life total with\b/i },
  { kind: 'counter_target', regex: /\bcounter\b[^.]*\bspell\b/i },
  { kind: 'sacrifice', regex: /\bsacrifice\b\s+(?:it|this\s+\w+)\b/i },
  { kind: 'mass_sacrifice', regex: /\b(?:each (?:player|opponent)|everyone)\b[^.]*\bsacrifices?\b/i },
  { kind: 'mass_sacrifice', regex: /\b(?:you )?sacrifice\b\s+(?:a|another|an)\s+(?:artifact|creature|enchantment|land|planeswalker|token)\b/i },
  { kind: 'untap_lands', regex: /\buntap\b[^.]*\ball lands\b/i },
  { kind: 'untap_creatures', regex: /\buntap\b[^.]*\beach creature\b/i },
  { kind: 'untap_enchanted', regex: /\buntap\b[^.]*\beach enchanted permanent\b/i },
  { kind: 'each_player_mill', regex: /\beach player mills?\b/i },
  { kind: 'regenerate', regex: /\bregenerate target\b/i },
  { kind: 'tap_x_myr', regex: /\btap x untapped myr you control\b/i },
  { kind: 'tap_target', regex: /\btap\b[^.,;]*\btarget\b/i },
  { kind: 'target_player_mill', regex: /\b(?:target player|each opponent)\s+mills?\b/i },
  { kind: 'untap_target', regex: /\buntap up to \w+ target\b/i },
  { kind: 'attach_target', regex: /\battach (?:this|target) (?:Aura|Equipment|aura|equipment)\b/i },
  { kind: 'roll_dice', regex: /\broll (?:a |x )?(?:six-sided|\d+-sided)? ?(?:die|dice)\b/i },
  { kind: 'cant_be_blocked', regex: /\btarget\b[^.]*\bcan't be blocked\b/i },
  { kind: 'manifest', regex: /\bmanifest\b(?:\s+dread(?:\s+twice)?)?/i },
  { kind: 'scry', regex: /\bscry\b\s*\d*/i },
  { kind: 'scry', regex: /\blook at the top\b[^.]*\b(?:card|cards|library)\b[^.]*\blibrary\b/i },
  { kind: 'scry', regex: /\breveal the top\b[^.]*\b(?:card|cards)\b[^.]*\blibrary\b/i },
  { kind: 'proliferate', regex: /\bproliferate\b/i },
  { kind: 'mill', regex: /\bmill\b[^.,;]*?(?:\d+|X|one|two|three|four|five|a)\s*card(s)?/i },
  { kind: 'mill', regex: /\bput\b[^.]*?\bthe\s+top\s+(?:\d+|X|one|two|three|four|five)\s+cards?\b[^.]*\b(graveyard|library)\b/i },
  { kind: 'fight', regex: /\bfights?\b/i },
  { kind: 'storm', regex: /\bstorm\b/i },
  { kind: 'copy_spell', regex: /(?:copy it|copy this spell)\b/i },
  { kind: 'discover', regex: /\bdiscover\s+(\d+)/i },
  { kind: 'cascade', regex: /\bcascade\b/i },
  { kind: 'annihilator', regex: /\bannihilator\s*(\d+)/i },
  { kind: 'sacrifice_n_permanents', regex: /\bdefending player sacrifices (\w+) permanents\b/i },
  { kind: 'exile_n_permanents', regex: /\bdefending player exiles (\w+) permanents\b/i },
  { kind: 'equip', regex: /\bequip\s*\{[^}]+\}/i },
  { kind: 'pump', regex: /(?:gets|gain(?:s)?|get)\s*[^.,;]*?([-−+]?\d+)\s*\/\s*([-−+]?\d+)\s*until end of turn/i },
  // Static anthems ("creatures you control get +2/+2") have no time limit;
  // the until-end-of-turn pattern above is more specific and listed first.
  { kind: 'pump', regex: /(?:gets|gain(?:s)?|get)\s*([-−+]?\d+)\s*\/\s*([-−+]?\d+)/i },
  // Temporary keyword grants ("Creatures you control gain deathtouch until end
  // of turn", "It gains haste"). Static "have"/"has" grants stay unresolvable.
  { kind: 'keyword_pump', regex: /\bgains?\s+(?:[a-z ]+?\s+)?(deathtouch|flying|first strike|double strike|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|ward)\b/i },
  { kind: 'gains_keyword', regex: /\bgains?\s+(skulk|deathtouch|flying|first strike|haste|lifelink|trample|vigilance)\s+until end of turn\b/i },
  { kind: 'shuffle_into_library', regex: /\bshuffle it into its owner's library\b/i },
  { kind: 'experience_counter', regex: /\byou get an experience counter\b/i },
  { kind: 'switch_power_toughness', regex: /\bswitch the power and toughness of\b/i },
  { kind: 'add_energy', regex: /\byou get\b[^.,;]*\{e\}/i },
  { kind: 'gain_monarch', regex: /\byou become the monarch\b/i },
  { kind: 'gain_control', regex: /\bgain(?:s)? control of\s+(?:up to one\s+)?target\s+(?:creature|permanent|artifact|enchantment)\b/i },
  { kind: 'gain_rad', regex: /\b(?:get|gets|getting)\b[^.,;]*\brad counters?\b/i },
  { kind: 'lose_rad', regex: /\bloses?\b[^.,;]*\brad counters?\b/i },
  // The app has no counter/regenerate/prevent mechanics, so these are
  // vacuously true — resolve silently instead of toasting "not implemented".
  { kind: 'static_noop', regex: /\bcan't be (countered|regenerated)|can't be prevented/i },
  // Plain attack/block restrictions ("This creature can't block", "can't be
  // blocked") are enforced by the combat engines.
  { kind: 'static_restriction', regex: /\bcan't\s+(?:attack(?:\s+or\s+block)?|(?:be\s+)?block(?:ed)?)\b(?!.*\b(unless|as long as|if)\b)/i },
  { kind: 'static_restriction', regex: /\bcan't be blocked as long as defending player (?:has a rad counter|controls an? [A-Za-z]+)\b/i },
  // Enchanted/equipped permanent restrictions are enforced by canBlock/canAttack.
  { kind: 'static_noop', regex: /\b(?:enchanted|equipped) (?:permanent|creature) can't attack or block\b/i },
  // Shroud/hexproof reminders ("It can't be the target of spells or abilities")
  // are covered by the app's hexproof-targeting guard.
  { kind: 'static_noop', regex: /\bcan't be the target of\b/i },
  // Menace reminder text — the menace keyword is already enforced by both
  // combat engines ("two or more blockers").
  { kind: 'static_noop', regex: /\bcan't be blocked except by two or more creatures\b/i },
  // Skulk reminder text — the skulk keyword is now enforced in blocking.
  { kind: 'static_noop', regex: /\bcan't be blocked by creatures with greater power\b/i },
  // Menace/fear/shroud-style reminder texts describing block conditions that
  // the app's combat model doesn't evaluate (artifact/color/type blockers).
  { kind: 'static_noop', regex: /\bcan't be blocked except by (artifact creatures|creatures that share a color with|creatures with (?:greater|equal) power)/i },
  // Attack tax (Ghostly Prison / Propaganda) — enforced by the combat engines.
  { kind: 'static_noop', regex: /\bcreatures?\s+can't attack you unless their controller pays\b/i },
  // Protection-from grants ("gains protection from each color") — the app has
  // no per-color damage/block model to honor it mechanically, so it's resolved
  // silently (a pump-like protection isn't modeled).
  { kind: 'static_noop', regex: /\bgains? protection from\b/i },
  // Activated-ability locks (Linvala, enchanted "can't be activated") — applied
  // via the context-menu gate.
  { kind: 'static_noop', regex: /\bactivated abilities of .* can't be activated\b/i },
  { kind: 'static_noop', regex: /\bcan't be activated unless/i },
  // "This mana can't be spent to pay generic mana costs" (Jegantha) — a
  // companion restriction; resolve silently.
  { kind: 'static_noop', regex: /\bthis mana can't be spent to pay generic\b/i },
  // "Activate only if you have N or more life" (Bilbo) — gated in the activated
  // menu.
  { kind: 'static_noop', regex: /\bactivate only if you have\b/i },
  // "This .* can't be sacrificed" / "Mana abilities can't be copied/targeted".
  { kind: 'static_noop', regex: /\bcan't be sacrificed\b/i },
  { kind: 'static_noop', regex: /\bmana abilities can't be (copied|targeted)\b/i },
  // Evoke consequence ("it's sacrificed when it enters") — evoke costs aren't
  // modeled, so the reminder is vacuously inert.
  { kind: 'static_noop', regex: /\bit'?s sacrificed when it enters\b/i },
  // Static keyword anthems ("creatures you control have haste", "equipped
  // creature has deathtouch") are evaluated by the combat engines.
  { kind: 'static_keyword', regex: /\b(?:creatures? you control|other [a-z ]*creatures? you control|equipped creature|enchanted creature|[a-z]+s? you control)\s+(?:have|has)\s+(?:deathtouch|flying|first strike|double strike|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|ward)\b/i },
]

function pumpScope(sentence) {
  if (/your opponents control/i.test(sentence)) return 'opponent'
  if (/each other creature/i.test(sentence) || /other creatures/i.test(sentence)) return 'others'
  if (/you control/i.test(sentence)) return 'own'
  return 'all'
}

function parseEffect(sentence) {
  for (const ep of EFFECT_PATTERNS) {
    const m = sentence.match(ep.regex)
    if (m) {
      const params = {}
      // Counter placement detection ("put a +1/+1 counter" / "put a -1/-1 counter")
      if (/(counter|counters)/i.test(sentence) && /\bput\b/i.test(sentence)) {
        const c = sentence.match(/([-−+]?\d\s*[/]\s*[-−+]?\d)\s*(?:counter|counters)/i)
        if (c) {
          const normalized = c[1].replace(/[−]/g, '-').replace(/\s+/g, '').toLowerCase()
          params.counterKind = normalized.startsWith('-') ? '-1/-1' : '+1/+1'
          const n = sentence.match(/\bput\b[^.]*?\b(two|three|four|five|X)\b/i)
          if (n) params.amount = ({ two: 2, three: 3, four: 4, five: 5, x: 'X' })[n[1].toLowerCase()] ?? 1
          else params.amount = 1
          params.scope = pumpScope(sentence)
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
      // Mill amount
      if (ep.kind === 'mill') {
        const n = sentence.match(/\b(two|three|four|five)\s+cards?\b/i)
        if (n) params.amount = ({ two: 2, three: 3, four: 4, five: 5 })[n[1].toLowerCase()]
        else {
          const d = sentence.match(/\b(\d+)\s+cards?\b/i)
          if (d) params.amount = parseInt(d[1])
        }
        if (!params.amount) params.amount = 1
      }
      // Draw / Life amount
      if (['draw_cards', 'lose_life', 'gain_life', 'scry'].includes(ep.kind)) {
        const n = sentence.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|X)\b/i)
        if (n) params.amount = ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, x: 'X' })[n[1].toLowerCase()] ?? 1
        else { const d = sentence.match(/\b(\d+)\b/); if (d) params.amount = parseInt(d[1]) }
        if (!params.amount) params.amount = 1
      }
      // Damage amount ("deals 3 damage", "deals X damage", "deals two damage")
      if (ep.kind === 'deal_damage') {
        const d = sentence.match(/\bdeals?\s+(\d+)\s+damage\b/i)
        if (d) params.amount = parseInt(d[1])
        else {
          const w = sentence.match(/\bdeals?\s+(one|two|three|four|five|X)\s+damage\b/i)
          if (w) params.amount = ({ one: 1, two: 2, three: 3, four: 4, five: 5, x: 'X' })[w[1].toLowerCase()] ?? 1
        }
        if (params.amount === undefined) params.amount = 1
      }
      // Destroy / Exile target
      if (['destroy', 'exile'].includes(ep.kind)) {
        const perm = sentence.match(/\b(target\s+\w+(?:\s+\w+)?)/i)
        if (perm) params.targetHint = perm[1]
      }
      // Until-end-of-turn pump
      if (ep.kind === 'pump') {
        const m = sentence.match(/([-−+]?\d+)\s*\/\s*([-−+]?\d+)/i)
        if (m) {
          params.power = parseInt(m[1].replace(/[−]/g, '-'), 10)
          params.toughness = parseInt(m[2].replace(/[−]/g, '-'), 10)
        }
        params.scope = pumpScope(sentence)
      }
      if (ep.kind === 'equip') {
        const costMatch = sentence.match(/equip\s*(\{[^}]+\})/i)
        if (costMatch) params.cost = costMatch[1]
      }
      if (ep.kind === 'annihilator') {
        const amountMatch = sentence.match(/annihilator\s*(\d+)/i)
        if (amountMatch) params.amount = parseInt(amountMatch[1], 10)
      }
      if (ep.kind === 'return_from_graveyard') {
        if (/\bbattlefield\b/i.test(sentence)) params.zone = 'battlefield'
        else if (/\bhand\b/i.test(sentence)) params.zone = 'hand'
      }
      if (ep.kind === 'keyword_pump') {
        const k = sentence.match(/\b(deathtouch|flying|first strike|double strike|haste|hexproof|indestructible|lifelink|menace|reach|trample|vigilance|ward)\b/i)
        if (k) params.keyword = k[1].toLowerCase()
        params.scope = pumpScope(sentence)
      }
      if (ep.kind === 'discover') {
        const n = sentence.match(/\bdiscover\s+(\d+)/i)
        if (n) params.amount = parseInt(n[1], 10)
      }
      if (ep.kind === 'gains_keyword') {
        const k = sentence.match(/\bgains?\s+(skulk|deathtouch|flying|first strike|haste|lifelink|trample|vigilance)\b/i)
        if (k) params.keyword = k[1].toLowerCase()
      }
      if (ep.kind === 'x_pump') {
        // "gets +X/+0 until end of turn, where X is the greatest power among
        // creatures you control" (Orcish Siegemaster).
        if (/\bgreatest power among creatures you control\b/i.test(sentence)) params.x_source = 'greatest_power'
        else if (/\bnumber of food counters/i.test(sentence)) params.x_source = 'counters'
        else if (/\bnumber of auras? .*(?:attached|on)/i.test(sentence)) params.x_source = 'auras'
        else if (/\bamount of \{e\} you have\b/i.test(sentence)) params.x_source = 'energy'
        const m = sentence.match(/\+x\s*\/\s*([+-]?x|[+-]?\d+)/i)
        if (m) params.toughness = m[1].toLowerCase() === 'x' ? 'x' : m[1]
        params.power = 'x'
      }
      if (ep.kind === 'manifest') {
        // "manifest dread" mills one card then manifests the next; "twice" x2.
        if (/\bdread\b/i.test(sentence)) params.dread = /\btwice\b/i.test(sentence) ? 2 : 1
        else params.dread = 0
      }
      if (ep.kind === 'amass') {
        const n = sentence.match(/\bamass\s+(?:orcs\s+)?(\d+|x)/i)
        if (n) params.amount = n[1].toLowerCase() === 'x' ? (sentence.match(/\bwhere x is .*? (\d+)/i)?.[1] ? 'X' : 1) : parseInt(n[1], 10)
        else params.amount = 1
      }
      if (ep.kind === 'gain_control') {
        params.temporary = /\buntil end of turn\b|\bfor as long as\b/i.test(sentence)
      }
      if (ep.kind === 'gain_rad' || ep.kind === 'lose_rad') {
        if (/\beach (?:player|opponent)\b/i.test(sentence)) params.scope = 'each'
        else if (/\byou(?: may)? get\b|you get/i.test(sentence)) params.scope = 'you'
        else if (/\b(defending player|target player)\b/i.test(sentence)) params.scope = 'opponent'
        else params.scope = 'opponent'
        if (/\bequal to its power\b/i.test(sentence)) params.amount = 'power'
        else {
          const n = sentence.match(/\b(one|two|three|four|five|six)\s*rad/i)
          if (n) params.amount = ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 })[n[1].toLowerCase()]
          else params.amount = 1
        }
      }
      if (ep.kind === 'mass_sacrifice') {
        // "Sacrifice another enchantment: ..." is an activated-ability COST, not
        // a mass-sacrifice effect — let the sentence fall through.
        if (/\bsacrifice\b[^:]*:/i.test(sentence)) continue
        if (/\beach opponent\b/i.test(sentence)) params.scope = 'opponent'
        else if (/\beach (?:player|everyone)\b/i.test(sentence)) params.scope = 'all'
        else params.scope = 'own'
        if (/\btokens?\b/i.test(sentence)) params.kind = 'token'
        else if (/\bpermanents?\b/i.test(sentence)) params.kind = 'permanent'
        else if (/\bplaneswalker\b/i.test(sentence)) params.kind = 'creature_or_planeswalker'
        else params.kind = 'creature'
      }
      if (ep.kind === 'add_energy') {
        // "you get six {E}" / "you get {E}{E}" — the word number wins over the
        // symbol count ("six {E}" is one symbol but six energy).
        const n = sentence.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*\{E\}/i)
        if (n) params.amount = ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 })[n[1].toLowerCase()]
        else params.amount = (sentence.match(/\{E\}/gi) ?? []).length || 1
      }
      if (ep.kind === 'remove_counters') {
        // "remove a time counter" (1), "remove up to three counters" (3),
        // "remove all counters" (all).
        if (/\ball\b/i.test(sentence)) params.amount = 'all'
        else {
          const n = sentence.match(/\b(\d+|one|two|three|four|five)\s*(?:counter|counters)/i)
          if (n) {
            const v = n[1].toLowerCase()
            params.amount = v === 'one' ? 1 : /^\d+$/.test(v) ? parseInt(v, 10) : ({ two: 2, three: 3, four: 4, five: 5 })[v] ?? 1
          } else params.amount = 1
        }
      }
      if (ep.kind === 'animate_self') {
        // "becomes a legendary 6/6 … creature with menace and deathtouch" /
        // "This Vehicle becomes an artifact creature" (keeps printed P/T).
        const pt = sentence.match(/becomes an? (?:legendary )?(\d+)\/(\d+)/i)
        params.power = pt ? parseInt(pt[1], 10) : 0
        params.toughness = pt ? parseInt(pt[2], 10) : 0
        const keywords = []
        for (const kw of ['menace', 'deathtouch', 'trample', 'haste', 'flying', 'vigilance', 'lifelink']) {
          if (new RegExp(`\\b${kw}\\b`, 'i').test(sentence)) keywords.push(kw)
        }
        params.keywords = keywords
      }
      if (ep.kind === 'discard_hand_draw') {
        const n = sentence.match(/draw (one|two|three|four|five|\d+) cards/i)
        params.amount = n ? (({ one: 1, two: 2, three: 3, four: 4, five: 5 })[n[1]] ?? parseInt(n[1], 10) ?? 4) : 4
      }
      if (ep.kind === 'bounce_n_nonland') {
        const n = sentence.match(/Return (\w+) target nonland/i)
        params.count = n ? (({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 })[n[1].toLowerCase()] ?? 6) : 6
      }
      return { kind: ep.kind, params }
    }
  }
  return { kind: 'other', params: { description: sentence.slice(0, 200) } }
}

function parseTargets(sentence) {
  // Qualifiers like "nonland" / "noncreature" / "nontoken" precede the type
  // word ("target nonland permanent").
  const qualifier = '(?:nonland\\s+|noncreature\\s+|nontoken\\s+)?'
  if (new RegExp(`\\btarget\\s+${qualifier}(creature|player|opponent|artifact|enchantment|land|planeswalker|permanent|spell)`, 'i').test(sentence)) {
    const filters = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'permanent', 'spell', 'player', 'opponent']
    for (const f of filters) {
      if (new RegExp(`target\\s+${qualifier}${f}`, 'i').test(sentence)) {
        // Players aren't targetable in this app (targeting is card-based):
        // a player target resolves as the source owner instead.
        if (f === 'player' || f === 'opponent') {
          return { targets: 0, targetFilter: null }
        }
        // Capture the qualifier ("nonland permanent") and the trailing filter
        // ("you don't control") so the target rules survive to the UI.
        const extra = sentence.match(new RegExp(`target\\s+(${qualifier})?(${f})([^.,;]*)`, 'i'))
        const filter = [extra[1]?.trim(), f, extra[3]?.trim()].filter(Boolean).join(' ').trim()
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
  // Energy costs: "Pay six {E}", "Pay {E}{E}{E}", "Pay one or more {E}".
  const payClause = sentence.match(/\bpay\b[^.,;]*/i)
  if (payClause && /\{E\}/i.test(payClause[0])) {
    const energyWord = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
    const digit = payClause[0].match(/\b(\d+)\s*\{E\}/i)?.[1]
    const word = payClause[0].match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*\{E\}/i)?.[1]
    const count = digit ? parseInt(digit, 10) : word ? energyWord[word.toLowerCase()] : (payClause[0].match(/\{E\}/gi) ?? []).length
    if (count > 0) costParts.push(`Pay ${count} {E}`)
  }
  const discardMatch = sentence.match(/\bdiscard\b[^.,;]*/i)
  if (discardMatch && sentence.indexOf('discard') < (sentence.length / 2)) costParts.push('Discard')
  return costParts.length > 0 ? costParts.join(', ') : null
}

function isActivated(sentence) {
  return /\bequip\s*\{[^}]+\}/i.test(sentence) ||
    (/:\s*\w/i.test(sentence) && (/\{T\}/.test(sentence) || /\bpay\b/i.test(sentence) || /\bsacrifice\b/i.test(sentence)))
}

function mkAbility(abilityType, effect, extra = {}) {
  return {
    abilityType,
    triggerEvent: null,
    triggerCondition: null,
    isOptional: false,
    cost: null,
    targets: 0,
    targetFilter: null,
    effect,
    ...extra,
  }
}

function parseManaBoost(s) {
  if (/any color/i.test(s)) return { anyColor: true }
  const colors = [...s.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1])
  return colors.length ? { colors } : {}
}

// Sentence shapes seen repeatedly in deck rule outputs that the generic
// trigger/effect tables miss. Returns an ability or null.
function parseSpecialAbility(sentence) {
  let m
  // "Whenever enchanted land is tapped for mana, its controller adds an additional one mana of any color."
  // (No ^ anchor: newline-normalized text may prefix "Enchant land" onto the sentence.)
  if ((m = sentence.match(/Whenever enchanted .+? is tapped for mana, its controller adds an additional (.+?)\.?$/i))) {
    return mkAbility('triggered', { kind: 'add_mana', params: parseManaBoost(m[1]) }, {
      abilityType: 'triggered', triggerEvent: 'mana_tapped', triggerCondition: sentence, isOptional: false,
    })
  }
  // "This creature enters with X +1/+1 counters on it."
  if ((m = sentence.match(/^This creature enters with (X|\d+) ([+-]?\d\/[+-]?\d+) counters? on it/i))) {
    return mkAbility('static', {
      kind: 'put_counter',
      params: { counterKind: m[2].includes('/') ? (m[2].startsWith('-') ? '-1/-1' : '+1/+1') : m[2], amount: /^x$/i.test(m[1]) ? 'X' : parseInt(m[1]), scope: 'self' },
    }, { triggerCondition: sentence })
  }
  // "Creatures you control have base power and toughness X/X until end of turn."
  if ((m = sentence.match(/^Creatures you control have base power and toughness (\S+)\/(\S+)/i))) {
    return mkAbility('spell', {
      kind: 'pump',
      params: { power: m[1], toughness: m[2], scope: 'own_creatures', baseToughness: true, untilEndOfTurn: true },
    }, { triggerCondition: sentence })
  }
  // "All creatures get -X/-X until end of turn."
  if ((m = sentence.match(/^(?:All |Each |Nonland )?creatures? get -([^/\s.]+)\/-([^/\s.]+)/i))) {
    return mkAbility('spell', {
      kind: 'pump',
      params: { power: '-' + m[1], toughness: '-' + m[2], scope: 'all_creatures', untilEndOfTurn: true },
    }, { triggerCondition: sentence })
  }
  // "You may have this Equipment/artifact enter as a copy of any ..."
  if (/^You may have this .+ enter as a copy of any/i.test(sentence)) {
    return mkAbility('static', { kind: 'static_noop', params: {} }, { triggerCondition: sentence, isOptional: true })
  }
  // Characteristic definition: "<Name>'s power and toughness are each equal to the number of lands you control."
  if (/power and toughness are each equal to the number of .+ you control/i.test(sentence)) {
    return mkAbility('static', { kind: 'static_noop', params: {} }, { triggerCondition: sentence })
  }
  // "Prevent all combat damage that would be dealt this turn."
  if (/^Prevent all combat damage/i.test(sentence)) {
    return mkAbility('spell', { kind: 'static_restriction', params: { preventCombatDamage: true, untilEndOfTurn: true } }, { triggerCondition: sentence })
  }
  // "Gain control of each noncommander creature with mana value 3 or less."
  if ((m = sentence.match(/^Gain control of each (.+)$/i))) {
    const params = { scope: 'each' }
    const mv = m[1].match(/mana value (\d+) or less/i)
    if (mv) params.maxManaValue = parseInt(mv[1])
    if (/noncommander/i.test(m[1])) params.excludeCommander = true
    return mkAbility('spell', { kind: 'gain_control', params }, { triggerCondition: sentence })
  }
  // "Whenever an opponent taps an artifact for mana, gain control of that artifact until ..."
  if (/^Whenever an opponent taps an artifact for mana, gain control/i.test(sentence)) {
    return mkAbility('triggered', { kind: 'gain_control', params: { temporary: true } }, {
      triggerEvent: 'mana_tapped', triggerCondition: sentence,
    })
  }
  // "...you may play a land and cast a permanent spell ... from your graveyard."
  if (/play a land and cast a permanent spell .* from your graveyard/i.test(sentence)) {
    return mkAbility('static', { kind: 'cast_from_graveyard', params: { permanentsOnly: true } }, {
      triggerCondition: sentence, isOptional: true,
    })
  }
  // Extra land drops / land-type grants: "You may play an additional land on each of your turns."
  if (/play an additional land on each of your turns/i.test(sentence)) {
    return mkAbility('static', { kind: 'static_noop', params: {} }, { triggerCondition: sentence, isOptional: true })
  }
  // "Lands you control are every basic land type ..." / "... are Forest lands in addition to their other types"
  if (/(?:Lands|creatures) you control are .+(?:in addition to their other types|basic land type)/i.test(sentence)) {
    return mkAbility('static', { kind: 'static_noop', params: {} }, { triggerCondition: sentence })
  }
  return null
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

  // ── Compound multi-sentence abilities ──
  // "Choose target X. <effect>" shapes resolve as ONE effect spanning several
  // sentences. When a run of consecutive sentences matches a compound pattern,
  // merge them so the classification and pattern tables see the whole.
  const COMPOUND_PATTERNS = [
    [/target creatures with equal toughness[\s\S]*?Destroy the chosen creatures/i, 'destroy_equal_toughness'],
    [/up to three target creature cards with total mana value[\s\S]*?Return each of them to the battlefield/i, 'war_in_heaven_reanimate'],
    [/Choose target artifact or creature[\s.]*You get \{E\}\{E\}\{E\}\{E\}[\s\S]*?gain control of it/i, 'confiscation_energy'],
    [/Choose up to one target artifact or creature card in your graveyard[\s\S]*?return it from your graveyard to the battlefield/i, 'energy_reanimate'],
    [/Choose another target artifact creature you control[\s.]*When that creature dies this turn, return it to the battlefield tapped under your control/i, 'cryptek_mark'],
    [/choose up to one target nonland permanent[\s.]*Its controller may sacrifice it[\s.]*If they don't, this creature deals 5 damage/i, 'star_athlete_choice'],
    [/The owner of target permanent shuffles it into their library, then reveals the top card of their library[\s.]*If it's a permanent card/i, 'chaos_warp'],
    [/Target legendary creature becomes a God in addition to its other types[\s.]*Put a \+1\/\+1 counter on it/i, 'tyrite_sanctum'],
    [/Destroy target creature an opponent controls[\s.]*That player loses 3 life/i, 'suspended_sentence'],
    [/choose an opponent[\s.]*If that player has more cards in hand than you, draw cards equal to the difference/i, 'slithermuse_draw'],
    [/For each opponent, choose up to one target artifact or enchantment that player controls[\s\S]*?search your library for up to that many land cards/i, 'disorienting_ramp'],
    [/for each opponent, choose a creature that player controls[\s\S]*?Create a token that's a copy/i, 'benthic_copy'],
    [/Target opponent gains control of Yes Man[\s.]*When they do, you draw two cards and put a quest counter on Yes Man/i, 'yes_man_give'],
    [/Choose target commander that entered this turn[\s.]*Put a \+1\/\+1 counter on it/i, 'forge_of_heroes'],
    [/Target land you control becomes an X\/X Elemental creature with trample and haste until end of turn, where X is the number of enchantments you control/i, 'animate_target_temp'],
    [/becomes a legendary 6\/6 Nightmare God creature with menace and deathtouch[\s\S]*?It's still an enchantment/i, 'animate_self'],
    [/choose odd or even[\s.]*Creatures with mana value of that quality can't block this turn/i, 'parity_ban'],
    [/choose (?:an opponent at random|another target player)[\s\S]*?deals damage equal to that spell's mana value/i, 'first_spell_damage'],
    [/you may discard a card[\s.]*If you do, draw a card/i, 'loot_optional'],
    [/you may discard your hand[\s.]*If you do, draw four cards/i, 'discard_hand_draw'],
    [/you may pay \{\d+\} and sacrifice an Aura attached to[\s\S]*?create a token that's a copy of that Aura/i, 'three_dog_aura_copies'],
    [/you may pay \{E\}\{E\}[\s\S]*?gains jump-start until end of turn/i, 'enable_graveyard_cast'],
    [/gains escape until end of turn[\s\S]*?The escape cost is equal to/i, 'enable_graveyard_cast'],
    [/sacrifice any number of creatures each with base power or toughness 1 or less[\s\S]*?Create that many/i, 'sacrifice_small_make_tokens'],
    [/attach it to target creature you control[\s\S]*?gains shroud until end of turn/i, 'detach_reattach'],
    [/Choose a player with the most life[\s\S]*?can't be blocked by creatures that player controls this turn/i, 'black_gate'],
  ]
  const joinClean = (ss) => ss.map(s => s.replace(/\([^)]*\)/g, '').trim()).filter(Boolean).join(' ')
  const mergedSentences = []
  for (let i = 0; i < sentences.length; i++) {
    let absorbed = 0
    for (let take = Math.min(4, sentences.length - i); take >= 2; take--) {
      const joined = joinClean(sentences.slice(i, i + take))
      if (COMPOUND_PATTERNS.some(([re]) => re.test(joined))) { absorbed = take; break }
    }
    if (absorbed) {
      mergedSentences.push(joinClean(sentences.slice(i, i + absorbed)))
      i += absorbed - 1
    } else {
      mergedSentences.push(sentences[i])
    }
  }
  sentences.length = 0
  sentences.push(...mergedSentences)

  // Modal ("Choose one —") and kicker cards: each mode is a choice, so spell
  // abilities on these cards are optional — the player picks one and skips the rest.
  const hasChoices = /\bchoose one\b|\bchoose two\b|\bkicker\b|\bwas kicked\b/i.test(text)
  const optionalSentence = (sentence) =>
    hasChoices || /\b(may|you may)\b/i.test(sentence) || /^or\b/i.test(sentence)

  for (const sentence of sentences) {
    // Skip reminder text in parentheses
    const cleanSentence = sentence.replace(/\([^)]*\)/g, '').trim()
    if (!cleanSentence) continue

    // Recurring static/aura/CDA shapes the generic tables miss
    const special = parseSpecialAbility(cleanSentence)
    if (special) {
      abilities.push(special)
      continue
    }

    // Reassemble "…you may pay {cost}. If you do, <effect>" / "If the player
    // doesn't, <effect>" into a single optional-pay ability.
    const lastAbility = abilities[abilities.length - 1]
    if (lastAbility && lastAbility.effect.kind === 'other' && /may pay/i.test(lastAbility.effect.params.description ?? '') && /^if (?:you do|the player doesn't)/i.test(cleanSentence)) {
      const desc = lastAbility.effect.params.description
      const manaCost = desc.match(/may pay\s+(\{[^}]+\})/i)?.[1]
      const lifeCost = desc.match(/may pay\s+(\d+)\s+life/i)?.[1]
      lastAbility.effect = {
        kind: 'optional_pay',
        params: {
          cost: manaCost ? manaCost : lifeCost ? `Pay ${lifeCost} life` : '',
          payer: /\bthat player\b/i.test(desc) ? 'opponent' : 'self',
          then: parseEffect(cleanSentence),
          thenIfNotPaid: /if the player doesn't/i.test(cleanSentence),
        },
      }
      delete lastAbility.effect.params.description
      continue
    }

    // Activated ability (cost: effect) — checked before static so sentences
    // like "{3}, {T}: Target creature can't be blocked this turn" (which
    // contain "can't be") are correctly classified as activated.
    if (isActivated(cleanSentence)) {
      const cost = parseCost(cleanSentence)
      const effect = parseEffect(cleanSentence)
      const tgt = parseTargets(cleanSentence)
      abilities.push({
        abilityType: 'activated',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: optionalSentence(cleanSentence),
        cost,
        targets: tgt.targets,
        targetFilter: tgt.targetFilter,
        effect,
      })
      continue
    }

    const isStatic = /\bcan't\b.*\b(attack|block)\b/i.test(cleanSentence) ||
      /\b(has|have|g(et|ain)s?)\s+(\+?\+?\d|deathtouch|flying|first strike|trample|haste|lifelink)/i.test(cleanSentence) ||
      /\bcan't be\b/i.test(cleanSentence) ||
      /\bmust be blocked if able\b/i.test(cleanSentence)
    if (isStatic) {
      const effect = parseEffect(cleanSentence)
      const tgt = parseTargets(cleanSentence)
      abilities.push({
        abilityType: 'static',
        triggerEvent: null,
        triggerCondition: null,
        isOptional: optionalSentence(cleanSentence),
        cost: null,
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
        // Multiple trigger events ("enters the battlefield or attacks"): the
        // ability fires on every event kind the sentence joins with "or".
        // Without the explicit join, a second match is a false positive (a
        // landfall sentence also matches the loose "enters the battlefield"
        // pattern), so keep single-event classification in that case.
        const sentenceEvents = TRIGGER_PATTERNS
          .filter((other) => other.patterns.some((p) => p.test(cleanSentence)))
          .map((other) => other.event)
        const triggerEvents = sentenceEvents.length > 1 && /\bor\b/i.test(cleanSentence)
          ? sentenceEvents
          : undefined
        abilities.push({
          abilityType: 'triggered',
          triggerEvent: tp.event,
          triggerEvents: triggerEvents && triggerEvents.length > 1 ? triggerEvents : undefined,
          triggerCondition: cond || null,
          isOptional: optionalSentence(cleanSentence),
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
        isOptional: optionalSentence(cleanSentence),
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
    entryTapRule: entryTap.entryTapRule,
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

  // Prune entries for cards no longer in the decklist (stale from older runs).
  // Without this, removed cards keep their old rules forever and stale copies
  // in later-alphabetical deck files override fresh entries at merge time.
  for (const key of Object.keys(output)) {
    if (!ordered.includes(key)) delete output[key]
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
