import type { DeckImportDefinition, DeckListEntry } from '../types/card'
import type { PrebuiltDeck } from '../data/prebuiltDecks'

const REQUEST_TIMEOUT_MS = 15_000
const MAX_LIST_SIZE = 1_000_000

type ListSection = 'main' | 'commander' | 'sideboard'

function addEntry(entries: DeckListEntry[], name: string, quantity: number) {
  const existing = entries.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
  if (existing) existing.quantity += quantity
  else entries.push({ name, quantity })
}

function cleanCardName(value: string): string {
  return value
    .replace(/\s+\*CMDR\*\s*$/i, '')
    .replace(/\s+\[[A-Z0-9]{2,6}\]\s+\d+[A-Z]?\s*$/i, '')
    .replace(/\s+\([A-Z0-9]{2,6}\)\s+\d+[A-Z]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseEntry(line: string): { name: string; quantity: number; commander: boolean } | null {
  const commander = /\s+\*CMDR\*\s*$/i.test(line)
  const withoutMarker = line.replace(/\s+\*CMDR\*\s*$/i, '').trim()
  const bracketMatch = withoutMarker.match(/\s+\[(\d+)\s*x?\]\s*$/i)
  const withoutBracket = bracketMatch ? withoutMarker.slice(0, bracketMatch.index).trim() : withoutMarker
  const quantityMatch = withoutBracket.match(/^(\d+)\s*x?\s+(.+)$/i)
  const quantity = Number(bracketMatch?.[1] ?? quantityMatch?.[1] ?? 1)
  const name = cleanCardName(quantityMatch ? quantityMatch[2] : withoutBracket)
  if (!name || !Number.isInteger(quantity) || quantity < 1) return null
  return { name, quantity, commander }
}

/** Parse common deck-list formats such as `4 Lightning Bolt`, `4x Sol Ring`, or sectioned lists. */
export function parseDeckList(
  text: string,
  options: { name?: string; format?: string } = {},
): DeckImportDefinition {
  const cards: DeckListEntry[] = []
  const commanderNames: string[] = []
  let section: ListSection = 'main'

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    line = line.replace(/^(?:[-•])\s+/, '')

    const decoratedHeader = line.match(/^[-=]{2,}\s*(.*?)\s*[-=]{2,}$/)
    if (decoratedHeader) {
      const label = decoratedHeader[1].toLowerCase()
      section = label.includes('commander') ? 'commander' : label.includes('sideboard') ? 'sideboard' : 'main'
      continue
    }
    if (/^(url|source|format|author|name)\s*:/i.test(line) || line.includes('—')) continue

    const header = line.match(/^(commander|commanders|command zone|mainboard|main|deck|cards|sideboard|maybeboard)\s*:?(.*)$/i)
    if (header) {
      const label = header[1].toLowerCase()
      section = label.startsWith('commander') || label === 'command zone'
        ? 'commander'
        : label === 'sideboard' || label === 'maybeboard' ? 'sideboard' : 'main'
      line = header[2].trim()
      if (!line) continue
    }

    const entry = parseEntry(line)
    if (!entry || section === 'sideboard') continue
    if (section === 'commander' || entry.commander) {
      for (let i = 0; i < entry.quantity; i++) commanderNames.push(entry.name)
    } else {
      addEntry(cards, entry.name, entry.quantity)
    }
  }

  if (cards.length === 0 && commanderNames.length === 0) {
    throw new Error('No cards were found in the deck list.')
  }

  return {
    name: options.name?.trim() || 'Imported Deck',
    format: options.format?.trim() || 'commander',
    commanderNames: [...new Set(commanderNames)],
    cards,
    complete: commanderNames.length > 0,
  }
}

export function prebuiltToDeckDefinition(deck: PrebuiltDeck): DeckImportDefinition {
  const cards: DeckListEntry[] = []
  for (const name of deck.cards) addEntry(cards, name, 1)
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    commanderNames: [deck.commander, ...(deck.partners ?? [])],
    cards,
    complete: deck.complete,
    source: deck.officialRelease
      ? { type: 'builtin', url: deck.officialRelease.url, publisher: deck.officialRelease.publisher, product: deck.officialRelease.product, releaseDate: deck.officialRelease.releaseDate }
      : { type: 'builtin' },
  }
}

export async function fetchDeckList(url: string): Promise<string> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Enter a valid deck-list URL.')
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Deck-list URLs must use http or https.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(parsedUrl.toString(), { signal: controller.signal })
    if (!response.ok) throw new Error(`Deck-list URL returned ${response.status}.`)
    const text = await response.text()
    if (text.length > MAX_LIST_SIZE) throw new Error('Deck list is too large to import.')
    return text
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('The deck-list host blocked browser access (CORS). Use a raw text URL or paste the list instead.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
