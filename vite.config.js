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
      // University of Wyoming Skew-T sounding image
      '/api/sounding-img': {
        target: 'https://weather.uwyo.edu',
        changeOrigin: true,
        rewrite: (path) => {
          const qs = path.split('?')[1] ?? ''
          const p = new URLSearchParams(qs)
          return `/cgi-bin/sounding.py?region=naconf&TYPE=GIF%3ASKEWT&YEAR=${p.get('year')}&MONTH=${p.get('month')}&FROM=${p.get('from')}&TO=${p.get('from')}&STNM=${p.get('stnm')}`
        },
      },
      // SPC mesoanalysis GIF images (CORS-blocked)
      '/api/spc-meso': {
        target: 'https://www.spc.noaa.gov',
        changeOrigin: true,
        rewrite: (path) => {
          const product = new URLSearchParams(path.split('?')[1] ?? '').get('product') ?? 'sbcape'
          return `/exper/mesoanalysis/s/${product}/${product}_s19.gif`
        },
      },
    },
  },
})
