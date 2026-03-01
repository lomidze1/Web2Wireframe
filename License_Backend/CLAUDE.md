# License_Backend

License management service — in-memory storage, simple REST API.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Framework:** Express 4
- **Module:** ESM (`"type": "module"`)
- **Storage:** In-memory `Map<string, License>` (NO database)
- **Dev runtime:** tsx watch
- **Production:** tsc → `node dist/index.ts`

## Commands

```bash
npm run dev       # tsx watch src/index.ts
npm run build     # tsc
npm run start     # node dist/index.ts
```

## Architecture

```
src/
  index.ts              # Entire service in single file (~209 lines)
```

## API Routes

- `GET /health`
- `GET /me/license` (auth) — get or create license for user
- `POST /license/activate` (auth) — set plan to free/plus/pro
- `POST /admin/set-license` (adminAuth) — override plan, status, expiresAt

## Auth

- Bearer token vs `DEV_TOKEN` env var (user routes)
- Bearer token vs `ADMIN_TOKEN` (admin routes)
- `req.userId` = `DEV_USER_ID` after auth

## License Model

```typescript
Plan = "free" | "plus" | "pro"
Status = "trial" | "active" | "expired" | "canceled"

interface License {
  userId: string;
  plan: Plan;
  status: Status;
  expiresAt?: string;
  limits: { importsPerDay, aiGenerationsPerDay, librarySaves }
  usage: { importsToday, aiGenerationsToday, librarySavesTotal }
  updatedAt: string;
}
```

Default free plan: 10 imports/day, 5 AI generations/day, 20 library saves.

## Environment Variables

See `.env.example`:
```
PORT=3003
ALLOWED_ORIGINS=http://localhost:5173,...
DEV_TOKEN=dev-token
DEV_USER_ID=dev-user
ADMIN_TOKEN=admin-token
```

## Warnings

- **In-memory storage — restart = complete data loss!**
- Entire service is in a single file (`src/index.ts`)
- No database — future migration needed for production
- No test framework configured
- Default port in code is 4001, but `.env.example` overrides to 3003
