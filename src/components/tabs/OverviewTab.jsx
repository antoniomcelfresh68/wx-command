import 'leaflet/dist/leaflet.css'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, WMSTileLayer } from 'react-leaflet'
import L from 'leaflet'
import { PanelShell, PanelHeader } from '../shared'

// Suppress Vite asset-hash warning for default Leaflet icons (not used here)
delete L.Icon.Default.prototype._getIconUrl

// ── Live NEXRAD radar via IEM WMS ─────────────────────────────────────────────
function RadarMap() {
  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <MapContainer
        center={[38.0, -97.0]}
        zoom={4}
        zoomControl={false}
        attributionControl={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {/* Dark base map */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        />
        {/* IEM NEXRAD composite reflectivity WMS overlay */}
        <WMSTileLayer
          url="https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi"
          layers="nexrad-n0r"
          format="image/png"
          transparent={true}
          version="1.1.1"
          opacity={0.8}
        />
      </MapContainer>
      {/* HUD label */}
      <div style={{
        position: 'absolute', bottom: 10, left: 12, zIndex: 1000, pointerEvents: 'none',
        fontSize: 11, color: '#f0f2ff', opacity: 0.55, fontFamily: 'monospace', letterSpacing: '0.06em',
      }}>
        NEXRAD N0R · IEM WMS
      </div>
    </div>
  )
}

// ── SPC Day 1 category via point-in-polygon on live GeoJSON ──────────────────
const SPC_RISK_RANK  = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }
const SPC_RISK_COLOR = {
  'NO RISK': '#8b92b3', TSTM: '#c1e9c1', MRGL: '#55bb55',
  SLGT: '#f6f67b', ENH: '#e8a126', MDT: '#e05c5c', HIGH: '#ff00ff',
}

// Ray-casting point-in-polygon (exterior ring only; sufficient for SPC polygons)
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
              : geom.type === 'MultiPolygon' ? geom.coordinates
              : []
  return polys.some(poly => pointInRing(lon, lat, poly[0]))
}

function deriveDay1Category(geojson, lat, lon) {
  let bestRank = 0, bestLabel = 'NO RISK'
  for (const f of geojson.features ?? []) {
    const label = (f.properties?.LABEL ?? '').toUpperCase()
    const rank  = SPC_RISK_RANK[label] ?? 0
    if (rank > bestRank && pointInFeature(lon, lat, f.geometry)) {
      bestRank = rank; bestLabel = label
    }
  }
  return bestLabel
}

function useSpcDay1(lat, lon) {
  const { data, isLoading } = useQuery({
    queryKey: ['spc-day1-geo'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
  })
  if (isLoading || !data) return { category: '…', color: '#8b92b3', loading: true }
  const category = deriveDay1Category(data, lat, lon)
  return { category, color: SPC_RISK_COLOR[category] ?? '#8b92b3', loading: false }
}

// ── Local alerts for selected location ───────────────────────────────────────
function useLocalAlerts(lat, lon) {
  const { data, isLoading } = useQuery({
    queryKey: ['local-alerts-count', lat, lon],
    queryFn: () =>
      fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
        headers: { Accept: 'application/geo+json' },
      }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
  if (isLoading || !data) return { value: '…', loading: true }
  return { value: (data.features?.length ?? 0).toLocaleString(), loading: false }
}

// ── Open-Meteo CAPE + CIN for selected location ───────────────────────────────
function useConvectiveParams(lat, lon) {
  return useQuery({
    queryKey: ['convective', lat, lon],
    queryFn: () =>
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=cape,convective_inhibition&wind_speed_unit=kn&forecast_days=1`
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}

// ── Station METAR helpers ────────────────────────────────────────────────────
function skyCondition(m) {
  const wx = m.wxString ?? ''
  if (wx.includes('TS'))             return 'Thunderstorm'
  if (wx.includes('RA'))             return 'Rain'
  if (wx.includes('SN'))             return 'Snow'
  if (wx.includes('FG') || wx.includes('BR')) return 'Fog / Mist'
  if (wx.includes('DZ'))             return 'Drizzle'
  if (wx.includes('FZRA'))           return 'Freezing Rain'
  switch (m.cover) {
    case 'CLR': case 'SKC': case 'CAVOK': return 'Clear'
    case 'FEW':  return 'Few Clouds'
    case 'SCT':  return 'Partly Cloudy'
    case 'BKN':  return 'Mostly Cloudy'
    case 'OVC':  return 'Overcast'
    default:     return m.cover || null
  }
}

function ceilFeet(clouds) {
  if (!Array.isArray(clouds)) return null
  const layer = clouds.find(c => c.cover === 'BKN' || c.cover === 'OVC')
  return layer?.base != null ? layer.base * 100 : null
}

function dewHumidity(tempC, dewpC) {
  if (tempC == null || dewpC == null) return null
  const a = 17.625, b = 243.04
  return Math.round(100 * Math.exp(a * dewpC / (b + dewpC)) / Math.exp(a * tempC / (b + tempC)))
}

function degToCard(d) {
  if (d == null) return null
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(d / 22.5) % 16]
}

function fmtObsTime(unix) {
  if (!unix) return null
  const d = new Date(unix * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
  return `${dd} ${mo} ${hh}:${mm}Z`
}

function parseAvMetar(arr) {
  const m = arr?.[0]
  if (!m) return null
  const tempC  = m.temp != null ? parseFloat(m.temp) : null
  const dewpC  = m.dewp != null ? parseFloat(m.dewp) : null
  return {
    stationId:    m.icaoId || m.stationId || null,
    tempF:        tempC != null ? Math.round(tempC * 9/5 + 32) : null,
    dewpF:        dewpC != null ? Math.round(dewpC * 9/5 + 32) : null,
    condition:    skyCondition(m),
    humidity:     dewHumidity(tempC, dewpC),
    windDir:      degToCard(m.wdir),
    windSpd:      m.wspd != null ? Math.round(parseFloat(m.wspd)) : null,
    gusts:        m.wgst != null ? Math.round(parseFloat(m.wgst)) : null,
    pressureInHg: m.altim != null ? (parseFloat(m.altim) * 0.02953).toFixed(2) : null,
    visibMi:      m.visib != null ? parseFloat(m.visib) : null,
    ceiling:      ceilFeet(m.clouds),
    obsTime:      fmtObsTime(m.obsTime),
  }
}

function parseIemObs(data) {
  // IEM obhistory returns { data: [{tmpf, dwpf, drct, sknt, gust, alti, vsby, ...}] }
  const rows = data?.data
  const m = Array.isArray(rows) ? rows[rows.length - 1] : null
  if (!m) return null
  const tempF = m.tmpf != null ? Math.round(parseFloat(m.tmpf)) : null
  const dewpF = m.dwpf != null ? Math.round(parseFloat(m.dwpf)) : null
  // derive humidity from °F values (convert back to °C for Magnus)
  const tempC = tempF != null ? (tempF - 32) * 5/9 : null
  const dewpC = dewpF != null ? (dewpF - 32) * 5/9 : null
  return {
    stationId:    null,
    tempF,
    dewpF,
    condition:    null,
    humidity:     dewHumidity(tempC, dewpC),
    windDir:      degToCard(m.drct != null ? parseFloat(m.drct) : null),
    windSpd:      m.sknt != null ? Math.round(parseFloat(m.sknt)) : null,
    gusts:        m.gust != null ? Math.round(parseFloat(m.gust)) : null,
    pressureInHg: m.alti != null ? parseFloat(m.alti).toFixed(2) : null,
    visibMi:      m.vsby != null ? parseFloat(m.vsby) : null,
    ceiling:      null,
    obsTime:      m.valid ?? null,
  }
}

function useStationMetar(stationId) {
  return useQuery({
    queryKey: ['station-metar', stationId],
    enabled: !!stationId,
    queryFn: async () => {
      // Primary: aviationweather.gov
      try {
        const r = await fetch(
          `https://aviationweather.gov/api/data/metar?ids=${stationId}&format=json&taf=false&hours=1`
        )
        if (r.ok) {
          const parsed = parseAvMetar(await r.json())
          if (parsed) return parsed
        }
      } catch (_) {}
      // Fallback: IEM obhistory
      try {
        const r2 = await fetch(
          `https://mesonet.agron.iastate.edu/api/1/obhistory.json?station=${stationId}&network=OK_ASOS&hours=3`
        )
        if (r2.ok) {
          const parsed = parseIemObs(await r2.json())
          if (parsed) return parsed
        }
      } catch (_) {}
      return null   // all sources failed — card shows "—" for everything
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  })
}

// ── Main layout ───────────────────────────────────────────────────────────────
function capeColor(v) {
  if (v == null) return '#8b92b3'
  if (v < 500)   return '#22c55e'
  if (v < 1500)  return '#f59e0b'
  if (v < 2500)  return '#f97316'
  return '#ef4444'
}
function cinColor(v) {
  if (v == null) return '#8b92b3'
  if (v > -25)   return '#22c55e'
  if (v > -100)  return '#f59e0b'
  if (v > -250)  return '#f97316'
  return '#ef4444'
}

// helper: format a nullable value with optional suffix
function fmt(v, suffix = '') {
  return v != null ? `${v}${suffix}` : '—'
}

export default function OverviewTab({ location }) {
  const { category: day1Cat, color: day1Color, loading: day1Loading } = useSpcDay1(location.lat, location.lon)
  const { data: convData, isLoading: convLoading } = useConvectiveParams(location.lat, location.lon)
  const { value: localWarnCount, loading: localWarnLoading } = useLocalAlerts(location.lat, location.lon)
  const { data: metar, isLoading: metarLoading } = useStationMetar(location.stationId ?? null)

  const cape = convData?.current?.cape
  const cin  = convData?.current?.convective_inhibition

  // Derived display values
  const stationLabel = location.label
  const tempDisplay  = metar?.tempF != null ? String(metar.tempF) : '—'
  const condDisplay  = metar?.condition ?? (metarLoading ? '…' : '—')
  const windDisplay  = metar
    ? (metar.windDir && metar.windSpd != null ? `${metar.windDir} ${metar.windSpd} kt` : '—')
    : (metarLoading ? '…' : '—')

  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 12,
        padding: 12,
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      {/* Left column: Radar — spans both rows */}
      <PanelShell style={{ gridColumn: '1', gridRow: '1 / 3' }}>
        <PanelHeader label="NEXRAD Radar" right="IEM · N0R Composite" />
        <RadarMap />
      </PanelShell>

      {/* Right top: Current Conditions */}
      <PanelShell style={{ gridColumn: '2', gridRow: '1' }}>
        <PanelHeader label="Current Conditions" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px', gap: 10, overflow: 'hidden' }}>
          {/* Station + live dot */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#22c55e', flexShrink: 0,
                animation: 'livePulse 2s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 14, color: '#8b92b3' }}>{stationLabel}</span>
            </div>
            {metar?.obsTime && (
              <span style={{ fontSize: 11, color: '#8b92b3', opacity: 0.5, paddingLeft: 13, fontFamily: 'monospace' }}>
                {metar.obsTime}
              </span>
            )}
          </div>
          {/* Big temp */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
            {tempDisplay === '—'
              ? <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color: '#8b92b3' }}>—</span>
              : <>
                  <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color: '#f0f2ff' }}>{tempDisplay}</span>
                  <span style={{ fontSize: 22, color: '#8b92b3', marginTop: 6 }}>°F</span>
                </>
            }
          </div>
          <div style={{ fontSize: 16, color: condDisplay === '—' ? '#8b92b3' : '#f0f2ff', marginTop: -4 }}>{condDisplay}</div>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 4 }}>
            {[
              { k: 'Dewpoint',   v: fmt(metar?.dewpF,        '°F') },
              { k: 'Humidity',   v: fmt(metar?.humidity,     '%')  },
              { k: 'Wind',       v: windDisplay                    },
              { k: 'Gusts',      v: fmt(metar?.gusts,        ' kt') },
              { k: 'Pressure',   v: fmt(metar?.pressureInHg, ' in') },
              { k: 'Visibility', v: metar?.visibMi != null ? `${metar.visibMi} mi` : '—' },
            ].map(({ k, v }) => (
              <div key={k}>
                <div style={{ fontSize: 12, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: v === '—' ? '#8b92b3' : '#f0f2ff', marginTop: 1 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </PanelShell>

      {/* Right bottom: Severe Highlights */}
      <PanelShell style={{ gridColumn: '2', gridRow: '2' }}>
        <PanelHeader label="Severe Highlights" />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', overflow: 'hidden' }}>
          {[
            { label: 'SPC Day 1',      value: day1Cat,                                                   unit: '',     color: day1Color,        dim: 'SPC · Day 1 Categorical',   live: false, loading: day1Loading      },
            { label: 'CAPE',           value: cape != null ? Math.round(cape).toLocaleString() : '…',    unit: 'J/kg', color: capeColor(cape),  dim: 'Open-Meteo · surface',      live: false, loading: convLoading      },
            { label: 'CIN',            value: cin  != null ? Math.round(cin).toLocaleString()  : '…',    unit: 'J/kg', color: cinColor(cin),    dim: 'Open-Meteo · surface',      live: false, loading: convLoading      },
            { label: 'Local Warnings', value: localWarnCount,                                             unit: '',     color: '#ef4444',        dim: 'Live · api.weather.gov',    live: true,  loading: localWarnLoading },
          ].map((item, i) => (
            <div
              key={item.label}
              style={{
                padding: '14px 16px',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6,
                borderRight: i % 2 === 0 ? '1px solid #1e2235' : 'none',
                borderBottom: i < 2 ? '1px solid #1e2235' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0,
                  animation: item.live ? 'livePulse 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{
                  fontSize: 22, fontWeight: 700, lineHeight: 1,
                  color: item.loading ? '#8b92b3' : '#f0f2ff',
                  fontFamily: item.loading ? 'inherit' : 'inherit',
                }}>
                  {item.value}
                </span>
                {item.unit && <span style={{ fontSize: 12, color: '#8b92b3' }}>{item.unit}</span>}
              </div>
              <span style={{ fontSize: 12, color: '#8b92b3', opacity: 0.6 }}>{item.live ? 'Live · api.weather.gov' : item.dim}</span>
            </div>
          ))}
        </div>
      </PanelShell>
    </div>
  )
}
