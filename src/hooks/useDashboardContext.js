import { useQuery } from '@tanstack/react-query'

// ── Point-in-polygon helpers (mirrors OverviewTab logic) ─────────────────────
const SPC_RISK_RANK = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }

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

function deriveCatCategory(geojson, lat, lon) {
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

// Returns highest probability (e.g. "5%") the point falls within, or null
// SPC LABEL is a decimal fraction ("0.05"), DN is the integer percentage (5)
function deriveHighestProb(geojson, lat, lon) {
  let best = 0
  for (const f of geojson?.features ?? []) {
    const dn = f.properties?.DN
    const prob = dn != null && !isNaN(dn)
      ? dn
      : (() => { const v = parseFloat(f.properties?.LABEL ?? ''); return isNaN(v) ? NaN : v < 1 ? Math.round(v * 100) : Math.round(v) })()
    if (!isNaN(prob) && prob > best && pointInFeature(lon, lat, f.geometry)) {
      best = prob
    }
  }
  return best > 0 ? `${best}%` : null
}

// ── WMO weather code → human readable ────────────────────────────────────────
function wmoCondition(code) {
  if (code == null) return null
  if (code === 0)            return 'Clear Sky'
  if (code <= 2)             return 'Partly Cloudy'
  if (code === 3)            return 'Overcast'
  if (code <= 49)            return 'Fog'
  if (code <= 59)            return 'Drizzle'
  if (code <= 69)            return 'Rain'
  if (code <= 79)            return 'Snow / Sleet'
  if (code <= 82)            return 'Rain Showers'
  if (code <= 84)            return 'Snow Showers'
  if (code <= 99)            return 'Thunderstorm'
  return null
}

// ── Metar helpers ─────────────────────────────────────────────────────────────
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

function skyCondition(m) {
  const wx = m.wxString ?? ''
  if (wx.includes('TS'))  return 'Thunderstorm'
  if (wx.includes('RA'))  return 'Rain'
  if (wx.includes('SN'))  return 'Snow'
  if (wx.includes('FG') || wx.includes('BR')) return 'Fog / Mist'
  if (wx.includes('DZ'))  return 'Drizzle'
  if (wx.includes('FZRA')) return 'Freezing Rain'
  switch (m.cover) {
    case 'CLR': case 'SKC': case 'CAVOK': return 'Clear'
    case 'FEW': return 'Few Clouds'
    case 'SCT': return 'Partly Cloudy'
    case 'BKN': return 'Mostly Cloudy'
    case 'OVC': return 'Overcast'
    default: return m.cover || null
  }
}

function parseAvMetar(arr) {
  const m = arr?.[0]
  if (!m) return null
  const tempC = m.temp != null ? parseFloat(m.temp) : null
  const dewpC = m.dewp != null ? parseFloat(m.dewp) : null
  return {
    tempF:        tempC != null ? Math.round(tempC * 9 / 5 + 32) : null,
    dewpF:        dewpC != null ? Math.round(dewpC * 9 / 5 + 32) : null,
    condition:    skyCondition(m),
    humidity:     dewHumidity(tempC, dewpC),
    windDir:      degToCard(m.wdir),
    windSpd:      m.wspd  != null ? Math.round(parseFloat(m.wspd))  : null,
    gusts:        m.wgst  != null ? Math.round(parseFloat(m.wgst))  : null,
    pressureInHg: m.altim != null ? (parseFloat(m.altim) * 0.02953).toFixed(2) : null,
    visibMi:      m.visib != null ? parseFloat(m.visib) : null,
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDashboardContext(location) {
  const { lat, lon, label, stationId: knownStid } = location

  // Nearest ASOS station — IEM API v1, distance param in miles
  const { data: nearestStid } = useQuery({
    queryKey: ['nearest-station', lat, lon],
    queryFn: async () => {
      const r = await fetch(
        `https://mesonet.agron.iastate.edu/api/1/stations.json?network=ASOS&distance=50&lat=${lat}&lon=${lon}`
      )
      if (!r.ok) throw new Error(r.status)
      const data = await r.json()
      // IEM v1 returns { data: [...] } where each entry has a 'stid' field
      const stations = data?.data ?? data?.stations ?? []
      return stations[0]?.stid ?? stations[0]?.id ?? null
    },
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const stid = nearestStid ?? knownStid ?? null

  // METAR observation
  const { data: metar } = useQuery({
    queryKey: ['station-metar', stid],
    enabled: !!stid,
    queryFn: async () => {
      try {
        // Routed through Vite proxy — aviationweather.gov is CORS-blocked in browser
        const r = await fetch(
          `/api/metar?ids=${stid}&format=json&taf=false&hours=1`
        )
        if (r.ok) {
          const parsed = parseAvMetar(await r.json())
          if (parsed) return parsed
        }
      } catch (_) {}
      return null
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // SPC Day 1 categorical GeoJSON
  const { data: spcDay1CatData } = useQuery({
    queryKey: ['spc-day1-geo'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  // SPC Day 1 tornado probability GeoJSON
  const { data: spcDay1TornData } = useQuery({
    queryKey: ['spc-day1-torn'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  // SPC Day 1 wind probability GeoJSON
  const { data: spcDay1WindData } = useQuery({
    queryKey: ['spc-day1-wind'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  // SPC Day 1 hail probability GeoJSON
  const { data: spcDay1HailData } = useQuery({
    queryKey: ['spc-day1-hail'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  // SPC Day 2 categorical GeoJSON
  const { data: spcDay2Data } = useQuery({
    queryKey: ['spc-day2-geo'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day2otlk_cat.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  // SPC Day 3 categorical GeoJSON
  const { data: spcDay3Data } = useQuery({
    queryKey: ['spc-day3-geo'],
    queryFn: () =>
      fetch('https://www.spc.noaa.gov/products/outlook/day3otlk_cat.nolyr.geojson')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 30 * 60 * 1000,
    retry: false,
  })

  // CAPE / CIN
  const { data: convData } = useQuery({
    queryKey: ['convective', lat, lon],
    queryFn: () =>
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=cape,convective_inhibition&wind_speed_unit=kn&forecast_days=1`
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // Nationwide SVR/TOR count
  const { data: warnData } = useQuery({
    queryKey: ['active-warnings-national'],
    queryFn: () =>
      fetch(
        'https://api.weather.gov/alerts/active?status=actual&message_type=alert' +
        '&event=Tornado%20Warning,Severe%20Thunderstorm%20Warning',
        { headers: { Accept: 'application/geo+json' } }
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 60 * 1000,
    retry: false,
  })

  // Warnings for this specific point
  const { data: pointWarnData } = useQuery({
    queryKey: ['point-warnings', lat, lon],
    queryFn: () =>
      fetch(
        `https://api.weather.gov/alerts/active?point=${lat},${lon}&status=actual`,
        { headers: { Accept: 'application/geo+json' } }
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 60 * 1000,
    retry: false,
  })

  // 7-day forecast
  const { data: forecastData } = useQuery({
    queryKey: ['open-meteo-forecast', lat, lon],
    queryFn: () =>
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,dewpoint_2m,precipitation_probability,windspeed_10m,winddirection_10m` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode` +
        `&temperature_unit=fahrenheit&windspeed_unit=kn&timezone=auto&forecast_days=7`
      ).then(r => { if (!r.ok) throw new Error(r.status); return r.json() }),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  // ── Assemble snapshot ─────────────────────────────────────────────────────
  const spcDay1Category = spcDay1CatData ? deriveCatCategory(spcDay1CatData, lat, lon) : null
  const spcDay2Category = spcDay2Data    ? deriveCatCategory(spcDay2Data,    lat, lon) : null
  const spcDay3Category = spcDay3Data    ? deriveCatCategory(spcDay3Data,    lat, lon) : null
  const spcTornadoRisk  = spcDay1TornData ? deriveHighestProb(spcDay1TornData, lat, lon) : null
  const spcWindRisk     = spcDay1WindData ? deriveHighestProb(spcDay1WindData, lat, lon) : null
  const spcHailRisk     = spcDay1HailData ? deriveHighestProb(spcDay1HailData, lat, lon) : null

  const cape = convData?.current?.cape ?? null
  const cin  = convData?.current?.convective_inhibition ?? null
  const activeSvrTorWarnings = warnData?.features?.length ?? null

  const daily = forecastData?.daily
  const forecast = daily ? {
    todayHigh:  daily.temperature_2m_max?.[0]          != null ? Math.round(daily.temperature_2m_max[0])  : null,
    todayLow:   daily.temperature_2m_min?.[0]          != null ? Math.round(daily.temperature_2m_min[0])  : null,
    pop:        daily.precipitation_probability_max?.[0] ?? null,
    conditions: wmoCondition(daily.weathercode?.[0]),
  } : null

  const forecast7Day = daily?.time
    ? daily.time.map((date, i) => ({
        date,
        high:       daily.temperature_2m_max?.[i]          != null ? Math.round(daily.temperature_2m_max[i])  : null,
        low:        daily.temperature_2m_min?.[i]          != null ? Math.round(daily.temperature_2m_min[i])  : null,
        pop:        daily.precipitation_probability_max?.[i] ?? null,
        conditions: wmoCondition(daily.weathercode?.[i]),
      }))
    : null

  const activeWarnings = (pointWarnData?.features ?? []).map(f => ({
    event:    f.properties?.event    ?? null,
    severity: f.properties?.severity ?? null,
    headline: f.properties?.headline ?? null,
    expires:  f.properties?.expires  ?? null,
  }))

  return {
    location: { name: label, station: stid, lat, lon },
    currentConditions: metar ? {
      temp:        metar.tempF,
      dewpoint:    metar.dewpF,
      humidity:    metar.humidity != null ? `${metar.humidity}%` : null,
      wind:        metar.windDir && metar.windSpd != null ? `${metar.windDir} ${metar.windSpd} kt` : null,
      gusts:       metar.gusts   != null ? `${metar.gusts} kt` : null,
      pressure:    metar.pressureInHg != null ? `${metar.pressureInHg} inHg` : null,
      visibility:  metar.visibMi != null ? `${metar.visibMi} mi` : null,
      conditions:  metar.condition,
    } : null,
    severeHighlights: {
      spcDay1Category,
      cape:                   cape  != null ? Math.round(cape)  : null,
      cin:                    cin   != null ? Math.round(cin)   : null,
      activeSvrTorWarnings,
    },
    spcOutlook: {
      day1: {
        category:    spcDay1Category,
        tornadoRisk: spcTornadoRisk,
        windRisk:    spcWindRisk,
        hailRisk:    spcHailRisk,
      },
      day2: { category: spcDay2Category },
      day3: { category: spcDay3Category },
    },
    forecast,
    forecast7Day,
    activeWarnings,
    timestamp: new Date().toISOString(),
  }
}
