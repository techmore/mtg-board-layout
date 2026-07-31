import { useState, useRef, useCallback, useEffect } from 'react'

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

export default function CameraWidget() {
  const [active, setActive] = useState(false)
  const [showCrop, setShowCrop] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
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
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  useEffect(() => { saveCameraSetting('mtg-camera-pos', pos) }, [pos])
  useEffect(() => { saveCameraSetting('mtg-camera-size', size) }, [size])
  useEffect(() => { saveCameraSetting('mtg-camera-crop', crop) }, [crop])

  useEffect(() => {
    if (active && streamRef.current && videoRef.current) {
      const video = videoRef.current
      video.srcObject = streamRef.current
      void video.play().catch(() => {
        setCameraError('Camera is ready, but video playback was blocked. Press Start again.')
      })
    }
  }, [active])

  const toggle = async () => {
    if (active) {
      stop()
      setActive(false)
      setCameraError(null)
    } else {
      setCameraError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is unavailable in this browser context.')
        return
      }
      const requestId = ++cameraRequest.current
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true })
        if (requestId !== cameraRequest.current) {
          s.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = s
        const track = s.getVideoTracks()[0]
        track?.addEventListener('ended', () => {
          if (streamRef.current !== s) return
          streamRef.current = null
          setActive(false)
          setCameraError('The camera stopped. Press Start to reconnect.')
        }, { once: true })
        setActive(true)
      } catch (error) {
        if (requestId !== cameraRequest.current) return
        setActive(false)
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          setCameraError('Camera permission was denied. Allow camera access and press Start again.')
        } else if (error instanceof DOMException && error.name === 'NotFoundError') {
          setCameraError('No camera was found.')
        } else {
          setCameraError('Unable to start the camera. Check browser permissions and try again.')
        }
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
        <div style={{ height: size.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, boxSizing: 'border-box', color: cameraError ? '#ffaba5' : '#8b949e', fontSize: '0.75rem', textAlign: 'center' }}>
          <span>{cameraError ?? 'Camera off'}</span>
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
