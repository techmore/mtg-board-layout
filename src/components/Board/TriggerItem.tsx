import type { BoardCard, TriggerInstance } from '../../types/card'
import { effectLabelFor, targetsForEffect, filterMatch } from './triggerUtils'
import { TargetCard } from './TargetCard'

type TriggerAction = (triggerId: string) => void
type TargetAction = (triggerId: string, cardId: string) => void

interface TriggerItemProps {
  trigger: TriggerInstance
  cards: BoardCard[]
  resolveTrigger: TriggerAction
  selectTarget: TargetAction
  toggleProliferateTarget: TargetAction
  confirmProliferate: TriggerAction
  toggleScryTarget: TargetAction
  confirmScry: TriggerAction
  confirmSearchLibrary: TriggerAction
  selectSearchLibraryTarget: TargetAction
}

export function TriggerItem({
  trigger,
  cards,
  resolveTrigger,
  selectTarget,
  toggleProliferateTarget,
  confirmProliferate,
  toggleScryTarget,
  confirmScry,
  confirmSearchLibrary,
  selectSearchLibraryTarget,
}: TriggerItemProps) {
  const effect = trigger.ability.effect
  const needsTarget = trigger.selectedTargets !== undefined
  const targetsRemaining = needsTarget
    ? trigger.ability.targets - (trigger.selectedTargets?.length ?? 0)
    : 0
  const targetCards = targetsForEffect(effect.kind, cards)
  const targetHint = trigger.ability.targetFilter

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        background: needsTarget
          ? 'rgba(255,179,64,0.08)'
          : 'rgba(88,166,255,0.06)',
        border: needsTarget
          ? '1px solid rgba(255,179,64,0.4)'
          : '1px solid rgba(88,166,255,0.2)',
      }}
    >
      <div style={{ fontSize: '0.82rem', color: '#e6edf3', marginBottom: 4 }}>
        <strong style={{ color: '#79c0ff' }}>{trigger.sourceCardName}</strong>
        {' — '}
        {trigger.ability.triggerCondition ?? trigger.ability.triggerEvent}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: 8 }}>
        → {effectLabelFor(effect.kind, effect.params)}
      </div>

      {effect.kind === 'proliferate' && needsTarget && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.72rem', color: '#ffb340', marginBottom: 6 }}>
            Choose permanents to proliferate (toggle on/off):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {cards
              .filter((card) => card.zone === 'battlefield' && card.counters > 0)
              .map((card) => {
                const selected = trigger.selectedTargets?.includes(card.id)
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleProliferateTarget(trigger.id, card.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: `1px solid ${selected ? 'rgba(88,166,255,0.6)' : 'rgba(88,166,255,0.3)'}`,
                      background: selected
                        ? 'rgba(88,166,255,0.2)'
                        : 'rgba(13,17,23,0.6)',
                      color: selected ? '#79c0ff' : '#e6edf3',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: selected ? 700 : 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 180,
                    }}
                    title={`${card.name} (${card.type}) — ${card.counters} counter(s)`}
                  >
                    {card.name}
                    <span style={{ color: '#8b949e', marginLeft: 4, fontSize: '0.65rem' }}>
                      ({card.counters})
                    </span>
                  </button>
                )
              })}
            {cards.filter((card) => card.zone === 'battlefield' && card.counters > 0).length === 0 && (
              <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>
                No permanents with counters on the battlefield.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => confirmProliferate(trigger.id)}
              style={{
                padding: '5px 14px',
                borderRadius: 6,
                border: '1px solid rgba(88,166,255,0.5)',
                background: 'rgba(88,166,255,0.15)',
                color: '#79c0ff',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              Confirm ({trigger.selectedTargets?.length ?? 0} selected)
            </button>
            <button
              type="button"
              onClick={() => resolveTrigger(trigger.id)}
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                border: '1px solid #484f58',
                background: 'transparent',
                color: '#8b949e',
                cursor: 'pointer',
                fontSize: '0.68rem',
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {effect.kind === 'scry' && needsTarget && (
        <div style={{ marginBottom: 8 }}>
          {(() => {
            const scryAmount = (effect.params as Record<string, unknown>).amount as number ?? 1
            const libraryCards = cards.filter((card) => card.zone === 'library')
            const topCards = libraryCards.slice(0, scryAmount)
            return (
              <>
                <div style={{ fontSize: '0.72rem', color: '#ffb340', marginBottom: 6 }}>
                  Choose cards to put on the bottom (toggled cards go to bottom, rest stay on top):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {topCards.map((card) => {
                    const selected = trigger.selectedTargets?.includes(card.id)
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => toggleScryTarget(trigger.id, card.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: `1px solid ${selected ? 'rgba(210,153,34,0.6)' : 'rgba(88,166,255,0.3)'}`,
                          background: selected
                            ? 'rgba(210,153,34,0.15)'
                            : 'rgba(13,17,23,0.6)',
                          color: selected ? '#d29922' : '#e6edf3',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          fontWeight: selected ? 700 : 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 180,
                        }}
                      >
                        {card.name}
                        {selected && (
                          <span style={{ color: '#d29922', marginLeft: 4, fontSize: '0.65rem' }}>
                            (bottom)
                          </span>
                        )}
                      </button>
                    )
                  })}
                  {topCards.length === 0 && (
                    <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>
                      No cards in library.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => confirmScry(trigger.id)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(88,166,255,0.5)',
                      background: 'rgba(88,166,255,0.15)',
                      color: '#79c0ff',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    Confirm ({trigger.selectedTargets?.length ?? 0} to bottom)
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveTrigger(trigger.id)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      border: '1px solid #484f58',
                      background: 'transparent',
                      color: '#8b949e',
                      cursor: 'pointer',
                      fontSize: '0.68rem',
                    }}
                  >
                    Skip
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {effect.kind === 'search_library' && needsTarget && (
        <div style={{ marginBottom: 8 }}>
          {(() => {
            const libraryCards = cards.filter((card) => card.zone === 'library')
            const selected = trigger.selectedTargets ?? []
            const pickedId = selected.length > 0 ? selected[0] : null
            return (
              <>
                <div style={{ fontSize: '0.72rem', color: '#ffb340', marginBottom: 6 }}>
                  Search your library — pick a card to put onto the battlefield:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {libraryCards.map((card) => {
                    const isPicked = card.id === pickedId
                    return (
                      <button
                        key={card.id}
                        type="button"
                        onClick={() => selectSearchLibraryTarget(trigger.id, card.id)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: `1px solid ${isPicked ? 'rgba(88,166,255,0.6)' : 'rgba(255,255,255,0.12)'}`,
                          background: isPicked
                            ? 'rgba(88,166,255,0.2)'
                            : 'rgba(13,17,23,0.6)',
                          color: isPicked ? '#79c0ff' : '#e6edf3',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          fontWeight: isPicked ? 700 : 400,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 180,
                        }}
                      >
                        {card.name}
                      </button>
                    )
                  })}
                  {libraryCards.length === 0 && (
                    <div style={{ color: '#8b949e', fontSize: '0.72rem' }}>
                      No cards in library.
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => confirmSearchLibrary(trigger.id)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(88,166,255,0.5)',
                      background: 'rgba(88,166,255,0.15)',
                      color: pickedId ? '#79c0ff' : '#8b949e',
                      cursor: pickedId ? 'pointer' : 'default',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {pickedId ? `Fetch ${libraryCards.find((card) => card.id === pickedId)?.name}` : 'Skip'}
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveTrigger(trigger.id)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 6,
                      border: '1px solid #484f58',
                      background: 'transparent',
                      color: '#8b949e',
                      cursor: 'pointer',
                      fontSize: '0.68rem',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {needsTarget && effect.kind !== 'proliferate' && effect.kind !== 'scry' && effect.kind !== 'search_library' && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.72rem', color: '#ffb340', marginBottom: 6 }}>
            Select target ({targetsRemaining} remaining):
            {targetHint && (
              <span style={{ color: '#8b949e', marginLeft: 6 }}>
                (filter: {targetHint})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {targetCards
              .filter((card) => filterMatch(targetHint, card))
              .map((card) => (
                <TargetCard
                  key={card.id}
                  card={card}
                  onClick={() => selectTarget(trigger.id, card.id)}
                />
              ))}
          </div>
          <button
            type="button"
            onClick={() => resolveTrigger(trigger.id)}
            style={{
              marginTop: 6,
              padding: '3px 10px',
              borderRadius: 6,
              border: '1px solid #484f58',
              background: 'transparent',
              color: '#8b949e',
              cursor: 'pointer',
              fontSize: '0.68rem',
            }}
          >
            Cancel targeting
          </button>
        </div>
      )}

      {!needsTarget && (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => resolveTrigger(trigger.id)}
            style={{
              padding: '5px 14px',
              borderRadius: 6,
              border: '1px solid rgba(88,166,255,0.5)',
              background: 'rgba(88,166,255,0.15)',
              color: '#79c0ff',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            Resolve
          </button>
        </div>
      )}
    </div>
  )
}
