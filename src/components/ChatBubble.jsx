export default function ChatBubble() {
  return (
    <button
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 52,
        height: 52,
        borderRadius: '50%',
        background: '#3b82f6',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 24px rgba(59,130,246,0.4)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        zIndex: 50,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.08)'
        e.currentTarget.style.boxShadow = '0 6px 32px rgba(59,130,246,0.55)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.boxShadow = '0 4px 24px rgba(59,130,246,0.4)'
      }}
      title="WX Assistant (coming soon)"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ width: 22, height: 22 }}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <circle cx="9" cy="10" r="1" fill="white" stroke="none" />
        <circle cx="12" cy="10" r="1" fill="white" stroke="none" />
        <circle cx="15" cy="10" r="1" fill="white" stroke="none" />
      </svg>
    </button>
  )
}
