// Check Riveteers Overlook and Ifnir Deadlands specifically
const targets = [
  { name: 'Riveteers Overlook' },
  { name: 'Ifnir Deadlands' },
  { name: 'Evolving Wilds' },
  { name: 'Terramorphic Expanse' },
  { name: 'Nesting Grounds' },
]

const res = await fetch('https://api.scryfall.com/cards/collection', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'MTGBoardLayout/1.0' },
  body: JSON.stringify({ identifiers: targets }),
})
const data = await res.json()
for (const card of data.data) {
  const oracleText = card.oracle_text ?? card.card_faces?.[0]?.oracle_text ?? ''
  const normalized = oracleText.replace(/\s+/g, ' ')
  const clause = normalized.split(/[.;]/).find((part) => /\b(?:enters|comes into play)(?: the battlefield)?\s+tapped\b/i.test(part))
  const isConditional = clause ? /\bunless\b|\bif\b|\bmay\b/i.test(clause) : false
  console.log(`\n${card.name}:`)
  console.log(`  Type: ${card.type_line}`)
  console.log(`  Oracle: "${oracleText.slice(0, 200)}"`)
  console.log(`  Regex match: ${clause ? `"${clause}"` : 'NONE'}`)
  console.log(`  EntryTapRule: ${clause ? (isConditional ? 'conditional' : 'always') : 'never'}`)
}
