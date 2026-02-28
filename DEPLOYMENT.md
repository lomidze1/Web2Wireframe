# Deployment Guide

Production deployment for Web2Wireframe services.

For local development setup, see service-specific README files.

## Services Overview

| Service | Build | Start | Port |
|---------|-------|-------|------|
| Website_Frontend | `npm run build` → `dist/` | Static hosting | — |
| Website_Backend | `npm run build` → `dist/` | `npm start` | 3001 |
| Plugin_Backend | — (JavaScript) | `node api/index.js` | 3002 |
| License_Backend | `npm run build` → `dist/` | `npm start` | 3003 |
| Plugin_Frontend | `npm run build` → `build/` | Figma plugin | — |
| Browser_Extension | `npm run build` → `dist/` | Chrome extension | — |
| shared-extraction | `npm run build` → `dist/` | Library (dependency) | — |

## Build Order

shared-extraction must build first (it's a dependency):

```bash
npm run build:shared     # 1. Shared library first
npm run build:all        # 2. Everything else
```

## Website_Frontend

### Build

```bash
cd Website_Frontend
npm run build
```

### Environment Variables

```env
VITE_API_URL=https://your-backend-url
```

### Hosting

Serve `Website_Frontend/dist` with any static host (Vercel, Netlify, etc.). Configure SPA rewrites for React Router.

## Website_Backend

### Build and Start

```bash
cd Website_Backend
npm run build
npm start
```

### Environment Variables

```env
RESEND_API_KEY=          # Required
SUPPORT_TO_EMAIL=        # Required
NOREPLY_EMAIL=           # Required
ALLOWED_ORIGIN=          # Required (frontend URL)
PORT=3001
NODE_ENV=production
FIGMA_CLIENT_ID=         # Optional (Figma OAuth)
FIGMA_CLIENT_SECRET=     # Optional (Figma OAuth)
```

## Plugin_Backend

### Start

```bash
cd Plugin_Backend
node api/index.js
```

### Environment Variables

```env
MONGODB_URI=             # Optional
API_PORT=3002
NODE_ENV=production
CORS_ORIGIN=https://www.figma.com
```

## License_Backend

### Build and Start

```bash
cd License_Backend
npm run build
npm start
```

### Environment Variables

```env
PORT=3003
DEV_TOKEN=               # Auth token
ADMIN_TOKEN=             # Admin token
ALLOWED_ORIGINS=         # Comma-separated origins
```

## Plugin_Frontend

Build and submit to Figma Community:

```bash
cd Plugin_Frontend
npm run build
```

Submit `Plugin_Frontend/manifest.json` via Figma's plugin review process.

## Browser_Extension

Build and submit to Chrome Web Store:

```bash
cd Browser_Extension
npm run build
```

Package `Browser_Extension/dist/` as a zip for Chrome Web Store submission.

## Resend Setup

- Create account at https://resend.com
- Get API key and configure `RESEND_API_KEY`
- Verify domain for `NOREPLY_EMAIL`
