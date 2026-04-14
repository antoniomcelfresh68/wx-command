import { useState, useEffect, useCallback, useMemo } from 'react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, WMSTileLayer, GeoJSON, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import BasemapLayers from '../BasemapLayers'
import L from 'leaflet'
import { useQuery } from '@tanstack/react-query'
import { PanelShell, PanelHeader } from '../shared'

delete L.Icon.Default.prototype._getIconUrl

// ── Constants ────────────────────────────────────────────────────────────────

const REPORT_COLORS = { torn: '#ef4444', wind: '#f59e0b', hail: '#4ade80' }

const MESO_PRODUCTS = [
  { id: 'sbcape',  label: 'SB CAPE' },
  { id: 'mlcape',  label: 'ML CAPE' },
  { id: 'esrh',    label: 'Eff. SRH' },
  { id: 'stp',     label: 'STP' },
  { id: 'ehi',     label: 'EHI' },
  { id: 'effbwd',  label: 'Eff. Shear' },
  { id: 'sfcp',    label: 'Sfc Analysis' },
]

const SPC_COLORS = {
  TSTM: '#c1e9c1', MRGL: '#55bb55', SLGT: '#f6f67b',
  ENH: '#e8a126',  MDT: '#e05c5c',  HIGH: '#ff00ff',
}

const WARN_STYLES = {
  'Tornado Warning':             { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.30, weight: 3.5, opacity: 1 },
  'Severe Thunderstorm Warning': { color: '#f97316', fillColor: '#f97316', fillOpacity: 0.25, weight: 3,   opacity: 1 },
  'Tornado Watch':               { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.15, weight: 2.5, opacity: 1, dashArray: '8 5' },
  'Severe Thunderstorm Watch':   { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.15, weight: 2.5, opacity: 1, dashArray: '8 5' },
}

// ── Upper-air rawinsonde stations (WMO ID, name, lat, lon) ───────────────────
// sid = NWS station ID used in SPC sounding archive filenames
const UPPER_AIR_STATIONS = [
  { sid: 'EYW', name: 'Key West, FL',       lat: 24.55, lon: -81.75 },
  { sid: 'TBW', name: 'Tampa, FL',          lat: 27.70, lon: -82.40 },
  { sid: 'TLH', name: 'Tallahassee, FL',    lat: 30.38, lon: -84.37 },
  { sid: 'FFC', name: 'Peachtree City, GA', lat: 33.35, lon: -84.57 },
  { sid: 'CRP', name: 'Corpus Christi, TX', lat: 27.77, lon: -97.50 },
  { sid: 'LCH', name: 'Lake Charles, LA',   lat: 30.12, lon: -93.22 },
  { sid: 'LIX', name: 'New Orleans, LA',    lat: 29.98, lon: -90.05 },
  { sid: 'JAN', name: 'Jackson, MS',        lat: 32.32, lon: -90.08 },
  { sid: 'BMX', name: 'Birmingham, AL',     lat: 33.17, lon: -86.77 },
  { sid: 'CHS', name: 'Charleston, SC',     lat: 32.90, lon: -80.03 },
  { sid: 'LZK', name: 'Little Rock, AR',    lat: 34.83, lon: -92.25 },
  { sid: 'OHX', name: 'Nashville, TN',      lat: 36.25, lon: -86.57 },
  { sid: 'BRO', name: 'Brownsville, TX',    lat: 25.90, lon: -97.43 },
  { sid: 'DRT', name: 'Del Rio, TX',        lat: 29.37, lon: -100.92 },
  { sid: 'MAF', name: 'Midland, TX',        lat: 31.93, lon: -102.18 },
  { sid: 'AMA', name: 'Amarillo, TX',       lat: 35.23, lon: -101.70 },
  { sid: 'FWD', name: 'Fort Worth, TX',     lat: 32.83, lon: -97.30 },
  { sid: 'OUN', name: 'Norman, OK',         lat: 35.18, lon: -97.44 },
  { sid: 'DDC', name: 'Dodge City, KS',     lat: 37.77, lon: -99.97 },
  { sid: 'DNR', name: 'Denver, CO',         lat: 39.75, lon: -104.87 },
  { sid: 'SLC', name: 'Salt Lake City, UT', lat: 40.77, lon: -111.97 },
  { sid: 'WAL', name: 'Wallops Island, VA', lat: 37.93, lon: -75.48 },
  { sid: 'PIT', name: 'Pittsburgh, PA',     lat: 40.48, lon: -80.22 },
  { sid: 'BUF', name: 'Buffalo, NY',        lat: 42.93, lon: -78.73 },
  { sid: 'ALB', name: 'Albany, NY',         lat: 42.70, lon: -73.83 },
  { sid: 'DTX', name: 'Detroit, MI',        lat: 42.23, lon: -83.74 },
  { sid: 'ILX', name: 'Lincoln, IL',        lat: 40.15, lon: -89.35 },
  { sid: 'OAX', name: 'Omaha, NE',          lat: 41.37, lon: -96.37 },
  { sid: 'TOP', name: 'Topeka, KS',         lat: 39.07, lon: -95.62 },
  { sid: 'RIW', name: 'Riverton, WY',       lat: 43.07, lon: -108.45 },
  { sid: 'CAR', name: 'Caribou, ME',        lat: 46.87, lon: -68.02 },
  { sid: 'OKX', name: 'Upton, NY',          lat: 40.87, lon: -72.87 },
  { sid: 'UNR', name: 'Rapid City, SD',     lat: 44.07, lon: -103.07 },
  { sid: 'MPX', name: 'Chanhassen, MN',     lat: 44.83, lon: -93.57 },
  { sid: 'ABR', name: 'Aberdeen, SD',       lat: 45.45, lon: -98.43 },
  { sid: 'MFR', name: 'Medford, OR',        lat: 42.38, lon: -122.87 },
  { sid: 'GRB', name: 'Green Bay, WI',      lat: 44.48, lon: -88.13 },
  { sid: 'DLH', name: 'Duluth, MN',         lat: 46.83, lon: -92.18 },
  { sid: 'BIS', name: 'Bismarck, ND',       lat: 46.77, lon: -100.75 },
  { sid: 'GTF', name: 'Great Falls, MT',    lat: 47.47, lon: -111.38 },
  { sid: 'GYX', name: 'Gray, ME',           lat: 43.90, lon: -70.25 },
  { sid: 'OAK', name: 'Oakland, CA',        lat: 37.73, lon: -122.22 },
  { sid: 'VBG', name: 'Vandenberg, CA',     lat: 34.73, lon: -120.57 },
]

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, toR = Math.PI / 180
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function nearestStation(lat, lon) {
  return UPPER_AIR_STATIONS.reduce((best, s) => {
    const d = haversine(lat, lon, s.lat, s.lon)
    return d < best.dist ? { station: s, dist: d } : best
  }, { station: UPPER_AIR_STATIONS[0], dist: Infinity }).station
}

// Returns time info for the most recently available sounding (00Z or 12Z).
// SPC archives are available ~1-2 hrs after launch time (00Z ready ~02Z, 12Z ready ~14Z).
function getSoundingTime() {
  const now = new Date()
  const utcH = now.getUTCHours()
  let d = new Date(now)
  let hour
  if (utcH >= 14)      { hour = 12 }
  else if (utcH >= 2)  { hour = 0 }
  else {
    d.setUTCDate(d.getUTCDate() - 1)
    hour = 12
  }
  const year  = String(d.getUTCFullYear())
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day   = String(d.getUTCDate()).padStart(2, '0')
  const hh    = String(hour).padStart(2, '0')
  return {
    dt:         `${year}${month}${day}${hh}`,   // YYYYMMDDHH — SPC archive key
    hourLabel:  `${hh}Z`,
  }
}

// ── Color threshold helpers ───────────────────────────────────────────────────

function capeColor(v) {
  if (v == null) return '#8b92b3'
  if (v >= 3000) return '#ef4444'
  if (v >= 2000) return '#f97316'
  if (v >= 1000) return '#f59e0b'
  if (v >= 500)  return '#22c55e'
  return '#8b92b3'
}
function cinColor(v) {
  if (v == null) return '#8b92b3'
  if (v > -25)  return '#ef4444'
  if (v > -50)  return '#f59e0b'
  if (v > -100) return '#22c55e'
  return '#3b82f6'
}
function liColor(v) {
  if (v == null) return '#8b92b3'
  if (v <= -6) return '#ef4444'
  if (v <= -4) return '#f97316'
  if (v <= -2) return '#f59e0b'
  if (v < 0)   return '#22c55e'
  return '#8b92b3'
}
function shearColor(v) {
  if (v == null) return '#8b92b3'
  if (v >= 60) return '#ef4444'
  if (v >= 40) return '#f97316'
  if (v >= 30) return '#f59e0b'
  if (v >= 20) return '#22c55e'
  return '#8b92b3'
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function parseReportsCsv(text, type) {
  if (!text || typeof text !== 'string') return []
  return text.trim().split('\n').slice(1).reduce((acc, line) => {
    const parts = line.split(',')
    const lat = parseFloat(parts[5])
    const lon = parseFloat(parts[6])
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0) {
      // SPC uses positive values for western hemisphere longitudes
      acc.push({ lat, lon: lon > 0 ? -lon : lon, time: parts[0] ?? '', loc: parts[2] ?? '', state: parts[4] ?? '', mag: parts[1] ?? '', type })
    }
    return acc
  }, [])
}


function styleOutlook(feature) {
  const label = (feature.properties?.LABEL || '').toUpperCase()
  const color = SPC_COLORS[label] || '#888'
  return { color, fillColor: color, fillOpacity: 0.30, weight: 1.5, opacity: 0.8 }
}

function styleWarning(feature) {
  return WARN_STYLES[feature?.properties?.event] ?? { color: '#8b92b3', fillColor: '#8b92b3', fillOpacity: 0.15, weight: 2 }
}

function styleWatch(feature) {
  const type = feature?.properties?.type
  return type === 'TOR'
    ? { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.12, weight: 2.5, dashArray: '8 5' }
    : { color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.12, weight: 2.5, dashArray: '8 5' }
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useStormReports(enabled) {
  const mkQuery = (path, type) => useQuery({   // eslint-disable-line react-hooks/rules-of-hooks
    queryKey: ['spc-reports-' + type],
    queryFn: () => fetch(path).then(r => { if (!r.ok) throw new Error(r.status); return r.text() }).then(t => parseReportsCsv(t, type)),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled,
    retry: false,
  })
  const torn = mkQuery('/api/spc-torn', 'torn')
  const wind = mkQuery('/api/spc-wind', 'wind')
  const hail = mkQuery('/api/spc-hail', 'hail')
  return {
    reports: [...(torn.data ?? []), ...(wind.data ?? []), ...(hail.data ?? [])],
    loading: torn.isLoading || wind.isLoading || hail.isLoading,
  }
}

function useSpcOutlook() {
  return useQuery({
    queryKey: ['spc-day1-chase'],
    queryFn: () => fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson')
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  })
}

function useActiveWarnings() {
  return useQuery({
    queryKey: ['active-warnings-chase'],
    queryFn: () => fetch(
      'https://api.weather.gov/alerts/active?status=actual&message_type=alert' +
      '&event=Tornado%20Warning,Severe%20Thunderstorm%20Warning,Tornado%20Watch,Severe%20Thunderstorm%20Watch',
      { headers: { Accept: 'application/geo+json' } }
    ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: false,
  })
}

function useWatchPolygons() {
  return useQuery({
    queryKey: ['iem-watches-chase'],
    queryFn: () => fetch('/api/iem-watches').then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  })
}


function useChaseParams(lat, lon) {
  return useQuery({
    queryKey: ['chase-params', lat, lon],
    queryFn: () => fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,cape,convective_inhibition,lifted_index,windspeed_10m,winddirection_10m,wind_gusts_10m` +
      `&hourly=windspeed_925hPa,windspeed_300hPa` +
      `&forecast_hours=1` +
      `&windspeed_unit=kn&temperature_unit=fahrenheit&timezone=auto`
    ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: false,
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MapController({ lat, lon }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lon], 6) }, [lat, lon, map])
  return null
}

function SoundingPanel({ lat, lon }) {
  const station = useMemo(() => nearestStation(lat, lon), [lat, lon])
  const { dt, hourLabel } = useMemo(getSoundingTime, [])
  const [imgError, setImgError] = useState(false)
  const [imgKey, setImgKey] = useState(0)

  const imgSrc      = `/api/spc-sounding?dt=${dt}&sid=${station.sid}`
  const spcPageUrl  = `https://www.spc.noaa.gov/exper/soundings/${dt}_OBS/`

  return (
    <PanelShell>
      <PanelHeader label="Sounding" right={`${station.name} · ${hourLabel}`} />
      <div style={{ padding: 8 }}>
        {imgError ? (
          <div style={{ padding: '16px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#8b92b3' }}>Image unavailable</span>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <a href={spcPageUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: 12, color: '#3b82f6' }}>Open SPC Soundings ↗</a>
              <button onClick={() => { setImgError(false); setImgKey(k => k + 1) }}
                style={{ fontSize: 12, color: '#8b92b3', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Retry
              </button>
            </div>
          </div>
        ) : (
          <a href={spcPageUrl} target="_blank" rel="noreferrer" title="Open SPC sounding archive">
            <img
              key={imgKey}
              src={imgSrc}
              alt={`Skew-T — ${station.name}`}
              style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block', cursor: 'pointer' }}
              onError={() => setImgError(true)}
            />
          </a>
        )}
        <div style={{ fontSize: 10, color: '#8b92b3', marginTop: 4, textAlign: 'right', opacity: 0.5 }}>
          SPC · {station.sid} · click to open archive
        </div>
      </div>
    </PanelShell>
  )
}

function MesoanalysisPanel() {
  const [product, setProduct] = useState('sbcape')
  const [imgError, setImgError] = useState(false)

  const imgSrc = `/api/spc-meso?product=${product}`

  return (
    <PanelShell>
      <PanelHeader label="SPC Mesoanalysis" />
      <div style={{ padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: '1px solid #1e2235' }}>
        {MESO_PRODUCTS.map(p => {
          const isActive = product === p.id
          return (
            <button
              key={p.id}
              onClick={() => { setProduct(p.id); setImgError(false) }}
              style={{
                padding: '3px 8px', borderRadius: 4, fontSize: 11,
                border: isActive ? '1px solid #3b82f6' : '1px solid #1e2235',
                background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                color: isActive ? '#3b82f6' : '#8b92b3',
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <div style={{ padding: 8 }}>
        {imgError
          ? <div style={{ fontSize: 12, color: '#8b92b3', padding: '12px 0', textAlign: 'center' }}>
              Image unavailable — <a href="https://www.spc.noaa.gov/exper/mesoanalysis/" target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>open SPC</a>
            </div>
          : <img
              key={product}
              src={imgSrc}
              alt={product}
              style={{ width: '100%', height: 'auto', borderRadius: 4, display: 'block' }}
              onError={() => setImgError(true)}
            />
        }
        <div style={{ fontSize: 10, color: '#8b92b3', marginTop: 4, textAlign: 'right', opacity: 0.6 }}>
          SPC · {MESO_PRODUCTS.find(p => p.id === product)?.label} · CONUS
        </div>
      </div>
    </PanelShell>
  )
}

function ChaseParamsPanel({ lat, lon }) {
  const { data, isLoading, isError } = useChaseParams(lat, lon)
  const curr   = data?.current ?? {}
  const hourly = data?.hourly  ?? {}

  const sfc925   = hourly.windspeed_925hPa?.[0] ?? null
  const upper300 = hourly.windspeed_300hPa?.[0]  ?? null
  const shear    = sfc925 != null && upper300 != null ? Math.abs(upper300 - sfc925) : null

  const params = [
    { label: 'CAPE',        value: curr.cape != null ? `${Math.round(curr.cape)}` : '—',                          unit: 'J/kg', color: capeColor(curr.cape) },
    { label: 'CIN',         value: curr.convective_inhibition != null ? `${Math.round(curr.convective_inhibition)}` : '—', unit: 'J/kg', color: cinColor(curr.convective_inhibition) },
    { label: 'LI',          value: curr.lifted_index != null ? curr.lifted_index.toFixed(1) : '—',                unit: '',     color: liColor(curr.lifted_index) },
    { label: '925–300 Shear', value: shear != null ? `${Math.round(shear)}` : '—',                               unit: 'kt',   color: shearColor(shear) },
    { label: 'Sfc Wind',    value: curr.windspeed_10m != null ? `${Math.round(curr.windspeed_10m)} kt` : '—',     unit: '',     color: '#f0f2ff' },
    { label: 'Wind Gust',   value: curr.wind_gusts_10m != null ? `${Math.round(curr.wind_gusts_10m)} kt` : '—',  unit: '',     color: '#f0f2ff' },
  ]

  return (
    <PanelShell>
      <PanelHeader label="Chase Parameters" right="Open-Meteo" />
      <div style={{ padding: '10px 14px' }}>
        {isLoading && <div style={{ color: '#8b92b3', fontSize: 12, fontFamily: 'monospace' }}>Loading…</div>}
        {isError   && <div style={{ color: '#ef4444', fontSize: 12 }}>Data unavailable</div>}
        {!isLoading && !isError && params.map(p => (
          <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
            <span style={{ fontSize: 11, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {p.label}
            </span>
            <span style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 700, color: p.color }}>
              {p.value}
              {p.unit && <span style={{ fontSize: 10, color: '#8b92b3', fontWeight: 400, marginLeft: 3 }}>{p.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChaseOpsTab({ location }) {
  const { lat, lon } = location

  const [layers, setLayers] = useState({
    satellite: false, radar: true, outlook: true, warnings: true, reports: true, watches: false,
  })
  const [radarKey, setRadarKey] = useState(Date.now())

  const toggleLayer = useCallback(key => setLayers(prev => ({ ...prev, [key]: !prev[key] })), [])

  // Refresh radar tiles every 5 minutes
  useEffect(() => {
    const id = setInterval(() => setRadarKey(Date.now()), 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const { data: outlookData }  = useSpcOutlook()
  const { data: warnData }     = useActiveWarnings()
  const { data: watchData }    = useWatchPolygons()
  const { reports }            = useStormReports(layers.reports)
  const { data: _chaseData } = useChaseParams(lat, lon) // pre-warms the cache for ChaseParamsPanel

  const tornCount = reports.filter(r => r.type === 'torn').length
  const windCount = reports.filter(r => r.type === 'wind').length
  const hailCount = reports.filter(r => r.type === 'hail').length

  const warnFeatures = warnData?.features?.filter(
    f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  ) ?? []

  const LAYER_ITEMS = [
    { key: 'satellite', label: 'Satellite',   color: '#22c55e' },
    { key: 'radar',     label: 'Radar',       color: '#3b82f6' },
    { key: 'outlook',   label: 'SPC Outlook', color: '#f59e0b' },
    { key: 'warnings',  label: 'Warnings',    color: '#ef4444' },
    { key: 'reports',   label: 'Reports',     color: '#f97316' },
    { key: 'watches',   label: 'Watches',     color: '#a855f7' },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'row', gap: 12, padding: 12, overflow: 'hidden', minHeight: 0 }}>

      {/* ── Map column ── */}
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 8, border: '1px solid #1e2235' }}>
          <MapContainer
            center={[lat, lon]}
            zoom={6}
            zoomControl={false}
            attributionControl={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            {layers.satellite ? (
              <>
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution="© Esri"
                  maxZoom={19}
                />
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  opacity={0.65}
                />
              </>
            ) : (
              <BasemapLayers />
            )}

            {layers.radar && (
              <WMSTileLayer
                key={radarKey}
                url="https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi"
                layers="nexrad-n0r"
                format="image/png"
                transparent
                opacity={0.75}
                zIndex={10}
              />
            )}

            {layers.outlook && outlookData && (
              <GeoJSON
                key={'outlook-' + (outlookData.features?.length ?? 0)}
                data={outlookData}
                style={styleOutlook}
              />
            )}

            {layers.warnings && warnFeatures.length > 0 && (
              <GeoJSON
                key={'warns-' + warnFeatures.length}
                data={{ type: 'FeatureCollection', features: warnFeatures }}
                style={styleWarning}
              />
            )}

            {layers.watches && watchData?.features && (
              <GeoJSON
                key={'watches-' + watchData.features.length}
                data={watchData}
                style={styleWatch}
              />
            )}

            {layers.reports && reports.map((r, i) => (
              <CircleMarker
                key={`${r.type}-${i}`}
                center={[r.lat, r.lon]}
                radius={5}
                pathOptions={{ color: REPORT_COLORS[r.type], fillColor: REPORT_COLORS[r.type], fillOpacity: 0.85, weight: 1 }}
              >
                <Tooltip sticky>{r.time} — {r.loc}, {r.state}{r.mag ? ` (${r.mag})` : ''}</Tooltip>
              </CircleMarker>
            ))}

            {/* Location marker */}
            <CircleMarker
              center={[lat, lon]}
              radius={8}
              pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}
            />
            <CircleMarker
              center={[lat, lon]}
              radius={3}
              pathOptions={{ color: '#fff', fillColor: '#fff', fillOpacity: 1, weight: 0 }}
            />

            <MapController lat={lat} lon={lon} />
          </MapContainer>

          {/* HUD label */}
          <div style={{
            position: 'absolute', top: 10, left: 12, zIndex: 1000, pointerEvents: 'none',
            fontSize: 11, fontWeight: 600, color: '#8b92b3', opacity: 0.5,
            textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace',
          }}>
            Chase Ops · {location.label}
          </div>

          {/* Floating layer control */}
          <div style={{
            position: 'absolute', top: 10, right: 12, zIndex: 1000,
            background: 'rgba(9,11,20,0.90)', border: '1px solid #1e2235',
            borderRadius: 8, overflow: 'hidden', minWidth: 148,
          }}>
            <div style={{
              padding: '5px 12px', fontSize: 10, fontWeight: 600,
              color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.08em',
              borderBottom: '1px solid #1e2235',
            }}>
              Layers
            </div>
            {LAYER_ITEMS.map(({ key, label, color }) => {
              const on = layers[key]
              return (
                <div
                  key={key}
                  onClick={() => toggleLayer(key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 12px', cursor: 'pointer', gap: 14,
                    background: 'transparent', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ fontSize: 12, color: on ? '#f0f2ff' : '#8b92b3', userSelect: 'none' }}>
                    {label}
                  </span>
                  {/* Toggle pill */}
                  <div style={{
                    width: 30, height: 17, borderRadius: 9, flexShrink: 0,
                    background: on ? color : '#2a2f45',
                    position: 'relative', transition: 'background 0.2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 2.5, borderRadius: '50%',
                      left: on ? 14 : 3, width: 12, height: 12,
                      background: '#fff', transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }} />
                  </div>
                </div>
              )
            })}
            {layers.reports && (
              <div style={{
                padding: '4px 12px 5px', borderTop: '1px solid #1e2235',
                fontSize: 10, color: '#8b92b3', fontFamily: 'monospace',
              }}>
                {tornCount} TOR · {windCount} W · {hailCount} H
              </div>
            )}
          </div>

          {/* Report legend */}
          {layers.reports && (
            <div style={{
              position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
              background: 'rgba(15,17,32,0.85)', border: '1px solid #1e2235',
              borderRadius: 6, padding: '8px 12px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {[['torn', 'Tornado', tornCount], ['wind', 'Wind', windCount], ['hail', 'Hail', hailCount]].map(([type, label, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: REPORT_COLORS[type], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#8b92b3' }}>{label} ({count})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right data column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minWidth: 260, maxWidth: 340 }}>
        <SoundingPanel lat={lat} lon={lon} />
        <MesoanalysisPanel />
        <ChaseParamsPanel lat={lat} lon={lon} />
      </div>

    </div>
  )
}
