# Plugin_Backend

Wireframe extraction API (Express + Puppeteer + CDP).

## Tech Stack

- Express 4.18.2
- Puppeteer 21.4.0 (legacy fallback)
- Cheerio 1.0.0
- JSDOM 23.0.1
- Mongoose 8.0.0 (optional MongoDB)
- shared-extraction (local dependency)

## Setup

```bash
npm install
cp .env.example .env
```

### Environment Variables

```env
MONGODB_URI=             # MongoDB connection (optional)
NODE_ENV=development
API_PORT=3002
API_URL=http://localhost:3002
CORS_ORIGIN=http://localhost:3000,https://www.figma.com
PUPPETEER_TIMEOUT=30000
PUPPETEER_HEADLESS=true
```

## Development

```bash
npm run dev      # Server @ :3002
```

## API Endpoints

### POST /api/import-url

Puppeteer-based URL import (fallback method).

```json
{
  "userId": "figma-user-123",
  "sourceUrl": "https://example.com",
  "viewports": [1440, 375],
  "colorMode": "plugin-colors",
  "typographyMode": "plugin-fonts",
  "textMode": "lorem",
  "pluginColors": ["#333", "#666", "#999", "#ccc"],
  "pluginFont": "Montserrat"
}
```

### POST /api/import-cdp

CDP data import from Browser Extension (primary method). Accepts structured CDP capture data with matched CSS rules, fonts, and assets.

### GET /api/health

Health check endpoint.

### Other Endpoints

- `GET /api/wireframe/:id` — Get specific wireframe
- `GET /api/wireframe-history/:userId` — User's history
- `POST /api/save-settings` — Save user settings
- `GET /api/settings/:userId` — Get user settings

## Project Structure

```
Plugin_Backend/
├── api/
│   └── index.js           # Express server entry
├── lib/
│   └── htmlExtractor.ts   # Puppeteer extraction
├── utils/
│   └── styleUtils.ts      # Color/font utilities
├── models/
│   ├── Wireframe.js       # Wireframe schema
│   └── UserSettings.js    # User settings schema
└── package.json           # Depends on shared-extraction
```

## CDP vs Puppeteer

| Method | Endpoint | Quality |
|--------|----------|---------|
| **CDP** (primary) | `/api/import-cdp` | 1:1 fidelity — gradients, CSS vars preserved |
| **Puppeteer** (fallback) | `/api/import-url` | Lower — getComputedStyle loses gradients/variables |

CDP data comes from Browser_Extension via the shared-extraction library.
