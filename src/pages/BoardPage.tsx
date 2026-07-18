import { useState, useRef, useCallback, useEffect } from 'react'
import { useGameStore } from '../stores/gameStore'
import CardZoom from '../components/Board/CardZoom'
import DiceCoinOverlay from '../components/Board/DiceCoinOverlay'
import type { BoardCard } from '../types/card'

function isLand(type: string) {
  return type === 'land'
}

export default function BoardPage() {
  const cards = useGameStore((s) => s.cards)
  const backgroundImage = useGameStore((s) => s.backgroundImage)
  const showOpponent = useGameStore((s) => s.showOpponent)
  const broadcasting = useGameStore((s) => s.broadcasting)
  const lifeTotal = useGameStore((s) => s.lifeTotal)
  const setOverlay = useGameStore((s) => s.setOverlay)
  const toggleTap = useGameStore((s) => s.toggleTap)
  const toggleOpponent = useGameStore((s) => s.toggleOpponent)
  const setLife = useGameStore((s) => s.setLife)
  const addCounter = useGameStore((s) => s.addCounter)
  const removeCounter = useGameStore((s) => s.removeCounter)
  const moveCard = useGameStore((s) => s.moveCard)

  const dragCardId = useRef<string | null>(null)

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const onDropOnBattlefield = (e: React.DragEvent) => {
    e.preventDefault()
    if (dragCardId.current) {
      moveCard(dragCardId.current, 'battlefield')
      dragCardId.current = null
    }
  }

  const handCards = cards.filter((c) => c.zone === 'hand')
  const creatureCards = cards.filter((c) => c.zone === 'battlefield' && c.type === 'creature')
  const planeswalkerCards = cards.filter((c) => c.zone === 'battlefield' && c.type === 'planeswalker')
  const battleCards = cards.filter((c) => c.zone === 'battlefield' && c.type === 'battle')
  const artifactCards = cards.filter((c) => c.zone === 'battlefield' && c.type === 'artifact')
  const enchantmentCards = cards.filter((c) => c.zone === 'battlefield' && c.type === 'enchantment')
  const landCards = cards.filter((c) => c.zone === 'battlefield' && isLand(c.type))
  const otherPermanents = cards.filter((c) =>
    c.zone === 'battlefield' && !['creature','planeswalker','battle','artifact','enchantment','land'].includes(c.type)
  )
  const graveyardCards = cards.filter((c) => c.zone === 'graveyard')
  const commandCards = cards.filter((c) => c.zone === 'command')
  const libraryCards = cards.filter((c) => c.zone === 'library')
  const exileCards = cards.filter((c) => c.zone === 'exile')

  const [contextMenu, setContextMenu] = useState<{
    cardId: string
    x: number
    y: number
  } | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const [handExpanded, setHandExpanded] = useState(true)
  const handBig = altHeld || handExpanded
  const handExpandedRef = useRef(handExpanded)
  handExpandedRef.current = handExpanded
  const lastAltRef = useRef(0)

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

  const handleRightClick = (e: React.MouseEvent, cardId: string) => {
    e.preventDefault()
    setContextMenu({ cardId, x: e.clientX, y: e.clientY })
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: backgroundImage
          ? `url(${backgroundImage}) center/cover no-repeat`
          : 'url(/unofficial_magic_the_gathering.webp) center/cover no-repeat',
        color: '#fff',
        minHeight: 0,
      }}
    >
      {broadcasting && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 30,
            padding: '5px 9px',
            borderRadius: 999,
            background: 'rgba(248,81,73,0.9)',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.3px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          ● BROADCASTING
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {showOpponent && (
            <div
              style={{
                height: '20%',
                borderBottom: '2px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.3)',
                fontSize: '0.9rem',
                color: '#8b949e',
              }}
            >
              Opponent's Board
            </div>
          )}

          {/* Draw/reset bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              background: 'rgba(0,0,0,0.12)',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              flexShrink: 0,
            }}
          >
            <BoardBtn onClick={() => useGameStore.getState().drawCards(7)}>Draw 7</BoardBtn>
            <BoardBtn onClick={() => useGameStore.getState().drawCards(1)}>Draw 1</BoardBtn>
            <BoardBtn onClick={() => useGameStore.getState().reshuffle()}>
              Reshuffle
            </BoardBtn>

            <div style={{ flex: 1 }} />

            {/* Life counter — top center */}
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

            {/* Opponent toggle */}
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

          {/* Camera feed — top right */}
          <CameraWidget />

          {/* Battlefield */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 12px',
              gap: 8,
              minHeight: 0,
            }}
            onDragOver={onDragOver}
            onDrop={onDropOnBattlefield}
          >
            <div
              style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto', minHeight: 0 }}
            >
              {BattlefieldSection('Creatures', creatureCards, toggleTap, handleRightClick, setOverlay)}
              {BattlefieldSection('Planeswalkers', planeswalkerCards, toggleTap, handleRightClick, setOverlay)}
              {BattlefieldSection('Battles', battleCards, toggleTap, handleRightClick, setOverlay)}
              {BattlefieldSection('Artifacts', artifactCards, toggleTap, handleRightClick, setOverlay)}
              {BattlefieldSection('Enchantments', enchantmentCards, toggleTap, handleRightClick, setOverlay)}
              {BattlefieldSection('Other', otherPermanents, toggleTap, handleRightClick, setOverlay)}

              {creatureCards.length === 0 && planeswalkerCards.length === 0 && battleCards.length === 0 &&
               artifactCards.length === 0 && enchantmentCards.length === 0 && otherPermanents.length === 0 &&
               landCards.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3, fontSize: '0.85rem' }}>
                  Battlefield
                </div>
              )}
            </div>

            {/* Lands stacked — bottom left, peek-top so you can count */}
            {landCards.length > 0 && (
              <div
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.08)',
                  paddingTop: 8,
                  alignSelf: 'flex-start',
                  flexShrink: 0,
                }}
              >
                {landCards.map((card, idx) => (
                  <div
                    key={card.id}
                    style={{
                      width: 180,
                      height: 252,
                      marginTop: idx > 0 ? -200 : 0,
                      position: 'relative',
                      cursor: 'pointer',
                      zIndex: idx,
                    }}
                    onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
                    onContextMenu={(e) => handleRightClick(e, card.id)}
                  >
                    <img
                      src={card.imageUri}
                      alt={card.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: '2px solid rgba(255,255,255,0.15)',
                        transform: card.tapped ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s',
                      }}
                    />
                    {card.counters > 0 && (
                      <div style={counterBadgeStyle}>{card.counters}</div>
                    )}
                    <button
                      type="button"
                      aria-label={card.tapped ? `Untap ${card.name}` : `Tap ${card.name}`}
                      onClick={(e) => { e.stopPropagation(); toggleTap(card.id) }}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.55)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
              justifyContent: handBig ? 'flex-start' : 'center',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        color: card.tapped ? '#58a6ff' : '#8b949e',
                        padding: 0,
                      }}
                      title="Tap / Untap"
                    >
                      ↻
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hand (private area) */}
          <div
            style={{
              height: handBig ? 560 : 140,
              flexShrink: 0,
              background: 'rgba(0,0,0,0.4)',
              borderTop: '2px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: handBig ? 'flex-start' : 'center',
              gap: handBig ? 12 : 4,
              padding: '8px 16px',
              overflowX: handBig ? 'scroll' : 'hidden',
              overflowY: 'hidden',
              flexWrap: 'nowrap',
              position: 'relative',
              transition: 'height 0.12s, gap 0.12s',
            }}
          >
            <button
              type="button"
              aria-label={handExpanded ? 'Collapse hand' : 'Expand hand'}
              onClick={() => setHandExpanded(!handExpanded)}
              style={{
                position: 'absolute',
                left: 4,
                top: 2,
                width: 22,
                height: 22,
                borderRadius: 4,
                background: handExpanded ? 'rgba(88,166,255,0.2)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: handExpanded ? '#58a6ff' : '#8b949e',
                transition: 'background 0.12s, color 0.12s',
                zIndex: 10,
                padding: 0,
              }}
              title={handExpanded ? 'Collapse hand' : 'Expand hand'}
            >
              ▲
            </button>
            {handCards.length === 0 ? (
              <span style={{ opacity: 0.3, fontSize: '0.85rem' }}>Your Hand (private)</span>
            ) : (
              handCards.map((card) => (
                <HoverZoomCard key={card.id} card={card} setOverlay={setOverlay} handleRightClick={handleRightClick} setDragCardId={dragCardId} handBig={handBig} />
              ))
            )}
          </div>

          {/* Zones panel — bottom right */}
          <div
            style={{
              position: 'absolute',
              bottom: handBig ? 576 : 148,
              right: 8,
              display: 'flex',
              gap: 4,
              padding: 6,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(6px)',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <SmallZoneBox label="Cmd" count={null}>
              {commandCards.length > 0 ? (
                commandCards.slice(0, 1).map((card) => (
                  <MiniCard
                    key={card.id}
                    card={card}
                    onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
                    onContextMenu={(e) => handleRightClick(e, card.id)}
                  />
                ))
              ) : (
                <div style={emptySlotStyle} />
              )}
            </SmallZoneBox>
            <SmallZoneBox label="Lib" count={libraryCards.length}>
              <CardBack />
            </SmallZoneBox>
            <SmallZoneBox label="GY" count={graveyardCards.length}>
              {graveyardCards.slice(0, 1).map((card) => (
                <MiniCard
                  key={card.id}
                  card={card}
                  onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
                  onContextMenu={(e) => handleRightClick(e, card.id)}
                />
              ))}
              {graveyardCards.length === 0 && <div style={emptySlotStyle} />}
            </SmallZoneBox>
            <SmallZoneBox label="Ex" count={exileCards.length}>
              {exileCards.slice(0, 1).map((card) => (
                <MiniCard
                  key={card.id}
                  card={card}
                  onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
                  onContextMenu={(e) => handleRightClick(e, card.id)}
                />
              ))}
              {exileCards.length === 0 && <div style={emptySlotStyle} />}
            </SmallZoneBox>
          </div>
        </div>
      </div>

      <CardZoom />
      <DiceCoinOverlay />

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 999 }}
            onClick={() => setContextMenu(null)}
          />
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              background: '#1a1a2e',
              border: '1px solid #30363d',
              borderRadius: 8,
              padding: '4px 0',
              zIndex: 1000,
              minWidth: 140,
            }}
          >
            <ContextItem
              label="Zoom"
              onClick={() => {
                setOverlay({ type: 'zoom', cardId: contextMenu.cardId })
                setContextMenu(null)
              }}
            />
            <ContextItem
              label="Tap / Untap"
              onClick={() => {
                toggleTap(contextMenu.cardId)
                setContextMenu(null)
              }}
            />
            <ContextItem
              label="+1/+1 Counter"
              onClick={() => {
                addCounter(contextMenu.cardId)
                setContextMenu(null)
              }}
            />
            <ContextItem
              label="−1/−1 Counter"
              onClick={() => {
                removeCounter(contextMenu.cardId)
                setContextMenu(null)
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

type CameraPosition = { x: number; y: number }
type CameraSize = { w: number; h: number }
type CameraCrop = { top: number; left: number; right: number }

function readCameraSetting<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const value: unknown = JSON.parse(raw)
    return isValid(value) ? value : fallback
  } catch {
    return fallback
  }
}

function saveCameraSetting(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* ignore storage quota and privacy-mode failures */ }
}

function isCameraPosition(value: unknown): value is CameraPosition {
  if (!value || typeof value !== 'object') return false
  const position = value as Record<string, unknown>
  return typeof position.x === 'number' && Number.isFinite(position.x) &&
    typeof position.y === 'number' && Number.isFinite(position.y)
}

function isCameraSize(value: unknown): value is CameraSize {
  if (!value || typeof value !== 'object') return false
  const size = value as Record<string, unknown>
  return typeof size.w === 'number' && Number.isFinite(size.w) && size.w >= 120 &&
    typeof size.h === 'number' && Number.isFinite(size.h) && size.h >= 90
}

function isCameraCrop(value: unknown): value is CameraCrop {
  if (!value || typeof value !== 'object') return false
  const crop = value as Record<string, unknown>
  return ['top', 'left', 'right'].every((key) =>
    typeof crop[key] === 'number' && Number.isFinite(crop[key]) && crop[key] >= 0 && crop[key] <= 60
  )
}

function clampCameraPosition(position: CameraPosition, size: CameraSize): CameraPosition {
  const maxX = Math.max(8, window.innerWidth - 200 - size.w - 8)
  const maxY = Math.max(8, window.innerHeight - size.h - 8)
  return {
    x: Math.min(Math.max(8, position.x), maxX),
    y: Math.min(Math.max(8, position.y), maxY),
  }
}

function CameraWidget() {
  const [active, setActive] = useState(false)
  const [showCrop, setShowCrop] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cameraRequest = useRef(0)
  const initialSize = readCameraSetting('mtg-camera-size', { w: 200, h: 150 }, isCameraSize)
  const [pos, setPos] = useState<CameraPosition>(() => clampCameraPosition(
    readCameraSetting(
      'mtg-camera-pos',
      { x: Math.max(8, window.innerWidth - 200 - 210), y: 8 },
      isCameraPosition,
    ),
    initialSize,
  ))
  const [size, setSize] = useState<CameraSize>(() => initialSize)
  const [crop, setCrop] = useState<CameraCrop>(() => readCameraSetting(
    'mtg-camera-crop',
    { top: 0, left: 0, right: 0 },
    isCameraCrop,
  ))
  const dragRef = useRef<{ type: 'move' | 'resize' | 'none'; ox: number; oy: number; sx: number; sy: number; sw: number; sh: number }>({ type: 'none', ox: 0, oy: 0, sx: 0, sy: 0, sw: 0, sh: 0 })

  const stop = useCallback(() => {
    cameraRequest.current++
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  useEffect(() => { saveCameraSetting('mtg-camera-pos', pos) }, [pos])
  useEffect(() => { saveCameraSetting('mtg-camera-size', size) }, [size])
  useEffect(() => { saveCameraSetting('mtg-camera-crop', crop) }, [crop])

  useEffect(() => {
    if (active && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [active])

  const toggle = async () => {
    if (active) {
      stop()
      setActive(false)
    } else {
      const requestId = ++cameraRequest.current
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true })
        if (requestId !== cameraRequest.current) {
          s.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = s
        setActive(true)
      } catch {
        if (requestId === cameraRequest.current) setActive(false)
      }
    }
  }

  const onPointerDown = (type: 'move' | 'resize', e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { type, ox: e.clientX, oy: e.clientY, sx: pos.x, sy: pos.y, sw: size.w, sh: size.h }
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - dragRef.current.ox
      const dy = ev.clientY - dragRef.current.oy
      if (dragRef.current.type === 'move') {
        setPos(clampCameraPosition({ x: dragRef.current.sx + dx, y: dragRef.current.sy + dy }, size))
      } else {
        const nextSize = { w: Math.max(120, dragRef.current.sw + dx), h: Math.max(90, dragRef.current.sh + dy) }
        setSize(nextSize)
        setPos((current) => clampCameraPosition(current, nextSize))
      }
    }
    const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: size.w,
        zIndex: 20,
        borderRadius: 10,
        overflow: 'hidden',
        border: active ? '2px solid rgba(255,255,255,0.15)' : '2px dashed rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
      }}
      onPointerDown={(e) => onPointerDown('move', e)}
    >
      {active ? (
        <div style={{ position: 'relative', width: '100%', height: size.h, overflow: 'hidden' }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'cover',
              clipPath: `inset(${crop.top}px ${crop.right}px 0px ${crop.left}px)`,
            }}
          />
        </div>
      ) : (
        <div style={{ height: size.h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e', fontSize: '0.75rem' }}>
          Camera off
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 4, left: 4, right: 4, display: 'flex', gap: 4, pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={toggle}
          style={{
            background: active ? 'rgba(248,81,73,0.8)' : 'rgba(35,134,54,0.8)',
            border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer',
            fontSize: '0.65rem', padding: '3px 8px',
          }}
        >
          {active ? 'Stop' : 'Start'}
        </button>
        <button onClick={() => setShowCrop(!showCrop)}
          style={{
            background: showCrop ? 'rgba(56,139,253,0.5)' : 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer',
            fontSize: '0.65rem', padding: '3px 8px',
          }}
        >
          Crop
        </button>
      </div>
      {/* Resize handle */}
      <div
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown('resize', e) }}
        style={{
          position: 'absolute', bottom: 0, right: 0, width: 14, height: 14,
          cursor: 'nwse-resize', pointerEvents: 'auto',
          background: 'rgba(255,255,255,0.15)', borderTopLeftRadius: 6,
        }}
      />

      {/* Crop sliders */}
      {showCrop && (
        <div onPointerDown={(e) => e.stopPropagation()} style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'rgba(0,0,0,0.8)', padding: '8px', display: 'flex', flexDirection: 'column', gap: 4,
          pointerEvents: 'auto',
        }}>
          <label style={{ fontSize: '0.6rem', color: '#8b949e', display: 'flex', alignItems: 'center', gap: 6 }}>
            Top
            <input type="range" min={0} max={60} value={crop.top} onChange={(e) => setCrop({ ...crop, top: +e.target.value })}
              style={{ flex: 1, height: 4, accentColor: '#58a6ff' }} />
            <span style={{ width: 20, textAlign: 'right' }}>{crop.top}</span>
          </label>
          <label style={{ fontSize: '0.6rem', color: '#8b949e', display: 'flex', alignItems: 'center', gap: 6 }}>
            Left
            <input type="range" min={0} max={60} value={crop.left} onChange={(e) => setCrop({ ...crop, left: +e.target.value })}
              style={{ flex: 1, height: 4, accentColor: '#58a6ff' }} />
            <span style={{ width: 20, textAlign: 'right' }}>{crop.left}</span>
          </label>
          <label style={{ fontSize: '0.6rem', color: '#8b949e', display: 'flex', alignItems: 'center', gap: 6 }}>
            Right
            <input type="range" min={0} max={60} value={crop.right} onChange={(e) => setCrop({ ...crop, right: +e.target.value })}
              style={{ flex: 1, height: 4, accentColor: '#58a6ff' }} />
            <span style={{ width: 20, textAlign: 'right' }}>{crop.right}</span>
          </label>
        </div>
      )}
    </div>
  )
}

function SmallZoneBox({
  label,
  count,
  children,
}: {
  label: string
  count: number | null
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '6px',
        fontSize: '0.85rem',
        color: '#8b949e',
        position: 'relative',
        minWidth: 172,
        height: 'auto',
      }}
    >
      {count !== null && count > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -6,
            right: -6,
            background: '#d29922',
            color: '#000',
            fontSize: '0.85rem',
            fontWeight: 700,
            borderRadius: '50%',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          {count}
        </div>
      )}
      {children}
      <div style={{ whiteSpace: 'nowrap', marginLeft: 'auto' }}>{label}</div>
    </div>
  )
}

const CARD_BACK_URL = '/sleeve_weathered_cardback.webp'

function CardBack() {
  return (
    <img
      src={CARD_BACK_URL}
      alt="Card back"
      style={{
        width: 160,
        height: 224,
        objectFit: 'cover',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        flexShrink: 0,
      }}
    />
  )
}

const emptySlotStyle: React.CSSProperties = {
  width: 160,
  height: 224,
  borderRadius: 8,
  border: '1px dashed rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.02)',
  flexShrink: 0,
}

function MiniCard({
  card,
  onClick,
  onContextMenu,
}: {
  card: BoardCard
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <img
      src={card.imageUri}
      alt={card.name}
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={{
        width: 160,
        height: 224,
        objectFit: 'cover',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.15)',
        cursor: 'pointer',
      }}
    />
  )
}

function BattlefieldSection(
  label: string,
  cards: BoardCard[],
  toggleTap: (id: string) => void,
  handleRightClick: (e: React.MouseEvent, cardId: string) => void,
  setOverlay: (o: { type: 'zoom' | null; cardId?: string }) => void,
) {
  if (cards.length === 0) return null
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
        {label} ({cards.length})
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {cards.map((card) => (
          <BoardCardComponent
            key={card.id}
            card={card}
            onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
            onContextMenu={(e) => handleRightClick(e, card.id)}
            toggleTap={() => toggleTap(card.id)}
          />
        ))}
      </div>
    </div>
  )
}

function BoardCardComponent({
  card,
  onClick,
  onContextMenu,
  toggleTap,
}: {
  card: BoardCard
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  toggleTap: () => void
}) {
  return (
    <div
      style={{
        width: 320,
        position: 'relative',
        cursor: 'pointer',
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <img
        src={card.imageUri}
        alt={card.name}
        style={{
          width: '100%',
          borderRadius: 8,
          border: card.tapped ? '4px solid #58a6ff' : '2px solid rgba(255,255,255,0.15)',
          transform: card.tapped ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s',
        }}
      />
      {card.counters > 0 && (
        <div style={counterBadgeStyle}>{card.counters}</div>
      )}
      <div
        style={{
          fontSize: '0.85rem',
          textAlign: 'center',
          marginTop: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {card.name}
      </div>
      <button
        type="button"
        aria-label={card.tapped ? `Untap ${card.name}` : `Tap ${card.name}`}
        onClick={(e) => { e.stopPropagation(); toggleTap() }}
        style={{
          position: 'absolute',
          bottom: 28,
          right: 4,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '0.8rem',
          color: card.tapped ? '#58a6ff' : '#8b949e',
          padding: 0,
        }}
        title="Tap / Untap"
      >
        ↻
      </button>
    </div>
  )
}

function ContextItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 16px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        color: '#e6edf3',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: 'transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(88,166,255,0.1)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  )
}

function BoardBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 4,
        color: '#e6edf3',
        cursor: 'pointer',
        fontSize: '0.75rem',
      }}
    >
      {children}
    </button>
  )
}

function HoverZoomCard({
  card,
  setOverlay,
  handleRightClick,
  setDragCardId,
  handBig,
}: {
  card: { id: string; imageUri: string; name: string }
  setOverlay: (o: { type: 'zoom' | null; cardId?: string }) => void
  handleRightClick: (e: React.MouseEvent, cardId: string) => void
  setDragCardId: React.MutableRefObject<string | null>
  handBig: boolean
}) {
  return (
    <div
      draggable
      style={{
        height: '100%',
        aspectRatio: '5/7',
        maxHeight: handBig ? 496 : 124,
        cursor: 'grab',
        flexShrink: 0,
        transition: 'max-height 0.12s',
      }}
      onDragStart={() => { setDragCardId.current = card.id }}
      onClick={() => setOverlay({ type: 'zoom', cardId: card.id })}
      onContextMenu={(e) => handleRightClick(e, card.id)}
    >
      <img
        src={card.imageUri}
        alt={card.name}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 6,
          border: '2px solid rgba(255,255,255,0.15)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  )
}


const counterBadgeStyle: React.CSSProperties = {
  position: 'absolute',
  top: -4,
  right: -4,
  background: '#d29922',
  color: '#000',
  fontSize: '0.7rem',
  fontWeight: 700,
  borderRadius: '50%',
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
