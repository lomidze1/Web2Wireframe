# Website_Backend

Support API for the website (Express + TypeScript).

## Setup

```bash
npm install
```

Create `.env`:

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

- `.env.example` does not list `NOREPLY_EMAIL` (needs verification).
- Rate limiting is skipped when `NODE_ENV=development` (see `src/middleware/rateLimit.ts`).

## Development

```bash
npm run dev
```

Default port is `3001` (see `src/config/env.ts`).

## Build

```bash
npm run build
npm start
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
  "figmaUserId": "123456"
}
```

Response:

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

### GET /api/health

```json
{
  "success": true,
  "message": "Support API is running",
  "timestamp": "2024-12-28T10:30:00Z"
}
```

## Related Docs

- Setup: `../QUICKSTART_SUPPORT_SYSTEM.md`
- Reference: `../COMPLETE_SUPPORT_SYSTEM.md`
- Deployment: `../DEPLOYMENT.md`
