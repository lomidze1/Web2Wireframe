# Website_Backend

Support API and Figma OAuth service (Express + TypeScript).

## Tech Stack

- Express 4.18.2
- TypeScript 5.3.3
- Zod 3.22.4 (validation)
- Resend 2.0.0 (email)
- express-session 1.19.0
- express-rate-limit 7.1.5

## Setup

```bash
npm install
cp .env.example .env
```

### Environment Variables

```env
# Required
RESEND_API_KEY=          # Resend email API key
SUPPORT_TO_EMAIL=        # Email to receive support tickets
NOREPLY_EMAIL=           # Sender email address
ALLOWED_ORIGIN=          # CORS origin (e.g., http://localhost:5173)

# Optional
PORT=3001
NODE_ENV=development
RATE_LIMIT_WINDOW_MS=600000
RATE_LIMIT_MAX_REQUESTS=5
FIGMA_CLIENT_ID=         # Figma OAuth (if enabled)
FIGMA_CLIENT_SECRET=     # Figma OAuth (if enabled)
```

Note: Rate limiting is skipped when `NODE_ENV=development`.

## Development

```bash
npm run dev       # tsx watch @ :3001
npm run build     # tsc → dist/
npm start         # node dist/index.js
npm run type-check
```

## API Endpoints

### POST /api/support

Submit a support ticket. Sends email via Resend.

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

**Validation rules** (from `src/middleware/validation.ts`):
- `name`: 2–100 chars, letters/spaces/apostrophes/hyphens
- `email`: valid format, max 255
- `topic`: 3–100 chars
- `message`: 10–5000 chars
- `selectedPlan`: `Free | Plus | Pro` (optional)
- `figmaUserId`: max 255 (optional)

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

### GET /api/health

```json
{
  "success": true,
  "message": "Support API is running",
  "timestamp": "2024-12-28T10:30:00Z"
}
```

### Figma OAuth (conditional)

- `GET /api/figmaAuth/login` — Initiate OAuth
- `GET /api/figmaAuth/callback` — OAuth callback

Enabled when `FIGMA_CLIENT_ID` and `FIGMA_CLIENT_SECRET` are set.

## Project Structure

```
Website_Backend/
├── src/
│   ├── index.ts           # Express server entry
│   ├── config/env.ts      # Zod env validation
│   ├── routes/
│   │   ├── support.ts     # Support form API
│   │   ├── figmaAuth.ts   # Figma OAuth
│   │   └── sessionApi.ts  # Session management
│   ├── middleware/
│   │   ├── validation.ts  # Zod schemas
│   │   ├── auth.ts        # Authentication
│   │   ├── errorHandler.ts
│   │   └── rateLimit.ts
│   ├── controllers/
│   ├── services/
│   └── types/
└── tsconfig.json
```

## Troubleshooting

- **CORS errors**: Update `ALLOWED_ORIGIN` in `.env`
- **Email not sent**: Verify `RESEND_API_KEY`, `NOREPLY_EMAIL`, and `SUPPORT_TO_EMAIL`
- **Rate limited**: Set `NODE_ENV=development` or increase `RATE_LIMIT_MAX_REQUESTS`
