import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useDeckStore } from '../../stores/deckStore'
import { prebuiltDecks, type PrebuiltDeck } from '../../data/prebuiltDecks'
import { fetchDeckCards } from '../../services/deckImport'
import { prebuiltToDeckDefinition } from '../../services/deckList'
import type { Deck } from '../../types/card'

interface OpponentSetupDialogProps {
  open: boolean
  onClose: () => void
}

function prebuiltCommanderLabel(deck: PrebuiltDeck): string {
  return [deck.commander, ...(deck.partners ?? [])].join(' & ')
}

function importedCommanderLabel(deck: Deck): string {
  return deck.commanderNames.length > 0 ? deck.commanderNames.join(' & ') : 'No commander'
}

function importedCardCount(deck: Deck): number {
  return deck.cards.reduce((sum, card) => sum + card.quantity, 0)
}

const rowBaseStyle = {
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: 10,
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1px solid transparent',
  background: 'transparent',
  color: '#e6edf3',
  cursor: 'pointer',
  textAlign: 'left' as const,
  fontSize: '0.82rem',
}

const rowHoverStyle = {
  borderColor: '#30363d',
  background: '#0d1117',
}

export function OpponentSetupDialog({ open, onClose }: OpponentSetupDialogProps) {
  const decks = useDeckStore((s) => s.decks)
  const [hydrating, setHydrating] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
    if (open) {
      setErrors({})
      setHydrating({})
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const startWithPrebuilt = async (deck: PrebuiltDeck) => {
    setHydrating((prev) => ({ ...prev, [deck.id]: true }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[deck.id]
      return next
    })
    try {
      const definition = prebuiltToDeckDefinition(deck)
      const hydrated = await fetchDeckCards(definition)
      if (!openRef.current) return
      useGameStore.getState().loadOpponentDeck(definition.commanderNames, hydrated.cards, definition.name)
      onClose()
    } catch {
      if (!openRef.current) return
      setErrors((prev) => ({
        ...prev,
        [deck.id]: 'Failed to load this deck. Check your connection.',
      }))
    } finally {
      setHydrating((prev) => {
        const next = { ...prev }
        delete next[deck.id]
        return next
      })
    }
  }

  const startWithImported = (deck: Deck) => {
    useGameStore.getState().loadOpponentDeck(deck.commanderNames, deck.cards, deck.name)
    onClose()
  }

  const renderPrebuiltRow = (deck: PrebuiltDeck) => {
    const loading = hydrating[deck.id] === true
    const error = errors[deck.id]
    return (
      <button
        key={deck.id}
        type="button"
        disabled={loading}
        onClick={() => { void startWithPrebuilt(deck) }}
        title={error ? error : undefined}
        style={{
          ...rowBaseStyle,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'default' : 'pointer',
        }}
        onMouseEnter={(e) => {
          if (!loading) Object.assign(e.currentTarget.style, rowHoverStyle)
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{deck.name}</div>
          <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>
            {prebuiltCommanderLabel(deck)} · {deck.cards.length} cards
          </div>
          {error && (
            <div style={{ color: '#f85149', fontSize: '0.72rem', marginTop: 2 }}>
              {error}
            </div>
          )}
        </div>
        {loading && <span style={{ color: '#58a6ff', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Loading…</span>}
      </button>
    )
  }

  const renderImportedRow = (deck: Deck) => {
    return (
      <button
        key={deck.id}
        type="button"
        onClick={() => startWithImported(deck)}
        style={rowBaseStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, rowHoverStyle)}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{deck.name}</div>
          <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>
            {importedCommanderLabel(deck)} · {importedCardCount(deck)} cards
          </div>
        </div>
      </button>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose AI opponent deck"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,0.78)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(540px, 100%)',
          maxHeight: 'min(640px, 85vh)',
          display: 'flex',
          flexDirection: 'column',
          padding: 24,
          borderRadius: 14,
          background: '#161b22',
          border: '1px solid #30363d',
          boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#e6edf3' }} id="opponent-setup-title">
            Add AI Opponent
          </div>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#8b949e',
              cursor: 'pointer',
              width: 28,
              height: 28,
              fontSize: '0.9rem',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ color: '#8b949e', fontSize: '0.8rem', marginBottom: 14 }}>
          Choose the deck the AI opponent will play.
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <div>
            <div style={{ color: '#8b949e', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 4px 4px' }}>
              Prebuilt
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {prebuiltDecks.map(renderPrebuiltRow)}
            </div>
          </div>
          <div>
            <div style={{ color: '#8b949e', fontSize: '0.68rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', margin: '0 4px 4px' }}>
              Imported
            </div>
            {decks.length === 0 ? (
              <div style={{ color: '#8b949e', fontSize: '0.78rem', padding: '8px 4px' }}>
                No imported decks yet. Import a deck on the Decks page.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {decks.map(renderImportedRow)}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid #30363d' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid #30363d',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
