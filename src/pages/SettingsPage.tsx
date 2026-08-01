import { useMemo, useRef, useState } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useDeckStore } from '../stores/deckStore'
import { useCardRuleStore } from '../stores/cardRuleStore'
import type { DeckCard, EntryTapMode } from '../types/card'

const ENTRY_TAP_OPTIONS: { value: EntryTapMode; label: string; description: string }[] = [
  { value: 'automatic', label: 'Automatic', description: 'Use the card text and the built-in rule database.' },
  { value: 'always', label: 'Always tapped', description: 'This card enters the battlefield tapped.' },
  { value: 'never', label: 'Always untapped', description: 'Ignore automatic enters-tapped text for this card.' },
  { value: 'conditional', label: 'Ask on play', description: 'Prompt whether it enters tapped each time it is played.' },
]

function entryTapMode(card: DeckCard): EntryTapMode {
  return card.entryTapMode ?? 'automatic'
}

function CardRuleDatabase() {
  const decks = useDeckStore((state) => state.decks)
  const updateCardEntryTapMode = useDeckStore((state) => state.updateCardEntryTapMode)
  const savedRules = useCardRuleStore((state) => state.rules)
  const setEntryTapMode = useCardRuleStore((state) => state.setEntryTapMode)
  const [filter, setFilter] = useState('')

  const cards = useMemo(() => {
    const byId = new Map<string, { card: DeckCard; deckNames: string[] }>()
    for (const deck of decks) {
      for (const card of deck.cards) {
        const existing = byId.get(card.scryfallId)
        if (existing) {
          if (!existing.deckNames.includes(deck.name)) existing.deckNames.push(deck.name)
        } else {
          byId.set(card.scryfallId, { card, deckNames: [deck.name] })
        }
      }
    }
    return [...byId.values()].sort((left, right) => left.card.name.localeCompare(right.card.name))
  }, [decks])

  const visibleCards = cards.filter(({ card }) => {
    const query = filter.trim().toLowerCase()
    return !query || card.name.toLowerCase().includes(query) || card.typeLine.toLowerCase().includes(query)
  })

  return (
    <section style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 8 }}>Card Rule Database</h3>
      <p style={{ margin: '0 0 10px', color: '#8b949e', fontSize: '0.8rem', lineHeight: 1.45 }}>
        Set how each imported card enters play. Rules are saved locally by Scryfall ID and apply to every copy in every deck. Use <strong style={{ color: '#e6edf3' }}>Ask on play</strong> for cards with special or turn-dependent instructions you want to verify manually.
      </p>
      <input
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter cards by name or type"
        aria-label="Filter card rules"
        style={{ width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '8px 10px', marginBottom: 10, borderRadius: 6, border: '1px solid #30363d', background: '#0d1117', color: '#e6edf3' }}
      />
      {decks.length === 0 ? (
        <div style={{ padding: 12, border: '1px solid #30363d', borderRadius: 8, color: '#8b949e', background: '#161b22' }}>
          Import a deck to start building the card rule database.
        </div>
      ) : visibleCards.length === 0 ? (
        <div style={{ padding: 12, border: '1px solid #30363d', borderRadius: 8, color: '#8b949e', background: '#161b22' }}>
          No cards match this filter.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6, maxWidth: 900 }}>
          {visibleCards.map(({ card, deckNames }) => {
            const mode = savedRules[card.scryfallId] ?? entryTapMode(card)
            return (
              <div
                key={card.scryfallId}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', border: '1px solid #30363d', borderRadius: 8, background: '#161b22' }}
              >
                <img src={card.imageUri} alt="" aria-hidden="true" style={{ width: 34, height: 48, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.name}</div>
                  <div style={{ color: '#8b949e', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={deckNames.join(', ')}>
                    {card.typeLine} · {deckNames.join(', ')}
                  </div>
                </div>
                <select
                  value={mode}
                  onChange={(event) => {
                    const nextMode = event.target.value as EntryTapMode
                    setEntryTapMode(card.scryfallId, nextMode)
                    updateCardEntryTapMode(card.scryfallId, nextMode)
                  }}
                  aria-label={`Entry rule for ${card.name}`}
                  title={ENTRY_TAP_OPTIONS.find((option) => option.value === mode)?.description}
                  style={{ minWidth: 150, padding: '6px 8px', borderRadius: 5, border: '1px solid #484f58', background: '#0d1117', color: '#e6edf3', fontSize: '0.75rem' }}
                >
                  {ENTRY_TAP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const backgroundImage = useGameStore((s) => s.backgroundImage)
  const backgrounds = useGameStore((s) => s.backgrounds)
  const setBackground = useGameStore((s) => s.setBackground)
  const saveBackground = useGameStore((s) => s.saveBackground)
  const removeBackground = useGameStore((s) => s.removeBackground)
  const aiFixedDeck = useGameStore((s) => s.aiFixedDeck)
  const setAiFixedDeck = useGameStore((s) => s.setAiFixedDeck)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const source = reader.result as string
      const image = new Image()
      image.onload = () => {
        const maxWidth = 1920
        const maxHeight = 1080
        const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          saveBackground(file.name, source)
          return
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const optimized = canvas.toDataURL('image/webp', 0.82)
        saveBackground(file.name, optimized.length < source.length ? optimized : source)
      }
      image.onerror = () => saveBackground(file.name, source)
      image.src = source
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div style={{ flex: 1, padding: 24, color: '#e6edf3', minHeight: 0, overflowY: 'auto' }}>
      <h2 style={{ marginBottom: 16 }}>Settings</h2>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Background Image</h3>

        <button
          onClick={() => fileRef.current?.click()}
          style={{
            marginBottom: 16,
            padding: '8px 16px',
            background: '#238636',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            cursor: 'pointer',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          + Upload Image
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          hidden
        />

        <p style={{ margin: '0 0 8px', color: '#8b949e', fontSize: '0.8rem' }}>
          Click an image to set it as the board background.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <div
            onClick={() => setBackground(null)}
            style={{
              width: 220,
              padding: 8,
              borderRadius: 8,
              border: `2px solid ${backgroundImage === null ? '#58a6ff' : '#30363d'}`,
              background: backgroundImage === null ? 'rgba(88,166,255,0.1)' : '#161b22',
              cursor: 'pointer',
              transition: 'border-color .15s, background .15s',
            }}
            title="Default background"
          >
            <div style={{
              width: '100%',
              height: 120,
              borderRadius: 6,
              marginBottom: 8,
              background: 'url(/unofficial_magic_the_gathering.webp) center/cover no-repeat',
            }} />
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: backgroundImage === null ? '#58a6ff' : '#e6edf3' }}>
              {backgroundImage === null ? '✓ Active' : 'Default'}
            </div>
          </div>
          {backgrounds.map((background) => {
            const active = background.dataUrl === backgroundImage
            return (
              <div
                key={background.id}
                onClick={() => setBackground(background.dataUrl)}
                style={{
                  width: 220,
                  padding: 8,
                  borderRadius: 8,
                  border: `2px solid ${active ? '#58a6ff' : '#30363d'}`,
                  background: active ? 'rgba(88,166,255,0.1)' : '#161b22',
                  cursor: 'pointer',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <img
                  src={background.dataUrl}
                  alt={background.name}
                  style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 6, display: 'block', marginBottom: 8, pointerEvents: 'none' }}
                />
                <div style={{ marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', color: active ? '#58a6ff' : '#e6edf3' }} title={background.name}>
                  {active ? `✓ Active — ${background.name}` : background.name}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); removeBackground(background.id) }}
                  aria-label={`Remove ${background.name}`}
                  style={{
                    padding: '4px 10px',
                    background: 'none',
                    border: '1px solid #f85149',
                    borderRadius: 5,
                    color: '#f85149',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                  }}
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>AI Opponent</h3>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={aiFixedDeck}
            onChange={(e) => setAiFixedDeck(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Use the fixed simple deck (Draconic Destruction)</div>
            <div style={{ color: '#8b949e', fontSize: '0.75rem', lineHeight: 1.5, marginTop: 4, maxWidth: 520 }}>
              Recommended. The AI is built and tested against this one red-green dragon deck, so its turns are reliable.
              The other starter decks were only recently completed and haven't been fully play-tested yet — enabling them
              here means the "+ AI Opponent" button lets you pick any prebuilt or imported deck, and the AI may run into
              cards its simple logic doesn't know how to play yet.
            </div>
          </div>
        </label>
      </section>

      <CardRuleDatabase />
    </div>
  )
}
