import { useState } from 'react'
import { useGameStore } from '../../stores/gameStore'
import { useDeckStore } from '../../stores/deckStore'
import type { CardScale, ManaUsageKind } from '../../types/card'
import { CARD_SCALE_OPTIONS } from '../../layout/cardSizing'
import { BoardBtn } from './BoardBtn'
import ManaPoolArtifact from './ManaPoolArtifact'
import { ManaUsageLog } from './ManaUsageLog'
import { OpponentSetupDialog } from './OpponentSetupDialog'
import { PhaseBar } from './PhaseBar'
import { DRACONIC_DESTRUCTION_DECK } from '../../data/prebuiltDecks'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'

interface BoardControlsProps {
  handleDeckChange: (deckId: string) => Promise<void>
  manaLogOpen: boolean
  setManaLogOpen: (open: boolean) => void
  manaUsageKind: ManaUsageKind
  setManaUsageKind: (kind: ManaUsageKind) => void
  manaUsageLabel: string
  setManaUsageLabel: (label: string) => void
  onBackgroundOnly: () => void
  opponentSize: number
  onCycleOpponentSize: () => void
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
  opponentSize,
  onCycleOpponentSize,
}: BoardControlsProps) {
  const activeDeckId = useGameStore((s) => s.activeDeckId)
  const decks = useDeckStore((s) => s.decks)
  const importing = useDeckStore((s) => s.importing)
  const cardScale = useGameStore((s) => s.cardScale)
  const setCardScale = useGameStore((s) => s.setCardScale)
  const manaPool = useGameStore((s) => s.manaPool)
  const energyCounters = useGameStore((s) => s.energyCounters)
  const potentialMana = useGameStore((s) => s.potentialMana)
  const addMana = useGameStore((s) => s.addMana)
  const spendMana = useGameStore((s) => s.spendMana)
  const clearManaPool = useGameStore((s) => s.clearManaPool)
  const manaLog = useGameStore((s) => s.manaLog)
  const turn = useGameStore((s) => s.turn)
  const effectHistory = useGameStore((s) => s.effectHistory)
  const landPlaysThisTurn = useGameStore((s) => s.landPlaysThisTurn)
  const lifeTotal = useGameStore((s) => s.lifeTotal)
  const monarch = useGameStore((s) => s.monarch)
  const setLife = useGameStore((s) => s.setLife)
  const showOpponent = useGameStore((s) => s.showOpponent)
  const toggleOpponent = useGameStore((s) => s.toggleOpponent)
  const aiFixedDeck = useGameStore((s) => s.aiFixedDeck)
  const [opponentSetupOpen, setOpponentSetupOpen] = useState(false)
  const [confirmNewHandOpen, setConfirmNewHandOpen] = useState(false)
  const combatState = useGameStore((s) => s.combatState)
  const toggleCombat = useGameStore((s) => s.toggleCombat)
  const resolveCombat = useGameStore((s) => s.resolveCombat)
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
      <div style={dividerStyle} />
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
      {energyCounters > 0 && (
        <span
          aria-label={`${energyCounters} energy counters`}
          title={`${energyCounters} energy counters ({E})`}
          style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d29922', whiteSpace: 'nowrap' }}
        >
          ⚡{energyCounters}
        </span>
      )}
      <div style={dividerStyle} />
      <BoardBtn onClick={() => useGameStore.getState().drawCards(7)}>Draw 7</BoardBtn>
      <BoardBtn onClick={() => useGameStore.getState().drawCards(1)}>Draw 1</BoardBtn>
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

      <OpponentSetupDialog open={opponentSetupOpen} onClose={() => setOpponentSetupOpen(false)} />

      <ConfirmDialog
        open={confirmNewHandOpen}
        title="New Hand"
        message="Discard the current board and draw a fresh opening hand?"
        confirmLabel="New Hand"
        onConfirm={() => { setConfirmNewHandOpen(false); redeal() }}
        onCancel={() => setConfirmNewHandOpen(false)}
      />

      <div style={{ flex: 1 }} />

      <div style={dividerStyle} />
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {!showOpponent && (
          <Button
            size="sm"
            variant="danger"
            title={aiFixedDeck ? 'Load the fixed simple AI deck (Draconic Destruction)' : 'Choose the AI opponent deck'}
            onClick={() => {
              if (aiFixedDeck) {
                useGameStore.getState().loadOpponentDeck(DRACONIC_DESTRUCTION_DECK.commanderNames, DRACONIC_DESTRUCTION_DECK.cards, DRACONIC_DESTRUCTION_DECK.name)
              } else {
                setOpponentSetupOpen(true)
              }
            }}
          >
            + AI Opponent
          </Button>
        )}
        {showOpponent && (
          <Button
            size="sm"
            title="Cycle table presets. Drag the divider bar to resize freely."
            onClick={onCycleOpponentSize}
          >
            {opponentSize < 0.4 ? 'Table: Compact' : opponentSize < 0.65 ? 'Table: Split' : 'Table: Opponent'}
          </Button>
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

      <BoardBtn onClick={() => { if (confirmNewHandOpen) return; setConfirmNewHandOpen(true) }}>
        New Hand
      </BoardBtn>
      <div style={dividerStyle} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Button
          size="sm"
          variant="ghost"
          title="Decrease life"
          onClick={() => setLife(lifeTotal - 1)}
          style={{ width: 26, height: 26, padding: 0 }}
        >
          −
        </Button>
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
        {monarch === 'player' && (
          <span title="You are the monarch" style={{ color: '#d29922', fontSize: '0.85rem' }}>👑</span>
        )}
        <Button
          size="sm"
          variant="ghost"
          title="Increase life"
          onClick={() => setLife(lifeTotal + 1)}
          style={{ width: 26, height: 26, padding: 0 }}
        >
          +
        </Button>
      </div>

      <div style={dividerStyle} />

      <div style={{ flex: 1 }} />

      <BoardBtn onClick={onBackgroundOnly}>
        Background Only
      </BoardBtn>

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

const dividerStyle: React.CSSProperties = { width: 1, height: 26, background: 'rgba(255,255,255,0.14)', flexShrink: 0 }
