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
    },
  },
})
