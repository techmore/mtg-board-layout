import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchCards } from '../services/scryfall'
import { useDeckStore } from '../stores/deckStore'
import type { DeckCard, ScryfallCard } from '../types/card'

const MAX_DECK_SIZE = 100
const MAX_COMMANDERS = 2

function toDeckCard(scryfall: ScryfallCard): Omit<DeckCard, 'quantity'> {
  const face = scryfall.card_faces?.[0]
  return {
    scryfallId: scryfall.id,
    name: scryfall.name,
    manaCost: face?.mana_cost ?? scryfall.mana_cost,
    manaValue: scryfall.cmc,
    typeLine: face?.type_line ?? scryfall.type_line,
    oracleText: face?.oracle_text ?? scryfall.oracle_text,
    imageUri: scryfall.image_uris?.normal ?? face?.image_uris?.normal ?? '',
  }
}

export default function DeckBuilderPage() {
  const navigate = useNavigate()
  const importDeck = useDeckStore((state) => state.importDeck)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ScryfallCard[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)

  const [deckName, setDeckName] = useState('')
  const [deck, setDeck] = useState<DeckCard[]>([])
  const [commanderNames, setCommanderNames] = useState<string[]>([])

  const debounceRef = useRef<number | null>(null)
  const totalCopies = deck.reduce((sum, card) => sum + card.quantity, 0)

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearchError(null)
      return
    }
    setSearching(true)
    debounceRef.current = window.setTimeout(() => {
      searchCards(trimmed)
        .then((cards) => {
          const physical = cards.filter((card) => !card.name.startsWith('A-'))
          const withImages = physical.filter((card) => card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal)
          setSkipped(cards.length - withImages.length)
          setResults(withImages.slice(0, 40))
          setSearchError(null)
        })
        .catch(() => {
          setResults([])
          setSearchError('Search failed. Check your connection and try again.')
        })
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  const addCard = (scryfall: ScryfallCard) => {
    if (totalCopies >= MAX_DECK_SIZE) return
    const base = toDeckCard(scryfall)
    setDeck((current) => {
      const existing = current.find((card) => card.name === base.name)
      if (existing) {
        return current.map((card) => card.name === base.name ? { ...card, quantity: card.quantity + 1 } : card)
      }
      return [...current, { ...base, quantity: 1 }]
    })
  }

  const incrementCard = (name: string) => {
    if (totalCopies >= MAX_DECK_SIZE) return
    setDeck((current) => current.map((card) =>
      card.name === name ? { ...card, quantity: card.quantity + 1 } : card,
    ))
  }

  const removeCopy = (name: string) => {
    setDeck((current) => current.flatMap((card) =>
      card.name !== name ? [card]
        : card.quantity > 1 ? [{ ...card, quantity: card.quantity - 1 }]
          : [],
    ))
  }

  const removeCard = (name: string) => {
    setDeck((current) => current.filter((card) => card.name !== name))
    setCommanderNames((current) => current.filter((c) => c !== name))
  }

  const toggleCommander = (name: string) => {
    setCommanderNames((current) => {
      if (current.includes(name)) return current.filter((c) => c !== name)
      if (current.length >= MAX_COMMANDERS) return current
      return [...current, name]
    })
  }

  const saveDeck = () => {
    if (!deckName.trim() || totalCopies === 0) return
    importDeck(deckName.trim(), deck, 'commander', commanderNames, false, undefined, { type: 'text' })
    navigate('/decks')
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: '#0d1117',
        color: '#e6edf3',
        padding: 18,
        boxSizing: 'border-box',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.05rem' }}>Deck Builder</strong>
        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          placeholder="Deck name"
          maxLength={40}
          style={inputStyle}
        />
        <span style={{ color: '#8b949e', fontSize: '0.75rem' }}>{totalCopies}/{MAX_DECK_SIZE} cards</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/decks')}
          style={secondaryButtonStyle}
        >
          Cancel
        </button>
        <button
          onClick={saveDeck}
          disabled={!deckName.trim() || totalCopies === 0}
          style={{
            ...primaryButtonStyle,
            opacity: !deckName.trim() || totalCopies === 0 ? 0.5 : 1,
            cursor: !deckName.trim() || totalCopies === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Save Deck
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
        <section style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search cards (e.g. 'dragon' or 'Lightning Bolt')…"
            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
          />
          {searchError && <div style={{ color: '#f85149', fontSize: '0.75rem', marginBottom: 8 }}>{searchError}</div>}
          {searching && <div style={{ color: '#8b949e', fontSize: '0.75rem', marginBottom: 8 }}>Searching…</div>}
          {!searching && query.trim().length >= 2 && !searchError && results.length === 0 && (
            <div style={{ color: '#8b949e', fontSize: '0.75rem', marginBottom: 8 }}>No results.</div>
          )}
          {skipped > 0 && (
            <div style={{ color: '#8b949e', fontSize: '0.7rem', marginBottom: 8 }}>
              {skipped} card(s) without images skipped.
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, alignContent: 'start' }}>
            {results.map((card) => {
              const face = card.card_faces?.[0]
              const image = card.image_uris?.normal ?? face?.image_uris?.normal ?? ''
              const typeLine = face?.type_line ?? card.type_line
              return (
                <div
                  key={card.id}
                  style={{
                    border: '1px solid #30363d',
                    borderRadius: 8,
                    background: '#161b22',
                    padding: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  {image ? (
                    <img src={image} alt={card.name} style={{ width: '100%', aspectRatio: '488 / 680', objectFit: 'cover', borderRadius: 5, display: 'block' }} />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '488 / 680', borderRadius: 5, background: '#21262d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#484f58', fontSize: '0.7rem' }}>No image</div>
                  )}
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                  <div style={{ fontSize: '0.62rem', color: '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{typeLine}</div>
                  <button
                    onClick={() => addCard(card)}
                    disabled={totalCopies >= MAX_DECK_SIZE}
                    style={{
                      padding: '4px 0',
                      borderRadius: 5,
                      border: '1px solid rgba(88,166,255,0.4)',
                      background: 'rgba(88,166,255,0.12)',
                      color: '#58a6ff',
                      cursor: totalCopies >= MAX_DECK_SIZE ? 'not-allowed' : 'pointer',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                    }}
                  >
                    + Add
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        <aside style={{ flex: 1, minWidth: 280, maxWidth: 380, border: '1px solid #30363d', borderRadius: 10, background: '#161b22', padding: 12, display: 'flex', flexDirection: 'column' }}>
          <strong style={{ fontSize: '0.8rem', marginBottom: 10 }}>Deck list</strong>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {deck.length === 0 && <div style={{ color: '#8b949e', fontSize: '0.75rem' }}>Add cards from the search results.</div>}
            {deck.map((card) => {
              const isCommander = commanderNames.includes(card.name)
              return (
                <div
                  key={card.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 7px',
                    borderRadius: 6,
                    border: isCommander ? '1px solid rgba(210,153,34,0.55)' : '1px solid rgba(255,255,255,0.08)',
                    background: isCommander ? 'rgba(210,153,34,0.1)' : 'rgba(255,255,255,0.02)',
                    fontSize: '0.72rem',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card.name}
                    {isCommander && <span style={{ color: '#ffd33d', fontSize: '0.6rem', marginLeft: 5, fontWeight: 700 }}>CMDR</span>}
                  </span>
                  <button
                    onClick={() => toggleCommander(card.name)}
                    title="Toggle commander"
                    disabled={!isCommander && commanderNames.length >= MAX_COMMANDERS}
                    style={tinyButtonStyle}
                  >
                    C
                  </button>
                  <button onClick={() => removeCopy(card.name)} style={tinyButtonStyle}>−</button>
                  <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700 }}>{card.quantity}</span>
                  <button onClick={() => incrementCard(card.name)} disabled={totalCopies >= MAX_DECK_SIZE} style={tinyButtonStyle}>+</button>
                  <button onClick={() => removeCard(card.name)} style={{ ...tinyButtonStyle, color: '#f85149' }}>×</button>
                </div>
              )
            })}
          </div>
        </aside>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 11px',
  borderRadius: 7,
  border: '1px solid #30363d',
  background: '#161b22',
  color: '#e6edf3',
  fontSize: '0.82rem',
}
const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 7,
  border: '1px solid #30363d',
  background: 'transparent',
  color: '#8b949e',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
}
const primaryButtonStyle: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 7,
  border: 'none',
  background: '#238636',
  color: '#fff',
  fontSize: '0.8rem',
  fontWeight: 700,
}
const tinyButtonStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 4,
  border: '1px solid #30363d',
  background: 'rgba(255,255,255,0.04)',
  color: '#d0d7de',
  cursor: 'pointer',
  fontSize: '0.68rem',
  padding: 0,
  lineHeight: 1,
  flexShrink: 0,
}
