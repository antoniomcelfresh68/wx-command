import { useState, useEffect, useRef, useCallback } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useQuery, useQueries } from '@tanstack/react-query'
import { format } from 'date-fns'

delete L.Icon.Default.prototype._getIconUrl

// ── SPC categorical risk colors & rank ───────────────────────────────────────
const SPC_COLORS = {
  TSTM: '#c1e9c1',
  MRGL: '#55bb55',
  SLGT: '#f6f67b',
  ENH:  '#e8a126',
  MDT:  '#e05c5c',
  HIGH: '#ff00ff',
}
const SPC_RANK = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }

// Probabilistic threshold colors (day 4–8)
const PROB_COLORS = [
  { min: 60, color: '#ff00ff' },
  { min: 45, color: '#e05c5c' },
  { min: 30, color: '#e8a126' },
  { min: 15, color: '#f6f67b' },
  { min: 5,  color: '#55bb55' },
]

// ── URL builders ─────────────────────────────────────────────────────────────
function getSpcUrl(day, filter) {
  if (day >= 4) return `https://www.spc.noaa.gov/products/exper/day4-8/day${day}prob.nolyr.geojson`
  const type = { cat: 'cat', torn: 'torn', wind: 'wind', hail: 'hail' }[filter] ?? 'cat'
  return `https://www.spc.noaa.gov/products/outlook/day${day}otlk_${type}.nolyr.geojson`
}

function getBadgeUrl(day) {
  return day >= 4
    ? `https://www.spc.noaa.gov/products/exper/day4-8/day${day}prob.nolyr.geojson`
    : `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.nolyr.geojson`
}

// ── Feature style functions ───────────────────────────────────────────────────
function styleCategorical(feature) {
  const label = (feature.properties?.LABEL || '').toUpperCase()
  const color = SPC_COLORS[label] || '#888888'
  return { color, fillColor: color, fillOpacity: 0.45, weight: 1.5, opacity: 0.85 }
}

function styleProbabilistic(feature) {
  const raw = feature.properties?.LABEL || feature.properties?.LABEL2 || ''
  const prob = parseInt(raw, 10)
  const entry = PROB_COLORS.find(p => prob >= p.min)
  const color = entry ? entry.color : '#888888'
  return { color, fillColor: color, fillOpacity: 0.45, weight: 1.5, opacity: 0.85 }
}

// Tornado/wind/hail probability outlooks use a similar numeric label scheme
function styleTornProb(feature) {
  const raw = feature.properties?.LABEL || feature.properties?.LABEL2 || ''
  const prob = parseInt(raw, 10)
  if (isNaN(prob)) return { color: '#888', fillColor: '#888', fillOpacity: 0.35, weight: 1.5, opacity: 0.7 }
  const palette = [
    { min: 60, color: '#ff00ff' },
    { min: 45, color: '#e05c5c' },
    { min: 30, color: '#e8a126' },
    { min: 15, color: '#f6f67b' },
    { min: 10, color: '#55bb55' },
    { min: 2,  color: '#a7d9a7' },
  ]
  const entry = palette.find(p => prob >= p.min)
  const color = entry ? entry.color : '#888'
  return { color, fillColor: color, fillOpacity: 0.45, weight: 1.5, opacity: 0.85 }
}

function getStyleFn(day, filter) {
  if (day >= 4)           return styleProbabilistic
  if (filter === 'cat')   return styleCategorical
  return styleTornProb    // torn / wind / hail all use numeric probabilities
}

// ── Day badge hook — fetches all 8 day outlooks for risk labels ───────────────
function useAllDayBadges() {
  const results = useQueries({
    queries: [1, 2, 3, 4, 5, 6, 7, 8].map(day => ({
      queryKey: ['spc-badge', day],
      queryFn: async () => {
        try {
          const r = await fetch(getBadgeUrl(day))
          return r.ok ? r.json() : null
        } catch { return null }
      },
      staleTime: 30 * 60 * 1000,
      refetchInterval: 30 * 60 * 1000,
      retry: false,
    })),
  })

  return results.map((result, i) => {
    const day  = i + 1
    const data = result.data
    if (!data?.features?.length) return null
    if (day >= 4) {
      let maxProb = 0
      for (const f of data.features) {
        const raw = f.properties?.LABEL || f.properties?.LABEL2 || ''
        const p = parseInt(raw, 10)
        if (!isNaN(p) && p > maxProb) maxProb = p
      }
      return maxProb > 0 ? `${maxProb}%` : '0%'
    } else {
      let bestRank = 0, bestLabel = null
      for (const f of data.features) {
        const label = (f.properties?.LABEL ?? '').toUpperCase()
        const rank  = SPC_RANK[label] ?? 0
        if (rank > bestRank) { bestRank = rank; bestLabel = label }
      }
      return bestLabel ?? '0%'
    }
  })
}

// ── WFO lookup ────────────────────────────────────────────────────────────────
function useWFO(lat, lon) {
  return useQuery({
    queryKey: ['wfo-lookup', lat, lon],
    queryFn: () =>
      fetch(`https://api.weather.gov/points/${lat},${lon}`, {
        headers: { Accept: 'application/geo+json' },
      })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
        .then(d => d?.properties?.cwa ?? null),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
}

// ── AFD text rendering (terminal style) ──────────────────────────────────────
const AFD_PATTERNS = [
  { re: /\bTORNAD(?:O|OES|IC)\b/g,                            s: { color: '#ef4444', fontWeight: 700 } },
  { re: /\bSEVERE\b/g,                                         s: { color: '#f97316', fontWeight: 600 } },
  { re: /\bWARNING\b/g,                                        s: { color: '#ef4444', fontWeight: 600 } },
  { re: /\bWATCH(?:ES)?\b/g,                                   s: { color: '#f59e0b', fontWeight: 600 } },
  { re: /\bADVISORY\b/g,                                       s: { color: '#f59e0b' } },
  { re: /\b(?:ENHANCED|MODERATE|HIGH|SLIGHT|MARGINAL)\b/g,     s: { color: '#22c55e' } },
  { re: /\b\d+(?:\.\d+)?\s*(?:MPH|KT|KTS|MB|HPA|IN|MM|J\/KG|FT|KM|MILES?)\b/gi, s: { color: '#3b82f6' } },
  { re: /\bPDS\b/g,                                            s: { color: '#ef4444', fontWeight: 700 } },
]

function tokenizeLine(line) {
  const hits = []
  AFD_PATTERNS.forEach(({ re, s }) => {
    const r = new RegExp(re.source, re.flags)
    let m
    while ((m = r.exec(line)) !== null)
      hits.push({ start: m.index, end: m.index + m[0].length, text: m[0], s })
  })
  hits.sort((a, b) => a.start - b.start)
  const clean = []; let last = 0
  for (const h of hits) { if (h.start >= last) { clean.push(h); last = h.end } }
  const out = []; let pos = 0
  clean.forEach((h, idx) => {
    if (h.start > pos) out.push(<span key={`p${idx}`}>{line.slice(pos, h.start)}</span>)
    out.push(<span key={`m${idx}`} style={h.s}>{h.text}</span>)
    pos = h.end
  })
  if (pos < line.length) out.push(<span key="e">{line.slice(pos)}</span>)
  return out.length ? out : [line]
}

function renderAFDLine(line, i) {
  if (!line.trim()) return <div key={i} style={{ height: 5 }} />
  if (/^\.[A-Z\s\/&]+\.\.\./.test(line))
    return <div key={i} style={{ color: '#3b82f6', fontWeight: 700, marginTop: 10, paddingTop: 6, borderTop: '1px solid #1e2235' }}>{line}</div>
  if (/^[A-Z]{4}\d{2}\s+K[A-Z]{3}/.test(line) || /^\d{3}$/.test(line.trim()))
    return <div key={i} style={{ color: '#252b45', fontSize: 12 }}>{line || ' '}</div>
  if (line.trim() === line.trim().toUpperCase() && line.trim().length > 3 && line.trim().length < 50 && /[A-Z]{3}/.test(line))
    return <div key={i} style={{ color: '#f0f2ff', fontWeight: 600, marginTop: 4 }}>{tokenizeLine(line)}</div>
  return <div key={i}>{tokenizeLine(line)}</div>
}

// ── AFD modal overlay ─────────────────────────────────────────────────────────
function AFDModal({ location, onClose }) {
  const { data: wfo, isLoading: wfoLoading } = useWFO(location.lat, location.lon)

  const { data: list, isLoading: listLoading, error: listError } = useQuery({
    queryKey: ['afd-list', wfo],
    queryFn: () =>
      fetch(`https://api.weather.gov/products/types/AFD/locations/${wfo}`, {
        headers: { Accept: 'application/geo+json' },
      }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    enabled: !!wfo,
    staleTime: 5 * 60 * 1000,
  })

  const latestUrl = list?.['@graph']?.[0]?.['@id']

  const { data: afd, isLoading: afdLoading, error: afdError } = useQuery({
    queryKey: ['afd-text', latestUrl],
    queryFn: () =>
      fetch(latestUrl, { headers: { Accept: 'application/geo+json' } })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    enabled: !!latestUrl,
    staleTime: 5 * 60 * 1000,
  })

  const loading    = wfoLoading || listLoading || afdLoading
  const hasError   = listError || afdError
  const wfoLabel   = wfo ?? '…'
  const issuanceTime = afd?.issuanceTime
    ? format(new Date(afd.issuanceTime), 'dd MMM yyyy HH:mm') + 'Z'
    : null
  const lines = afd?.productText ? afd.productText.replace(/\r\n/g, '\n').split('\n') : []

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 2000,
      background: 'rgba(9,11,20,0.96)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'monospace',
    }}>
      {/* Modal header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #1e2235',
        flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f2ff', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Area Forecast Discussion
          </span>
          <span style={{ fontSize: 12, color: '#8b92b3', marginLeft: 10 }}>
            NWS {wfoLabel} · api.weather.gov
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid #1e2235', borderRadius: 4,
            color: '#8b92b3', cursor: 'pointer', padding: '4px 10px',
            fontSize: 12, letterSpacing: '0.05em',
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Modal body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px 24px', fontSize: 13, lineHeight: 1.75, color: '#8b92b3' }}>
        {loading && (
          <div style={{ padding: 24 }}>Fetching AFD…</div>
        )}
        {!loading && hasError && (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#ef4444', marginBottom: 8 }}>Failed to load AFD</div>
            <div style={{ opacity: 0.6 }}>Check network or try again later.</div>
          </div>
        )}
        {!loading && !hasError && !afd?.productText && (
          <div style={{ padding: 24 }}>No text available.</div>
        )}
        {!loading && !hasError && afd?.productText && (
          <>
            {issuanceTime && (
              <div style={{ fontSize: 11, color: '#3b82f6', marginBottom: 10, opacity: 0.7 }}>
                Issued: {issuanceTime} — NWS {wfoLabel}
              </div>
            )}
            {lines.map((line, i) => renderAFDLine(line, i))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Map controller — syncs center/zoom to selected location ──────────────────
function MapController({ lat, lon }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lon], 5) }, [lat, lon, map])
  return null
}

// ── Filter button config ──────────────────────────────────────────────────────
const FILTERS = [
  { id: 'cat',  label: 'Categorical' },
  { id: 'torn', label: 'Tornado %'   },
  { id: 'wind', label: 'Wind %'      },
  { id: 'hail', label: 'Hail %'      },
]

// Torn/wind/hail probability color palette (mirrors styleTornProb)
const TORN_PROB_COLORS = [
  { min: 60, color: '#ff00ff' },
  { min: 45, color: '#e05c5c' },
  { min: 30, color: '#e8a126' },
  { min: 15, color: '#f6f67b' },
  { min: 10, color: '#55bb55' },
  { min: 2,  color: '#a7d9a7' },
]

function getHoverInfo(day, filter, feature) {
  const props = feature.properties ?? {}
  if (day <= 3 && filter === 'cat') {
    const label = (props.LABEL ?? '').toUpperCase()
    return { displayLabel: label || 'NO RISK', color: SPC_COLORS[label] ?? '#8b92b3' }
  }
  const raw  = props.LABEL ?? props.LABEL2 ?? ''
  const prob = parseInt(raw, 10)
  const displayLabel = isNaN(prob) ? (raw || '—') : `${prob}%`
  const palette = day >= 4 ? PROB_COLORS : TORN_PROB_COLORS
  const entry = palette.find(p => prob >= p.min)
  return { displayLabel, color: entry?.color ?? '#888888' }
}

const DAY_LABELS = {
  1: 'Day 1', 2: 'Day 2', 3: 'Day 3',
  4: 'Day 4', 5: 'Day 5', 6: 'Day 6', 7: 'Day 7', 8: 'Day 8',
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SevereTab({ location }) {
  const [activeDay,    setActiveDay]    = useState(1)
  const [activeFilter, setActiveFilter] = useState('cat')
  const [afdOpen,      setAfdOpen]      = useState(false)
  const [geoData,      setGeoData]      = useState(null)
  const [status,       setStatus]       = useState('loading')
  const [hoverInfo,    setHoverInfo]    = useState(null) // { x, y, displayLabel, color }
  const mapWrapperRef = useRef(null)

  const badges = useAllDayBadges()
  const isProb  = activeDay >= 4
  const showFilter = activeDay <= 3
  // Day 3 only supports categorical — hide prob filter buttons
  const visibleFilters = activeDay <= 2 ? FILTERS : FILTERS.filter(f => f.id === 'cat')

  // Reset filter to categorical when switching to Day 3 or probabilistic days
  useEffect(() => {
    if (activeDay >= 3) setActiveFilter('cat')
  }, [activeDay])

  // Fetch active outlook GeoJSON
  useEffect(() => {
    setStatus('loading')
    setGeoData(null)
    fetch(getSpcUrl(activeDay, activeFilter))
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => { setGeoData(data); setStatus('ok') })
      .catch(() => setStatus('error'))
  }, [activeDay, activeFilter])

  const styleFn = getStyleFn(activeDay, activeFilter)

  const onEachFeature = useCallback((feature, layer) => {
    layer.on({
      mousemove(e) {
        const rect = mapWrapperRef.current?.getBoundingClientRect()
        if (!rect) return
        const x = e.originalEvent.clientX - rect.left
        const y = e.originalEvent.clientY - rect.top
        const { displayLabel, color } = getHoverInfo(activeDay, activeFilter, feature)
        setHoverInfo({ x, y, displayLabel, color })
      },
      mouseout() { setHoverInfo(null) },
    })
  }, [activeDay, activeFilter])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

      {/* ── Day selector bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px',
        borderBottom: showFilter ? 'none' : '1px solid #1e2235',
        flexShrink: 0, background: '#0f1120',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: '#8b92b3',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4, whiteSpace: 'nowrap',
        }}>
          Outlook:
        </span>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((day, idx) => {
          const isActive = activeDay === day
          const badge    = badges[idx]
          const badgeColor = day < 4 && badge && SPC_COLORS[badge]
            ? SPC_COLORS[badge]
            : '#8b92b3'
          return (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              style={{
                height: 48, minWidth: 54,
                padding: '0 12px',
                borderRadius: 6,
                border: isActive ? '1px solid #3b82f6' : '1px solid #1e2235',
                background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isActive ? '#3b82f6' : '#8b92b3',
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.12s ease',
                marginLeft: day === 4 ? 8 : 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2,
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#3b82f633'; e.currentTarget.style.color = '#f0f2ff' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#1e2235';   e.currentTarget.style.color = '#8b92b3'   } }}
            >
              <span>Day {day}</span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: isActive ? '#3b82f6' : badgeColor,
                letterSpacing: '0.04em',
                opacity: badge ? 1 : 0.35,
              }}>
                {badge ?? '—'}
              </span>
            </button>
          )
        })}
        <span style={{ fontSize: 12, color: '#8b92b3', marginLeft: 'auto', opacity: 0.5, whiteSpace: 'nowrap' }}>
          {isProb ? 'Days 4–8 · Probabilistic (any-severe)' : 'SPC GeoJSON'}
        </span>
      </div>

      {/* ── Filter selector (days 1–3 only) ── */}
      {showFilter && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 14px',
          borderBottom: '1px solid #1e2235',
          flexShrink: 0, background: '#0d0f1e',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: '#8b92b3',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4,
          }}>
            Layer:
          </span>
          {visibleFilters.map(({ id, label }) => {
            const isActive = activeFilter === id
            return (
              <button
                key={id}
                onClick={() => setActiveFilter(id)}
                style={{
                  padding: '4px 12px', borderRadius: 4,
                  border: isActive ? '1px solid #3b82f6' : '1px solid #1e2235',
                  background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                  color: isActive ? '#3b82f6' : '#8b92b3',
                  fontSize: 12, fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer', transition: 'all 0.1s ease',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#3b82f633'; e.currentTarget.style.color = '#f0f2ff' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#1e2235';   e.currentTarget.style.color = '#8b92b3'   } }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Map area ── */}
      <div ref={mapWrapperRef} style={{ flex: 1, position: 'relative', background: '#090b14', overflow: 'hidden' }}>
        <MapContainer
          center={[location.lat, location.lon]}
          zoom={5}
          zoomControl={false}
          attributionControl={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* CartoDB Voyager — cities, roads, interstates */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* SPC outlook polygons */}
          {geoData && (
            <GeoJSON
              key={`${activeDay}-${activeFilter}`}
              data={geoData}
              style={styleFn}
              onEachFeature={onEachFeature}
            />
          )}

          {/* Selected location marker */}
          <CircleMarker
            center={[location.lat, location.lon]}
            radius={7}
            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}
          />
          <CircleMarker
            center={[location.lat, location.lon]}
            radius={3}
            pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 1, weight: 0 }}
          />

          <MapController lat={location.lat} lon={location.lon} />
        </MapContainer>

        {/* Loading overlay */}
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, pointerEvents: 'none',
          }}>
            <span style={{
              fontSize: 13, color: '#8b92b3', fontFamily: 'monospace',
              background: 'rgba(9,11,20,0.85)', padding: '8px 18px', borderRadius: 6,
            }}>
              Loading outlook…
            </span>
          </div>
        )}

        {/* Error overlay */}
        {status === 'error' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 1000,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 36, height: 36, color: '#8b92b3', opacity: 0.4 }}>
              <path d="M12 2L2 19h20L12 2z" /><path d="M12 9v5M12 17h.01" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 14, color: '#8b92b3' }}>
              {isProb ? 'Extended outlook unavailable' : 'Outlook GeoJSON unavailable'}
            </span>
          </div>
        )}

        {/* Risk legend — categorical (top-right) */}
        {!isProb && activeFilter === 'cat' && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: '#0f1120cc', border: '1px solid #1e2235',
            borderRadius: 6, padding: '12px',
            fontSize: 13, color: '#8b92b3',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 11 }}>Risk Level</div>
            {Object.entries(SPC_COLORS).map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 16, height: 16, background: color, flexShrink: 0, borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)' }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Probability legend — torn/wind/hail + day 4-8 (top-right) */}
        {(isProb || activeFilter !== 'cat') && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: '#0f1120cc', border: '1px solid #1e2235',
            borderRadius: 6, padding: '12px',
            fontSize: 13, color: '#8b92b3',
            display: 'flex', flexDirection: 'column', gap: 5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 11 }}>
              {isProb ? 'Prob. Any Severe' : FILTERS.find(f => f.id === activeFilter)?.label}
            </div>
            {PROB_COLORS.map(({ min, color }) => (
              <div key={min} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 16, height: 16, background: color, flexShrink: 0, borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)' }} />
                <span>≥{min}%</span>
              </div>
            ))}
          </div>
        )}

        {/* HUD label */}
        <div style={{
          position: 'absolute', top: 12, left: 14, zIndex: 1000, pointerEvents: 'none',
          fontSize: 12, fontWeight: 600, color: '#8b92b3', opacity: 0.45,
          textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace',
        }}>
          SPC · {DAY_LABELS[activeDay]} Convective Outlook
        </div>

        {/* AFD button */}
        <button
          onClick={() => setAfdOpen(true)}
          style={{
            position: 'absolute', bottom: 12, left: 14, zIndex: 1000,
            background: 'rgba(15,17,32,0.88)', border: '1px solid #1e2235',
            borderRadius: 5, padding: '6px 13px',
            fontSize: 12, color: '#8b92b3', cursor: 'pointer',
            fontFamily: 'monospace', letterSpacing: '0.05em',
            transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#3b82f6' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e2235'; e.currentTarget.style.color = '#8b92b3' }}
        >
          Read Forecast Discussion
        </button>

        {/* AFD modal overlay */}
        {afdOpen && <AFDModal location={location} onClose={() => setAfdOpen(false)} />}

        {/* Mouse-following hover tooltip */}
        {hoverInfo && (
          <div style={{
            position: 'absolute',
            left: hoverInfo.x + 14,
            top:  hoverInfo.y - 10,
            zIndex: 1100,
            pointerEvents: 'none',
            background: '#0f1120',
            border: '1px solid #1e2235',
            borderLeft: `3px solid ${hoverInfo.color}`,
            borderRadius: 5,
            padding: '7px 11px',
            fontSize: 12,
            lineHeight: 1.55,
            color: '#c9cfe8',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontWeight: 700, color: hoverInfo.color, fontSize: 13, marginBottom: 2 }}>
              {hoverInfo.displayLabel}
            </div>
            <div style={{ color: '#8b92b3', fontSize: 11 }}>
              {DAY_LABELS[activeDay]}
              {activeDay <= 2 && ` · ${FILTERS.find(f => f.id === activeFilter)?.label ?? ''}`}
              {activeDay === 3 && ' · Categorical'}
              {activeDay >= 4 && ' · Probabilistic'}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
