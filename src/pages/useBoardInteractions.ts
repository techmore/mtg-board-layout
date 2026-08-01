import { useState, useRef, useEffect, useMemo } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useDeckStore } from '../stores/deckStore'
import { getCardLayout } from '../layout/cardSizing'
import { deckNeedsRuleHydration, hydrateDeckRules } from '../services/deckImport'
import { getBoardViewModel } from './boardViewModel'
import { loadCardRules } from '../stores/cardRulesLoader'
import type { ManaUsageKind } from '../types/card'

export function useBoardInteractions() {
  const cards = useGameStore((s) => s.cards)
  const cardScale = useGameStore((s) => s.cardScale)
  const drawNotice = useGameStore((s) => s.drawNotice)
  const turnAnnouncement = useGameStore((s) => s.turnAnnouncement)
  const turnPrompt = useGameStore((s) => s.turnPrompt)
  const clearDrawNotice = useGameStore((s) => s.clearDrawNotice)
  const clearTurnAnnouncement = useGameStore((s) => s.clearTurnAnnouncement)
  const cancelTurnPrompt = useGameStore((s) => s.cancelTurnPrompt)
  const overrideLandPlay = useGameStore((s) => s.overrideLandPlay)
  const resolveConditionalEntry = useGameStore((s) => s.resolveConditionalEntry)
  const discardForTurn = useGameStore((s) => s.discardForTurn)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const toggleTap = useGameStore((s) => s.toggleTap)
  const moveCard = useGameStore((s) => s.moveCard)
  const reorderBattlefield = useGameStore((s) => s.reorderBattlefield)
  const loadDeck = useGameStore((s) => s.loadDeck)
  const showOpponent = useGameStore((s) => s.showOpponent)
  const opponentLifeTotal = useGameStore((s) => s.opponentLifeTotal)
  const activePlayer = useGameStore((s) => s.activePlayer)
  const advancePhase = useGameStore((s) => s.advancePhase)
  const broadcasting = useGameStore((s) => s.broadcasting)
  const backgroundImage = useGameStore((s) => s.backgroundImage)
  const decks = useDeckStore((s) => s.decks)
  const importDeck = useDeckStore((s) => s.importDeck)
  const setImporting = useDeckStore((s) => s.setImporting)

  const {
    handCards,
    handStacks,
    creatureCards,
    planeswalkerCards,
    battleCards,
    spellCards,
    artifactCards,
    enchantmentCards,
    landCards,
    landStacks,
    otherPermanents,
    graveyardCards,
    commandCards,
    libraryCards,
    exileCards,
  } = useMemo(() => getBoardViewModel(cards), [cards])
  const opponentViewModel = useMemo(() => getBoardViewModel(cards, 'opponent'), [cards])

  const [contextMenu, setContextMenu] = useState<{
    cardId: string
    x: number
    y: number
  } | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const [handExpanded, setHandExpanded] = useState(true)
  const [selectedDiscardId, setSelectedDiscardId] = useState<string | null>(null)
  const [manaLogOpen, setManaLogOpen] = useState(false)
  const [manaUsageKind, setManaUsageKind] = useState<ManaUsageKind>('spell')
  const [manaUsageLabel, setManaUsageLabel] = useState('')
  const [backgroundOnly, setBackgroundOnly] = useState(false)
  const [opponentSize, setOpponentSize] = useState(0.3)

  const handBig = altHeld || handExpanded
  const maxHandStackCount = Math.max(1, ...handStacks.map(([, stack]) => stack.count))
  const cardLayout = getCardLayout(cardScale, handBig, maxHandStackCount)
  const handExpandedRef = useRef(handExpanded)
  handExpandedRef.current = handExpanded
  const lastAltRef = useRef(0)
  const dragCardId = useRef<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        advancePhase()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [advancePhase])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return
      if (handExpandedRef.current) {
        setHandExpanded(false)
        setAltHeld(true)
        return
      }
      const now = Date.now()
      if (now - lastAltRef.current < 400) {
        setHandExpanded(true)
        setAltHeld(false)
        lastAltRef.current = 0
        return
      }
      lastAltRef.current = now
      setAltHeld(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return
      if (!handExpandedRef.current) setAltHeld(false)
    }
    addEventListener('keydown', down)
    addEventListener('keyup', up)
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    if (!drawNotice) return
    const noticeId = drawNotice.id
    const timeout = window.setTimeout(() => clearDrawNotice(noticeId), 2200)
    return () => window.clearTimeout(timeout)
  }, [clearDrawNotice, drawNotice])

  useEffect(() => {
    if (!turnAnnouncement) return
    const announcementId = turnAnnouncement.id
    const timeout = window.setTimeout(() => clearTurnAnnouncement(announcementId), 2800)
    return () => window.clearTimeout(timeout)
  }, [clearTurnAnnouncement, turnAnnouncement])

  useEffect(() => {
    setSelectedDiscardId(null)
  }, [turnPrompt])

  useEffect(() => {
    void loadCardRules('blight-curse')
  }, [])

  const handleRightClick = (e: React.MouseEvent, cardId: string) => {
    e.preventDefault()
    setContextMenu({ cardId, x: e.clientX, y: e.clientY })
  }

  const handleDeckChange = async (deckId: string) => {
    const deck = decks.find((candidate) => candidate.id === deckId)
    if (!deck) return
    let cards = deck.cards
    if (deckNeedsRuleHydration(deck)) {
      setImporting(`rules:${deck.id}`)
      try {
        const hydrated = await hydrateDeckRules(deck)
        cards = hydrated.cards
        importDeck(deck.name, cards, deck.format, deck.commanderNames, hydrated.notFound.length === 0 && deck.complete, deck.id, deck.source)
      } catch {
        cards = deck.cards
      } finally {
        setImporting(null)
      }
    }
    loadDeck(deck.commanderNames, cards, deck.id)
    useGameStore.getState().drawCards(7)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onDropOnBattlefield = (e: React.DragEvent) => {
    e.preventDefault()
    const cardId = dragCardId.current || e.dataTransfer.getData('text/plain')
    if (cardId) {
      moveCard(cardId, 'battlefield')
      dragCardId.current = null
    }
  }

  return {
    cards, cardScale, broadcasting, backgroundImage,
    drawNotice, turnAnnouncement, turnPrompt,
    clearDrawNotice, clearTurnAnnouncement,
    cancelTurnPrompt, overrideLandPlay, resolveConditionalEntry,
    discardForTurn, setOverlay, toggleTap, moveCard,
    reorderBattlefield, loadDeck,
    showOpponent, opponentLifeTotal, activePlayer, advancePhase,
    handCards, handStacks, creatureCards, planeswalkerCards,
    battleCards, spellCards, artifactCards, enchantmentCards,
    landCards, landStacks, otherPermanents,
    graveyardCards, commandCards, libraryCards, exileCards,
    opponentViewModel,
    contextMenu, setContextMenu,
    altHeld, handExpanded, setHandExpanded,
    selectedDiscardId, setSelectedDiscardId,
    manaLogOpen, setManaLogOpen,
    manaUsageKind, setManaUsageKind,
    manaUsageLabel, setManaUsageLabel,
    backgroundOnly, setBackgroundOnly,
    opponentSize, setOpponentSize,
    handBig, maxHandStackCount, cardLayout,
    dragCardId,
    handleRightClick, handleDeckChange,
    onDragOver, onDropOnBattlefield,
  }
}
