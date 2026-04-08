export function HatchFill({ size = 32 }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        background: 'repeating-linear-gradient(45deg,#1e2235 0,#1e2235 2px,transparent 2px,transparent 8px)',
      }}
    />
  )
}

export function PanelShell({ children, style }) {
  return (
    <div
      style={{
        background: '#0f1120',
        border: '1px solid #1e2235',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function PanelHeader({ label, right }) {
  return (
    <div
      style={{
        padding: '8px 14px',
        borderBottom: '1px solid #1e2235',
        fontSize: 13, fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: '#8b92b3',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span>{label}</span>
      {right && (
        <span style={{ fontSize: 12, fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#8b92b3' }}>
          {right}
        </span>
      )}
    </div>
  )
}
