#!/usr/bin/env node
/**
 * Merges per-deck rule outputs (scripts/rules-output/*.json) into the combined
 * runtime artifact public/all-decks-rules.json consumed by cardRulesLoader.
 * Run after parse-card-rules.mjs whenever deck rules change.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const RULES_DIR = resolve(__dirname, 'rules-output')
const OUTPUT_FILE = resolve(__dirname, '../public/all-decks-rules.json')

const merged = {}
let deckCount = 0
for (const file of readdirSync(RULES_DIR).filter((f) => f.endsWith('.json')).sort()) {
  const deck = JSON.parse(readFileSync(join(RULES_DIR, file), 'utf8'))
  for (const [name, entry] of Object.entries(deck)) merged[name] = entry
  deckCount++
}

writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2) + '\n')
console.log(`Merged ${deckCount} decks — ${Object.keys(merged).length} unique cards -> ${OUTPUT_FILE}`)
