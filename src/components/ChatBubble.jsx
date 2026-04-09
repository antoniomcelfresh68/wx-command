import { useState, useEffect, useRef, useCallback } from 'react'
import { useDashboardContext } from '../hooks/useDashboardContext'

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(context) {
  return `You are an experienced SPC meteorologist and storm chaser advisor embedded in a live severe weather dashboard. You have real-time access to the following dashboard data for ${context.location?.name ?? 'the selected location'}:

${JSON.stringify(context, null, 2)}

Key data available to you:
- "spcOutlook.day1" — today's SPC categorical risk (category) plus point-specific tornado, wind, and hail probabilities
- "spcOutlook.day2" and "spcOutlook.day3" — multi-day SPC categorical outlook risk levels for this location
- "forecast7Day" — 7-day daily forecast with high/low temps, precipitation probability (pop), and conditions
- "activeWarnings" — all active NWS warnings in effect for this location with event type, severity, headline, and expiration

Answer questions with the expertise of a senior NWS/SPC forecaster. Be direct and concise. Use correct meteorological terminology. Reference specific values from the dashboard data when relevant — including multi-day SPC outlooks and the 7-day forecast when answering questions about upcoming weather. You can also answer general meteorology questions beyond what's shown on the dashboard. When the situation is active or dangerous, be appropriately urgent.`
}

function greetingPrompt(locationName) {
  return `Briefly introduce yourself and give a one-sentence summary of current conditions and any notable severe weather for ${locationName} right now.`
}

// ── Typing dots ───────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '11px 14px', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#8b92b3',
            animation: `wxTypingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChatBubble({ location }) {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState([])   // { role, content }[]
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)

  // Full API-compatible history (includes hidden greeting user turn)
  const historyRef    = useRef([])
  const greeted       = useRef(false)
  const messagesEndRef = useRef(null)
  const inputRef       = useRef(null)
  // Always use latest context for system prompt without stale closure
  const contextRef     = useRef(null)

  const context = useDashboardContext(location)
  contextRef.current = context

  // Scroll to bottom on new messages or typing indicator
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Core API call ──────────────────────────────────────────────────────────
  const callAPI = useCallback(async (userText) => {
    const systemPrompt = buildSystemPrompt(contextRef.current)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 500,
          messages: [
            { role: 'system', content: systemPrompt },
            ...historyRef.current,
            { role: 'user', content: userText },
          ],
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content ?? 'No response received.'

      const assistantMsg = { role: 'assistant', content: reply }
      // Persist full turn to history ref
      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: userText },
        assistantMsg,
      ]
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errMsg = { role: 'assistant', content: 'Unable to reach WX Assistant. Check your API key or network connection.' }
      historyRef.current = [...historyRef.current, errMsg]
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Auto-greeting on first open ────────────────────────────────────────────
  useEffect(() => {
    if (open && !greeted.current) {
      greeted.current = true
      setLoading(true)
      callAPI(greetingPrompt(location.label))
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open, callAPI, location.label])

  // ── User send ──────────────────────────────────────────────────────────────
  function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    callAPI(text)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes wxTypingDot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30%            { opacity: 1;    transform: translateY(-4px); }
        }
      `}</style>

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 24,
          width: 360, height: 500,
          background: '#0f1120', border: '1px solid #1e2235',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          zIndex: 9999, boxShadow: '0 8px 40px rgba(0,0,0,0.65)',
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 14px', borderBottom: '1px solid #1e2235', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f0f2ff', letterSpacing: '0.03em' }}>
                WX Assistant
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#22c55e',
                  animation: 'livePulse 2s ease-in-out infinite',
                }} />
                <span style={{
                  fontSize: 10, color: '#22c55e', fontWeight: 700,
                  letterSpacing: '0.09em', textTransform: 'uppercase',
                }}>
                  LIVE DATA
                </span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none', border: 'none', color: '#8b92b3',
                cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '10px 10px 4px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {messages.length === 0 && !loading && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: '#8b92b3', fontSize: 12,
                fontFamily: 'monospace', opacity: 0.45,
              }}>
                Connecting to dashboard…
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '84%', padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                  background:   msg.role === 'user' ? 'rgba(59,130,246,0.2)' : '#141728',
                  border:       msg.role === 'user' ? '1px solid rgba(59,130,246,0.32)' : '1px solid #1e2235',
                  color:        msg.role === 'user' ? '#93c5fd' : '#c9cfe8',
                  fontSize: 13, lineHeight: 1.57, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#141728', border: '1px solid #1e2235', borderRadius: '12px 12px 12px 3px' }}>
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div style={{
            display: 'flex', gap: 7, padding: '10px', borderTop: '1px solid #1e2235', flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about current conditions…"
              disabled={loading}
              style={{
                flex: 1, background: '#090b14', border: '1px solid #1e2235',
                borderRadius: 6, padding: '8px 12px',
                color: '#f0f2ff', fontSize: 13, fontFamily: 'inherit',
                outline: 'none', opacity: loading ? 0.5 : 1,
                transition: 'border-color 0.1s',
              }}
              onFocus={e  => { e.target.style.borderColor = '#3b82f640' }}
              onBlur={e   => { e.target.style.borderColor = '#1e2235'   }}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              style={{
                flexShrink: 0, padding: '0 16px', borderRadius: 6,
                border: 'none', fontSize: 13, fontWeight: 600,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                background: loading || !input.trim() ? 'rgba(59,130,246,0.18)' : '#3b82f6',
                color: loading || !input.trim() ? '#8b92b3' : '#fff',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── Float button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed', bottom: 24, right: 24,
          width: 52, height: 52, borderRadius: '50%',
          background: open ? '#2563eb' : '#3b82f6',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(59,130,246,0.4)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
          zIndex: 9999,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform  = 'scale(1.08)'
          e.currentTarget.style.boxShadow  = '0 6px 32px rgba(59,130,246,0.55)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform  = 'scale(1)'
          e.currentTarget.style.boxShadow  = '0 4px 24px rgba(59,130,246,0.4)'
        }}
        title="WX Assistant"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2}
               strokeLinecap="round" style={{ width: 18, height: 18 }}>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8}
               strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="9"  cy="10" r="1" fill="white" stroke="none" />
            <circle cx="12" cy="10" r="1" fill="white" stroke="none" />
            <circle cx="15" cy="10" r="1" fill="white" stroke="none" />
          </svg>
        )}
      </button>
    </>
  )
}
