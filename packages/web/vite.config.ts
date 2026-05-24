import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  ssr: {
    external: ['react-router', 'react-router-dom'],
  },
  // Frontend code uses relative `/api/*` paths so the production CSP
  // (`connect-src 'self'` in nginx.conf) stays happy and nginx can proxy
  // them. In dev (`pnpm dev:web`, port 5173) we need the same paths to
  // reach the backend on :3002 — Vite proxies them server-side, which
  // also keeps it same-origin from the browser's perspective.
  server: {
    proxy: {
      '/api': 'http://localhost:3002',
      '/web': 'http://localhost:3002',
      '/auth': 'http://localhost:3002',
    },
  },
})
