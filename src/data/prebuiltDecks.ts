import type { DeckCard } from '../types/card'
import danceOfTheElements from './decklists/dance-of-the-elements.json'
import cairosMomument from './decklists/cairos-monument.json'
import enduringEnchantments from './decklists/enduring-enchantments.json'
import sauronDarkLord from './decklists/sauron-dark-lord.json'
import foodFellowship from './decklists/food-fellowship.json'
import creativeEnergy from './decklists/creative-energy.json'
import eldraziIncursion from './decklists/eldrazi-incursion.json'
import squirrelMob from './decklists/squirrel-mob.json'
import jumpScare from './decklists/jump-scare.json'
import endlessPunishment from './decklists/endless-punishment.json'
import eldraziUnbound from './decklists/eldrazi-unbound.json'
import graveDanger from './decklists/grave-danger.json'
import mutantMenace from './decklists/mutant-menace.json'
import gloryDog from './decklists/glory-dog.json'
import necronDynasties from './decklists/necron-dynasties.json'

export interface PrebuiltDeck {
  id: string
  name: string
  format: string
  commander: string
  partners?: string[]
  complete: boolean
  cards: string[]
  officialRelease?: {
    publisher: string
    product: string
    releaseDate: string
    url: string
  }
}

interface DeckListFile {
  id: string
  name: string
  commander: string
  partners?: string[]
  officialRelease?: PrebuiltDeck['officialRelease']
  cards: string[]
}

const displayNames: Record<string, string> = {
  'dance-of-the-elements': 'Dance of the Elements',
  'cairos-monument': "Cairo's Monument",
  'enduring-enchantments': 'Enduring Enchantments',
  'sauron-dark-lord': 'Sauron, the Dark Lord',
  'food-fellowship': 'Food & Fellowship',
  'creative-energy': 'Creative Energy',
  'eldrazi-incursion': 'Eldrazi Incursion',
  'squirrel-mob': 'Squirreled Away',
  'jump-scare': 'Jump Scare',
  'endless-punishment': 'Endless Punishment',
  'eldrazi-unbound': 'Eldrazi Unbound',
  'grave-danger': 'Grave Danger',
  'mutant-menace': 'Mutant Menace',
  'glory-dog': 'Glory Dog',
  'necron-dynasties': 'Necron Dynasties',
}

const deckListFiles: DeckListFile[] = [
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

const deckListDecks: PrebuiltDeck[] = deckListFiles.map((deck) => ({
  id: deck.id,
  name: displayNames[deck.id] ?? deck.name,
  format: 'commander',
  commander: deck.commander,
  partners: deck.partners ?? [],
  complete: true,
  officialRelease: deck.officialRelease,
  cards: deck.cards,
}))

const blightCurse: PrebuiltDeck = {
  id: 'blight-curse',
  name: 'Blight Curse',
  format: 'commander',
  commander: "Auntie Ool, Cursewretch",
  partners: ['The Reaper, King No More'],
  complete: true,
  officialRelease: {
    publisher: 'Wizards of the Coast',
    product: 'Lorwyn Eclipsed Commander Decks',
    releaseDate: '2026-01-23',
    url: 'https://magic.wizards.com/en/news/announcements/lorwyn-eclipsed-commander-decklists',
  },
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

const draconicDestructionCards: DeckCard[] = [
  { name: 'Atarka, World Render', scryfallId: 'c569fab1-6901-40ab-b958-001698819585', typeLine: 'Legendary Creature — Dragon', manaCost: '{5}{R}{G}', manaValue: 7, oracleText: 'Flying, trample\nWhenever a Dragon you control attacks, it gains double strike until end of turn.', imageUri: '/cards/draconic-destruction/c569fab1-6901-40ab-b958-001698819585.jpg', quantity: 1 },
  { name: 'Dragon Hatchling', scryfallId: 'c5d3a18c-d030-494d-b7b1-4d1d1e27fbbf', typeLine: 'Creature — Dragon', manaCost: '{1}{R}', manaValue: 2, oracleText: 'Flying\n{R}: Dragon Hatchling gets +1/+0 until end of turn.', imageUri: '/cards/draconic-destruction/c5d3a18c-d030-494d-b7b1-4d1d1e27fbbf.jpg', quantity: 1 },
  { name: 'Territorial Hellkite', scryfallId: 'faad2d44-1443-42c3-9d3e-b78951b1e851', typeLine: 'Creature — Dragon', manaCost: '{3}{R}{R}', manaValue: 5, oracleText: 'Flying\nWhenever Territorial Hellkite attacks, it deals 4 damage to target creature defending player controls.', imageUri: '/cards/draconic-destruction/faad2d44-1443-42c3-9d3e-b78951b1e851.jpg', quantity: 1 },
  { name: 'Scaled Nurturer', scryfallId: '84ae5a76-b8b9-431d-8060-a6a96f5d1e0b', typeLine: 'Creature — Dragon Druid', manaCost: '{2}{G}', manaValue: 3, oracleText: '{T}: Add one mana of any color.', imageUri: '/cards/draconic-destruction/84ae5a76-b8b9-431d-8060-a6a96f5d1e0b.jpg', quantity: 1 },
  { name: 'Scaled Behemoth', scryfallId: '017ef6eb-7a2b-4730-bf21-a2289d4c07ad', typeLine: 'Creature — Dragon', manaCost: '{4}{G}{G}', manaValue: 6, oracleText: 'Hexproof (This creature can\'t be the target of spells or abilities your opponents control.)', imageUri: '/cards/draconic-destruction/017ef6eb-7a2b-4730-bf21-a2289d4c07ad.jpg', quantity: 1 },
  { name: 'Goldspan Dragon', scryfallId: '848c1951-90fa-4f01-9aed-76f1afcd9995', typeLine: 'Creature — Dragon', manaCost: '{3}{R}{R}', manaValue: 5, oracleText: 'Flying, haste\nWhenever Goldspan Dragon attacks or becomes the target of a spell, create a Treasure token.\nTreasure tokens you control have "{T}, Sacrifice this artifact: Add one mana of any color."', imageUri: '/cards/draconic-destruction/848c1951-90fa-4f01-9aed-76f1afcd9995.jpg', quantity: 1 },
  { name: 'Llanowar Elves', scryfallId: '6a0b230b-d391-4998-a3f7-7b158a0ec2cd', typeLine: 'Creature — Elf Druid', manaCost: '{G}', manaValue: 1, oracleText: '{T}: Add {G}.', imageUri: '/cards/draconic-destruction/6a0b230b-d391-4998-a3f7-7b158a0ec2cd.jpg', quantity: 1 },
  { name: 'Fyndhorn Elves', scryfallId: '450744cf-7eba-491b-97b0-ca80c6368bbb', typeLine: 'Creature — Elf Druid', manaCost: '{G}', manaValue: 1, oracleText: '{T}: Add {G}.', imageUri: '/cards/draconic-destruction/450744cf-7eba-491b-97b0-ca80c6368bbb.jpg', quantity: 1 },
  { name: 'Elvish Mystic', scryfallId: 'eb654a76-62ee-4fd8-83d4-cb912211a9a0', typeLine: 'Creature — Elf Druid', manaCost: '{G}', manaValue: 1, oracleText: '{T}: Add {G}.', imageUri: '/cards/draconic-destruction/eb654a76-62ee-4fd8-83d4-cb912211a9a0.jpg', quantity: 1 },
  { name: 'Birds of Paradise', scryfallId: '492c2f9a-51e7-4e0f-9899-23bf43ea988b', typeLine: 'Creature — Bird', manaCost: '{G}', manaValue: 1, oracleText: 'Flying\n{T}: Add one mana of any color.', imageUri: '/cards/draconic-destruction/492c2f9a-51e7-4e0f-9899-23bf43ea988b.jpg', quantity: 1 },
  { name: 'Dragonmaster Outcast', scryfallId: 'a485edea-07cd-48dd-97e7-daeba85553d6', typeLine: 'Creature — Human Shaman', manaCost: '{R}', manaValue: 1, oracleText: 'At the beginning of your upkeep, if you control six or more lands, create a 5/5 red Dragon creature token with flying.', imageUri: '/cards/draconic-destruction/a485edea-07cd-48dd-97e7-daeba85553d6.jpg', quantity: 1 },
  { name: 'Thunderbreak Regent', scryfallId: '06624919-bb3e-458c-9301-0bb22d8b556c', typeLine: 'Creature — Dragon', manaCost: '{2}{R}{R}', manaValue: 4, oracleText: 'Flying\nWhenever a Dragon you control becomes the target of a spell or ability an opponent controls, Thunderbreak Regent deals 3 damage to that opponent.', imageUri: '/cards/draconic-destruction/06624919-bb3e-458c-9301-0bb22d8b556c.jpg', quantity: 1 },
  { name: 'Glorybringer', scryfallId: '06f90d62-6d21-47b1-a427-eb25a42f4dcb', typeLine: 'Creature — Dragon', manaCost: '{3}{R}{R}', manaValue: 5, oracleText: 'Flying, haste\nYou may exert Glorybringer as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls.', imageUri: '/cards/draconic-destruction/06f90d62-6d21-47b1-a427-eb25a42f4dcb.jpg', quantity: 1 },
  { name: 'Stormbreath Dragon', scryfallId: '3637d9b8-87bb-478d-bfb1-59ddab7b5e4c', typeLine: 'Creature — Dragon', manaCost: '{3}{R}{R}', manaValue: 5, oracleText: 'Flying, haste, protection from white\n{5}{R}{R}: Monstrosity 3. (If this creature isn\'t monstrous, put three +1/+1 counters on it and it becomes monstrous.)', imageUri: '/cards/draconic-destruction/3637d9b8-87bb-478d-bfb1-59ddab7b5e4c.jpg', quantity: 1 },
  { name: 'Dragonlord Atarka', scryfallId: 'd411ad43-3718-4ed7-932f-fcea28705782', typeLine: 'Legendary Creature — Elder Dragon', manaCost: '{5}{R}{G}', manaValue: 7, oracleText: 'Flying, trample\nWhen Dragonlord Atarka enters the battlefield, it deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers your opponents control.', imageUri: '/cards/draconic-destruction/d411ad43-3718-4ed7-932f-fcea28705782.jpg', quantity: 1 },
  { name: 'Lathliss, Dragon Queen', scryfallId: '0cb48015-627b-49cd-8dc3-d446e82b8172', typeLine: 'Legendary Creature — Dragon', manaCost: '{4}{R}{R}', manaValue: 6, oracleText: 'Flying\nWhenever a nontoken Dragon enters the battlefield under your control, create a 5/5 red Dragon creature token with flying.\n{1}{R}: Dragons you control get +1/+0 until end of turn.', imageUri: '/cards/draconic-destruction/0cb48015-627b-49cd-8dc3-d446e82b8172.jpg', quantity: 1 },
  { name: 'Utvara Hellkite', scryfallId: 'df459109-d6ab-4b1d-9570-c7677ff4a014', typeLine: 'Creature — Dragon', manaCost: '{6}{R}{R}', manaValue: 8, oracleText: 'Flying\nWhenever a Dragon you control attacks, create a 6/6 red Dragon creature token with flying.', imageUri: '/cards/draconic-destruction/df459109-d6ab-4b1d-9570-c7677ff4a014.jpg', quantity: 1 },
  { name: 'Scourge of Valkas', scryfallId: 'e6bd7225-b39f-4b3b-8c36-dbc2c09f6e50', typeLine: 'Creature — Dragon', manaCost: '{2}{R}{R}{R}', manaValue: 5, oracleText: 'Flying\nWhenever Scourge of Valkas or another Dragon enters the battlefield under your control, it deals X damage to any target, where X is the number of Dragons you control.\n{R}: Scourge of Valkas gets +1/+0 until end of turn.', imageUri: '/cards/draconic-destruction/e6bd7225-b39f-4b3b-8c36-dbc2c09f6e50.jpg', quantity: 1 },
  { name: 'Savage Ventmaw', scryfallId: '50027d69-8bb0-444c-8e9b-4c9afd91cbda', typeLine: 'Creature — Dragon', manaCost: '{4}{R}{G}', manaValue: 6, oracleText: 'Flying\nWhenever Savage Ventmaw attacks, add {R}{R}{R}{G}{G}{G}. Until end of turn, you don\'t lose this mana as steps and phases end.', imageUri: '/cards/draconic-destruction/50027d69-8bb0-444c-8e9b-4c9afd91cbda.jpg', quantity: 1 },
  { name: 'Hellkite Charger', scryfallId: '6836c646-83ff-4bf8-96dd-4cbdd6c7e861', typeLine: 'Creature — Dragon', manaCost: '{4}{R}{R}', manaValue: 6, oracleText: 'Flying, haste\nWhenever Hellkite Charger attacks, you may pay {5}{R}{R}. If you do, untap all creatures you control and after this phase, there is an additional combat phase.', imageUri: '/cards/draconic-destruction/6836c646-83ff-4bf8-96dd-4cbdd6c7e861.jpg', quantity: 1 },
  { name: 'Kolaghan, the Storm\'s Fury', scryfallId: '85b6ec91-0ecc-431c-bf85-220c615e0a80', typeLine: 'Legendary Creature — Dragon', manaCost: '{3}{B}{R}', manaValue: 5, oracleText: 'Flying, haste\nOther creatures you control have haste.\nWhenever an attacking Dragon you control dies, each opponent loses 1 life and you gain 1 life.', imageUri: '/cards/draconic-destruction/85b6ec91-0ecc-431c-bf85-220c615e0a80.jpg', quantity: 1 },
  { name: 'Dragonspeaker Shaman', scryfallId: '7b0a2799-197e-4d61-ab23-67d974458a05', typeLine: 'Creature — Human Barbarian Shaman', manaCost: '{1}{R}{R}', manaValue: 3, oracleText: 'Dragon spells you cast cost {2} less to cast.', imageUri: '/cards/draconic-destruction/7b0a2799-197e-4d61-ab23-67d974458a05.jpg', quantity: 1 },
  { name: 'Dragon\'s Fire', scryfallId: '9666987a-5267-46d3-9b00-31baa92a9cbc', typeLine: 'Instant', manaCost: '{1}{R}', manaValue: 2, oracleText: 'Dragon\'s Fire deals 3 damage to target creature. You may have Dragon\'s Fire deal 4 damage instead if you control a Dragon.', imageUri: '/cards/draconic-destruction/9666987a-5267-46d3-9b00-31baa92a9cbc.jpg', quantity: 1 },
  { name: 'Lightning Bolt', scryfallId: '7673784e-db4b-43a1-8d55-1bb9fc1e284f', typeLine: 'Instant', manaCost: '{R}', manaValue: 1, oracleText: 'Lightning Bolt deals 3 damage to any target.', imageUri: '/cards/draconic-destruction/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg', quantity: 1 },
  { name: 'Crash Through', scryfallId: '9eb16918-6363-4849-8d74-e26822a0ddf7', typeLine: 'Sorcery', manaCost: '{R}', manaValue: 1, oracleText: 'Creatures you control gain trample until end of turn.\nDraw a card.', imageUri: '/cards/draconic-destruction/9eb16918-6363-4849-8d74-e26822a0ddf7.jpg', quantity: 1 },
  { name: 'Cultivate', scryfallId: 'e60deb92-f7dd-4f4e-9036-e47dd586f985', typeLine: 'Sorcery', manaCost: '{2}{G}', manaValue: 3, oracleText: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', imageUri: '/cards/draconic-destruction/e60deb92-f7dd-4f4e-9036-e47dd586f985.jpg', quantity: 1 },
  { name: 'Heroic Intervention', scryfallId: 'e32c67d1-187f-40df-b3b3-6036f5c92834', typeLine: 'Instant', manaCost: '{1}{G}', manaValue: 2, oracleText: 'Permanents you control gain hexproof and indestructible until end of turn.', imageUri: '/cards/draconic-destruction/e32c67d1-187f-40df-b3b3-6036f5c92834.jpg', quantity: 1 },
  { name: 'Beast Within', scryfallId: '400b43aa-c1d2-4435-b863-061f43889422', typeLine: 'Instant', manaCost: '{2}{G}', manaValue: 3, oracleText: 'Destroy target permanent. Its controller creates a 3/3 green Beast creature token.', imageUri: '/cards/draconic-destruction/400b43aa-c1d2-4435-b863-061f43889422.jpg', quantity: 1 },
  { name: 'Chaos Warp', scryfallId: '57f61970-382e-415c-868b-6bbb6c78825d', typeLine: 'Instant', manaCost: '{2}{R}', manaValue: 3, oracleText: 'The owner of target permanent shuffles it into their library, then reveals cards from the top of their library until they reveal a permanent card. They put that card onto the battlefield and the rest on the bottom in a random order.', imageUri: '/cards/draconic-destruction/57f61970-382e-415c-868b-6bbb6c78825d.jpg', quantity: 1 },
  { name: 'Kodama\'s Reach', scryfallId: '90c423cc-1264-4067-9c50-e7c88c68ef2d', typeLine: 'Sorcery — Arcane', manaCost: '{2}{G}', manaValue: 3, oracleText: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', imageUri: '/cards/draconic-destruction/90c423cc-1264-4067-9c50-e7c88c68ef2d.jpg', quantity: 1 },
  { name: 'Farseek', scryfallId: 'c1aac0f5-1d01-4673-b8d3-878d9a1d423c', typeLine: 'Sorcery', manaCost: '{1}{G}', manaValue: 2, oracleText: 'Search your library for a Plains, Island, Swamp, or Mountain card and put it onto the battlefield tapped. Then shuffle.', imageUri: '/cards/draconic-destruction/c1aac0f5-1d01-4673-b8d3-878d9a1d423c.jpg', quantity: 1 },
  { name: 'Nature\'s Lore', scryfallId: '7afc4a15-5ff8-457a-aa62-803b2d78d912', typeLine: 'Sorcery', manaCost: '{1}{G}', manaValue: 2, oracleText: 'Search your library for a Forest card and put it onto the battlefield. Then shuffle.', imageUri: '/cards/draconic-destruction/7afc4a15-5ff8-457a-aa62-803b2d78d912.jpg', quantity: 1 },
  { name: 'Return of the Wildspeaker', scryfallId: '2fa1dac5-51ba-403e-b48b-d2c0d23a8146', typeLine: 'Instant', manaCost: '{4}{G}', manaValue: 5, oracleText: 'Choose one —\n• Draw cards equal to the greatest power among non-Human creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn.', imageUri: '/cards/draconic-destruction/2fa1dac5-51ba-403e-b48b-d2c0d23a8146.jpg', quantity: 1 },
  { name: 'Sol Ring', scryfallId: '91fdb56b-54d5-4272-8319-505ff987fe9b', typeLine: 'Artifact', manaCost: '{1}', manaValue: 1, oracleText: '{T}: Add {C}{C}.', imageUri: '/cards/draconic-destruction/91fdb56b-54d5-4272-8319-505ff987fe9b.jpg', quantity: 1 },
  { name: 'Arcane Signet', scryfallId: '1cad1bd2-7c56-4ce0-99a6-b2a49c1288dd', typeLine: 'Artifact', manaCost: '{2}', manaValue: 2, oracleText: '{T}: Add one mana of any color in your commander\'s color identity.', imageUri: '/cards/draconic-destruction/1cad1bd2-7c56-4ce0-99a6-b2a49c1288dd.jpg', quantity: 1 },
  { name: 'Herald\'s Horn', scryfallId: '4bfa71d4-4125-4404-9c24-979401bae592', typeLine: 'Artifact', manaCost: '{3}', manaValue: 3, oracleText: 'As Herald\'s Horn enters the battlefield, choose a creature type.\nCreature spells of the chosen type you cast cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it\'s a creature of the chosen type, you may reveal it and put it into your hand.', imageUri: '/cards/draconic-destruction/4bfa71d4-4125-4404-9c24-979401bae592.jpg', quantity: 1 },
  { name: 'Commander\'s Sphere', scryfallId: 'a0d50603-e31f-4cd7-b4b6-49847d99eb2e', typeLine: 'Artifact', manaCost: '{3}', manaValue: 3, oracleText: '{T}: Add one mana of any color in your commander\'s color identity.\nSacrifice Commander\'s Sphere: Draw a card.', imageUri: '/cards/draconic-destruction/a0d50603-e31f-4cd7-b4b6-49847d99eb2e.jpg', quantity: 1 },
  { name: 'Dragon\'s Hoard', scryfallId: '3ee80876-6e87-46c4-a6fd-ff6752db3032', typeLine: 'Artifact', manaCost: '{3}', manaValue: 3, oracleText: 'Whenever a Dragon enters the battlefield under your control, put a gold counter on Dragon\'s Hoard.\n{T}: Add one mana of any color.\n{T}, Remove a gold counter from Dragon\'s Hoard: Draw a card.', imageUri: '/cards/draconic-destruction/3ee80876-6e87-46c4-a6fd-ff6752db3032.jpg', quantity: 1 },
  { name: 'Vanquisher\'s Banner', scryfallId: 'efa6944e-b5e2-4584-ae37-f5b59a8ec75e', typeLine: 'Artifact', manaCost: '{5}', manaValue: 5, oracleText: 'As Vanquisher\'s Banner enters the battlefield, choose a creature type.\nCreatures of the chosen type you control get +1/+1.\nWhenever you cast a creature spell of the chosen type, draw a card.', imageUri: '/cards/draconic-destruction/efa6944e-b5e2-4584-ae37-f5b59a8ec75e.jpg', quantity: 1 },
  { name: 'Guardian Project', scryfallId: '2c523ef7-d6c4-4887-9a4e-0c2bc6f63676', typeLine: 'Enchantment', manaCost: '{3}{G}', manaValue: 4, oracleText: 'Whenever a nontoken creature enters the battlefield under your control, if it doesn\'t share a name with another creature you control or a creature card in your graveyard, draw a card.', imageUri: '/cards/draconic-destruction/2c523ef7-d6c4-4887-9a4e-0c2bc6f63676.jpg', quantity: 1 },
  { name: 'Rhythm of the Wild', scryfallId: 'c2a6453e-a373-44ec-807a-15c0c8b1af57', typeLine: 'Enchantment', manaCost: '{1}{R}{G}', manaValue: 3, oracleText: 'Creatures you control can\'t be countered.\n{R}{G}: The next creature spell you cast this turn can\'t be countered and has riot.', imageUri: '/cards/draconic-destruction/c2a6453e-a373-44ec-807a-15c0c8b1af57.jpg', quantity: 1 },
  { name: 'Gift of the Wilds', scryfallId: '6a0df4e9-b201-4fc7-8e37-59d99b583f76', typeLine: 'Enchantment — Aura', manaCost: '{1}{G}', manaValue: 2, oracleText: 'Enchant creature\nEnchanted creature gets +1/+1 and has trample.', imageUri: '/cards/draconic-destruction/6a0df4e9-b201-4fc7-8e37-59d99b583f76.jpg', quantity: 1 },
  { name: 'Mountain', scryfallId: '426b0211-3d5d-4e53-bcf6-21823c655ffd', typeLine: 'Basic Land — Mountain', manaCost: '', manaValue: 0, oracleText: '', imageUri: '/cards/draconic-destruction/426b0211-3d5d-4e53-bcf6-21823c655ffd.jpg', quantity: 31, manaProduction: { colors: ['R'], amount: 1 } },
  { name: 'Forest', scryfallId: '22463284-2478-4b1e-9a37-6dd2383266cf', typeLine: 'Basic Land — Forest', manaCost: '', manaValue: 0, oracleText: '', imageUri: '/cards/draconic-destruction/22463284-2478-4b1e-9a37-6dd2383266cf.jpg', quantity: 18, manaProduction: { colors: ['G'], amount: 1 } },
  { name: 'Command Tower', scryfallId: '0548fb60-c843-4f8f-a029-6f10efc63a41', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: '{T}: Add one mana of any color in your commander\'s color identity.', imageUri: '/cards/draconic-destruction/0548fb60-c843-4f8f-a029-6f10efc63a41.jpg', quantity: 1 },
  { name: 'Exotic Orchard', scryfallId: '8853ff94-bf44-4cfd-9d3a-0743c361fb0d', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: '{T}: Add one mana of any color that a land an opponent controls could produce.', imageUri: '/cards/draconic-destruction/8853ff94-bf44-4cfd-9d3a-0743c361fb0d.jpg', quantity: 1 },
  { name: 'Rootbound Crag', scryfallId: '42d174e5-b8c2-45eb-8e08-1b94fc27cbee', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: 'Rootbound Crag enters the battlefield tapped unless you control a Mountain or a Forest.\n{T}: Add {R} or {G}.', imageUri: '/cards/draconic-destruction/42d174e5-b8c2-45eb-8e08-1b94fc27cbee.jpg', quantity: 1 },
  { name: 'Cinder Glade', scryfallId: 'ec93087a-5728-40e8-8625-a1d175d5252c', typeLine: 'Land — Mountain Forest', manaCost: '', manaValue: 0, oracleText: '({T}: Add {R} or {G}.)\nCinder Glade enters the battlefield tapped unless you control two or more basic lands.', imageUri: '/cards/draconic-destruction/ec93087a-5728-40e8-8625-a1d175d5252c.jpg', quantity: 1 },
  { name: 'Game Trail', scryfallId: '2a84a604-7b05-4716-bcd8-40d2acdb76e8', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: 'As Game Trail enters the battlefield, you may reveal a Mountain or Forest card from your hand. If you don\'t, Game Trail enters the battlefield tapped.\n{T}: Add {R} or {G}.', imageUri: '/cards/draconic-destruction/2a84a604-7b05-4716-bcd8-40d2acdb76e8.jpg', quantity: 1 },
  { name: 'Karplusan Forest', scryfallId: '67198b97-bac2-480f-aea8-12841e8884de', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: '{T}: Add {C}.\n{T}: Add {R} or {G}. Karplusan Forest deals 1 damage to you.', imageUri: '/cards/draconic-destruction/67198b97-bac2-480f-aea8-12841e8884de.jpg', quantity: 1 },
  { name: 'Kessig Wolf Run', scryfallId: '32da0d6c-64dd-4aec-b63e-953e96164603', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: '{T}: Add {C}.\n{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn.', imageUri: '/cards/draconic-destruction/32da0d6c-64dd-4aec-b63e-953e96164603.jpg', quantity: 1 },
  { name: 'Terramorphic Expanse', scryfallId: 'a81f924b-0527-4311-8120-9bfff71524f6', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: '{T}, Sacrifice Terramorphic Expanse: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.', imageUri: '/cards/draconic-destruction/a81f924b-0527-4311-8120-9bfff71524f6.jpg', quantity: 1 },
  { name: 'Haven of the Spirit Dragon', scryfallId: 'd0c552da-874e-49eb-b221-47220b8b7786', typeLine: 'Land', manaCost: '', manaValue: 0, oracleText: '{T}: Add {C}.\n{1}, {T}: You may cast a Dragon spell from your graveyard.', imageUri: '/cards/draconic-destruction/d0c552da-874e-49eb-b221-47220b8b7786.jpg', quantity: 1 },
]

export const DRACONIC_DESTRUCTION_DECK = {
  name: 'Draconic Destruction',
  commanderNames: ['Atarka, World Render'],
  cards: draconicDestructionCards,
}

export const prebuiltDecks: PrebuiltDeck[] = [
  blightCurse,
  ...deckListDecks,
]
