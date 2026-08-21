import { useGameStore } from '../../stores/gameStore'
import { ContextItem } from './ContextItem'
import { getCachedCardRules, getCardRule } from '../../stores/cardRulesLoader'
import { effectKindLabel, executeActivated } from './contextMenuActions'
import { graveyardCastEligible } from '../../stores/triggerActions'

interface CardContextMenuProps {
  cardId: string
  x: number
  y: number
  onClose: () => void
}

export function CardContextMenu({ cardId, x, y, onClose }: CardContextMenuProps) {
  const cards = useGameStore((s) => s.cards)
  const moveCard = useGameStore((s) => s.moveCard)
  const toggleTap = useGameStore((s) => s.toggleTap)
  const addCounter = useGameStore((s) => s.addCounter)
  const removeCounter = useGameStore((s) => s.removeCounter)
  const addTokenToCard = useGameStore((s) => s.addTokenToCard)
  const setOverlay = useGameStore((s) => s.setOverlay)

  // Keep the menu inside the viewport: right-clicking near an edge would
  // otherwise overflow the window. Estimate height from the action count.
  const menuWidth = 150
  const menuHeight = 60 + 8 * 30
  const clampedX = Math.max(4, Math.min(x, window.innerWidth - menuWidth - 8))
  const clampedY = Math.max(4, Math.min(y, window.innerHeight - menuHeight - 8))

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          left: clampedX,
          top: clampedY,
          background: '#1a1a2e',
          border: '1px solid #30363d',
          borderRadius: 8,
          padding: '4px 0',
          zIndex: 1000,
          minWidth: 140,
        }}
      >
        {cards.find((c) => c.id === cardId)?.zone === 'command' && (
          <ContextItem
            label="Play from command zone"
            onClick={() => {
              useGameStore.getState().castSpell(cardId)
              onClose()
            }}
          />
        )}
        {(() => {
          const card = cards.find((c) => c.id === cardId)
          if (!card || card.zone !== 'battlefield') return null
          return (
            <ContextItem
              label="Sacrifice"
              onClick={() => {
                moveCard(cardId, 'graveyard')
                useGameStore.getState().emitGameEvent({ type: 'sacrifice', cardId, cardName: card.name })
                onClose()
              }}
            />
          )
        })()}
        {(() => {
          const card = cards.find((c) => c.id === cardId)
          if (!card || card.zone === 'graveyard' || card.zone === 'library') return null
          return (
            <ContextItem
              label="Move to graveyard"
              onClick={() => {
                moveCard(cardId, 'graveyard')
                onClose()
              }}
            />
          )
        })()}
        {(() => {
          const card = cards.find((c) => c.id === cardId)
          if (!card || card.zone !== 'hand') return null
          if (card.type === 'land') {
            return (
              <ContextItem
                label={useGameStore.getState().landPlaysThisTurn >= 1 ? 'Play land (extra)' : 'Play land'}
                onClick={() => {
                  const store = useGameStore
                  const state = store.getState()
                  if (state.landPlaysThisTurn >= 1) {
                    store.setState({ turnPrompt: { action: 'end', reason: 'land', cardId }, turnAnnouncement: null })
                  } else {
                    state.moveCard(cardId, 'battlefield')
                    state.emitGameEvent({ type: 'etb', cardId, cardName: card.name })
                    store.setState({ landPlaysThisTurn: 1 })
                  }
                  onClose()
                }}
              />
            )
          }
          if (card.type !== 'instant' && card.type !== 'sorcery') {
            return (
              <ContextItem
                label="Play permanent"
                onClick={() => {
                  useGameStore.getState().castSpell(cardId)
                  onClose()
                }}
              />
            )
          }
            return (
              <ContextItem
                label="Cast spell"
                onClick={() => {
                  useGameStore.getState().castSpell(cardId)
                  onClose()
                }}
              />
            )
        })()}
        {(() => {
          const card = cards.find((c) => c.id === cardId)
          const g = useGameStore.getState()
          const window = g.graveyardCast
          if (!card || card.zone !== 'graveyard' || !window || window.untilTurn < g.turn) return null
          if (window.owner !== 'player') return null
          if (!graveyardCastEligible(card, window.filter, window.owner)) return null
          const kind = /instant or sorcery/i.test(window.filter) ? 'jump-start' : 'escape/unearth'
          return (
            <ContextItem
              label={`Cast from graveyard (${kind})`}
              onClick={() => {
                g.castFromGraveyard(cardId)
                onClose()
              }}
            />
          )
        })()}
        <ContextItem
          label="Add token"
          onClick={() => {
            addTokenToCard(cardId)
            onClose()
          }}
        />
        <ContextItem
          label="Zoom"
          onClick={() => {
            setOverlay({ type: 'zoom', cardId })
            onClose()
          }}
        />
        <ContextItem
          label="Tap / Untap"
          onClick={() => {
            toggleTap(cardId)
            onClose()
          }}
        />
        {(() => {
          const card = cards.find((c) => c.id === cardId)
          if (!card || card.zone !== 'battlefield') return null
          const production = card.manaProduction
          if (production && production.colors.length > 0 && !card.tapped) {
            const label = production.colors.length === 1
              ? `Tap for ${production.colors.join('')} (×${production.amount})`
              : 'Tap for mana'
            return <ContextItem label={label} onClick={() => { toggleTap(cardId); onClose() }} />
          }
          return null
        })()}
        {(() => {
          const card = cards.find((c) => c.id === cardId)
          if (!card || card.zone !== 'battlefield' || card.type !== 'creature') return null
          const combatState = useGameStore.getState().combatState
          return (
            <>
              <ContextItem
                label="Attack"
                onClick={() => {
                  if (!card.tapped) toggleTap(card.id)
                  useGameStore.getState().emitGameEvent({ type: 'attack', cardId: card.id, cardName: card.name })
                  onClose()
                }}
              />
              <ContextItem
                label="Deal combat damage"
                onClick={() => {
                  const power = parseInt(card.typeLine?.match(/(\d+)\//)?.[1] ?? '1')
                  useGameStore.getState().emitGameEvent({
                    type: 'combat_damage',
                    sourceCardId: card.id,
                    sourceCardName: card.name,
                    amount: power || 1,
                  })
                  onClose()
                }}
              />
              {combatState.active && combatState.attackers.map((attackerId) => {
                const attacker = cards.find((c) => c.id === attackerId)
                if (!attacker) return null
                const isBlocking = combatState.blockers[attackerId]?.includes(cardId)
                return (
                  <ContextItem
                    key={attackerId}
                    label={`${isBlocking ? 'Unblock ' : 'Block '}${attacker.name}`}
                    onClick={() => {
                      useGameStore.getState().assignBlocker(attackerId, cardId)
                      onClose()
                    }}
                  />
                )
              })}
            </>
          )
        })()}
        {(() => {
          const card = cards.find((c) => c.id === cardId)
          if (!card || card.zone !== 'battlefield') return null
          const rules = getCachedCardRules()
          const rule = rules ? getCardRule(card.name, rules) : undefined
          const activated = rule?.abilities.filter((a) => a.abilityType === 'activated' && a.effect.kind !== 'add_mana') ?? []
          if (activated.length === 0) return null
          // Activated-ability lock (Linvala / enchanted "can't be activated"):
          // if the opponent controls a source locking activated abilities, hide
          // the player's non-mana activated ability menu.
          const cardOwner = (card.owner ?? 'player') === 'opponent' ? 'opponent' : 'player'
          const lockActive = useGameStore.getState().cards.some((c) =>
            (cardOwner === 'player' ? (c.owner ?? 'player') === 'opponent' : (c.owner ?? 'player') === 'player') &&
            (/\bactivated abilities of .* can't be activated\b/i.test(c.oracleText ?? '') || /\bcan't be activated unless\b/i.test(c.oracleText ?? '')),
          )
          if (lockActive) return null
          return (
            <>
              <div style={{ height: 1, background: '#30363d', margin: '3px 8px' }} />
              <div style={{ padding: '4px 10px', fontSize: '0.65rem', color: '#8b949e', fontWeight: 600 }}>
                Activated abilities
              </div>
              {activated.map((ab, i) => (
                <ContextItem
                  key={i}
                  label={`${ab.cost ?? ''} → ${effectKindLabel(ab)}`}
                  onClick={() => {
                    executeActivated(ab, cardId, card.name)
                    onClose()
                  }}
                />
              ))}
            </>
          )
        })()}
        <ContextItem
          label="+1/+1 Counter"
          onClick={() => {
            addCounter(cardId)
            onClose()
          }}
        />
        <ContextItem
          label="−1/−1 Counter"
          onClick={() => {
            removeCounter(cardId)
            onClose()
          }}
        />
      </div>
    </>
  )
}
