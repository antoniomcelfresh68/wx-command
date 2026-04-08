import { useState, useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl

// ── Dewpoint color scale ──────────────────────────────────────────────────────
function dewColor(d) {
  if (d < 40) return '#3b82f6'   // blue   — dry
  if (d < 55) return '#22c55e'   // green  — comfortable
  if (d < 65) return '#f59e0b'   // yellow — humid
  return '#f97316'               // orange — very humid
}

// ── Severe parameter coloring & annotations ───────────────────────────────────
function paramColor(cat, val) {
  const G = '#22c55e', Y = '#f59e0b', O = '#f97316', R = '#ef4444', B = '#3b82f6'
  switch (cat) {
    case 'mlcape': case 'sbcape': case 'mucape':
      return val < 500 ? G : val < 1500 ? Y : val < 2500 ? O : R
    case 'srh3':   return val < 100 ? G : val < 250 ? Y : val < 400 ? O : R
    case 'srh1':   return val < 100 ? G : val < 200 ? Y : val < 300 ? O : R
    case 'shear6': return val < 30 ? G : val < 45 ? Y : val < 55 ? O : R
    case 'shear1': return val < 15 ? G : val < 25 ? Y : O
    case 'lcl':    return val > 2000 ? G : val > 1200 ? Y : val > 600 ? O : R
    case 'li':     return val > -2 ? G : val > -4 ? Y : val > -6 ? O : R
    case 'pwat':   return val < 0.75 ? G : val < 1.25 ? Y : val < 1.75 ? O : R
    default: return B
  }
}

function paramNote(cat, val) {
  switch (cat) {
    case 'mlcape': case 'sbcape': case 'mucape':
      return val < 500 ? 'LOW' : val < 1500 ? 'MODERATE' : val < 2500 ? 'HIGH' : 'EXTREME'
    case 'srh3': return val < 100 ? 'WEAK' : val < 250 ? 'MODERATE' : val < 400 ? 'LARGE' : 'EXTREME'
    case 'srh1': return val < 100 ? 'WEAK' : val < 200 ? 'MODERATE' : val < 300 ? 'LARGE' : 'EXTREME'
    case 'shear6': return val < 30 ? 'WEAK' : val < 45 ? 'MODERATE' : 'STRONG'
    case 'lcl':  return val > 2000 ? 'HIGH' : val > 1000 ? 'MODERATE' : 'LOW — FAVORABLE'
    case 'li':   return val > -2 ? 'STABLE' : val > -4 ? 'UNSTABLE' : 'VERY UNSTABLE'
    default: return null
  }
}

// ── UI components ─────────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: '#8b92b3',
      textTransform: 'uppercase', letterSpacing: '0.1em',
      padding: '12px 0 6px',
      borderBottom: '1px solid #1e2235',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function ParamCard({ label, value, unit, cat, num, loading }) {
  const color = loading ? '#2a2f47' : paramColor(cat, num)
  const note  = loading ? null : paramNote(cat, num)
  return (
    <div style={{
      background: '#090b14',
      border: '1px solid #1e2235',
      borderTop: `2px solid ${color}`,
      borderRadius: 6,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 3,
      opacity: loading ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: '#f0f2ff', lineHeight: 1 }}>
          {loading ? '…' : value}
        </span>
        {unit && !loading && <span style={{ fontSize: 13, color: '#8b92b3' }}>{unit}</span>}
      </div>
      <span style={{ fontSize: 12, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      {note && <span style={{ fontSize: 12, color, fontWeight: 600, marginTop: 1 }}>{note}</span>}
    </div>
  )
}

// ── METAR station fetch (aviationweather.gov) ─────────────────────────────────
const METAR_URL =
  'https://aviationweather.gov/api/data/metar?format=json&taf=false&hours=1&bbox=-125,24,-65,50'

function useMetarStations() {
  const [stations, setStations] = useState([])
  const [status, setStatus]     = useState('loading') // 'loading'|'ok'|'error'

  useEffect(() => {
    setStatus('loading')
    fetch(METAR_URL)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        const parsed = (Array.isArray(data) ? data : [])
          .filter(s => s.lat != null && s.lon != null && s.dwpt != null && !isNaN(s.dwpt))
          .map(s => ({
            id:   s.stationId || s.icaoId || '???',
            lat:  parseFloat(s.lat),
            lon:  parseFloat(s.lon),
            dew:  parseFloat(s.dwpt) * 9 / 5 + 32,  // °C → °F
            temp: s.temp != null ? parseFloat(s.temp) * 9 / 5 + 32 : null,
          }))
        setStations(parsed)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }, [])

  return { stations, status }
}

// ── Location for severe param fetch (KOKC) ───────────────────────────────────
const REF_LAT = 35.22
const REF_LON = -97.47

// Only parameters with a live Open-Meteo source are shown.
const MESO_DEFS = [
  { key: 'cape', label: 'CAPE',         unit: 'J/kg', cat: 'mlcape', fmt: v => Math.round(v).toLocaleString(), field: 'cape'                 },
  { key: 'cin',  label: 'CIN',          unit: 'J/kg', cat: 'default',fmt: v => Math.round(v).toLocaleString(), field: 'convective_inhibition' },
  { key: 'li',   label: 'Lifted Index', unit: '',     cat: 'li',     fmt: v => v.toFixed(1),                   field: 'lifted_index'          },
]

// Open-Meteo: free, CORS-friendly, provides CAPE / LI / CIN from GFS/best-match
// IEM spcmeso.py is permanently decommissioned (301 → HTML docs since 2025).
// NWS gridpoint API has no CAPE/SRH/shear/LCL/PWAT fields.
// rucsoundings.noaa.gov does not respond to browser requests.
function useOpenMeteoParams() {
  const [vals, setVals]     = useState({})
  const [status, setStatus] = useState('loading')
  const [fetchedAt, setFetchedAt] = useState(null)

  useEffect(() => {
    const params = 'cape,lifted_index,convective_inhibition'
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${REF_LAT}&longitude=${REF_LON}&current=${params}&forecast_days=1`

    fetch(url)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(data => {
        const cur = data.current ?? {}
        console.log('[Open-Meteo] current severe params:', cur)
        const result = {}
        for (const def of MESO_DEFS) {
          const v = cur[def.field]
          result[def.key] = (v != null && isFinite(Number(v))) ? Number(v) : null
        }
        setVals(result)
        setFetchedAt(cur.time ?? null)
        setStatus('ok')
      })
      .catch(err => { console.error('[Open-Meteo] fetch error:', err); setStatus('error') })
  }, [])

  return { vals, status, fetchedAt }
}


// ── Main component ────────────────────────────────────────────────────────────
export default function ObservationsTab() {
  const { stations, status: mapStatus } = useMetarStations()
  const { vals, status: mesoStatus, fetchedAt } = useOpenMeteoParams()

  const mesoLoading = mesoStatus === 'loading'

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

      {/* Left: dewpoint map */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <MapContainer
          center={[39.5, -96.0]}
          zoom={4}
          zoomControl={false}
          attributionControl={true}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
          />
          {mapStatus === 'ok' && stations.map(st => (
            <CircleMarker
              key={st.id}
              center={[st.lat, st.lon]}
              radius={6}
              fillColor={dewColor(st.dew)}
              fillOpacity={0.85}
              color="#fff"
              weight={1}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}>
                  <strong>{st.id}</strong><br />
                  Dewpoint: {Math.round(st.dew)}°F
                  {st.temp != null && <><br />Temp: {Math.round(st.temp)}°F</>}
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* Status banner */}
        {mapStatus === 'loading' && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'rgba(9,11,20,0.85)', border: '1px solid #1e2235', borderRadius: 6,
            padding: '5px 14px', fontSize: 12, color: '#8b92b3', fontFamily: 'monospace',
          }}>
            Loading METARs…
          </div>
        )}
        {mapStatus === 'error' && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'rgba(9,11,20,0.85)', border: '1px solid #e05c5c', borderRadius: 6,
            padding: '5px 14px', fontSize: 12, color: '#e05c5c', fontFamily: 'monospace',
          }}>
            METAR data unavailable
          </div>
        )}
        {mapStatus === 'ok' && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            background: 'rgba(9,11,20,0.75)', border: '1px solid #1e2235', borderRadius: 6,
            padding: '4px 12px', fontSize: 11, color: '#8b92b3', fontFamily: 'monospace',
            pointerEvents: 'none',
          }}>
            {stations.length.toLocaleString()} stations · aviationweather.gov METAR
          </div>
        )}

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 1000,
          background: 'rgba(15,17,32,0.9)', border: '1px solid #1e2235',
          borderRadius: 6, padding: '8px 10px',
          fontSize: 12, color: '#8b92b3',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>DEWPOINT</div>
          {[['< 40°F', '#3b82f6'], ['40–55°F', '#22c55e'], ['55–65°F', '#f59e0b'], ['> 65°F', '#f97316']].map(([l, c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
              <span>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Severe parameters panel */}
      <div style={{
        width: '42%', minWidth: 280, overflowY: 'auto',
        background: '#090b14', borderLeft: '1px solid #1e2235',
        padding: '4px 12px 16px',
      }}>
        <SectionLabel>
          Severe Wx Parameters — KOKC
          {!mesoLoading && fetchedAt && (
            <span style={{ fontWeight: 400, marginLeft: 8, opacity: 0.55, textTransform: 'none', fontSize: 11 }}>
              {fetchedAt.replace('T', ' ').slice(0, 16)}Z · Open-Meteo
            </span>
          )}
        </SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {MESO_DEFS.map(def => {
            const raw   = vals[def.key]
            const num   = raw != null ? raw : 0
            const value = raw != null ? String(def.fmt(raw)) : '—'
            return (
              <ParamCard
                key={def.key}
                label={def.label}
                value={value}
                unit={def.unit}
                cat={def.cat}
                num={num}
                loading={mesoLoading}
              />
            )
          })}
        </div>

        {mesoStatus === 'error' && (
          <div style={{ fontSize: 12, color: '#e05c5c', marginTop: 8, fontFamily: 'monospace' }}>
            Open-Meteo unavailable
          </div>
        )}
      </div>

    </div>
  )
}
