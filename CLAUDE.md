# CLAUDE.md

Web2Wireframe: Figma plugin + Chrome extension + website that turn web pages into Figma wireframes. **Paused from mid-November 2026**: it runs on its own for free and gets a check about once a month.

Full reference (architecture, routes, payments/Flitt, extraction, release runbook, code style): `docs/claude-reference.md`. Read only the section the task needs.
Project memory: `docs/claude-memory/` (index: `INDEX.md`). Save new notes there.

## Commands
```bash
docker compose up -d     # API + Web + MongoDB
pnpm dev:plugin          # Figma plugin watch
pnpm build && pnpm test  # verify after changes
pnpm type-check
```

## Rules that always apply
- **Don't change code without my OK.** Show the change first, then wait.
- **Don't push to GitHub without my confirmation.** `main` auto-deploys the API (Render) and website (Vercel).
- **LIVE zone: never edit `packages/api/`, `packages/shared/`, `packages/browser-extension/`** unless I ask explicitly. They are live; breaking the extension → API → plugin contract breaks real users. Normal work happens only in `packages/figma-plugin`.
- **`USE_PRODUCTION` must be `false`** in `packages/figma-plugin/src/ui/shared/apiConfig.ts` before any `git add` / `commit` / `push`.
- `packages/figma-plugin` and `browser-extension` are **Preact**, not React. React is only in `packages/web`.
- Payments are **Flitt only**; never add Stripe/Paddle/etc.
- Each package has its own `CLAUDE.md` with details; it loads when you work there.
