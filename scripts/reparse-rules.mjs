#!/usr/bin/env node
/**
 * Re-runs the ability parser over the oracle text already stored in
 * scripts/rules-output/*.json — no Scryfall fetch needed.
 *
 * Only `abilities` is replaced; every other stored field (mana cost, images,
 * entry-tap data) is preserved verbatim. Run scripts/sync-rules.mjs afterwards
 * to rebuild the merged public/all-decks-rules.json artifact.
 *
 * Usage: node scripts/reparse-rules.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCard } from './parse-card-rules.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const RULES_DIR = resolve(__dirname, 'rules-output')

let cards = 0
let abilitiesBefore = 0
let abilitiesAfter = 0
const otherBefore = { total: 0 }
const otherAfter = { total: 0 }

function countOther(deck, other) {
  for (const entry of Object.values(deck)) {
    for (const ab of entry.abilities ?? []) {
      if (ab.effect?.kind === 'other') other.total++
    }
  }
}

for (const file of readdirSync(RULES_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(RULES_DIR, file)
  const deck = JSON.parse(readFileSync(path, 'utf8'))
  countOther(deck, otherBefore)
  let changed = false
  for (const [name, entry] of Object.entries(deck)) {
    if (!entry.oracleText) continue // basic lands keep their empty rules
    const reparsed = parseCard({
      name,
      mana_cost: entry.manaCost ?? '',
      cmc: entry.manaValue ?? 0,
      type_line: entry.typeLine ?? '',
      oracle_text: entry.oracleText,
      id: entry.scryfallId,
    })
    abilitiesBefore += entry.abilities?.length ?? 0
    abilitiesAfter += reparsed.abilities.length
    deck[name] = { ...entry, abilities: reparsed.abilities }
    changed = true
    cards++
  }
  countOther(deck, otherAfter)
  if (changed) writeFileSync(path, JSON.stringify(deck, null, 2) + '\n')
}

console.log(`Re-parsed ${cards} cards across all decks.`)
console.log(`Abilities: ${abilitiesBefore} -> ${abilitiesAfter}`)
console.log(`"other" (unimplemented) abilities: ${otherBefore.total} -> ${otherAfter.total}`)
