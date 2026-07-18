import { useRef } from 'react'
import { useGameStore } from '../stores/gameStore'

export default function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const backgroundImage = useGameStore((s) => s.backgroundImage)
  const setBackground = useGameStore((s) => s.setBackground)

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setBackground(reader.result as string)
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ flex: 1, padding: 24, color: '#e6edf3', minHeight: 0 }}>
      <h2 style={{ marginBottom: 16 }}>Settings</h2>

      <section style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Background Image</h3>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          style={{ marginBottom: 8 }}
        />
        {backgroundImage && (
          <div>
            <img
              src={backgroundImage}
              alt="Background preview"
              style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8, display: 'block', marginBottom: 8 }}
            />
            <button
              onClick={() => setBackground(null)}
              style={{
                padding: '4px 12px',
                background: '#f85149',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
