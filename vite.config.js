import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // aviationweather.gov blocks direct browser requests with CORS headers
      '/api/metar': {
        target: 'https://aviationweather.gov',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/metar/, '/api/data/metar'),
      },
      // IEM watches GeoJSON — CORS-blocked from browser in some environments
      '/api/iem-watches': {
        target: 'https://mesonet.agron.iastate.edu',
        changeOrigin: true,
        rewrite: () => '/api/1/spc_watch_outline.geojson',
      },
      // SPC storm report CSVs (CORS-blocked)
      '/api/spc-torn': {
        target: 'https://www.spc.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/climo/reports/today_filtered_torn.csv',
      },
      '/api/spc-wind': {
        target: 'https://www.spc.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/climo/reports/today_filtered_wind.csv',
      },
      '/api/spc-hail': {
        target: 'https://www.spc.noaa.gov',
        changeOrigin: true,
        rewrite: () => '/climo/reports/today_filtered_hail.csv',
      },
      // SPC mesoanalysis GIF images — Referer required or server rejects
      '/api/spc-meso': {
        target: 'https://www.spc.noaa.gov',
        changeOrigin: true,
        headers: { Referer: 'https://www.spc.noaa.gov/' },
        rewrite: (path) => {
          const product = new URLSearchParams(path.split('?')[1] ?? '').get('product') ?? 'sbcp'
          return `/exper/mesoanalysis/s4/${product}.gif`
        },
      },
      // SPC sounding analysis GIFs — direct images, no HTML wrapper
      '/api/spc-sounding': {
        target: 'https://www.spc.noaa.gov',
        changeOrigin: true,
        headers: { Referer: 'https://www.spc.noaa.gov/' },
        rewrite: (path) => {
          const p = new URLSearchParams(path.split('?')[1] ?? '')
          return `/exper/soundings/${p.get('dt')}_OBS/${p.get('sid')}.gif`
        },
      },
    },
  },
})
