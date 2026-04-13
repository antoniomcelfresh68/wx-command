import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'

// ── SPC Day 1 badge ───────────────────────────────────────────────────────────
const SPC_RISK_RANK = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }

const SPC_RISK_COLOR = {
  TSTM: '#86efac', MRGL: '#55bb55', SLGT: '#eaea00',
  ENH: '#e8a126',  MDT: '#ef4444',  HIGH: '#e040fb',
}

function pointInRing(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
}

function pointInFeature(lon, lat, geom) {
  if (!geom) return false
  const polys = geom.type === 'Polygon'      ? [geom.coordinates]
              : geom.type === 'MultiPolygon' ? geom.coordinates : []
  return polys.some(poly => pointInRing(lon, lat, poly[0]))
}

function deriveDay1Category(geojson, lat, lon) {
  let bestRank = 0, bestLabel = 'NO RISK'
  for (const f of geojson?.features ?? []) {
    const label = (f.properties?.LABEL ?? '').toUpperCase()
    const rank  = SPC_RISK_RANK[label] ?? 0
    if (rank > bestRank && pointInFeature(lon, lat, f.geometry)) {
      bestRank = rank; bestLabel = label
    }
  }
  return bestLabel
}

function useSpcDay1Badge(lat, lon) {
  const { data } = useQuery({
    queryKey: ['spc-day1-geo'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  })
  if (!data) return null
  const cat = deriveDay1Category(data, lat, lon)
  return cat === 'NO RISK' ? null : cat
}

function fmtUTC(date) {
  const h = String(date.getUTCHours()).padStart(2, '0')
  const m = String(date.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}Z`
}

function fmtUTCDate(date) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const d  = String(date.getUTCDate()).padStart(2, '0')
  return `${d} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

const NAV_ITEMS = [
  {
    id: 'overview',
    label: 'Overview',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'severe',
    label: 'SPC',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path d="M12 2L2 19h20L12 2z" />
        <path d="M12 9v5M12 17h.01" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'observations',
    label: 'Observations',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    id: 'forecast',
    label: 'Forecast',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path d="M3 15a4 4 0 0 0 4 4h9a5 5 0 1 0-4.9-6H7a4 4 0 0 0-4 4z" />
        <path d="M3 3l18 18" strokeLinecap="round" opacity="0" />
        <polyline points="2 12 6 8 10 12 14 8 18 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'chaseops',
    label: 'Chase Ops',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <circle cx="12" cy="12" r="7" />
        <line x1="12" y1="2" x2="12" y2="5" strokeLinecap="round" />
        <line x1="12" y1="19" x2="12" y2="22" strokeLinecap="round" />
        <line x1="2" y1="12" x2="5" y2="12" strokeLinecap="round" />
        <line x1="19" y1="12" x2="22" y2="12" strokeLinecap="round" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'About',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" strokeLinecap="round" />
        <line x1="12" y1="8" x2="12.01" y2="8" strokeLinecap="round" strokeWidth={2.5} />
      </svg>
    ),
  },
]

export default function Sidebar({ activeTab, setActiveTab, location }) {
  const [utc, setUtc] = useState(new Date())
  const [local, setLocal] = useState(new Date())
  const spcRisk = useSpcDay1Badge(location?.lat, location?.lon)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setUtc(now)
      setLocal(now)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <aside
      className="flex flex-col shrink-0"
      style={{
        width: 200,
        background: '#0f1120',
        borderRight: '1px solid #1e2235',
        height: '100vh',
      }}
    >
      {/* Branding */}
      <div
        className="flex items-center gap-2 px-4 py-5"
        style={{ borderBottom: '1px solid #1e2235' }}
      >
        <div
          className="flex items-center justify-center rounded-md"
          style={{ width: 30, height: 30, background: '#3b82f6' }}
        >
          <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
            <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: '#f0f2ff', letterSpacing: '0.02em' }}>
            Antonio's Severe<br />Weather Dashboard
          </div>
          <div className="text-xs" style={{ color: '#8b92b3', marginTop: 2 }}>
            v5.2.1
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id
            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150"
                  style={{
                    background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                    color: isActive ? '#3b82f6' : '#8b92b3',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.color = '#f0f2ff'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = '#8b92b3'
                    }
                  }}
                >
                  <span style={{ flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  {item.id === 'severe' && spcRisk && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                      letterSpacing: '0.04em',
                      color: SPC_RISK_COLOR[spcRisk] ?? '#8b92b3',
                      background: `${SPC_RISK_COLOR[spcRisk] ?? '#8b92b3'}1a`,
                      border: `1px solid ${SPC_RISK_COLOR[spcRisk] ?? '#8b92b3'}55`,
                      borderRadius: 4,
                      padding: '1px 5px',
                      flexShrink: 0,
                    }}>
                      {spcRisk}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Clock */}
      <div
        className="px-4 py-4"
        style={{ borderTop: '1px solid #1e2235' }}
      >
        <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#8b92b3', opacity: 0.6 }}>
          Time
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: '#8b92b3' }}>UTC</span>
            <span
              className="font-mono text-sm font-semibold"
              style={{ color: '#f0f2ff' }}
            >
              {fmtUTC(utc)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: '#8b92b3' }}>Local</span>
            <span
              className="font-mono text-sm"
              style={{ color: '#8b92b3' }}
            >
              {format(local, 'HH:mm:ss')}
            </span>
          </div>
          <div className="text-xs mt-1" style={{ color: '#8b92b3', opacity: 0.6 }}>
            {fmtUTCDate(utc)}
          </div>
        </div>
      </div>
    </aside>
  )
}
