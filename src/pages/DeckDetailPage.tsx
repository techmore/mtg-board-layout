import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDeckStore } from '../stores/deckStore'
import { useGameStore } from '../stores/gameStore'
import { prebuiltDecks } from '../data/prebuiltDecks'
import { deckNeedsRuleHydration, fetchDeckCards, hydrateDeckRules } from '../services/deckImport'
import { prebuiltToDeckDefinition } from '../services/deckList'

function classifyCard(typeLine: string): string {
  const tl = typeLine.toLowerCase()
  if (tl.includes('creature')) return 'Creatures'
  if (tl.includes('planeswalker')) return 'Planeswalkers'
  if (tl.includes('battle')) return 'Battles'
  if (tl.includes('instant')) return 'Instants'
  if (tl.includes('sorcery')) return 'Sorceries'
  if (tl.includes('enchantment')) return 'Enchantments'
  if (tl.includes('artifact')) return 'Artifacts'
  if (tl.includes('land')) return 'Lands'
  return 'Other'
}

const CATEGORY_ORDER = [
  'Creatures', 'Planeswalkers', 'Instants', 'Sorceries',
  'Enchantments', 'Artifacts', 'Lands', 'Other',
]

export default function DeckDetailPage() {
  const { deckId } = useParams()
  const navigate = useNavigate()
  const decks = useDeckStore((s) => s.decks)
  const importing = useDeckStore((s) => s.importing)
  const importDeck = useDeckStore((s) => s.importDeck)
  const setImporting = useDeckStore((s) => s.setImporting)
  const loadDeck = useGameStore((s) => s.loadDeck)
  const [hoverCard, setHoverCard] = useState<{ name: string; uri: string; x: number; y: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const importStarted = useRef(false)

  const deck = decks.find((d) => d.id === deckId)
  const prebuilt = prebuiltDecks.find((d) => d.id === deckId)
  const hasDeck = Boolean(deck)

  useEffect(() => {
    if (hasDeck || !prebuilt || importStarted.current || (importing && importing !== deckId)) return
    importStarted.current = true
    ;(async () => {
      setImporting(deckId!)
      setImportError(null)
      try {
        const definition = prebuiltToDeckDefinition(prebuilt)
        const { cards, notFound } = await fetchDeckCards(definition)
        if (notFound.length > 0) setImportError(`Could not find: ${notFound.join(', ')}`)
        importDeck(definition.name, cards, definition.format, definition.commanderNames, notFound.length === 0 && definition.complete, definition.id, definition.source)
      } catch {
        setImportError('Failed to import deck.')
      } finally {
        setImporting(null)
      }
    })()
  }, [hasDeck, prebuilt, deckId, importing, setImporting, importDeck])

  if (!prebuilt && !deck) {
    return (
      <div style={{ flex: 1, padding: 24, color: '#e6edf3' }}>
        <p>Deck not found.</p>
        <button onClick={() => navigate('/decks')} style={{ ...btnStyle, marginTop: 12 }}>Back</button>
      </div>
    )
  }

  if (!deck) {
    return (
      <div style={{ flex: 1, padding: 24, color: '#e6edf3' }}>
        <button onClick={() => navigate('/decks')} style={{ ...btnStyle, background: 'none', border: '1px solid #30363d', marginBottom: 16 }}>← Back</button>
        {importError && (
          <div style={{ padding: '8px 12px', background: '#4d1a1a', borderRadius: 6, marginBottom: 12 }}>{importError}</div>
        )}
        <p style={{ marginBottom: 12, opacity: 0.7 }}>Importing deck&hellip;</p>
      </div>
    )
  }

  const commanders = deck.cards.filter((c) => deck.commanderNames.includes(c.name))
  const grouped: Record<string, typeof deck.cards> = {}
  for (const card of deck.cards) {
    if (deck.commanderNames.includes(card.name)) continue
    const cat = classifyCard(card.typeLine)
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(card)
  }

  const handlePlay = async () => {
    let cards = deck.cards
    if (deckNeedsRuleHydration(deck)) {
      setImporting(`rules:${deck.id}`)
      try {
        const hydrated = await hydrateDeckRules(deck)
        cards = hydrated.cards
        importDeck(deck.name, cards, deck.format, deck.commanderNames, hydrated.notFound.length === 0 && deck.complete, deck.id, deck.source)
      } catch {
        setImportError('Could not refresh card rules; playing with the saved card data.')
      } finally {
        setImporting(null)
      }
    }
    loadDeck(deck.commanderNames, cards, deck.id)
    useGameStore.getState().drawCards(7)
    navigate('/board')
  }

  const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0)

  return (
    <div style={{ flex: 1, padding: 24, color: '#e6edf3', overflow: 'auto', minHeight: 0 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/decks')} style={{ ...btnStyle, background: 'none', border: '1px solid #30363d', fontSize: '0.85rem' }}>
          ← Back
        </button>
        <h2 style={{ margin: 0 }}>{deck.name}</h2>
        <span style={{
          fontSize: '0.7rem', padding: '2px 8px', borderRadius: 999,
          background: deck.complete ? 'rgba(35,134,54,0.2)' : 'rgba(248,81,73,0.2)',
          color: deck.complete ? '#3fb950' : '#f85149', fontWeight: 600,
        }}>
          {deck.complete ? 'Complete' : 'Partial'}
        </span>
        <span style={{ fontSize: '0.85rem', color: '#8b949e' }}>{totalCards} cards</span>
        {deck.source?.publisher && deck.source.product && (
          <a
            href={deck.source.url}
            target="_blank"
            rel="noreferrer"
            title={`Official release: ${deck.source.product}`}
            style={{
              fontSize: '0.7rem',
              padding: '3px 8px',
              borderRadius: 999,
              border: '1px solid rgba(63,185,80,0.55)',
              color: '#56d364',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Official release · {deck.source.releaseDate ?? deck.source.publisher}
          </a>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={handlePlay} style={{
          ...btnStyle, background: '#238636', border: 'none', color: '#fff', fontWeight: 600,
        }}>
          Play This Deck
        </button>
      </div>

      {/* Commanders — large card images */}
      {commanders.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            Commander{commanders.length > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {commanders.map((c) => (
              <div
                key={c.scryfallId}
                style={{ width: 146, position: 'relative', cursor: 'pointer' }}
                onMouseEnter={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setHoverCard({ name: c.name, uri: c.imageUri, x: r.right, y: r.top + 40 })
                }}
                onMouseLeave={() => setHoverCard(null)}
              >
                <img src={c.imageUri} alt={c.name} style={{ width: '100%', borderRadius: 10, display: 'block', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }} />
                <div style={{ fontSize: '0.7rem', marginTop: 6, textAlign: 'center', color: '#e6edf3', lineHeight: 1.2 }}>
                  {c.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category sections — visual grid */}
      {CATEGORY_ORDER.map((cat) => {
        const cards = grouped[cat]
        if (!cards?.length) return null
        const catCount = cards.reduce((s, c) => s + c.quantity, 0)
        return (
          <div key={cat} style={{ marginBottom: 28 }}>
            <div style={{
              fontSize: '0.85rem', color: '#8b949e', marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
            }}>
              {cat} ({catCount})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {cards.map((c) => (
                <div
                  key={c.scryfallId}
                  style={{
                    width: 98, cursor: 'pointer', borderRadius: 6,
                    overflow: 'hidden', background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(88,166,255,0.5)'
                    const r = e.currentTarget.getBoundingClientRect()
                    setHoverCard({ name: c.name, uri: c.imageUri, x: r.right, y: r.top })
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                    setHoverCard(null)
                  }}
                >
                  <img src={c.imageUri} alt={c.name} style={{ width: '100%', display: 'block' }} />
                  <div style={{
                    padding: '2px 4px', fontSize: '0.6rem', lineHeight: 1.2,
                    color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {c.name}{c.quantity > 1 ? ` ×${c.quantity}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Hover popup */}
      {hoverCard && (
        <div
          style={{
            position: 'fixed',
            left: Math.min(hoverCard.x + 10, window.innerWidth - 240),
            top: Math.max(10, Math.min(hoverCard.y - 80, window.innerHeight - 340)),
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <img
            src={hoverCard.uri}
            alt={hoverCard.name}
            style={{
              width: 200,
              borderRadius: 10,
              boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 6,
  cursor: 'pointer',
}
