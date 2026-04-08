import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

function fmtUTC(date) {
  const h = String(date.getUTCHours()).padStart(2, '0')
  const m = String(date.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}Z`
}

function fmtUTCDate(date) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${d} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

// Map NWS event string → display label + color
function alertStyle(event = '') {
  const e = event.toLowerCase()
  if (e.includes('tornado warning'))             return { color: '#ef4444', label: event }
  if (e.includes('severe thunderstorm warning')) return { color: '#f97316', label: 'SVR T-Storm Warning' }
  if (e.includes('warning'))                     return { color: '#f97316', label: event }
  if (e.includes('watch'))                       return { color: '#f59e0b', label: event }
  if (e.includes('advisory'))                    return { color: '#22c55e', label: event }
  return { color: '#8b92b3', label: event }
}

function useLocationAlerts(lat, lon) {
  return useQuery({
    queryKey: ['location-alerts', lat, lon],
    queryFn: () =>
      fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
        headers: { Accept: 'application/geo+json' },
      }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

async function geocodeSearch(query) {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`
  )
  if (!r.ok) throw new Error(r.status)
  const data = await r.json()
  return data.results ?? []
}

async function findNearestStation(lat, lon) {
  try {
    const r = await fetch(
      `https://mesonet.agron.iastate.edu/api/1/stations.json?network=ASOS&within=50&lat=${lat}&lon=${lon}`
    )
    if (!r.ok) return null
    const data = await r.json()
    // IEM returns { data: [{stid, ...}] }
    const stations = data?.data ?? data?.stations ?? []
    if (!Array.isArray(stations) || !stations.length) return null
    return stations[0]?.stid ?? null
  } catch {
    return null
  }
}

export default function TopBar({ location, setLocation }) {
  const [utc, setUtc]               = useState(new Date())
  const [search, setSearch]         = useState('')
  const [results, setResults]       = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching]  = useState(false)
  const [isLocating, setIsLocating]    = useState(false)
  const searchRef  = useRef(null)
  const debounceId = useRef(null)

  // UTC clock tick
  useEffect(() => {
    const id = setInterval(() => setUtc(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Debounced geocode on input change
  useEffect(() => {
    clearTimeout(debounceId.current)
    const q = search.trim()
    if (!q) { setResults([]); setShowDropdown(false); return }
    debounceId.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await geocodeSearch(q)
        setResults(res)
        setShowDropdown(res.length > 0)
      } catch {
        setResults([])
        setShowDropdown(false)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(debounceId.current)
  }, [search])

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e) {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  async function selectResult(result) {
    setShowDropdown(false)
    setSearch('')
    setIsLocating(true)
    const { latitude: lat, longitude: lon, name } = result
    const statePart = result.admin1 ? `, ${result.admin1}` : ''
    try {
      const stid = await findNearestStation(lat, lon)
      setLocation({
        label: stid ? `${name} / ${stid}` : `${name}${statePart} — No station`,
        lat,
        lon,
        stationId: stid ?? null,
      })
    } catch {
      setLocation({ label: `${name}${statePart} — No station`, lat, lon, stationId: null })
    } finally {
      setIsLocating(false)
    }
  }

  const { data: alertData, isLoading: alertsLoading } = useLocationAlerts(location.lat, location.lon)

  const alerts = (() => {
    const features = alertData?.features ?? []
    const seen = new Set()
    return features
      .filter(f => {
        const event = f.properties?.event ?? ''
        if (seen.has(event)) return false
        seen.add(event)
        return true
      })
      .map(f => ({ id: f.id, event: f.properties?.event ?? 'Alert', ...alertStyle(f.properties?.event) }))
  })()

  return (
    <header
      className="flex items-center gap-3 px-4"
      style={{ height: 52, background: '#0f1120', borderBottom: '1px solid #1e2235', flexShrink: 0 }}
    >
      {/* Search */}
      <div className="relative" style={{ width: 220 }} ref={searchRef}>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ color: isSearching ? '#3b82f6' : '#8b92b3' }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder={isLocating ? 'Finding station…' : 'Search location…'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && setShowDropdown(false)}
          disabled={isLocating}
          className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md outline-none transition-colors"
          style={{
            background: '#090b14',
            border: '1px solid #1e2235',
            color: '#f0f2ff',
            caretColor: '#3b82f6',
            opacity: isLocating ? 0.6 : 1,
          }}
          onFocus={e => { e.target.style.borderColor = '#3b82f6'; if (results.length) setShowDropdown(true) }}
          onBlur={e => (e.target.style.borderColor = '#1e2235')}
        />

        {/* Dropdown */}
        {showDropdown && results.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#0f1120', border: '1px solid #1e2235', borderRadius: 6,
            zIndex: 9999, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            {results.map((r, i) => (
              <button
                key={r.id ?? i}
                onMouseDown={e => { e.preventDefault(); selectResult(r) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: i < results.length - 1 ? '1px solid #1e2235' : 'none',
                  color: '#f0f2ff',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1e2235')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: '#8b92b3', marginTop: 1 }}>
                  {[r.admin1, r.admin2, r.country_code].filter(Boolean).join(', ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active location pill */}
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
        style={{
          background: 'rgba(59,130,246,0.12)',
          border: '1px solid rgba(59,130,246,0.3)',
          color: '#3b82f6',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {isLocating ? 'Locating…' : location.label}
      </div>

      {/* Alert pills */}
      <div className="flex items-center gap-1.5" style={{ overflow: 'hidden' }}>
        {alertsLoading ? (
          <div style={{ fontSize: 12, color: '#8b92b3', fontFamily: 'monospace' }}>…</div>
        ) : alerts.length === 0 ? (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
            style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.25)',
              color: '#22c55e',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            No Active Warnings
          </div>
        ) : (
          alerts.map(alert => (
            <div
              key={alert.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold"
              style={{
                background: `${alert.color}22`,
                border: `1px solid ${alert.color}55`,
                color: alert.color,
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: alert.color, display: 'inline-block', flexShrink: 0,
                animation: 'livePulse 2s ease-in-out infinite',
              }} />
              {alert.label}
            </div>
          ))
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* UTC Timestamp */}
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-mono"
        style={{ background: '#090b14', border: '1px solid #1e2235', color: '#8b92b3', flexShrink: 0 }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span style={{ color: '#f0f2ff' }}>{fmtUTC(utc)}</span>
        <span style={{ color: '#1e2235', margin: '0 2px' }}>|</span>
        <span>{fmtUTCDate(utc)}</span>
      </div>
    </header>
  )
}
