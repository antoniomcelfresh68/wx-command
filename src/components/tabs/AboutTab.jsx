// ── About Tab ─────────────────────────────────────────────────────────────────

const SOURCES = [
  {
    name: 'Iowa State IEM Mesonet',
    data: 'Radar WMS, ASOS observations, nearest-station lookup',
    url:  'mesonet.agron.iastate.edu',
    href: 'https://mesonet.agron.iastate.edu',
  },
  {
    name: 'NOAA Storm Prediction Center',
    data: 'Convective outlooks (Day 1–8), watch/warning polygons',
    url:  'spc.noaa.gov',
    href: 'https://www.spc.noaa.gov',
  },
  {
    name: 'NOAA / NWS API',
    data: 'Forecasts, active alerts, AFD text, WFO lookup',
    url:  'api.weather.gov',
    href: 'https://api.weather.gov',
  },
  {
    name: 'aviationweather.gov',
    data: 'METAR surface observations (primary)',
    url:  'aviationweather.gov',
    href: 'https://aviationweather.gov',
  },
  {
    name: 'Open-Meteo',
    data: 'CAPE, CIN, Lifted Index, hourly & daily forecast',
    url:  'open-meteo.com',
    href: 'https://open-meteo.com',
  },
]

const VERSIONS = [
  {
    version: 'v5.1.0',
    label:   'Current build',
    notes:   'Live data throughout, SPC watch/warning polygons, AI assistant with multi-day SPC context, location search, 7-day forecast, Open-Meteo current conditions, SPC hover tooltips.',
  },
  {
    version: 'v5.0.0',
    label:   'Initial release',
    notes:   'Complete rebuild from Streamlit prototype. React + Vite stack, live data throughout, severe weather focus.',
  },
]

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: '#3b82f6',
      marginBottom: 16, paddingBottom: 8,
      borderBottom: '1px solid #1e2235',
    }}>
      {children}
    </div>
  )
}

function Card({ children, style }) {
  return (
    <div style={{
      background: '#0f1120',
      border: '1px solid #1e2235',
      borderRadius: 10,
      padding: '24px 28px',
      ...style,
    }}>
      {children}
    </div>
  )
}

function LinkButton({ href, children, icon }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '7px 16px',
        background: 'rgba(59,130,246,0.08)',
        border: '1px solid rgba(59,130,246,0.25)',
        borderRadius: 6,
        fontSize: 13, fontWeight: 500,
        color: '#8b92b3',
        textDecoration: 'none',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#3b82f6'
        e.currentTarget.style.color = '#3b82f6'
        e.currentTarget.style.background = 'rgba(59,130,246,0.14)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(59,130,246,0.25)'
        e.currentTarget.style.color = '#8b92b3'
        e.currentTarget.style.background = 'rgba(59,130,246,0.08)'
      }}
    >
      {icon}
      {children}
    </a>
  )
}

// ── SVG icons ─────────────────────────────────────────────────────────────────
const IconGitHub = (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}>
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
)

const IconLinkedIn = (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 15, height: 15, flexShrink: 0 }}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

const IconEmail = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 15, height: 15, flexShrink: 0 }}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M2 7l10 7 10-7" />
  </svg>
)

const IconExternal = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: 12, height: 12, flexShrink: 0, opacity: 0.5 }}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

// ── Main export ───────────────────────────────────────────────────────────────
export default function AboutTab() {
  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      background: '#090b14',
      padding: '32px 24px 48px',
    }}>
      {/* Centered content well */}
      <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Section 1: Credits ─────────────────────────────────────────── */}
        <Card>
          <SectionHeader>Credits</SectionHeader>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>

            {/* Avatar */}
            <div style={{ flexShrink: 0 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e2a4a, #2a3560)',
                border: '2px solid #1e2235',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{
                  fontSize: 22, fontWeight: 700, letterSpacing: '0.04em',
                  color: '#3b82f6', userSelect: 'none',
                }}>
                  AM
                </span>
              </div>
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f2ff', lineHeight: 1.3 }}>
                Antonio McElfresh
              </div>
              <div style={{ fontSize: 14, color: '#8b92b3', marginTop: 4, marginBottom: 18 }}>
                Meteorology Student · University of Oklahoma
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <LinkButton
                  href="https://github.com/antoniomcelfresh68"
                  icon={IconGitHub}
                >
                  github.com/antoniomcelfresh68
                </LinkButton>
                <LinkButton
                  href="https://linkedin.com/in/antoniomcelfresh"
                  icon={IconLinkedIn}
                >
                  LinkedIn
                </LinkButton>
                <LinkButton
                  href="mailto:antoniomcelfresh@ou.edu"
                  icon={IconEmail}
                >
                  antoniomcelfresh@ou.edu
                </LinkButton>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Section 2: Data Sources ────────────────────────────────────── */}
        <Card>
          <SectionHeader>Data Sources</SectionHeader>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Source', 'Data Provided', 'URL'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left',
                      padding: '6px 12px 10px',
                      fontSize: 11, fontWeight: 600,
                      color: '#8b92b3', textTransform: 'uppercase', letterSpacing: '0.08em',
                      borderBottom: '1px solid #1e2235',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s, i) => (
                  <tr
                    key={s.name}
                    style={{ borderBottom: i < SOURCES.length - 1 ? '1px solid #13162a' : 'none' }}
                  >
                    <td style={{ padding: '11px 12px', color: '#f0f2ff', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {s.name}
                    </td>
                    <td style={{ padding: '11px 12px', color: '#8b92b3', lineHeight: 1.5 }}>
                      {s.data}
                    </td>
                    <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          color: '#3b82f6', fontSize: 12,
                          fontFamily: 'monospace', textDecoration: 'none',
                          opacity: 0.85, transition: 'opacity 0.12s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '0.85' }}
                      >
                        {s.url}
                        {IconExternal}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Section 3: How This Was Built ─────────────────────────────── */}
        <Card>
          <SectionHeader>How This Was Built</SectionHeader>
          <p style={{
            fontSize: 14, color: '#8b92b3', lineHeight: 1.8, margin: 0,
          }}>
            Built with{' '}
            <Pill>React + Vite</Pill>,{' '}
            <Pill>Tailwind CSS</Pill>,{' '}
            <Pill>React Leaflet</Pill>,{' '}
            <Pill>Recharts</Pill>, and{' '}
            <Pill>TanStack React Query</Pill>.{' '}
            Developed using an AI-assisted workflow with{' '}
            <Pill>Claude (Anthropic)</Pill> for planning and architecture, and{' '}
            <Pill>Claude Code</Pill> for implementation. Deployed on{' '}
            <Pill>Vercel</Pill>.
          </p>
        </Card>

        {/* ── Section 4: Version History ─────────────────────────────────── */}
        <Card>
          <SectionHeader>Version History</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {VERSIONS.map((v, i) => (
              <div
                key={v.version}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 16,
                  padding: '12px 0',
                  borderBottom: i < VERSIONS.length - 1 ? '1px solid #1e2235' : 'none',
                }}
              >
                {/* Version badge */}
                <div style={{ flexShrink: 0, paddingTop: 1 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 4,
                    background: 'rgba(59,130,246,0.12)',
                    border: '1px solid rgba(59,130,246,0.25)',
                    fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                    color: '#3b82f6', letterSpacing: '0.04em',
                  }}>
                    {v.version}
                  </span>
                </div>
                {/* Description */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f0f2ff', marginBottom: 3 }}>
                    {v.label}
                  </div>
                  <div style={{ fontSize: 13, color: '#8b92b3', lineHeight: 1.6 }}>
                    {v.notes}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Footer note */}
        <div style={{
          textAlign: 'center', fontSize: 11,
          color: '#8b92b3', opacity: 0.4,
          fontFamily: 'monospace', letterSpacing: '0.05em',
        }}>
          wx-command · v5.1.0 · All weather data is provided for informational purposes only.
        </div>

      </div>
    </div>
  )
}

// Inline tech-pill component
function Pill({ children }) {
  return (
    <span style={{
      display: 'inline',
      padding: '1px 7px',
      borderRadius: 4,
      background: 'rgba(139,146,179,0.1)',
      border: '1px solid rgba(139,146,179,0.18)',
      fontSize: 13, color: '#f0f2ff',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
