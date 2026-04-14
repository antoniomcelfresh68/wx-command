import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useQuery, useQueries } from '@tanstack/react-query'
import { format } from 'date-fns'

delete L.Icon.Default.prototype._getIconUrl

// ── SPC categorical risk colors (official SPC values) ─────────────────────────
const SPC_COLORS = {
  TSTM: '#c1e9c1',
  MRGL: '#006400',
  SLGT: '#f4f400',
  ENH:  '#e8781e',
  MDT:  '#e83030',
  HIGH: '#ff00ff',
}
const SPC_RANK = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }

const CAT_LEGEND = [
  { key: 'TSTM', label: 'General Thunder' },
  { key: 'MRGL', label: 'Marginal'        },
  { key: 'SLGT', label: 'Slight'          },
  { key: 'ENH',  label: 'Enhanced'        },
  { key: 'MDT',  label: 'Moderate'        },
  { key: 'HIGH', label: 'High'            },
]

// ── Probabilistic colors (day 4–8 any-severe) ────────────────────────────────
const PROB_COLORS = [
  { min: 60, color: '#ff00ff' },
  { min: 45, color: '#e05c5c' },
  { min: 30, color: '#e8a126' },
  { min: 15, color: '#f6f67b' },
  { min: 5,  color: '#55bb55' },
]

// ── SPC official tornado probability palette ──────────────────────────────────
const TORN_PALETTE = [
  { min: 60, color: '#104E8B' },
  { min: 45, color: '#912CEE' },
  { min: 30, color: '#FF00FF' },
  { min: 15, color: '#FF0000' },
  { min: 10, color: '#FFA500' },
  { min: 5,  color: '#8B4513' },
  { min: 2,  color: '#008B00' },
]

// ── SPC official wind/hail probability palette ────────────────────────────────
const WIND_HAIL_PALETTE = [
  { min: 60, color: '#FF00FF' },
  { min: 45, color: '#FF0000' },
  { min: 30, color: '#FFA500' },
  { min: 15, color: '#F4F400' },
  { min: 5,  color: '#008B00' },
]

// ── ESRI Light Gray Canvas tile URLs (SPC tab only) ───────────────────────────
const ESRI_BASE       = 'https://{s}.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const ESRI_REF        = 'https://{s}.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
const ESRI_SUBS       = ['server', 'services']
const US_STATES_URL   = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json'
const STATE_STYLE     = { color: '#555555', weight: 2, fill: false, opacity: 0.9 }

// ── US state border layer (SPC tab only) ─────────────────────────────────────
function StateBorders() {
  const { data } = useQuery({
    queryKey: ['us-states-geojson'],
    queryFn: () => fetch(US_STATES_URL).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: Infinity,
    retry: 1,
  })
  if (!data) return null
  return <GeoJSON key="state-borders" data={data} style={STATE_STYLE} />
}

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

// ── Probability extractor ─────────────────────────────────────────────────────
// SPC GeoJSON uses DN as integer percentage (2), or LABEL as decimal fraction ("0.02").
function probFromFeature(f) {
  const dn = f.properties?.DN
  if (dn != null && !isNaN(dn)) return dn
  const raw = f.properties?.LABEL ?? f.properties?.LABEL2 ?? ''
  const v = parseFloat(raw)
  if (isNaN(v)) return NaN
  return v < 1 ? Math.round(v * 100) : Math.round(v)
}

// ── SIGN feature detection — SPC GeoJSON uses LABEL field (exact string) ─────
function isCIGFeature(f) {
  return f.properties?.LABEL === 'SIGN'
}

// ── Feature style functions ───────────────────────────────────────────────────
function styleCategorical(feature) {
  const label = (feature.properties?.LABEL || '').toUpperCase()
  const color = SPC_COLORS[label] || '#888888'
  return { color, fillColor: color, fillOpacity: 0.5, weight: 1, opacity: 0.8 }
}

function styleProbabilistic(feature) {
  const prob = probFromFeature(feature)
  const entry = PROB_COLORS.find(p => prob >= p.min)
  const color = entry ? entry.color : '#888888'
  return { className: 'spc-prob-polygon', color, fillColor: color, fillOpacity: 0.45, weight: 1, opacity: 1 }
}

function styleTornProb(feature, palette) {
  const prob = probFromFeature(feature)
  if (isNaN(prob) || prob === 0) return { className: 'spc-prob-polygon', color: '#888', fillColor: '#888', fillOpacity: 0.5, weight: 1.5, opacity: 1 }
  const entry = palette.find(p => prob >= p.min)
  const color = entry ? entry.color : '#888'
  // stroke same hex as fill per SPC style
  return { className: 'spc-prob-polygon', color, fillColor: color, fillOpacity: 0.5, weight: 1.5, opacity: 1 }
}

function styleCIG() {
  return { className: 'spc-prob-polygon', color: '#000000', fillColor: 'url(#sign-hatch)', fillOpacity: 1, weight: 2, opacity: 1 }
}

function getStyleFn(day, filter) {
  if (day >= 4)         return styleProbabilistic
  if (filter === 'cat') return styleCategorical
  const palette = filter === 'torn' ? TORN_PALETTE : WIND_HAIL_PALETTE
  return (feature) => styleTornProb(feature, palette)
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
        const p = probFromFeature(f)
        if (!isNaN(p) && p > maxProb) maxProb = p
      }
      return maxProb > 0 ? `${maxProb}%` : null
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px 24px', fontSize: 13, lineHeight: 1.75, color: '#8b92b3' }}>
        {loading && <div style={{ padding: 24 }}>Fetching AFD…</div>}
        {!loading && hasError && (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#ef4444', marginBottom: 8 }}>Failed to load AFD</div>
            <div style={{ opacity: 0.6 }}>Check network or try again later.</div>
          </div>
        )}
        {!loading && !hasError && !afd?.productText && <div style={{ padding: 24 }}>No text available.</div>}
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

// ── SVG SIGN hatch pattern injector ──────────────────────────────────────────
// Re-runs on every layeradd so the <defs> survive Leaflet SVG resets.
function SignHatchDefs() {
  const map = useMap()
  useEffect(() => {
    const injectDefs = () => {
      const svgPane = map.getPanes()?.overlayPane?.querySelector('svg')
      if (!svgPane) return
      if (svgPane.querySelector('#sign-hatch')) return
      const ns   = 'http://www.w3.org/2000/svg'
      const defs = document.createElementNS(ns, 'defs')
      defs.innerHTML = `
        <pattern id="sign-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45 0 0)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#000000" stroke-width="2"/>
        </pattern>`
      svgPane.insertBefore(defs, svgPane.firstChild)
    }
    injectDefs()
    map.on('layeradd', injectDefs)
    return () => { map.off('layeradd', injectDefs) }
  }, [map])
  return null
}

// ── Filter button config ──────────────────────────────────────────────────────
const FILTERS = [
  { id: 'cat',  label: 'Categorical' },
  { id: 'torn', label: 'Tornado %'   },
  { id: 'wind', label: 'Wind %'      },
  { id: 'hail', label: 'Hail %'      },
]

function getHoverInfo(day, filter, feature) {
  const props = feature.properties ?? {}
  if (day <= 3 && filter === 'cat') {
    const label = (props.LABEL ?? '').toUpperCase()
    return { displayLabel: label || 'NO RISK', color: SPC_COLORS[label] ?? '#8b92b3' }
  }
  const label = (props.LABEL || props.LABEL2 || '').toUpperCase()
  if (label === 'SIGN') return { displayLabel: 'SIG', color: '#444444' }
  const prob = probFromFeature(feature)
  const displayLabel = isNaN(prob) ? (props.LABEL2 || props.LABEL || '—') : `${prob}%`
  let palette
  if (day >= 4)               palette = PROB_COLORS
  else if (filter === 'torn') palette = TORN_PALETTE
  else                        palette = WIND_HAIL_PALETTE
  const entry = palette.find(p => prob >= p.min)
  return { displayLabel, color: entry?.color ?? '#888888' }
}

const DAY_LABELS = {
  1: 'Day 1', 2: 'Day 2', 3: 'Day 3',
  4: 'Day 4', 5: 'Day 5', 6: 'Day 6', 7: 'Day 7', 8: 'Day 8',
}

// ── Inline SVG swatch for CIG/hatched legend rows ─────────────────────────────
function HatchSwatch({ size = 16 }) {
  return (
    <svg width={size} height={size} style={{ flexShrink: 0, display: 'block' }}>
      <rect width={size} height={size} fill="#fff" stroke="#999" strokeWidth="1"/>
      {[-8,-4,0,4,8,12,16,20].map(offset => (
        <line
          key={offset}
          x1={offset} y1={0}
          x2={offset + size} y2={size}
          stroke="#000" strokeWidth="1.5"
        />
      ))}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SevereTab({ location }) {
  const [activeDay,    setActiveDay]    = useState(1)
  const [activeFilter, setActiveFilter] = useState('cat')
  const [afdOpen,      setAfdOpen]      = useState(false)
  const [geoData,      setGeoData]      = useState(null)
  const [status,       setStatus]       = useState('loading')
  const [hoverInfo,    setHoverInfo]    = useState(null)
  const mapWrapperRef = useRef(null)

  const badges      = useAllDayBadges()
  const isProb      = activeDay >= 4
  const showFilter  = activeDay <= 3
  const visibleFilters = activeDay <= 2 ? FILTERS : FILTERS.filter(f => f.id === 'cat')

  // Reset filter to categorical when switching to Day 3+ or probabilistic days
  useEffect(() => {
    if (activeDay >= 3) setActiveFilter('cat')
  }, [activeDay])

  // Fetch active outlook GeoJSON
  useEffect(() => {
    setStatus('loading')
    setGeoData(null)
    fetch(getSpcUrl(activeDay, activeFilter))
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        if (data?.features && activeFilter !== 'cat') {
          data.features.sort((a, b) => {
            const pa = probFromFeature(a)
            const pb = probFromFeature(b)
            return (isNaN(pa) ? -Infinity : pa) - (isNaN(pb) ? -Infinity : pb)
          })
        }
        setGeoData(data)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [activeDay, activeFilter])

  // Split CIG (SIGN) features into a separate layer so they render on top
  const mainGeoData = useMemo(() => {
    if (!geoData?.features) return geoData
    if (activeFilter === 'cat' || activeDay >= 4) return geoData
    const features = geoData.features.filter(f => !isCIGFeature(f))
    return { ...geoData, features }
  }, [geoData, activeFilter, activeDay])

  const cigGeoData = useMemo(() => {
    if (!geoData?.features || activeFilter === 'cat' || activeDay >= 4) return null
    const features = geoData.features.filter(isCIGFeature)
    return features.length ? { ...geoData, features } : null
  }, [geoData, activeFilter, activeDay])

  // Legend: only show probability thresholds actually present in the loaded data
  const activeProbThresholds = useMemo(() => {
    if (activeFilter === 'cat' || !geoData?.features) return []
    const presentProbs = new Set(
      geoData.features
        .filter(f => !isCIGFeature(f))
        .map(f => probFromFeature(f))
        .filter(p => !isNaN(p) && p > 0)
    )
    const palette = isProb ? PROB_COLORS : activeFilter === 'torn' ? TORN_PALETTE : WIND_HAIL_PALETTE
    return palette.filter(({ min }) => presentProbs.has(min))
  }, [geoData, isProb, activeFilter])

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

  // Legend title by context
  const legendTitle = isProb
    ? 'Prob. Any Severe'
    : activeFilter === 'cat'  ? 'Convective Outlook'
    : activeFilter === 'torn' ? 'Tornado Probability'
    : activeFilter === 'wind' ? 'Wind Probability'
    : 'Hail Probability'

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
          const isActive   = activeDay === day
          const badge      = badges[idx]
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

      {/* ── Filter selector (days 1–2 only) ── */}
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
      <div ref={mapWrapperRef} style={{ flex: 1, position: 'relative', background: '#e8e8e8', overflow: 'hidden' }}>
        <MapContainer
          center={[location.lat, location.lon]}
          zoom={5}
          zoomControl={false}
          attributionControl={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* ESRI Light Gray Canvas — SPC tab only, not BasemapLayers */}
          <TileLayer
            url={ESRI_BASE}
            subdomains={ESRI_SUBS}
            maxNativeZoom={16}
            maxZoom={19}
          />
          <TileLayer
            url={ESRI_REF}
            subdomains={ESRI_SUBS}
            maxNativeZoom={16}
            maxZoom={19}
          />

          {/* Thicker state outlines — below SPC polygons */}
          <StateBorders />

          {/* SPC probability/categorical polygons */}
          {mainGeoData && (
            <GeoJSON
              key={`${activeDay}-${activeFilter}-main`}
              data={mainGeoData}
              style={styleFn}
              onEachFeature={onEachFeature}
            />
          )}

          {/* CIG (SIGN) contours rendered on top as separate layer */}
          {cigGeoData && (
            <GeoJSON
              key={`${activeDay}-${activeFilter}-cig`}
              data={cigGeoData}
              style={styleCIG}
              onEachFeature={onEachFeature}
            />
          )}

          {/* Inject SVG SIGN hatch pattern — re-injects on each layeradd */}
          <SignHatchDefs />

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

        {/* ── SPC-style legend — bottom right ── */}
        <div style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
          background: '#ffffff',
          border: '1px solid #999',
          borderRadius: 8,
          padding: '10px',
          fontSize: 12,
          color: '#222',
          display: 'flex', flexDirection: 'column', gap: 4,
          minWidth: 150,
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontWeight: 700, fontVariant: 'small-caps',
            textAlign: 'center', marginBottom: 4,
            fontSize: 12, color: '#111',
            borderBottom: '1px solid #ddd', paddingBottom: 4,
          }}>
            {legendTitle}
          </div>

          {/* Categorical legend */}
          {activeFilter === 'cat' && CAT_LEGEND.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                width: 16, height: 16, flexShrink: 0,
                background: SPC_COLORS[key],
                border: '1px solid #999',
              }} />
              <span>{label}</span>
            </div>
          ))}

          {/* Probability legend — only thresholds present in current data */}
          {activeFilter !== 'cat' && activeProbThresholds.map(({ min, color }) => (
            <div key={min} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                width: 16, height: 16, flexShrink: 0,
                background: color,
                border: '1px solid #999',
              }} />
              <span>≥{min}%</span>
            </div>
          ))}

          {/* CIG row — shown only when SIGN features are present */}
          {cigGeoData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <HatchSwatch size={16} />
              <span>Sig. (CIG)</span>
            </div>
          )}
        </div>

        {/* HUD label */}
        <div style={{
          position: 'absolute', top: 12, left: 14, zIndex: 1000, pointerEvents: 'none',
          fontSize: 12, fontWeight: 600, color: '#333', opacity: 0.6,
          textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace',
          textShadow: '0 1px 3px rgba(255,255,255,0.8)',
        }}>
          SPC · {DAY_LABELS[activeDay]} Convective Outlook
        </div>

        {/* AFD button */}
        <button
          onClick={() => setAfdOpen(true)}
          style={{
            position: 'absolute', bottom: 12, left: 14, zIndex: 1000,
            background: 'rgba(255,255,255,0.88)', border: '1px solid #999',
            borderRadius: 5, padding: '6px 13px',
            fontSize: 12, color: '#333', cursor: 'pointer',
            fontFamily: 'monospace', letterSpacing: '0.05em',
            transition: 'border-color 0.12s, color 0.12s',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#3b82f6' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#999';    e.currentTarget.style.color = '#333'    }}
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
            background: '#ffffff',
            border: '1px solid #ccc',
            borderLeft: `3px solid ${hoverInfo.color}`,
            borderRadius: 5,
            padding: '7px 11px',
            fontSize: 12,
            lineHeight: 1.55,
            color: '#222',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontWeight: 700, color: hoverInfo.color === '#ffffff' ? '#333' : hoverInfo.color, fontSize: 13, marginBottom: 2 }}>
              {hoverInfo.displayLabel}
            </div>
            <div style={{ color: '#666', fontSize: 11 }}>
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
