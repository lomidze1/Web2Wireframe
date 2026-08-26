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
  // Regex keys (not bare prefixes) so the proxy only claims whole path
  // segments. A bare '/web' prefix also matched page routes like
  // `/website-to-figma`, which then 404'd from the API instead of rendering.
  // The trailing slash mirrors vercel.json's `/web/(.*)` rewrite, so dev and
  // production agree on which paths belong to the backend.
  server: {
    proxy: {
      '^/api/': 'http://localhost:3002',
      '^/web/': 'http://localhost:3002',
      '^/auth/': 'http://localhost:3002',
    },
  },
})
