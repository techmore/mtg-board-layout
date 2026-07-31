interface ServerUrlFieldProps {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  error?: string | null
}

export default function ServerUrlField({ value, onChange, onBlur, error }: ServerUrlFieldProps) {
  return (
    <div>
      <label htmlFor="multiplayer-server" style={labelStyle}>Multiplayer Server</label>
      <input
        id="multiplayer-server"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder="hostname, IP, or https://server.example.com"
        spellCheck={false}
        style={inputStyle}
      />
      <div style={helpStyle}>Everyone joining the room should use the same server. A bare host uses port 2567.</div>
      {error && <div role="alert" style={errorStyle}>{error}</div>}
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#8b949e', marginBottom: 6, fontWeight: 600 }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #30363d', background: '#161b22', color: '#e6edf3', fontSize: '0.9rem', fontFamily: 'monospace' }
const helpStyle: React.CSSProperties = { marginTop: 6, color: '#6e7681', fontSize: '0.7rem', lineHeight: 1.35 }
const errorStyle: React.CSSProperties = { marginTop: 6, color: '#f85149', fontSize: '0.75rem' }
