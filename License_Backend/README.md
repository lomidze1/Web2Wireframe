# License_Backend

License and subscription management service.

## Tech Stack

- Express 4.19.2
- TypeScript 5.4.5
- CORS 2.8.5

## Setup

```bash
npm install
cp .env.example .env   # if exists, otherwise create .env manually
```

### Environment Variables

```env
PORT=3003
DEV_TOKEN=               # Development auth token
ADMIN_TOKEN=             # Admin operations token
ALLOWED_ORIGINS=         # CORS origins (comma-separated)
```

## Development

```bash
npm run dev       # tsx watch @ :3003
npm run build     # tsc → dist/
npm start         # node dist/index.js
```

## API Endpoints

### GET /me/license

Get current user's license. Requires Bearer token.

Response:
```json
{
  "userId": "user-123",
  "plan": "free",
  "status": "active",
  "limits": {
    "importsPerDay": 5,
    "aiGenerationsPerDay": 0,
    "librarySaves": 3
  },
  "usage": {
    "importsToday": 2,
    "aiGenerationsToday": 0,
    "librarySavesTotal": 1
  }
}
```

### POST /license/activate

Activate or change a plan. Requires Bearer token.

### POST /admin/set-license

Admin: set any user's license. Requires Admin token.

### GET /health

Health check.

## Plans

| Plan | Imports/Day | AI/Day | Library Saves |
|------|-------------|--------|---------------|
| Free | 5 | 0 | 3 |
| Plus | Unlimited | 0 | Unlimited |
| Pro | Unlimited | Unlimited | Unlimited |

## Authentication

Uses Bearer token in `Authorization` header:
```
Authorization: Bearer <token>
```

In-memory license store (no database required).
