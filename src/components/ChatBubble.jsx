import { useState, useEffect, useRef, useCallback } from 'react'
import { useDashboardContext } from '../hooks/useDashboardContext'

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(context) {
  return `You are WX Assistant, an AI meteorologist embedded in Antonio's Severe Weather Dashboard v5.1.2 (wx-command.vercel.app). The dashboard is built with React + Vite, TanStack React Query (data fetching/caching), React Leaflet (maps), Recharts (charts), and Tailwind CSS. Deployed on Vercel with a serverless /api/chat proxy for OpenAI.

DASHBOARD — 5 TABS AND HOW THEY WORK:
• Overview: React Leaflet MapContainer with a CartoDB dark basemap TileLayer + IEM WMS WMSTileLayer for live NEXRAD N0R composite reflectivity radar. SPC Day 1 categorical GeoJSON polygons from spc.noaa.gov overlaid via Leaflet GeoJSON layer. Active warning polygons from NWS API. CAPE/CIN strip from Open-Meteo current params.
• SPC (Severe): Full SPC outlook map Days 1–8. GeoJSON from spc.noaa.gov/products/outlook (categorical/tornado/wind/hail) rendered as Leaflet GeoJSON layers with color-coded fills. AFD modal fetches NWS api.weather.gov/products/types/AFD/{WFO} — WFO resolved via api.weather.gov/points/{lat},{lon}. Warning polygons also shown.
• Observations: React Leaflet map with ASOS station network. Nearest station found via IEM Mesonet API (mesonet.agron.iastate.edu). Current hourly data from Open-Meteo. METAR obs from aviationweather.gov/api/data/metar.
• Forecast: 7-day daily and hourly Recharts charts. Data from Open-Meteo (daily: temp max/min, precip prob, weathercode; hourly: temp, dewpoint, precip prob, wind). AFD panel hardcoded to NWS OUN (Norman, OK).
• About: Attribution for all data sources.

DATA SOURCES:
• Open-Meteo — forecasts (daily/hourly temp, dewpoint, precip prob, wind, WMO weathercode), CAPE (J/kg), CIN (J/kg)
• SPC GeoJSON (spc.noaa.gov) — categorical/tornado/wind/hail outlook polygons, Days 1–8; experimental Day 4–8 probabilistic
• IEM WMS (mesonet.agron.iastate.edu) — live NEXRAD radar WMS tiles (nexrad-n0r-900913 layer), ASOS nearest-station lookup
• NWS API (api.weather.gov) — active alerts (point + nationwide SVR/TOR), AFD text products, WFO grid lookup
• aviationweather.gov — METAR observations (primary); IEM fallback for station lookup

LIVE DATA IN YOUR CONTEXT FOR ${context.location?.name ?? 'this location'}:
${JSON.stringify(context, null, 2)}

CONTEXT FIELD GUIDE:
- currentConditions: METAR obs — temp/dewpoint (°F), humidity, wind (cardinal dir + kt), gusts, pressure (inHg), visibility (mi), sky condition
- severeHighlights: spcDay1Category, cape (J/kg), cin (J/kg), activeSvrTorWarnings (nationwide count of active SVR+TOR warnings)
- spcOutlook.day1: category (NO RISK/TSTM/MRGL/SLGT/ENH/MDT/HIGH), tornadoRisk%, windRisk%, hailRisk% — point-specific probabilities
- spcOutlook.day2/day3: categorical risk for this location
- forecast7Day: [{date, high°F, low°F, pop%, conditions}] × 7 days from Open-Meteo
- activeWarnings: [{event, severity, headline, expires}] NWS active alerts at this point
- timestamp: when this context snapshot was assembled

METEOROLOGICAL EXPERTISE:
Interpret CAPE (500–1000 marginal, 1000–2500 elevated, >2500 significant severe), CIN (<−50 J/kg = capped; −25 to −50 = inhibited but breakable), SPC risk tiers, tornado/wind/hail probability thresholds (≥10% significant), METAR obs, AFD synoptic reasoning, wind shear, storm mode (supercell vs. QLCS), and mesoscale environment. Know NWS warning criteria (SVR = 58 mph+ or 1" hail; TOR = confirmed or imminent rotation).

BEHAVIOR:
- Always cite specific values from the live context when answering weather questions — never give a generic answer when real data is present
- When asked how something in the dashboard is built, explain the actual tech stack and data sources described above (e.g., "the radar uses a React Leaflet WMSTileLayer pointed at IEM's NEXRAD WMS endpoint")
- Be direct, concise, and technically precise; be urgent when conditions are dangerous
- Response budget is 500 tokens — prioritize signal over explanation`
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

// ── Example prompts ───────────────────────────────────────────────────────────
const EXAMPLE_PROMPTS = [
  "What's the tornado risk near me today?",
  'Explain today\'s SPC outlook',
  'What does SLGT risk mean?',
  'Is the atmosphere unstable right now?',
]

// ── Main component ────────────────────────────────────────────────────────────
export default function ChatBubble({ location }) {
  const [open, setOpen]         = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState([])   // { role, content }[]
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)

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
      const apiUrl = import.meta.env.DEV
        ? 'https://api.openai.com/v1/chat/completions'
        : '/api/chat'
      const headers = {
        'Content-Type': 'application/json',
        ...(import.meta.env.DEV && {
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        }),
      }
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers,
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
  function handleSend(overrideText) {
    const text = (overrideText ?? input).trim()
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

  function handleChipClick(text) {
    handleSend(text)
  }

  // Chips show after greeting arrives, before user sends any message
  const hasUserMessage = messages.some(m => m.role === 'user')
  const showChips = !hasUserMessage && !loading && messages.length > 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes wxTypingDot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30%            { opacity: 1;    transform: translateY(-4px); }
        }
        .wx-panel {
          transition: width 0.2s ease, height 0.2s ease;
        }
        .wx-chip {
          background: #0f1120;
          border: 1px solid #1e2235;
          color: #8b92b3;
          border-radius: 999px;
          padding: 6px 13px;
          font-size: 12px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
          text-align: left;
          font-family: inherit;
          line-height: 1.4;
        }
        .wx-chip:hover {
          border-color: rgba(59,130,246,0.45);
          color: #93c5fd;
          background: rgba(59,130,246,0.08);
        }
        .wx-icon-btn {
          background: none;
          border: none;
          color: #8b92b3;
          cursor: pointer;
          padding: 3px 5px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s, background 0.15s;
        }
        .wx-icon-btn:hover { color: #c9cfe8; background: rgba(255,255,255,0.06); }
      `}</style>

      {/* ── Chat panel ── */}
      {open && (
        <div className="wx-panel" style={{
          position: 'fixed', bottom: 88, right: 24,
          width: expanded ? 520 : 360,
          height: expanded ? '70vh' : 500,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Expand / collapse toggle */}
              <button
                className="wx-icon-btn"
                onClick={() => setExpanded(v => !v)}
                title={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? (
                  /* minimize-2 */
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                       strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <path d="M4 14h6v6"/><path d="M20 10h-6V4"/>
                    <path d="M14 10 21 3"/><path d="M3 21l7-7"/>
                  </svg>
                ) : (
                  /* maximize-2 */
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                       strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                    <path d="M15 3h6v6"/><path d="M9 21H3v-6"/>
                    <path d="M21 3l-7 7"/><path d="M3 21l7-7"/>
                  </svg>
                )}
              </button>
              {/* Close */}
              <button
                className="wx-icon-btn"
                onClick={() => setOpen(false)}
                title="Close"
                style={{ fontSize: 15, lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
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

            {/* Example prompt chips — shown after greeting, before first user message */}
            {showChips && (
              <div style={{ padding: '4px 0 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#8b92b3', opacity: 0.5, letterSpacing: '0.07em', textTransform: 'uppercase', paddingLeft: 2 }}>
                  Try asking
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {EXAMPLE_PROMPTS.map(prompt => (
                    <button
                      key={prompt}
                      className="wx-chip"
                      onClick={() => handleChipClick(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

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
