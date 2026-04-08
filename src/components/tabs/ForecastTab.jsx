import { useQuery } from '@tanstack/react-query'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { format } from 'date-fns'
import { PanelShell, PanelHeader } from '../shared'

// ── WMO weather code map ──────────────────────────────────────────────────────
const WMO_MAP = {
  0:  { desc: 'Clear',              icon: '☀️' },
  1:  { desc: 'Mainly Clear',       icon: '🌤️' },
  2:  { desc: 'Partly Cloudy',      icon: '⛅' },
  3:  { desc: 'Overcast',           icon: '☁️' },
  45: { desc: 'Fog',                icon: '🌫️' },
  48: { desc: 'Icy Fog',            icon: '🌫️' },
  51: { desc: 'Light Drizzle',      icon: '🌦️' },
  53: { desc: 'Drizzle',            icon: '🌦️' },
  55: { desc: 'Heavy Drizzle',      icon: '🌦️' },
  61: { desc: 'Light Rain',         icon: '🌧️' },
  63: { desc: 'Rain',               icon: '🌧️' },
  65: { desc: 'Heavy Rain',         icon: '🌧️' },
  71: { desc: 'Light Snow',         icon: '🌨️' },
  73: { desc: 'Snow',               icon: '❄️' },
  75: { desc: 'Heavy Snow',         icon: '❄️' },
  77: { desc: 'Snow Grains',        icon: '🌨️' },
  80: { desc: 'Light Showers',      icon: '🌦️' },
  81: { desc: 'Showers',            icon: '🌧️' },
  82: { desc: 'Heavy Showers',      icon: '🌧️' },
  85: { desc: 'Snow Showers',       icon: '🌨️' },
  86: { desc: 'Heavy Snow Showers', icon: '❄️' },
  95: { desc: 'Thunderstorm',       icon: '⛈️' },
  96: { desc: 'T-Storm w/ Hail',    icon: '⛈️' },
  99: { desc: 'T-Storm w/ Hail',    icon: '⛈️' },
}
function wmo(code) { return WMO_MAP[code] ?? { desc: '—', icon: '—' } }

// ── Helpers ───────────────────────────────────────────────────────────────────
function degToCard(d) {
  if (d == null) return '—'
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  return dirs[Math.round(d / 22.5) % 16]
}

function fmtHour(isoStr) {
  const h = parseInt(isoStr.slice(11, 13), 10)
  if (h === 0)  return '12 AM'
  if (h < 12)   return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function fmtDayLabel(isoDate, index) {
  if (index === 0) return 'Today'
  const [y, m, d] = isoDate.split('-').map(Number)
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(y, m - 1, d).getDay()]
}

// ── Data fetch (hourly + daily in one call) ───────────────────────────────────
function useOpenMeteoForecast(lat, lon) {
  return useQuery({
    queryKey: ['open-meteo-forecast', lat, lon],
    queryFn: () =>
      fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,dewpoint_2m,precipitation_probability,windspeed_10m,winddirection_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
        `&temperature_unit=fahrenheit&windspeed_unit=kn&timezone=auto&forecast_days=7`
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })
}

function parseHourly(data) {
  const h = data.hourly
  const now = Date.now()
  return h.time
    .map((t, i) => ({
      label:    fmtHour(t),
      ts:       new Date(t).getTime(),
      temp:     h.temperature_2m[i]           != null ? Math.round(h.temperature_2m[i])  : null,
      dewpoint: h.dewpoint_2m[i]              != null ? Math.round(h.dewpoint_2m[i])     : null,
      pop:      h.precipitation_probability[i] ?? null,
      wind:     h.windspeed_10m[i]            != null ? Math.round(h.windspeed_10m[i])   : null,
      windDeg:  h.winddirection_10m[i]        ?? null,
    }))
    .filter(h => h.ts >= now - 30 * 60 * 1000)  // start from ~now
    .slice(0, 24)
}

function parseDaily(data) {
  const d = data.daily
  return d.time.map((t, i) => ({
    label:  fmtDayLabel(t, i),
    high:   d.temperature_2m_max[i]          != null ? Math.round(d.temperature_2m_max[i])  : null,
    low:    d.temperature_2m_min[i]          != null ? Math.round(d.temperature_2m_min[i])  : null,
    pop:    d.precipitation_probability_max[i] ?? null,
    ...wmo(d.weathercode[i]),
  }))
}

// ── AFD syntax highlighting ───────────────────────────────────────────────────
const PATTERNS = [
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
  PATTERNS.forEach(({ re, s }) => {
    const r = new RegExp(re.source, re.flags)
    let m
    while ((m = r.exec(line)) !== null)
      hits.push({ start: m.index, end: m.index + m[0].length, text: m[0], s })
  })
  hits.sort((a, b) => a.start - b.start)
  const clean = []; let last = 0
  for (const h of hits) { if (h.start >= last) { clean.push(h); last = h.end } }
  const out = []; let pos = 0
  clean.forEach((h, i) => {
    if (h.start > pos) out.push(<span key={`p${i}`}>{line.slice(pos, h.start)}</span>)
    out.push(<span key={`m${i}`} style={h.s}>{h.text}</span>)
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

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#0f1120', border: '1px solid #1e2235', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>
      <div style={{ color: '#8b92b3', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 700 }}>
            {p.value == null ? '—' : `${p.value}${p.dataKey === 'pop' ? '%' : '°F'}`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Wind direction arrow ──────────────────────────────────────────────────────
function WindArrow({ deg }) {
  if (deg == null) return <span style={{ color: '#8b92b3', fontSize: 11 }}>—</span>
  return (
    <svg viewBox="0 0 12 12" style={{ width: 12, height: 12, transform: `rotate(${deg}deg)` }}>
      <path d="M6 1 L8 9 L6 7 L4 9 Z" fill="#3b82f6" />
    </svg>
  )
}

// ── AFD panel ─────────────────────────────────────────────────────────────────
function AFDPanel() {
  const { data: list, isLoading: listLoading, error: listError } = useQuery({
    queryKey: ['afd-list-OUN'],
    queryFn: () =>
      fetch('https://api.weather.gov/products/types/AFD/locations/OUN', {
        headers: { Accept: 'application/geo+json' },
      }).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
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

  const issuanceTime = afd?.issuanceTime
    ? format(new Date(afd.issuanceTime), 'dd MMM yyyy HH:mm') + 'Z'
    : null

  if (listLoading || afdLoading)
    return <div style={{ padding: 24, color: '#8b92b3', fontSize: 14, fontFamily: 'monospace' }}>Fetching AFD…</div>

  if (listError || afdError)
    return (
      <div style={{ padding: 24, color: '#8b92b3', fontSize: 14, fontFamily: 'monospace' }}>
        <div style={{ color: '#ef4444', marginBottom: 8 }}>Failed to load AFD</div>
        <div style={{ opacity: 0.6 }}>Check network or try again later.</div>
      </div>
    )

  if (!afd?.productText)
    return <div style={{ padding: 24, color: '#8b92b3', fontSize: 14, fontFamily: 'monospace' }}>No text available.</div>

  const lines = afd.productText.replace(/\r\n/g, '\n').split('\n')
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 20px', fontFamily: 'monospace', fontSize: 14, lineHeight: 1.75, color: '#8b92b3' }}>
      {issuanceTime && (
        <div style={{ fontSize: 12, color: '#3b82f6', marginBottom: 8, opacity: 0.7 }}>
          Issued: {issuanceTime} — NWS Norman OK (OUN)
        </div>
      )}
      {lines.map((line, i) => renderAFDLine(line, i))}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function ForecastTab({ location }) {
  const { data, isLoading, error } = useOpenMeteoForecast(location.lat, location.lon)

  const hourly = data ? parseHourly(data) : []
  const daily  = data ? parseDaily(data)  : []

  // Show every 3rd hour in wind timeline
  const windSlots = hourly.filter((_, i) => i % 3 === 0)

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, padding: 12 }}>

      {/* Hourly chart */}
      <PanelShell style={{ flexShrink: 0 }}>
        <PanelHeader
          label={`Hourly Forecast — ${location.label}`}
          right="Open-Meteo · 24-hr"
        />

        {isLoading ? (
          <div style={{ padding: 24, color: '#8b92b3', fontSize: 13, fontFamily: 'monospace' }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 24, color: '#ef4444', fontSize: 13, fontFamily: 'monospace' }}>Open-Meteo unavailable</div>
        ) : (
          <>
            <div style={{ padding: '16px 16px 8px' }}>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={hourly} margin={{ top: 4, right: 30, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#8b92b3', fontSize: 11 }} interval={3} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="temp" domain={['auto', 'auto']} tick={{ fill: '#8b92b3', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="pop" orientation="right" domain={[0, 100]} tick={{ fill: '#8b92b3', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <ChartTooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#8b92b3', paddingTop: 4 }} />
                  <Bar yAxisId="pop" dataKey="pop" name="PoP %" fill="#3b82f6" opacity={0.2} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="temp" type="monotone" dataKey="temp"     name="Temp °F" stroke="#ef4444" dot={false} strokeWidth={2} connectNulls={false} />
                  <Line yAxisId="temp" type="monotone" dataKey="dewpoint" name="Dwpt °F" stroke="#22c55e" dot={false} strokeWidth={2} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Wind timeline */}
            <div style={{ borderTop: '1px solid #1e2235', padding: '8px 16px 12px', overflowX: 'auto' }}>
              <div style={{ fontSize: 12, color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Wind (kt)</div>
              <div style={{ display: 'flex', gap: 0 }}>
                {windSlots.map((h, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 40, flex: '1 0 40px' }}>
                    <span style={{ fontSize: 11, color: '#8b92b3' }}>{h.label}</span>
                    <WindArrow deg={h.windDeg} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#f0f2ff' }}>{h.wind ?? '—'}</span>
                    <span style={{ fontSize: 11, color: '#8b92b3' }}>{degToCard(h.windDeg)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </PanelShell>

      {/* 7-day strip */}
      <PanelShell style={{ flexShrink: 0 }}>
        <PanelHeader label={`7-Day Forecast — ${location.label}`} right="Open-Meteo" />
        {isLoading ? (
          <div style={{ padding: 24, color: '#8b92b3', fontSize: 13, fontFamily: 'monospace' }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 24, color: '#ef4444', fontSize: 13, fontFamily: 'monospace' }}>Open-Meteo unavailable</div>
        ) : (
          <div style={{ display: 'flex', padding: 12, gap: 8, overflowX: 'auto' }}>
            {daily.map((d, i) => (
              <div
                key={d.label + i}
                style={{
                  flex: '1 0 100px', minWidth: 100,
                  background: i === 0 ? 'rgba(59,130,246,0.08)' : '#090b14',
                  border: `1px solid ${i === 0 ? '#3b82f633' : '#1e2235'}`,
                  borderRadius: 8, padding: '12px 10px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: i === 0 ? '#3b82f6' : '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {d.label}
                </span>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{d.icon}</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#ef4444' }}>{d.high != null ? `${d.high}°` : '—'}</span>
                  <span style={{ fontSize: 15, color: '#8b92b3' }}>{d.low != null ? `${d.low}°` : '—'}</span>
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ height: 3, background: '#1e2235', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${d.pop ?? 0}%`, background: '#3b82f6', borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#8b92b3', textAlign: 'center' }}>
                    {d.pop != null ? `${d.pop}% precip` : '— precip'}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#8b92b3', textAlign: 'center', lineHeight: 1.3 }}>{d.desc}</span>
              </div>
            ))}
          </div>
        )}
      </PanelShell>

      {/* NWS AFD */}
      <PanelShell style={{ flexShrink: 0, minHeight: 300 }}>
        <PanelHeader label="Area Forecast Discussion — NWS Norman OK (OUN)" right="api.weather.gov" />
        <AFDPanel />
      </PanelShell>

    </div>
  )
}
