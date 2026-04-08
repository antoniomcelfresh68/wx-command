import { useState, useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl

// SPC categorical risk colors
const SPC_COLORS = {
  TSTM: '#c1e9c1',
  MRGL: '#55bb55',
  SLGT: '#f6f67b',
  ENH:  '#e8a126',
  MDT:  '#e05c5c',
  HIGH: '#ff00ff',
}

// Probabilistic threshold colors (day 4-8)
const PROB_COLORS = [
  { min: 60, color: '#ff00ff' },
  { min: 45, color: '#e05c5c' },
  { min: 30, color: '#e8a126' },
  { min: 15, color: '#f6f67b' },
  { min: 5,  color: '#55bb55' },
]

function getSpcUrl(day) {
  if (day <= 3) return `https://www.spc.noaa.gov/products/outlook/day${day}otlk_cat.nolyr.geojson`
  return `https://www.spc.noaa.gov/products/exper/day4-8/day${day}prob.nolyr.geojson`
}

const DAY_LABELS = {
  1: 'Day 1', 2: 'Day 2', 3: 'Day 3',
  4: 'Days 4–8', 5: 'Days 4–8', 6: 'Days 4–8', 7: 'Days 4–8', 8: 'Days 4–8',
}

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

export default function SevereTab() {
  const [activeDay, setActiveDay] = useState(1)
  const [geoData, setGeoData] = useState(null)
  const [status, setStatus]   = useState('loading') // 'loading' | 'ok' | 'error'

  useEffect(() => {
    setStatus('loading')
    setGeoData(null)
    fetch(getSpcUrl(activeDay))
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => { setGeoData(data); setStatus('ok') })
      .catch(() => setStatus('error'))
  }, [activeDay])

  const isProb = activeDay >= 4

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

      {/* Day selector bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 14px',
        borderBottom: '1px solid #1e2235',
        flexShrink: 0, background: '#0f1120',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>
          Outlook:
        </span>
        {[1, 2, 3, 4, 5, 6, 7, 8].map(day => {
          const isActive = activeDay === day
          return (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              style={{
                padding: '5px 13px', borderRadius: 5,
                border: isActive ? '1px solid #3b82f6' : '1px solid #1e2235',
                background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isActive ? '#3b82f6' : '#8b92b3',
                fontSize: 14, fontWeight: isActive ? 700 : 500,
                cursor: 'pointer', transition: 'all 0.12s ease',
                marginLeft: day === 4 ? 8 : 0,
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = '#3b82f633'; e.currentTarget.style.color = '#f0f2ff' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#1e2235';   e.currentTarget.style.color = '#8b92b3'   } }}
            >
              Day {day}
            </button>
          )
        })}
        <span style={{ fontSize: 12, color: '#8b92b3', marginLeft: 'auto', opacity: 0.5 }}>
          {activeDay <= 3 ? 'Categorical · SPC GeoJSON' : 'Days 4–8 · Probabilistic (any-severe)'}
        </span>
      </div>

      {/* Map area */}
      <div style={{ flex: 1, position: 'relative', background: '#090b14', overflow: 'hidden' }}>
        <MapContainer
          center={[38.0, -97.0]}
          zoom={4}
          zoomControl={false}
          attributionControl={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* CartoDB dark matter basemap */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* SPC outlook polygons */}
          {geoData && (
            <GeoJSON
              key={activeDay}
              data={geoData}
              style={isProb ? styleProbabilistic : styleCategorical}
            />
          )}
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
            {isProb && (
              <span style={{ fontSize: 12, color: '#8b92b3', opacity: 0.6, fontFamily: 'monospace' }}>
                day{activeDay}prob.nolyr.geojson · SPC extended range
              </span>
            )}
          </div>
        )}

        {/* Risk legend — categorical */}
        {!isProb && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
            background: 'rgba(15,17,32,0.92)', border: '1px solid #1e2235',
            borderRadius: 6, padding: '8px 10px',
            fontSize: 12, color: '#8b92b3',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Risk Level</div>
            {Object.entries(SPC_COLORS).map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: color, flexShrink: 0, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Probabilistic legend */}
        {isProb && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
            background: 'rgba(15,17,32,0.92)', border: '1px solid #1e2235',
            borderRadius: 6, padding: '8px 10px',
            fontSize: 12, color: '#8b92b3',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Prob. Any Severe</div>
            {PROB_COLORS.map(({ min, color }) => (
              <div key={min} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, background: color, flexShrink: 0, borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)' }} />
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
      </div>

    </div>
  )
}
