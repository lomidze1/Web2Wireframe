# CLAUDE.md

Web2Wireframe - Figma plugin for converting websites to wireframes.

## Commands

```bash
npm run dev              # All services concurrently
npm run dev:frontend     # Website @ :5173
npm run dev:backend      # API @ :3001
npm run dev:plugin       # Figma plugin watch

npm run build:all        # Build everything
npm run type-check       # TypeScript validation
npm run lint             # ESLint check
```

## Workflow Rules

### IMPORTANT: Interview Before Coding

ახალი ფიჩერის/ცვლილებისთვის **აუცილებლად** გამოიკითხე მომხმარებელი `AskUserQuestion` tool-ით:
- რა არის მოთხოვნა?
- რომელ სერვისში?
- Edge cases?
- როგორ დავტესტოთ?

არასდროს გამოიცანო requirements - დააზუსტე!

### Code Style

- TypeScript strict mode (no `any`)
- SCSS modules for React styling
- Zod for API validation
- Express error handler middleware last
- MongoDB indexes on userId fields

### Verification After Changes

```bash
npm run type-check && npm run lint
```

### Commits

```
type: short description

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`

## Services

| Service | Port | Entry |
|---------|------|-------|
| Website_Frontend | 5173 | src/main.tsx |
| Website_Backend | 3001 | src/index.ts |
| Plugin_Frontend | - | src/main.ts |
| Plugin_Backend | 3001 | api/index.js |
| License_Backend | 4001 | src/index.ts |

## Skills Available

- `/interview-me` - Requirements gathering
- `/code-review` - Quality check
- `/deploy-check` - Pre-deployment validation
- `/fix-issue [#]` - GitHub issue workflow
- `/new-feature` - Feature implementation

## Agents Available

See `.claude/agents/` for specialized agents:
- `website-frontend` - React/Vite/SCSS
- `backend-typescript` - Express/Zod
- `figma-plugin` - Figma API
- `database-mongodb` - Mongoose
- `web-scraping` - Puppeteer/Cheerio
- `fullstack-integration` - Cross-service

## External Services

- Resend - Email delivery
- MongoDB - Wireframe storage
- Puppeteer - Website rendering
