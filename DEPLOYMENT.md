# Deployment Guide

## Docker Deployment (Recommended)

### Production

```bash
docker compose up -d --build

# Verify
docker compose ps          # All services "healthy"
curl http://localhost:3002/api/health
curl http://localhost:80    # Website
```

### Services

| Service | Port | Image | Health Check |
|---------|------|-------|-------------|
| api | 3002 | node:18-slim + chromium | `GET /api/health` |
| web | 80 | nginx:alpine (SSG static files) | - |
| mongo | 27017 | mongo:7 | `mongosh ping` |

### Environment Variables

Single `.env` file at project root (see `.env.example`):

```env
API_PORT=3002
MONGODB_URI=mongodb://mongo:27017/web2wireframe
AUTH_SECRET=<random-secret>
SESSION_SECRET=<random-secret>
ANTHROPIC_API_KEY=sk-ant-...
RESEND_API_KEY=re_...
FIGMA_CLIENT_ID=...
FIGMA_CLIENT_SECRET=...
CORS_ORIGIN=https://www.figma.com,https://www.web2wireframe.design
```

## Build-only Packages

### Figma Plugin (`packages/figma-plugin`)

```bash
cd packages/figma-plugin && pnpm build
# Output: build/main.js + build/ui.js → upload to Figma
```

### Browser Extension (`packages/browser-extension`)

```bash
cd packages/browser-extension && pnpm build
# Output: dist/ → upload to Chrome Web Store
```

## Build Order (handled by Turborepo)

```
1. packages/shared     (tsup)
2. packages/api        (tsc)
3. packages/web        (vite + SSG prerender)
4. packages/figma-plugin, packages/browser-extension (parallel)
```

## Production Domains

- **API:** `api.web2wireframe.design` (port 3002)
- **Website:** `www.web2wireframe.design` (port 80, nginx)
