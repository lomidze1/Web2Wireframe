# Plugin_Backend

Express API for the Figma plugin — website scraping, wireframe storage, CDP data bridge.

## Tech Stack

- **Language:** JavaScript (NOT TypeScript!)
- **Module:** CommonJS (`require()` / `module.exports`)
- **Framework:** Express 4
- **Database:** MongoDB via Mongoose v8 (optional — degrades gracefully)
- **Scraping:** Puppeteer v21 (legacy fallback) + CDP via `lib/cdp/`
- **HTML parsing:** Cheerio v1, jsdom v23
- **HTTP client:** axios
- **Shared:** `shared-extraction` package
- **Deployment:** Vercel (`vercel.json`)

## Commands

```bash
npm run dev       # nodemon or node api/index.js
npm run start     # node api/index.js
```

## Architecture

```
api/
  index.js              # Express app: ALL routes inline (no separate route files)
lib/
  cdp/
    client.js           # Puppeteer CDP session wrapper
    index.js            # extractDOMTreeWithCDP
  htmlExtractor.js      # renderWebsite() via Puppeteer; createWireframeData()
models/
  Wireframe.js          # Mongoose schema: wireframe data + localStyles
  UserSettings.js       # Mongoose schema: user preferences
utils/
  styleUtils.js         # DEFAULT_PLUGIN_COLORS, DEFAULT_PLUGIN_FONTS
  loremGenerator.js     # Lorem ipsum generation
  urlValidation.js      # validateUrl()
```

## API Routes

- `GET /api/health`
- `POST /api/import-url` — Puppeteer scrape → wireframe data
- `GET /api/wireframe/:id` — fetch by MongoDB ID
- `GET /api/wireframe-history/:userId` — paginated history
- `POST /api/save-settings` — upsert user settings
- `GET /api/settings/:userId` — get user settings
- `POST /api/import-cdp` — receive CDP data from Browser Extension
- `GET /api/pending-import` — one-time fetch of pending import (consumed on read)
- `DELETE /api/pending-import` — clear all pending
- `GET /api/default-colors`
- `GET /api/default-fonts`

## Key Design

- **pendingCDPImports** = in-memory `Map`, 10-min TTL, auto-cleanup every 5 min
- **MongoDB optional** — if unavailable, endpoints return defaults or 503
- **Validation** done manually in route handlers (NOT Zod)
- `userId` indexed on both Mongoose models

## Environment Variables

See `.env.example`:
```
MONGODB_URI=mongodb+srv://...
NODE_ENV=development
API_PORT=3002
CORS_ORIGIN=http://localhost:3000,https://www.figma.com
PUPPETEER_TIMEOUT=30000
PUPPETEER_HEADLESS=true
```

## Warnings

- **JavaScript/CommonJS ONLY** — `require()` / `module.exports`, არა `import/export`
- All routes are in `api/index.js` (no separate route files)
- MongoDB connection is optional — check graceful degradation
- `pendingCDPImports` is ephemeral — data lost on restart
- No test framework configured
- No TypeScript — no type checking available
