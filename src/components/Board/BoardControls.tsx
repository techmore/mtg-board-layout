import { useGameStore } from '../../stores/gameStore'
import { useDeckStore } from '../../stores/deckStore'
import type { CardScale, ManaUsageKind } from '../../types/card'
import { CARD_SCALE_OPTIONS } from '../../layout/cardSizing'
import { BoardBtn } from './BoardBtn'
import ManaPoolArtifact from './ManaPoolArtifact'
import { ManaUsageLog } from './ManaUsageLog'
import { PhaseBar } from './PhaseBar'
import { DRACONIC_DESTRUCTION_DECK } from '../../data/prebuiltDecks'

interface BoardControlsProps {
  handleDeckChange: (deckId: string) => Promise<void>
  manaLogOpen: boolean
  setManaLogOpen: (open: boolean) => void
  manaUsageKind: ManaUsageKind
  setManaUsageKind: (kind: ManaUsageKind) => void
  manaUsageLabel: string
  setManaUsageLabel: (label: string) => void
  onBackgroundOnly: () => void
}

export function BoardControls({
  handleDeckChange,
  manaLogOpen,
  setManaLogOpen,
  manaUsageKind,
  setManaUsageKind,
  manaUsageLabel,
  setManaUsageLabel,
  onBackgroundOnly,
}: BoardControlsProps) {
  const activeDeckId = useGameStore((s) => s.activeDeckId)
  const decks = useDeckStore((s) => s.decks)
  const importing = useDeckStore((s) => s.importing)
  const cardScale = useGameStore((s) => s.cardScale)
  const setCardScale = useGameStore((s) => s.setCardScale)
  const manaPool = useGameStore((s) => s.manaPool)
  const potentialMana = useGameStore((s) => s.potentialMana)
  const addMana = useGameStore((s) => s.addMana)
  const spendMana = useGameStore((s) => s.spendMana)
  const clearManaPool = useGameStore((s) => s.clearManaPool)
  const manaLog = useGameStore((s) => s.manaLog)
  const turn = useGameStore((s) => s.turn)
  const effectHistory = useGameStore((s) => s.effectHistory)
  const landPlaysThisTurn = useGameStore((s) => s.landPlaysThisTurn)
  const lifeTotal = useGameStore((s) => s.lifeTotal)
  const setLife = useGameStore((s) => s.setLife)
  const showOpponent = useGameStore((s) => s.showOpponent)
  const toggleOpponent = useGameStore((s) => s.toggleOpponent)
  const combatState = useGameStore((s) => s.combatState)
  const toggleCombat = useGameStore((s) => s.toggleCombat)
  const resolveCombat = useGameStore((s) => s.resolveCombat)
  const drawCards = useGameStore((s) => s.drawCards)
  const redeal = useGameStore((s) => s.redeal)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 64,
        boxSizing: 'border-box',
        padding: '10px 14px',
        background: '#10151d',
        borderBottom: '2px solid rgba(255,255,255,0.14)',
        position: 'relative',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#8b949e', fontSize: '0.7rem' }}>
        Deck
        <select
          value={activeDeckId ?? ''}
          onChange={(e) => { void handleDeckChange(e.target.value) }}
          disabled={importing !== null}
          aria-label="Active deck"
          style={{
            maxWidth: 190,
            padding: '4px 6px',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.45)',
            color: '#e6edf3',
            fontSize: '0.75rem',
          }}
        >
          {decks.length === 0 && <option value="">No decks imported</option>}
          {decks.length > 0 && !activeDeckId && <option value="">Select a deck</option>}
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>{deck.name}</option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#8b949e', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
        Cards
        <select
          value={cardScale}
          onChange={(event) => setCardScale(Number(event.target.value) as CardScale)}
          aria-label="Card scale"
          title="Scale cards on the board and in hand"
          style={{
            padding: '4px 5px',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(0,0,0,0.45)',
            color: '#e6edf3',
            fontSize: '0.75rem',
          }}
        >
          {CARD_SCALE_OPTIONS.map((scale) => (
            <option key={scale} value={scale}>{scale}×</option>
          ))}
        </select>
      </label>
      <ManaPoolArtifact
        manaPool={manaPool}
        potentialMana={potentialMana}
        onAdd={addMana}
        onSpend={(color) => spendMana(color, manaUsageKind, manaUsageLabel)}
        onClear={clearManaPool}
        onToggleLog={() => setManaLogOpen(!manaLogOpen)}
        manaLogOpen={manaLogOpen}
        compact
      />
      <BoardBtn onClick={() => useGameStore.getState().drawCards(7)}>Draw 7</BoardBtn>
      <BoardBtn onClick={() => useGameStore.getState().drawCards(1)}>Draw 1</BoardBtn>
      <BoardBtn onClick={() => useGameStore.getState().redeal(7)}>
        Redeal 7
      </BoardBtn>
      <BoardBtn onClick={onBackgroundOnly}>
        Background Only
      </BoardBtn>
      <div
        aria-label={`Land drops this turn: ${landPlaysThisTurn} of 1`}
        title="Land drop tracker for the current turn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '4px 8px',
          borderRadius: 999,
          background: landPlaysThisTurn > 1 ? 'rgba(248,81,73,0.18)' : landPlaysThisTurn === 1 ? 'rgba(63,185,80,0.18)' : 'rgba(255,211,61,0.12)',
          border: `1px solid ${landPlaysThisTurn > 1 ? 'rgba(248,81,73,0.55)' : landPlaysThisTurn === 1 ? 'rgba(63,185,80,0.55)' : 'rgba(255,211,61,0.45)'}`,
          color: landPlaysThisTurn > 1 ? '#ff7b72' : landPlaysThisTurn === 1 ? '#56d364' : '#ffd33d',
          fontSize: '0.72rem',
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        <span aria-hidden="true">{landPlaysThisTurn === 1 ? '✓' : '⌂'}</span>
        Land {landPlaysThisTurn}/1
      </div>

      <PhaseBar />

      {manaLogOpen && (
        <ManaUsageLog
          turn={turn}
          entries={manaLog}
          effectHistory={effectHistory}
          usageKind={manaUsageKind}
          usageLabel={manaUsageLabel}
          onUsageKindChange={setManaUsageKind}
          onUsageLabelChange={setManaUsageLabel}
          onClose={() => setManaLogOpen(false)}
        />
      )}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {!showOpponent && (
          <button
            title="Load AI opponent (Draconic Destruction)"
            onClick={() => {
              useGameStore.getState().loadOpponentDeck(DRACONIC_DESTRUCTION_DECK.commanderNames, DRACONIC_DESTRUCTION_DECK.cards, DRACONIC_DESTRUCTION_DECK.name)
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid rgba(248,81,73,0.35)',
              background: 'rgba(248,81,73,0.1)',
              color: '#f85149',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            + AI Opponent
          </button>
        )}
        {!combatState.active ? (
          <BoardBtn onClick={toggleCombat}>
            Start Combat
          </BoardBtn>
        ) : (
          <>
            <BoardBtn onClick={resolveCombat}>
              Resolve Combat
            </BoardBtn>
            <BoardBtn onClick={toggleCombat}>
              End Combat
            </BoardBtn>
          </>
        )}
      </div>

      <div
        aria-label={`Turn ${turn}`}
        style={{
          padding: '4px 9px',
          borderRadius: 999,
          background: 'rgba(88,166,255,0.14)',
          border: '1px solid rgba(88,166,255,0.3)',
          color: '#79c0ff',
          fontSize: '0.75rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        Turn {turn}
      </div>
      <BoardBtn onClick={() => drawCards(1)}>
        Draw 1
      </BoardBtn>
      <BoardBtn onClick={() => { if (window.confirm('New hand?')) redeal() }}>
        New Hand
      </BoardBtn>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <button
          title="Decrease life"
          onClick={() => setLife(lifeTotal - 1)}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#8b949e',
            cursor: 'pointer',
            borderRadius: 4,
            width: 24,
            height: 24,
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          −
        </button>
        <span
          style={{
            fontSize: '1.1rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: lifeTotal <= 0 ? '#f85149' : lifeTotal <= 5 ? '#d29922' : '#e6edf3',
            minWidth: 28,
            textAlign: 'center',
          }}
        >
          {lifeTotal}
        </span>
        <button
          title="Increase life"
          onClick={() => setLife(lifeTotal + 1)}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#8b949e',
            cursor: 'pointer',
            borderRadius: 4,
            width: 24,
            height: 24,
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          +
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <button
        title={showOpponent ? 'Hide opponent zone' : 'Show opponent zone'}
        onClick={toggleOpponent}
        style={{
          background: 'none',
          border: 'none',
          color: showOpponent ? '#e6edf3' : '#484f58',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </button>
    </div>
  )
}
