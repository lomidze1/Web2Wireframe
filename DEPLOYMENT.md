# Deployment Guide

This guide covers production deployment for the support system in `Website_Backend` and `Website_Frontend`.

For local setup, see `QUICKSTART_SUPPORT_SYSTEM.md`.

## Backend: Website_Backend

### Build and Start

```bash
cd Website_Backend
npm install
npm run build
npm start
```

### Required Environment Variables

From `Website_Backend/src/config/env.ts`:

```env
RESEND_API_KEY=
SUPPORT_TO_EMAIL=
NOREPLY_EMAIL=
ALLOWED_ORIGIN=
```

Optional:

```env
PORT=3001
NODE_ENV=production
RATE_LIMIT_WINDOW_MS=600000
RATE_LIMIT_MAX_REQUESTS=5
FIGMA_CLIENT_ID=
FIGMA_CLIENT_SECRET=
```

Notes:

- `.env.example` does not include `NOREPLY_EMAIL` (needs verification).
- `ALLOWED_ORIGIN` must include the deployed `Website_Frontend` URL.

## Frontend: Website_Frontend

### Build

```bash
cd Website_Frontend
npm install
npm run build
```

Vite outputs to `Website_Frontend/dist`.

### Environment Variables

```env
VITE_API_URL=https://your-backend-url.example
```

## Deployment Targets

### Render (Backend)

Use `npm install && npm run build` as the build command and `npm start` as the start command. Configure the environment variables listed above.

### Vercel (Backend or Frontend)

The repository does not include a `vercel.json` (needs verification). If you use Vercel, ensure the build and start commands match the scripts above.

### Static Hosting (Frontend)

Serve the `Website_Frontend/dist` directory with your preferred static host.

## Resend Setup

- Create an account and API key at https://resend.com.
- Configure `NOREPLY_EMAIL` and `SUPPORT_TO_EMAIL` to match your verified domain (needs verification).

**Version**: 1.0.0
