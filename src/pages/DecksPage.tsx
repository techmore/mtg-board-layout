import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeckStore } from '../stores/deckStore'
import { useGameStore } from '../stores/gameStore'
import { prebuiltDecks } from '../data/prebuiltDecks'
import { fetchDeckCards } from '../services/deckImport'

type Filter = 'all' | 'complete' | 'incomplete'

export default function DecksPage() {
  const navigate = useNavigate()
  const decks = useDeckStore((s) => s.decks)
  const importing = useDeckStore((s) => s.importing)
  const importDeck = useDeckStore((s) => s.importDeck)
  const setImporting = useDeckStore((s) => s.setImporting)
  const deleteDeck = useDeckStore((s) => s.deleteDeck)
  const loadDeck = useGameStore((s) => s.loadDeck)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const handleImport = async (id: string) => {
    const deck = prebuiltDecks.find((d) => d.id === id)
    if (!deck) return
    setImporting(id)
    setError(null)
    try {
      const { cards, notFound } = await fetchDeckCards(deck)
      if (notFound.length > 0) {
        setError(`Could not find: ${notFound.join(', ')}`)
      }
      const commanders = [deck.commander, ...(deck.partners ?? [])]
      importDeck(deck.name, cards, deck.format, commanders, notFound.length === 0 && deck.complete, id)
      navigate(`/decks/${id}`)
    } catch {
      setError('Failed to import deck. Check your connection.')
    } finally {
      setImporting(null)
    }
  }

  const handlePlay = (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId)
    if (!deck) return
    const commanders = deck.commanderNames.length > 0
      ? deck.commanderNames
      : deck.cards.length > 0 ? [deck.cards[0].name] : []
    loadDeck(commanders, deck.cards)
    useGameStore.getState().drawCards(7)
    navigate('/board')
  }

  const filteredDecks = prebuiltDecks.filter((d) => {
    if (filter === 'all') return true
    if (filter === 'complete') return d.complete
    return !d.complete
  })

  return (
    <div style={{ flex: 1, padding: 24, color: '#e6edf3', minHeight: 0, overflow: 'auto' }}>
      <h2 style={{ marginBottom: 16 }}>My Decks</h2>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h3 style={{
            color: '#8b949e', fontSize: '0.9rem',
            textTransform: 'uppercase', letterSpacing: 1,
          }}>
            Prebuilt Commander Decks
          </h3>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'complete', 'incomplete'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '2px 10px',
                  fontSize: '0.75rem',
                  background: filter === f ? '#30363d' : 'transparent',
                  border: '1px solid #30363d',
                  borderRadius: 4,
                  color: filter === f ? '#e6edf3' : '#8b949e',
                  cursor: 'pointer',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {filteredDecks.map((deck) => (
            <div
              key={deck.id}
              onClick={() => navigate(`/decks/${deck.id}`)}
              style={{
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 12,
                padding: 0,
                width: 240,
                cursor: 'pointer',
                overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#58a6ff' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d' }}
            >
              <div style={{ position: 'relative' }}>
                <img
                  src={`https://api.scryfall.io/cards/named?exact=${encodeURIComponent(deck.commander)}&format=image`}
                  alt={deck.commander}
                  style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
                <div style={{
                  position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4,
                }}>
                  <span style={{
                    padding: '1px 8px', borderRadius: 999,
                    background: 'rgba(0,0,0,0.6)',
                    color: '#fff', fontSize: '0.7rem', fontWeight: 600,
                    backdropFilter: 'blur(4px)',
                  }}>
                    {deck.commander}
                    {deck.partners?.length ? ` + ${deck.partners.join(', ')}` : ''}
                  </span>
                </div>
                <div style={{ position: 'absolute', top: 8, right: 8 }}>
                  <span style={{
                    fontSize: '0.6rem',
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: deck.complete ? 'rgba(35,134,54,0.8)' : 'rgba(248,81,73,0.8)',
                    color: '#fff',
                    fontWeight: 600,
                    backdropFilter: 'blur(4px)',
                  }}>
                    {deck.complete ? 'Complete' : 'Partial'}
                  </span>
                </div>
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 8 }}>{deck.name}</div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleImport(deck.id) }}
                  disabled={importing !== null}
                  style={{
                    padding: '6px 14px',
                    background: importing !== null ? '#30363d' : '#238636',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    cursor: importing !== null ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    width: '100%',
                    fontSize: '0.85rem',
                  }}
                >
                  {importing === deck.id ? 'Importing...' : importing ? 'Another import is running' : 'Import & View'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <div style={{
          padding: '8px 12px', background: '#4d1a1a', borderRadius: 6,
          marginBottom: 16, fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      <section>
        <h3 style={{
          marginBottom: 12, color: '#8b949e', fontSize: '0.9rem',
          textTransform: 'uppercase', letterSpacing: 1,
        }}>
          Imported Decks
        </h3>
        {decks.length === 0 ? (
          <p style={{ opacity: 0.5 }}>No decks imported yet.</p>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {decks.map((deck) => (
              <div
                key={deck.id}
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 12,
                  padding: 16,
                  width: 240,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ fontWeight: 600 }}>{deck.name}</div>
                  <span style={{
                    fontSize: '0.6rem',
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: deck.complete ? 'rgba(35,134,54,0.2)' : 'rgba(248,81,73,0.2)',
                    color: deck.complete ? '#3fb950' : '#f85149',
                    fontWeight: 600,
                  }}>
                    {deck.complete ? 'Complete' : 'Partial'}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: 8 }}>
                  {deck.cards.reduce((total, card) => total + card.quantity, 0)} cards
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => navigate(`/decks/${deck.id}`)}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: '1px solid #30363d',
                      borderRadius: 6,
                      color: '#e6edf3',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => handlePlay(deck.id)}
                    style={{
                      padding: '6px 16px',
                      background: '#238636',
                      border: 'none',
                      borderRadius: 6,
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: 600,
                      flex: 1,
                    }}
                  >
                    Play
                  </button>
                  <button
                    onClick={() => deleteDeck(deck.id)}
                    style={{
                      padding: '6px 12px',
                      background: 'none',
                      border: '1px solid #f85149',
                      borderRadius: 6,
                      color: '#f85149',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
