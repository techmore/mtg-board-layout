export interface PrebuiltDeck {
  id: string
  name: string
  format: string
  commander: string
  partners?: string[]
  complete: boolean
  cards: string[]
}

const blightCurse: PrebuiltDeck = {
  id: 'blight-curse',
  name: 'Blight Curse',
  format: 'commander',
  commander: "Auntie Ool, Cursewretch",
  partners: ['The Reaper, King No More'],
  complete: true,
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
}

const danceOfTheElements: PrebuiltDeck = {
  id: 'dance-of-the-elements',
  name: 'Dance of the Elements',
  format: 'commander',
  commander: 'Ashling, the Limitless',
  partners: ['Mass of Mysteries'],
  complete: false,
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
}

const cairosMomument: PrebuiltDeck = {
  id: 'cairos-monument',
  name: "Cairo's Monument",
  format: 'commander',
  commander: 'Cairo, the Eternal',
  complete: false,
  cards: [
    'Soul Warden', 'Soul Attendant', 'Ajanis Chosen', 'Serra Ascendant',
    'Archangel of Thune', 'Resplendent Angel', 'Righteous Valkyrie',
    'Angelic Field Marshal', 'Lyra Dawnbringer', 'Baneslayer Angel',
    'Sigarda, Host of Herons', 'Avacyn, Angel of Hope', 'Elesh Norn, Grand Cenobite',
    'Land Tax', 'Smothering Tithe', 'Sol Ring', 'Arcane Signet',
    'Command Tower', 'Path to Exile', 'Swords to Plowshares',
    'Wrath of God', 'Day of Judgment', 'Settle the Wreckage',
    'Plains', 'Island',
  ],
}

const enduringEnchantments: PrebuiltDeck = {
  id: 'enduring-enchantments',
  name: 'Enduring Enchantments',
  format: 'commander',
  commander: 'Anikthea, Hand of Erebos',
  complete: false,
  cards: [
    'Eidolon of Countless Battles', 'Doomwake Giant', 'Nylea, God of the Hunt',
    'Erebos, God of the Dead', 'Thassa, God of the Sea', 'Heliod, God of the Sun',
    'Purphoros, God of the Forge', 'Sphere of Safety', 'Ghostly Prison',
    'Propaganda', 'Starfield Mystic', 'Mesa Enchantress', 'Verduran Enchantress',
    'Enchantresss Presence', 'Argothian Enchantress', 'Sigil of the Empty Throne',
    'Luminarch Ascension', 'Sol Ring', 'Arcane Signet', 'Command Tower',
    'Swamp', 'Forest', 'Plains',
  ],
}

const sauronDarkLord: PrebuiltDeck = {
  id: 'sauron-dark-lord',
  name: 'Sauron, the Dark Lord',
  format: 'commander',
  commander: 'Sauron, the Dark Lord',
  complete: false,
  cards: [
    'Saruman of Many Colors', 'Saruman the White', 'The Witch-King, Bringer of Ruin',
    'Mordor Siege', 'Nazgûl', 'Lord of the Nazgûl', 'Ringwraiths',
    'Call of the Ring', 'The One Ring', 'Orcish Bowmasters',
    'Gollum, Scheming Guide', 'Mirkwood Bats', 'Palantir of Orthanc',
    'Sol Ring', 'Arcane Signet', 'Command Tower', 'Swamp', 'Island',
    'Mountain',
  ],
}

const foodFellowship: PrebuiltDeck = {
  id: 'food-fellowship',
  name: 'Food & Fellowship',
  format: 'commander',
  commander: 'Frodo Baggins',
  partners: ['Samwise Gamgee'],
  complete: false,
  cards: [
    "Peregrin Took", 'Merry, Warden of Isengard', "Pippin, Warden of Isengard",
    "Rosie Cotton of South Lane", 'Bill the Pony', 'Gaffer Gamgee',
    "Second Breakfast", 'Feasting Hobbit', 'Hobbit Feet',
    "Banquet Guests", 'Tea Time', "Frodo's Adventuring Party",
    'Sol Ring', 'Arcane Signet', 'Command Tower',
    "Plains", "Forest", "Island",
  ],
}

const creativeEnergy: PrebuiltDeck = {
  id: 'creative-energy',
  name: 'Creative Energy',
  format: 'commander',
  commander: 'Satya, Aetherflux Genius',
  complete: false,
  cards: [
    'Aetherspark', 'Amped Raptor', 'Aragorn, Company Leader',
    'Drannith Magistrate', 'Dockside Extortionist', 'Goldspan Dragon',
    'Jaxis, the Troublemaker', 'Kiki-Jiki, Mirror Breaker',
    'Laelia, the Blade Reforged', 'Mana Echoes', 'Professional Face-Breaker',
    'Splinter Twin', 'Storm-Kiln Artist', 'Underworld Breach',
    'Sol Ring', 'Arcane Signet', 'Command Tower',
    'Mountain', 'Island', 'Plains',
  ],
}

const eldraziIncursion: PrebuiltDeck = {
  id: 'eldrazi-incursion',
  name: 'Eldrazi Incursion',
  format: 'commander',
  commander: 'Ulalek, Fused Atrocity',
  complete: false,
  cards: [
    'Azlask, the Swelling Scourge', 'Emrakul, the Promised End',
    'Kozilek, Butcher of Truth', 'Ulamog, the Ceaseless Hunger',
    'Ulamog, the Infinite Gyre', 'It That Betrays', 'Pathrazer of Ulamog',
    'Artisan of Kozilek', 'Spawnsire of Ulamog', 'Breaker of Armies',
    'Desolation Twin', 'Eldrazi Conscription', 'Eye of Ugin',
    'Eldrazi Temple', 'Sol Ring', 'Wastes',
  ],
}

const squirrelMob: PrebuiltDeck = {
  id: 'squirrel-mob',
  name: 'Squirreled Away',
  format: 'commander',
  commander: 'Hazel of the Rootbloom',
  complete: false,
  cards: [
    'Chatterfang, Squirrel General', 'Squirrel Sovereign', 'Squirrel Nest',
    'Druid Class', 'Acorn Harvest', 'Squirrel Mob', 'Verdant Command',
    'Scurry Oak', 'Deepwood Denizen', 'Hardshell Escort',
    'Memorial to Unity', 'Sol Ring', 'Arcane Signet', 'Command Tower',
    'Squirrel Sanctuary', 'Forest', 'Plains', 'Swamp',
  ],
}

const jumpScare: PrebuiltDeck = {
  id: 'jump-scare',
  name: 'Jump Scare',
  format: 'commander',
  commander: 'Zimone, Mystery Unraveler',
  complete: false,
  cards: [
    'Yedora, Grave Gardener', 'Sakura-Tribe Elder', 'Scute Swarm',
    'Avenger of Zendikar', 'Rampaging Baloths', 'Omnath, Locus of Rage',
    'Lotus Cobra', 'Tireless Tracker', 'Tireless Provisioner',
    'Aesi, Tyrant of Gyre Strait', 'Tatyova, Benthic Druid',
    'Sol Ring', 'Arcane Signet', 'Command Tower',
    'Sylvan Library', 'Cultivate', 'Kodamas Reach',
    'Forest', 'Island',
  ],
}

const endlessPunishment: PrebuiltDeck = {
  id: 'endless-punishment',
  name: 'Endless Punishment',
  format: 'commander',
  commander: 'Valgavoth, Harrower of Souls',
  complete: false,
  cards: [
    'Tinybones, Bauble Burglar', 'Sheoldred, the Apocalypse',
    'Megrim', 'Liliana, Dreadhorde General', 'Torment of Hailfire',
    'Painful Quandary', 'Underworld Dreams', 'Fate Unraveler',
    'Rise of the Dark Realms', 'Exquisite Blood', 'Sanguine Bond',
    'Sol Ring', 'Arcane Signet', 'Command Tower',
    'Nykthos, Shrine to Nyx', 'Cabal Coffers', 'Urborg, Tomb of Yawgmoth',
    'Swamp', 'Mountain',
  ],
}

const eldraziUnbound: PrebuiltDeck = {
  id: 'eldrazi-unbound',
  name: 'Eldrazi Unbound',
  format: 'commander',
  commander: 'Zhulodok, Void Gorger',
  complete: false,
  cards: [
    "Ulamog, the Ceaseless Hunger", "Kozilek, Butcher of Truth",
    "Emrakul, the Aeons Torn", "It That Betrays", "Pathrazer of Ulamog",
    "Artisan of Kozilek", "Void Winnower", "Sire of Stagnation",
    "Endbringer", "Bane of Bala Ged", "Oblivion Sower",
    "Hedron Archive", "Dreamstone Hedron", "Sol Ring",
    "Eye of Ugin", "Eldrazi Temple", "Wastes",
  ],
}

const graveDanger: PrebuiltDeck = {
  id: 'grave-danger',
  name: 'Grave Danger',
  format: 'commander',
  commander: 'The Wise Mothman',
  complete: false,
  cards: [
    'Radstorm', 'Soul-Scar Mage', 'The Master, Multiplied',
    'Niv-Mizzet, Parun', 'Locust God', 'Scarab God',
    'Bruvac the Grandiloquent', 'Maddening Cacophony',
    'Fleet Swallower', 'Traumatize', 'Sol Ring', 'Arcane Signet',
    'Command Tower', 'Island', 'Mountain', 'Swamp',
  ],
}

const mutantMenace: PrebuiltDeck = {
  id: 'mutant-menace',
  name: 'Mutant Menace',
  format: 'commander',
  commander: 'Mr. House, President and CEO',
  complete: false,
  cards: [
    'The Master, Multiplied', 'Aligned Hedron Network', 'Chaos Warp',
    'Generous Gift', 'Swords to Plowshares', 'Cyclonic Rift',
    'Dice Chamber', 'Magnetic Theft', 'Sol Ring', 'Arcane Signet',
    'Command Tower', 'Mountain', 'Plains',
  ],
}

const gloryDog: PrebuiltDeck = {
  id: 'glory-dog',
  name: 'Glory Dog',
  format: 'commander',
  commander: 'Dogmeat, Ever Loyal',
  complete: false,
  cards: [
    'Sword of Feast and Famine', 'Sword of Fire and Ice',
    'Sword of Body and Mind', 'Colossus Hammer',
    'Sigarda, Host of Herons', 'Sram, Senior Edificer',
    'Danitha Capashen, Paragon', 'Puresteel Paladin',
    'Stoneforge Mystic', 'Steelshaper Apprentice',
    'Kor Spiritdancer', 'Sol Ring', 'Arcane Signet', 'Command Tower',
    'Plains', 'Mountain',
  ],
}

const necronDynasties: PrebuiltDeck = {
  id: 'necron-dynasties',
  name: 'Necron Dynasties',
  format: 'commander',
  commander: 'Imotekh the Stormlord',
  complete: false,
  cards: [
    'Anrakyr the Traveller', 'Illuminor Szeras', 'Orikan the Diviner',
    'The Silent King', 'Trazyn the Infinite', 'Canoptek Tomb Sentinel',
    'Canoptek Scarab Swarm', 'Doomstalker', 'Lokhust Heavy Destroyers',
    'Warhammer 40k', 'Sol Ring', 'Arcane Signet', 'Command Tower',
    'Swamp', 'Mountain',
  ],
}

export const prebuiltDecks: PrebuiltDeck[] = [
  blightCurse,
  danceOfTheElements,
  cairosMomument,
  enduringEnchantments,
  sauronDarkLord,
  foodFellowship,
  creativeEnergy,
  eldraziIncursion,
  squirrelMob,
  jumpScare,
  endlessPunishment,
  eldraziUnbound,
  graveDanger,
  mutantMenace,
  gloryDog,
  necronDynasties,
]
