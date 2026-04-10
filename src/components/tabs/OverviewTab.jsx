import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, WMSTileLayer, CircleMarker, GeoJSON, useMap } from 'react-leaflet'
import BasemapLayers from '../BasemapLayers'
import L from 'leaflet'
import { PanelShell, PanelHeader } from '../shared'

// Suppress Vite asset-hash warning for default Leaflet icons (not used here)
delete L.Icon.Default.prototype._getIconUrl

// ── Live NEXRAD radar via IEM WMS ─────────────────────────────────────────────

// Pans/zooms map when selected location changes (MapContainer center is init-only)
function MapController({ lat, lon, zoomTarget }) {
  const map = useMap()
  useEffect(() => { map.setView([lat, lon], 7) }, [lat, lon, map])
  useEffect(() => {
    if (!zoomTarget?.geometry) return
    try {
      const bounds = L.geoJSON(zoomTarget.geometry).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 })
    } catch {}
  }, [zoomTarget, map])
  return null
}

// ── Active watch/warning overlay ─────────────────────────────────────────────
const ALERT_STYLES = {
  'Tornado Warning': {
    color: '#ef4444', fillColor: '#ef4444',
    fillOpacity: 0.30, opacity: 1.0, weight: 3.5,
    className: 'tor-warning-pulse',
  },
  'Severe Thunderstorm Warning': {
    color: '#f97316', fillColor: '#f97316',
    fillOpacity: 0.25, opacity: 1.0, weight: 3,
  },
  'Tornado Watch': {
    color: '#ef4444', fillColor: '#ef4444',
    fillOpacity: 0.15, opacity: 1.0, weight: 2.5,
    dashArray: '8 5',
  },
  'Severe Thunderstorm Watch': {
    color: '#f59e0b', fillColor: '#f59e0b',
    fillOpacity: 0.15, opacity: 1.0, weight: 2.5,
    dashArray: '8 5',
  },
}

function alertStyle(feature) {
  return ALERT_STYLES[feature?.properties?.event] ?? {
    color: '#8b92b3', fillColor: '#8b92b3',
    fillOpacity: 0.2, opacity: 0.7, weight: 2,
  }
}

function useActiveAlerts() {
  return useQuery({
    queryKey: ['active-alerts-polygons'],
    queryFn: () =>
      fetch(
        'https://api.weather.gov/alerts/active?status=actual&message_type=alert' +
        '&event=Tornado%20Warning,Severe%20Thunderstorm%20Warning,Tornado%20Watch,Severe%20Thunderstorm%20Watch',
        { headers: { Accept: 'application/geo+json' } }
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    retry: 2,
  })
}

// SPC watch polygons via IEM proxy — NWS watch features always have geometry:null
function useWatchPolygons() {
  return useQuery({
    queryKey: ['iem-watch-polygons'],
    queryFn: async () => {
      const r = await fetch('/api/iem-watches')
      if (!r.ok) throw new Error(r.status)
      return r.json()
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  })
}

function fmtAlertTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch { return iso }
}

function AlertsLayer({ data, visible }) {
  if (!visible || !data?.features?.length) return null
  const polygonFeatures = data.features.filter(
    f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  )
  if (!polygonFeatures.length) return null

  return (
    <>
      <style>{`
        @keyframes torPulse {
          0%, 100% { stroke-opacity: 1.0; }
          50%       { stroke-opacity: 0.4; }
        }
        .tor-warning-pulse {
          animation: torPulse 1.4s ease-in-out infinite;
        }
      `}</style>
      <GeoJSON
        key={data.features.length + '-' + data.features[0]?.properties?.id}
        data={{ type: 'FeatureCollection', features: polygonFeatures }}
        style={alertStyle}
        onEachFeature={(feature, layer) => {
          const p = feature.properties ?? {}
          const style = ALERT_STYLES[p.event] ?? {}
          const color = style.color ?? '#8b92b3'
          layer.bindPopup(
            `<div style="font-family:monospace;font-size:12px;line-height:1.55;min-width:200px;max-width:260px">` +
            `<div style="font-weight:700;color:${color};font-size:13px;margin-bottom:4px">${p.event ?? 'Alert'}</div>` +
            `<div style="color:#555;margin-bottom:6px">${p.areaDesc ?? '—'}</div>` +
            `<div><span style="color:#888">Issued:</span> ${fmtAlertTime(p.sent)}</div>` +
            `<div><span style="color:#888">Expires:</span> ${fmtAlertTime(p.expires)}</div>` +
            (p.headline ? `<div style="margin-top:6px;color:#333;font-size:11px">${p.headline}</div>` : '') +
            `</div>`,
            { maxWidth: 280 }
          )
        }}
      />
    </>
  )
}

function WatchesLayer({ data }) {
  if (!data?.features?.length) return null

  const polygons = data.features.filter(
    f => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon'
  )
  if (!polygons.length) return null

  return (
    <GeoJSON
      key={'watches-' + polygons.length}
      data={{ type: 'FeatureCollection', features: polygons }}
      style={(feature) => {
        const type = feature?.properties?.type ?? ''
        if (type === 'TOR') return {
          color: '#ef4444', fillColor: '#ef4444',
          fillOpacity: 0.15, opacity: 1.0, weight: 2.5,
          dashArray: '8 5',
        }
        return {
          color: '#f59e0b', fillColor: '#f59e0b',
          fillOpacity: 0.15, opacity: 1.0, weight: 2.5,
          dashArray: '8 5',
        }
      }}
    />
  )
}

function fmtExpiresShort(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })
  } catch { return '—' }
}

function WarnBadge({ abbrev, label, color, features, onFeatureClick, dashedBorder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const count = features.length
  const active = count > 0

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const glowId = `badge-glow-${label.replace(/\s+/g, '-')}`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <style>{`
        @keyframes ${glowId} {
          0%, 100% { text-shadow: 0 0 8px ${color}cc, 0 0 18px ${color}66; }
          50%       { text-shadow: 0 0 16px ${color}ff, 0 0 32px ${color}aa; }
        }
      `}</style>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          width: 68, padding: '9px 8px 8px', borderRadius: 9, gap: 4,
          border: `2px ${dashedBorder ? 'dashed' : 'solid'} ${active ? color + 'bb' : color + '44'}`,
          background: active ? `linear-gradient(160deg, ${color}22 0%, ${color}0a 100%)` : 'rgba(15,17,32,0.92)',
          color: color,
          cursor: 'pointer', backdropFilter: 'blur(6px)',
          boxShadow: active ? `0 0 12px ${color}55, 0 0 24px ${color}22, inset 0 0 8px ${color}11` : '0 2px 8px rgba(0,0,0,0.5)',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{
          fontSize: 30, fontWeight: 900, lineHeight: 1, fontFamily: 'monospace', letterSpacing: '-0.03em',
          animation: active ? `${glowId} 2s ease-in-out infinite` : 'none',
        }}>
          {count}
        </span>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1, opacity: 1 }}>
          {label}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 0, left: 'calc(100% + 10px)',
          minWidth: 280, maxWidth: 360, maxHeight: 340, overflowY: 'auto',
          background: '#0a0c1a', border: `1px solid ${color}44`,
          borderRadius: 10, boxShadow: `0 12px 40px rgba(0,0,0,0.85), 0 0 0 1px ${color}22`,
          zIndex: 1100,
        }}>
          <div style={{
            padding: '9px 14px 8px',
            borderBottom: `1px solid ${color}22`,
            fontSize: 10, fontWeight: 800,
            color: active ? color : '#8b92b3',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            background: `linear-gradient(90deg, ${color}18 0%, transparent 100%)`,
          }}>
            {count} Active {label}
          </div>
          {active ? features.map((f, i) => {
            const p = f.properties ?? {}
            const area = (p.areaDesc ?? '').split(';')[0].trim()
            const expires = fmtExpiresShort(p.expires)
            return (
              <div
                key={p.id ?? i}
                onClick={() => { onFeatureClick?.(f); setOpen(false) }}
                style={{
                  padding: '9px 12px 9px 0',
                  borderBottom: i < features.length - 1 ? `1px solid #1a1d30` : 'none',
                  display: 'flex', alignItems: 'stretch', gap: 0,
                  cursor: 'pointer', transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${color}12`}
                onMouseLeave={e => e.currentTarget.style.background = ''}
              >
                {/* colored left accent bar */}
                <div style={{ width: 3, borderRadius: '0 2px 2px 0', background: color, marginRight: 10, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    {/* pill tag */}
                    <span style={{
                      fontSize: 10, fontWeight: 800, fontFamily: 'monospace',
                      padding: '1px 6px', borderRadius: 4,
                      background: color + '28', color, border: `1px solid ${color}55`,
                      letterSpacing: '0.06em',
                    }}>{abbrev}</span>
                    <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                      exp <span style={{ color: '#c9cfe8', fontWeight: 600 }}>{expires}</span>
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#8b92b3', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{area}</div>
                </div>
              </div>
            )
          }) : (
            <div style={{ padding: '12px 14px', fontSize: 12, color: '#8b92b3' }}>
              No active {label.toLowerCase()}.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RadarMap({ lat, lon, alertData }) {
  const [zoomTarget, setZoomTarget] = useState(null)
  const { data: watchData } = useWatchPolygons()
  const features = alertData?.features ?? []
  const torFeatures  = features.filter(f => f.properties?.event === 'Tornado Warning')
  const svrFeatures  = features.filter(f => f.properties?.event === 'Severe Thunderstorm Warning')
  const torWFeatures = features.filter(f => f.properties?.event === 'Tornado Watch')
  const svrWFeatures = features.filter(f => f.properties?.event === 'Severe Thunderstorm Watch')

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <MapContainer
        center={[lat, lon]}
        zoom={7}
        zoomControl={false}
        attributionControl={false}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <BasemapLayers />
        {/* IEM NEXRAD composite reflectivity WMS overlay */}
        <WMSTileLayer
          url="https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0r.cgi"
          layers="nexrad-n0r"
          format="image/png"
          transparent={true}
          version="1.1.1"
          opacity={0.8}
        />
        {/* Active warning polygons (NWS — has real geometry for warnings) */}
        <AlertsLayer data={alertData} visible={true} />
        {/* Active watch polygons (IEM/SPC — NWS watch features have geometry:null) */}
        <WatchesLayer data={watchData} />
        {/* Selected location marker: accent blue ring + white center dot */}
        <CircleMarker
          center={[lat, lon]}
          radius={7}
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }}
        />
        <CircleMarker
          center={[lat, lon]}
          radius={3}
          pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 1, weight: 0 }}
        />
        <MapController lat={lat} lon={lon} zoomTarget={zoomTarget} />
      </MapContainer>

      {/* Warning count badges — top left, stacked inside dark panel */}
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 1000,
        display: 'flex', flexDirection: 'column', gap: 6,
        background: '#0f1120', borderRadius: 8, padding: 8,
        border: '1px solid #1e2235',
      }}>
        <WarnBadge abbrev="TOR" label="TOR Warn"   color="#ef4444" features={torFeatures}  onFeatureClick={setZoomTarget} />
        <WarnBadge abbrev="TOR" label="TOR Watch"  color="#ef4444" features={torWFeatures} onFeatureClick={setZoomTarget} dashedBorder />
        <WarnBadge abbrev="SVR" label="SVR Warn"   color="#f97316" features={svrFeatures}  onFeatureClick={setZoomTarget} />
        <WarnBadge abbrev="SVR" label="TSTM Watch" color="#f59e0b" features={svrWFeatures} onFeatureClick={setZoomTarget} dashedBorder />
      </div>

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

// ── Nationwide active Tornado + Severe Thunderstorm Warnings ─────────────────
function useActiveWarnings() {
  const { data, isLoading } = useQuery({
    queryKey: ['active-warnings-national'],
    queryFn: () =>
      fetch(
        'https://api.weather.gov/alerts/active?status=actual&message_type=alert' +
        '&event=Tornado%20Warning,Severe%20Thunderstorm%20Warning',
        { headers: { Accept: 'application/geo+json' } }
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
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

// ── Current conditions via Open-Meteo (no CORS issues) ───────────────────────
function wmoCondition(code) {
  if (code === 0)                    return 'Clear'
  if (code === 1)                    return 'Mostly Clear'
  if (code === 2)                    return 'Partly Cloudy'
  if (code === 3)                    return 'Overcast'
  if (code === 45 || code === 48)    return 'Foggy'
  if (code >= 51 && code <= 55)      return 'Drizzle'
  if (code >= 56 && code <= 57)      return 'Freezing Drizzle'
  if (code >= 61 && code <= 65)      return 'Rain'
  if (code >= 66 && code <= 67)      return 'Freezing Rain'
  if (code >= 71 && code <= 77)      return 'Snow'
  if (code >= 80 && code <= 82)      return 'Showers'
  if (code === 85 || code === 86)    return 'Snow Showers'
  if (code === 95)                   return 'Thunderstorm'
  if (code === 96 || code === 99)    return 'Thunderstorm w/ Hail'
  return null
}

function degToCard(d) {
  if (d == null) return null
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(d / 22.5) % 16]
}

function fmtObsTime(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch { return iso }
}

function useCurrentConditions(lat, lon) {
  return useQuery({
    queryKey: ['current-conditions', lat, lon],
    queryFn: () =>
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,dewpoint_2m,relative_humidity_2m,windspeed_10m,` +
        `winddirection_10m,windgusts_10m,surface_pressure,visibility,weathercode` +
        `&temperature_unit=fahrenheit&windspeed_unit=kn&timezone=auto`
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
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

function getWeatherEmoji(condition) {
  const c = condition?.toLowerCase() ?? ''
  if (c.includes('thunder'))                              return '⛈️'
  if (c.includes('snow'))                                 return '❄️'
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return '🌧️'
  if (c.includes('fog')  || c.includes('mist'))           return '🌫️'
  if (c.includes('partly cloudy') || c.includes('mostly cloudy')) return '⛅'
  if (c.includes('cloudy') || c.includes('overcast'))     return '☁️'
  if (c.includes('clear') || c.includes('sunny'))         return '☀️'
  return '🌡️'
}

// ── Info tooltip ──────────────────────────────────────────────────────────────
function InfoTip({ text }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos]         = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)

  function show() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: r.left })
    }
    setVisible(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        style={{
          width: 13, height: 13, borderRadius: '50%',
          border: '1px solid #8b92b366',
          background: 'transparent',
          color: '#8b92b3',
          fontSize: 8, fontWeight: 700,
          cursor: 'default', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, lineHeight: 1,
        }}
      >
        ?
      </button>
      {visible && createPortal(
        <div style={{
          position: 'fixed', top: pos.top, left: pos.left,
          zIndex: 9999, maxWidth: 220, pointerEvents: 'none',
          background: '#0f1120', border: '1px solid #2a2f4a',
          borderRadius: 7, padding: '8px 11px',
          fontSize: 12, color: '#c9cfe8', lineHeight: 1.6,
          boxShadow: '0 6px 24px rgba(0,0,0,0.75)',
        }}>
          {text}
        </div>,
        document.body
      )}
    </>
  )
}

export default function OverviewTab({ location }) {
  const { category: day1Cat, color: day1Color, loading: day1Loading } = useSpcDay1(location.lat, location.lon)
  const { data: convData, isLoading: convLoading } = useConvectiveParams(location.lat, location.lon)
  const { value: activeWarnCount, loading: activeWarnLoading } = useActiveWarnings()
  const { data: condData, isLoading: condLoading } = useCurrentConditions(location.lat, location.lon)
  const { data: alertData } = useActiveAlerts()

  const cape = convData?.current?.cape
  const cin  = convData?.current?.convective_inhibition

  // Parse Open-Meteo current block
  const cur         = condData?.current ?? null
  const tempF       = cur?.temperature_2m    != null ? Math.round(cur.temperature_2m)    : null
  const dewpF       = cur?.dewpoint_2m       != null ? Math.round(cur.dewpoint_2m)       : null
  const humidity    = cur?.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null
  const windDir     = degToCard(cur?.winddirection_10m ?? null)
  const windSpd     = cur?.windspeed_10m     != null ? Math.round(cur.windspeed_10m)     : null
  const gusts       = cur?.windgusts_10m     != null ? Math.round(cur.windgusts_10m)     : null
  const pressureInHg = cur?.surface_pressure != null ? (cur.surface_pressure / 33.8639).toFixed(2) : null
  const visibMi     = cur?.visibility        != null ? (cur.visibility / 1609.34).toFixed(1) : null
  const condition   = cur?.weathercode       != null ? wmoCondition(cur.weathercode)     : null
  const obsTime     = cur?.time              != null ? fmtObsTime(cur.time)              : null

  // Derived display values
  const tempDisplay = tempF != null ? String(tempF) : '—'
  const condDisplay = condition ?? (condLoading ? '…' : '—')
  const windDisplay = windDir && windSpd != null
    ? `${windDir} ${windSpd} kt`
    : (condLoading ? '…' : '—')

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
        <RadarMap lat={location.lat} lon={location.lon} alertData={alertData} />
      </PanelShell>

      {/* Right top: Current Conditions */}
      <PanelShell style={{ gridColumn: '2', gridRow: '1' }}>
        <PanelHeader label="Current Conditions" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px', gap: 10, overflow: 'hidden' }}>
          {/* Location + live dot */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#22c55e', flexShrink: 0,
                animation: 'livePulse 2s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 14, color: '#8b92b3' }}>{location.label}</span>
            </div>
            <span style={{ fontSize: 11, color: '#8b92b3', opacity: 0.5, paddingLeft: 13, fontFamily: 'monospace' }}>
              {obsTime ? `Updated ${obsTime}` : (condLoading ? '…' : '—')}
            </span>
          </div>
          {/* Big temp + weather emoji */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              {tempDisplay === '—'
                ? <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color: '#8b92b3' }}>—</span>
                : <>
                    <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, color: '#f0f2ff' }}>{tempDisplay}</span>
                    <span style={{ fontSize: 22, color: '#8b92b3', marginTop: 6 }}>°F</span>
                  </>
              }
            </div>
            {condition && (
              <span style={{ fontSize: 40, lineHeight: 1, userSelect: 'none', marginTop: 4 }} title={condition}>
                {getWeatherEmoji(condition)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 16, color: condDisplay === '—' ? '#8b92b3' : '#f0f2ff', marginTop: -4 }}>{condDisplay}</div>
          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
            {[
              { k: 'Dewpoint',   v: fmt(dewpF,        '°F') },
              { k: 'Humidity',   v: fmt(humidity,     '%')  },
              { k: 'Wind',       v: windDisplay              },
              { k: 'Gusts',      v: fmt(gusts,        ' kt') },
              { k: 'Pressure',   v: fmt(pressureInHg, ' in') },
              { k: 'Visibility', v: visibMi != null ? `${visibMi} mi` : '—' },
            ].map(({ k, v }) => (
              <div key={k} style={{
                background: '#0d1117',
                border: '1px solid #1e2235',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}>
                <div style={{ fontSize: 11, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{k}</div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: v === '—' ? '#8b92b3' : '#f0f2ff' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </PanelShell>

      {/* Right bottom: Severe Highlights */}
      <PanelShell style={{ gridColumn: '2', gridRow: '2' }}>
        <PanelHeader label="Severe Highlights" />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, padding: '8px 12px', overflow: 'hidden' }}>
          {[
            { label: 'SPC Day 1',      value: day1Cat,                                                   unit: '',     color: day1Color,        dim: 'SPC · Day 1 Categorical',   live: false, loading: day1Loading,      tip: 'The Storm Prediction Center\'s severe weather outlook for today at your location. Risk levels: No Risk → TSTM → Marginal → Slight → Enhanced → Moderate → High. Higher categories mean greater organized severe weather potential.' },
            { label: 'CAPE',           value: cape != null ? Math.round(cape).toLocaleString() : '…',    unit: 'J/kg', color: capeColor(cape),  dim: 'Open-Meteo · surface',      live: false, loading: convLoading,      tip: 'Convective Available Potential Energy — measures how much energy is available for storm development. Under 500 J/kg: weak. 1,000–2,500: significant severe potential. Above 2,500: extreme instability.' },
            { label: 'CIN',            value: cin  != null ? Math.round(cin).toLocaleString()  : '…',    unit: 'J/kg', color: cinColor(cin),    dim: 'Open-Meteo · surface',      live: false, loading: convLoading,      tip: 'Convective Inhibition — a "cap" that suppresses storm development. Values near 0 allow storms to fire freely. Below −50 J/kg: notable cap. Below −200: strong suppression that is unlikely to break.' },
            { label: 'SVR/TOR Warnings', value: activeWarnCount,                                           unit: '',     color: '#ef4444',        dim: 'Nationwide · Live',         live: true,  loading: activeWarnLoading },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: '#0d1117',
                border: '1px solid #1e2235',
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0,
                  animation: item.live ? 'livePulse 2s ease-in-out infinite' : 'none',
                }} />
                <span style={{ fontSize: 11, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </span>
                {item.tip && <InfoTip text={item.tip} />}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: item.loading ? '#8b92b3' : '#f0f2ff' }}>
                  {item.value}
                </span>
                {item.unit && <span style={{ fontSize: 12, color: '#8b92b3' }}>{item.unit}</span>}
              </div>
              <span style={{ fontSize: 11, color: '#8b92b3', opacity: 0.6 }}>{item.dim}</span>
            </div>
          ))}
        </div>
      </PanelShell>
    </div>
  )
}
