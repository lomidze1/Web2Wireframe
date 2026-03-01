# Website_Backend

Express API for the marketing website — Figma OAuth, support tickets, license proxy.

## Tech Stack

- **Language:** TypeScript (strict mode, all strict checks)
- **Framework:** Express 4
- **Module:** ESM (`"type": "module"`)
- **Validation:** Zod v3
- **Email:** Resend v2
- **Auth:** express-session + Figma OAuth (authorization code flow)
- **Rate limiting:** express-rate-limit v7
- **Dev runtime:** tsx watch
- **Production:** tsc → `node dist/index.js`

## Commands

```bash
npm run dev       # tsx watch src/index.ts
npm run build     # tsc
npm run start     # node dist/index.js
```

## Architecture

```
src/
  index.ts              # Express app: session, CORS, routes, errorHandler LAST
  config/
    env.ts              # Centralized config: requireEnv/devDefault helpers
  controllers/
    supportController.ts
  middleware/
    auth.ts             # requireSessionAuth
    errorHandler.ts     # AppError class + errorHandler + asyncHandler
    rateLimit.ts        # supportRateLimiter
    validation.ts       # Zod schemas (supportTicketSchema)
  routes/
    support.ts          # POST /api/support
    figmaAuth.ts        # GET /auth/figma/login, /auth/figma/callback
    sessionApi.ts       # GET /api/me, /api/license/me (proxy)
  services/
    emailService.ts
    ipService.ts
    planService.ts
  types/
    index.ts
    express-session.d.ts  # Session augmentation: figmaUserId, figmaEmail, oauthState
```

## API Routes

- `GET /health`
- `GET /auth/figma/login` → Figma OAuth redirect
- `GET /auth/figma/callback` → exchange code, store userId in session
- `GET /api/me` → session user info
- `GET /api/license/me` → proxy to License_Backend
- `POST /api/support` → rate-limited support ticket → Resend email

## Patterns

- `asyncHandler` wrapper for all async route handlers
- Error handler middleware **always last** in `index.ts`
- Feature flags: `figmaOAuthEnabled`, `licenseProxyEnabled` (env-based)
- Session cookie: `w2w_session`, httpOnly, sameSite lax, secure in production
- Zod validation in `middleware/validation.ts`

## Environment Variables

See `.env.example`:
```
PORT=3001
SESSION_SECRET=change-me-in-production
RESEND_API_KEY=...
FIGMA_CLIENT_ID=...
FIGMA_CLIENT_SECRET=...
FIGMA_REDIRECT_URI=http://localhost:3001/auth/figma/callback
LICENSE_SERVICE_URL=https://web2wireframe.onrender.com
LICENSE_SERVICE_TOKEN=dev-token
ALLOWED_ORIGIN=http://localhost:5173
```

## Warnings

- Error handler middleware MUST be registered last
- Session augmentation types in `types/express-session.d.ts`
- License proxy depends on License_Backend availability
- No test framework configured
