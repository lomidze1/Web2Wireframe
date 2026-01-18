# Plugin_Backend

Backend service for the Figma plugin (Express + MongoDB + Puppeteer).

## Setup

```bash
npm install
```

Create `.env` from the example:

```bash
cp .env.example .env
```

`.env.example` values:

```env
MONGODB_URI=
NODE_ENV=development
API_PORT=3001
API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000,https://www.figma.com
PUPPETEER_TIMEOUT=30000
PUPPETEER_HEADLESS=true
```

## Development

```bash
npm run dev
```

Server starts on `API_PORT` (default `3001` in `api/index.js`).

## API Endpoints

- `POST /api/import-url`
- `GET /api/wireframe/:id`
- `GET /api/wireframe-history/:userId`
- `POST /api/save-settings`
- `GET /api/settings/:userId`
- `GET /api/health`

Request shape for `/api/import-url` (from `api/index.js`):

```json
{
  "userId": "figma-user-123",
  "sourceUrl": "https://example.com",
  "viewports": [1440, 375],
  "colorMode": "plugin-colors",
  "typographyMode": "plugin-fonts"
}
```

## Deployment

Deployment for `Plugin_Backend` is not documented in the repo (needs verification).

## Related Docs

- Frontend plugin UI: `../Plugin_Frontend/README.md`
- Technical overview: `./TECHNICAL_DOCUMENTATION.md`
