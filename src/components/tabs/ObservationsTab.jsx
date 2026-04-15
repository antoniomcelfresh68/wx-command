import { useState, useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import BasemapLayers from '../BasemapLayers'
import L from 'leaflet'
import { useQuery } from '@tanstack/react-query'

delete L.Icon.Default.prototype._getIconUrl

// ── Color scales ──────────────────────────────────────────────────────────────
function dewColor(v) {
  if (v < 30) return '#4a1a6b'
  if (v < 40) return '#1a3a8f'
  if (v < 50) return '#2196f3'
  if (v < 60) return '#4caf50'
  if (v < 65) return '#ffeb3b'
  if (v < 70) return '#ff9800'
  return '#f44336'
}

function tempColor(v) {
  if (v < 32) return '#7b1fa2'
  if (v < 50) return '#2196f3'
  if (v < 65) return '#4caf50'
  if (v < 80) return '#ffeb3b'
  if (v < 95) return '#ff9800'
  return '#f44336'
}

function capeColor(v) {
  if (v == null || v < 250) return '#4b5563'
  if (v < 500)  return '#1d4ed8'
  if (v < 1000) return '#16a34a'
  if (v < 2000) return '#ca8a04'
  if (v < 3000) return '#ea580c'
  return '#dc2626'
}

function liColor(v) {
  if (v == null || v >= 0) return '#4b5563'
  if (v > -2) return '#ca8a04'
  if (v > -6) return '#ea580c'
  return '#dc2626'
}

function cinColor(v) {
  if (v == null) return '#4b5563'
  const m = Math.abs(v)
  if (m < 25)  return '#16a34a'
  if (m < 100) return '#ca8a04'
  if (m < 200) return '#ea580c'
  return '#dc2626'
}

// ── Legend config ─────────────────────────────────────────────────────────────
const DEW_LEGEND = [
  { label: '< 30°F',  color: '#4a1a6b' },
  { label: '30–40°F', color: '#1a3a8f' },
  { label: '40–50°F', color: '#2196f3' },
  { label: '50–60°F', color: '#4caf50' },
  { label: '60–65°F', color: '#ffeb3b' },
  { label: '65–70°F', color: '#ff9800' },
  { label: '> 70°F',  color: '#f44336' },
]
const TEMP_LEGEND = [
  { label: '< 32°F',  color: '#7b1fa2' },
  { label: '32–50°F', color: '#2196f3' },
  { label: '50–65°F', color: '#4caf50' },
  { label: '65–80°F', color: '#ffeb3b' },
  { label: '80–95°F', color: '#ff9800' },
  { label: '> 95°F',  color: '#f44336' },
]
const CAPE_LEGEND = [
  { label: '< 250',    color: '#4b5563' },
  { label: '250–500',  color: '#1d4ed8' },
  { label: '500–1000', color: '#16a34a' },
  { label: '1k–2k',   color: '#ca8a04' },
  { label: '2k–3k',   color: '#ea580c' },
  { label: '> 3000',  color: '#dc2626' },
]
const LI_LEGEND = [
  { label: '≥ 0 (stable)',   color: '#4b5563' },
  { label: '0 to −2',        color: '#ca8a04' },
  { label: '−2 to −6',       color: '#ea580c' },
  { label: '< −6 (extreme)', color: '#dc2626' },
]
const CIN_LEGEND = [
  { label: '< 25 J/kg',   color: '#16a34a' },
  { label: '25–100',      color: '#ca8a04' },
  { label: '100–200',     color: '#ea580c' },
  { label: '> 200 J/kg',  color: '#dc2626' },
]

// ── Map controller ────────────────────────────────────────────────────────────
function MapController({ lat, lon }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lon], 5) }, [lat, lon, map])
  return null
}

// ── Station grid — ~150 major ASOS locations across CONUS ─────────────────────
// [id, lat, lon]
const STATIONS = [
  // Maine / NH / VT / MA / RI / CT
  ['KBGR', 44.807, -68.828], ['KPWM', 43.646, -70.309],
  ['KMHT', 42.932, -71.435], ['KBTV', 44.472, -73.153],
  ['KBOS', 42.362, -71.006], ['KPVD', 41.723, -71.428],
  ['KBDL', 41.938, -72.683],
  // New York
  ['KJFK', 40.641, -73.778], ['KLGA', 40.777, -73.873],
  ['KBUF', 42.940, -78.732], ['KSYR', 43.111, -76.107],
  ['KROC', 43.118, -77.672], ['KALB', 42.748, -73.802],
  // NJ / PA / DE / MD
  ['KEWR', 40.692, -74.169], ['KPHL', 39.872, -75.241],
  ['KPIT', 40.491, -80.233], ['KBWI', 39.175, -76.668],
  ['KDCA', 38.852, -77.037], ['KIAD', 38.953, -77.456],
  // VA / WV / NC / SC
  ['KORF', 36.898, -76.018], ['KRIC', 37.505, -77.320],
  ['KCRW', 38.374, -81.593],
  ['KRDU', 35.877, -78.787], ['KCLT', 35.214, -80.943],
  ['KCAE', 33.938, -81.119], ['KCHS', 32.899, -80.040],
  // GA / FL
  ['KATL', 33.641, -84.427], ['KSAV', 32.127, -81.202],
  ['KJAX', 30.494, -81.688], ['KTLH', 30.396, -84.350],
  ['KMCO', 28.429, -81.309], ['KTPA', 27.975, -82.533],
  ['KMIA', 25.796, -80.287], ['KFLL', 26.073, -80.152],
  ['KPNS', 30.473, -87.187],
  // AL / MS / TN / KY
  ['KBHM', 33.563, -86.753], ['KHSV', 34.722, -86.775],
  ['KMOB', 30.691, -88.243], ['KJAN', 32.311, -90.076],
  ['KBNA', 36.124, -86.678], ['KMEM', 35.042, -89.977],
  ['KSDF', 38.174, -85.736], ['KLEX', 38.036, -84.606],
  // OH / IN / MI
  ['KCLE', 41.412, -81.850], ['KCMH', 39.998, -82.892],
  ['KDAY', 39.902, -84.219], ['KIND', 39.717, -86.294],
  ['KEVV', 38.037, -87.532], ['KDTW', 42.212, -83.353],
  ['KGRR', 42.881, -85.523], ['KSBN', 41.709, -86.317],
  // IL / WI / MN
  ['KORD', 41.978, -87.905], ['KMDW', 41.786, -87.752],
  ['KRFD', 42.195, -89.097], ['KSPI', 39.844, -89.678],
  ['KMKE', 42.947, -87.897], ['KGRB', 44.485, -88.130],
  ['KEAU', 44.866, -91.484], ['KMSP', 44.882, -93.222],
  ['KDLH', 46.842, -92.194],
  // IA / MO / AR
  ['KDSM', 41.534, -93.663], ['KCID', 41.885, -91.711],
  ['KSTL', 38.748, -90.370], ['KSGF', 37.246, -93.389],
  ['KCOU', 38.818, -92.220], ['KLIT', 34.729, -92.224],
  ['KFSM', 35.336, -94.367],
  // LA
  ['KMSY', 29.993, -90.258], ['KBTR', 30.533, -91.150],
  ['KSHV', 32.446, -93.826],
  // ND / SD / NE / KS
  ['KBIS', 46.773, -100.747], ['KFAR', 46.921, -96.816],
  ['KGFK', 47.949, -97.176],  ['KRAP', 44.045, -103.057],
  ['KABR', 45.449, -98.422],
  ['KOMA', 41.303, -95.894],  ['KLNK', 40.851, -96.759],
  ['KGRI', 40.968, -98.310],  ['KMCK', 40.206, -100.592],
  ['KICT', 37.650, -97.433],  ['KTOP', 39.069, -95.663],
  ['KHYS', 38.842, -99.273],  ['KGLD', 39.370, -101.699],
  // OK / TX
  ['KOKC', 35.393, -97.601],  ['KTUL', 36.198, -95.888],
  ['KDFW', 32.897, -97.038],  ['KDAL', 32.847, -96.852],
  ['KIAH', 29.984, -95.341],  ['KHOU', 29.645, -95.279],
  ['KSAT', 29.534, -98.469],  ['KAUS', 30.194, -97.670],
  ['KELP', 31.807, -106.378], ['KAMA', 35.219, -101.706],
  ['KLBB', 33.663, -101.823], ['KABI', 32.411, -99.682],
  ['KMAF', 31.943, -102.202], ['KCRP', 27.770, -97.501],
  ['KSJT', 31.357, -100.496],
  // MT / ID / WY
  ['KBIL', 45.808, -108.543], ['KBZN', 45.778, -111.160],
  ['KGTF', 47.482, -111.371], ['KHLN', 46.607, -111.983],
  ['KMSO', 46.916, -114.091], ['KBOI', 43.564, -116.223],
  ['KTWF', 42.482, -114.488], ['KPIH', 42.910, -112.596],
  ['KCPR', 42.908, -106.464], ['KRIW', 43.064, -108.460],
  // CO / NM / UT
  ['KDEN', 39.856, -104.674], ['KCOS', 38.806, -104.701],
  ['KGJT', 39.122, -108.527], ['KPUB', 38.289, -104.497],
  ['KABQ', 35.040, -106.609], ['KROW', 33.302, -104.531],
  ['KSLC', 40.788, -111.978],
  // NV / AZ
  ['KLAS', 36.080, -115.152], ['KRNO', 39.499, -119.768],
  ['KEKO', 40.825, -115.792],
  ['KPHX', 33.437, -112.008], ['KTUS', 32.116, -110.941],
  ['KYUM', 32.657, -114.606], ['KFLG', 35.138, -111.671],
  // CA
  ['KLAX', 33.943, -118.408], ['KSAN', 32.734, -117.190],
  ['KSFO', 37.621, -122.375], ['KSMF', 38.695, -121.591],
  ['KFAT', 36.776, -119.718], ['KBFL', 35.434, -119.057],
  ['KOAK', 37.721, -122.221],
  // OR / WA
  ['KPDX', 45.590, -122.595], ['KSEA', 47.449, -122.309],
  ['KGEG', 47.620, -117.534], ['KYKM', 46.568, -120.544],
  ['KMFR', 42.374, -122.873], ['KEUG', 44.125, -123.212],
  ['KBLI', 48.793, -122.537],
]

// ── Fetch via Open-Meteo in sequential batches of 10 ─────────────────────────
const BATCH_SIZE = 10

async function fetchStations() {
  const results = []

  for (let i = 0; i < STATIONS.length; i += BATCH_SIZE) {
    const batch = STATIONS.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async ([id, lat, lon]) => {
        try {
          const r = await fetch(
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,dewpoint_2m,cape,convective_inhibition` +
            `&hourly=lifted_index&forecast_hours=1` +
            `&temperature_unit=fahrenheit&timezone=auto`
          )
          if (!r.ok) return null
          const data = await r.json()
          const cur = data?.current
          const tmp = cur?.temperature_2m
          const dew = cur?.dewpoint_2m
          if (tmp == null || dew == null) return null
          const cape = cur?.cape ?? null
          const cin  = cur?.convective_inhibition ?? null
          const li   = data?.hourly?.lifted_index?.[0] ?? null
          return { id, lat, lon, tmp, dew, cape, cin, li }
        } catch {
          return null
        }
      })
    )
    results.push(...batchResults.filter(Boolean))
  }

  console.log(`[ObservationsTab] fetched ${results.length} / ${STATIONS.length} stations successfully`)
  return results
}

function useObsStations() {
  return useQuery({
    queryKey: ['obs-stations-openmeteo'],
    queryFn: fetchStations,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
  })
}

// ── Main component ────────────────────────────────────────────────────────────
const MODE_CONFIG = {
  dew:  { colorFn: dewColor,  legend: DEW_LEGEND,  label: 'Dewpoint °F',  unit: '°F',    fmt: v => v != null ? `${Math.round(v)}°F` : '—' },
  temp: { colorFn: tempColor, legend: TEMP_LEGEND, label: 'Temperature °F', unit: '°F',  fmt: v => v != null ? `${Math.round(v)}°F` : '—' },
  cape: { colorFn: capeColor, legend: CAPE_LEGEND, label: 'CAPE J/kg',    unit: 'J/kg',  fmt: v => v != null ? Math.round(v) : '—' },
  li:   { colorFn: liColor,   legend: LI_LEGEND,   label: 'Lifted Index', unit: '',      fmt: v => v != null ? v.toFixed(1) : '—' },
  cin:  { colorFn: cinColor,  legend: CIN_LEGEND,  label: 'CIN J/kg',     unit: 'J/kg',  fmt: v => v != null ? Math.round(v) : '—' },
}

const STATION_VALUE = {
  dew:  s => s.dew,
  temp: s => s.tmp,
  cape: s => s.cape,
  li:   s => s.li,
  cin:  s => s.cin,
}

const TOGGLE_MODES = [
  { id: 'dew',  label: 'Dewpoint' },
  { id: 'temp', label: 'Temp' },
  { id: 'cape', label: 'CAPE' },
  { id: 'li',   label: 'LI' },
  { id: 'cin',  label: 'CIN' },
]

export default function ObservationsTab({ location }) {
  const [mode, setMode] = useState('dew')

  const { data: stations, isLoading, isError, error } = useObsStations()

  const { colorFn, legend: activeLegend, label: modeLabel } = MODE_CONFIG[mode]
  const visibleStations = stations ?? []

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <MapContainer
        center={[location.lat, location.lon]}
        zoom={5}
        zoomControl={false}
        attributionControl={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <BasemapLayers />

        {/* Station markers */}
        {visibleStations.map(s => (
          <CircleMarker
            key={s.id}
            center={[s.lat, s.lon]}
            radius={12}
            pathOptions={{
              fillColor: colorFn(STATION_VALUE[mode](s)),
              fillOpacity: 0.85,
              stroke: false,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
              <span style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }}>
                <strong>{s.id}</strong><br />
                Tmp: {Math.round(s.tmp)}°F · Dew: {Math.round(s.dew)}°F<br />
                CAPE: {s.cape != null ? Math.round(s.cape) : '—'} · LI: {s.li != null ? s.li.toFixed(1) : '—'} · CIN: {s.cin != null ? Math.round(s.cin) : '—'}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Selected location pin */}
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

      {/* Toggle — top right */}
      <div style={{
        position: 'absolute', top: 12, right: 14, zIndex: 1000,
        display: 'flex', borderRadius: 5, overflow: 'hidden',
        border: '1px solid #1e2235',
      }}>
        {TOGGLE_MODES.map(({ id, label }, i) => {
          const active = mode === id
          return (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                padding: '6px 14px',
                background: active ? 'rgba(59,130,246,0.18)' : 'rgba(15,17,32,0.88)',
                color: active ? '#3b82f6' : '#8b92b3',
                border: 'none',
                borderLeft: i > 0 ? '1px solid #1e2235' : 'none',
                fontSize: 12, fontWeight: active ? 600 : 400,
                cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.04em',
                transition: 'background 0.1s, color 0.1s',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* HUD label — top left */}
      <div style={{
        position: 'absolute', top: 12, left: 14, zIndex: 1000, pointerEvents: 'none',
        fontSize: 11, color: '#f0f2ff', opacity: 0.45,
        fontFamily: 'monospace', letterSpacing: '0.06em',
      }}>
        {isLoading
          ? `Loading observations… (0 / ${STATIONS.length})`
          : isError
            ? `Fetch error: ${error?.message ?? 'unavailable'}`
            : `${visibleStations.length} stations · Open-Meteo`
        }
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 999, pointerEvents: 'none',
        }}>
          <span style={{
            background: 'rgba(9,11,20,0.82)', border: '1px solid #1e2235',
            borderRadius: 6, padding: '8px 18px',
            fontSize: 13, color: '#8b92b3', fontFamily: 'monospace',
          }}>
            Fetching station observations…
          </span>
        </div>
      )}

      {/* Error overlay */}
      {isError && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          zIndex: 999, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 13, color: '#ef4444', fontFamily: 'monospace' }}>
            Observation data unavailable
          </span>
          <span style={{ fontSize: 11, color: '#8b92b3', fontFamily: 'monospace', opacity: 0.6 }}>
            {error?.message}
          </span>
        </div>
      )}

      {/* Legend — bottom left */}
      <div style={{
        position: 'absolute', bottom: 12, left: 14, zIndex: 1000,
        background: 'rgba(15,17,32,0.90)', border: '1px solid #1e2235',
        borderRadius: 6, padding: '8px 10px',
        fontSize: 11, color: '#8b92b3',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        <div style={{
          fontWeight: 700, marginBottom: 3,
          textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10,
        }}>
          {modeLabel}
        </div>
        {activeLegend.map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 11, height: 11, background: color, flexShrink: 0,
              borderRadius: 2, border: '1px solid rgba(255,255,255,0.12)',
            }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
