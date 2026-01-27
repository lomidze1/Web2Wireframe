# Complete Support System Reference

This document is the full reference for the support system running in `Website_Frontend` and `Website_Backend`.

For setup, see `QUICKSTART_SUPPORT_SYSTEM.md`. For deployment, see `DEPLOYMENT.md`.

## Project Structure (Support System)

```
Web 2 Wireframe/
├── Website_Frontend/   # Support form UI (React + Vite)
└── Website_Backend/    # Support API (Express + TypeScript)
```

## Configuration

Backend env vars (from `Website_Backend/src/config/env.ts`):

```env
# Required
RESEND_API_KEY=
SUPPORT_TO_EMAIL=
NOREPLY_EMAIL=
ALLOWED_ORIGIN=

# Optional
PORT=3001
NODE_ENV=development
RATE_LIMIT_WINDOW_MS=600000
RATE_LIMIT_MAX_REQUESTS=5
FIGMA_CLIENT_ID=
FIGMA_CLIENT_SECRET=
```

Notes:

- `.env.example` in `Website_Backend` does not currently include `NOREPLY_EMAIL` (needs verification).
- Rate limiting is disabled in development (see `Website_Backend/src/middleware/rateLimit.ts`).

Frontend env vars (from `Website_Frontend/.env.local.example`):

```env
VITE_API_URL=http://localhost:3001
```

## API

### POST /api/support

Request:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "topic": "Installation",
  "message": "I'm having trouble installing the plugin",
  "selectedPlan": "Free",
  "figmaUserId": "optional-figma-id"
}
```

Response (200):

```json
{
  "success": true,
  "message": "Support ticket submitted successfully",
  "data": {
    "ticketId": "SUPPORT-1703764000000-abc123",
    "plan": "Free",
    "planVerified": false
  }
}
```

Response (400 - validation error):

```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email address"
    }
  ]
}
```

Response (429 - rate limited):

```json
{
  "success": false,
  "error": "Too many support requests, please try again later"
}
```

### GET /api/health

```json
{
  "success": true,
  "message": "Support API is running",
  "timestamp": "2024-12-28T10:30:00Z"
}
```

## Validation Rules

From `Website_Backend/src/middleware/validation.ts`:

- Name: 2-100 chars, letters/spaces/`'`/`-`
- Email: valid format, max 255
- Topic: 3-100 chars
- Message: 10-5000 chars
- selectedPlan: `Free | Plus | Pro` (optional)
- figmaUserId: max 255 (optional)

## Plan Determination

From `Website_Backend/src/services/planService.ts`:

1. Figma lookup placeholder (returns `null`).
2. Client hint (`selectedPlan`) fallback.
3. Default to `Free`.

Verified plans are cached in memory (1 hour).

## Email Delivery

Emails are sent via Resend using:

- `from`: `NOREPLY_EMAIL`
- `to`: `SUPPORT_TO_EMAIL`
- `replyTo`: user email

The subject format includes plan tier and topic (see `Website_Backend/src/controllers/supportController.ts`).

## Testing

```bash
curl -X POST http://localhost:3001/api/support \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "topic": "Testing",
    "message": "This is a test message that is long enough",
    "selectedPlan": "Free"
  }'
```

## Troubleshooting

- CORS errors: update `ALLOWED_ORIGIN` in `Website_Backend/.env`.
- Email not sent: verify `RESEND_API_KEY`, `NOREPLY_EMAIL`, and `SUPPORT_TO_EMAIL`.
- Rate limiting: configure `RATE_LIMIT_*` or run with `NODE_ENV=development`.
