# URL Import — Corrected Findings (2026-03-29)

## Correction: Chrome Icon Observation

**W2W (ჩვენი plugin):** URL import-ისას Mac-ზე Chrome icon ჩნდება dock-ში — ეს ჩვენი Puppeteer headless browser-ია.

**h2d:** URL import-ისას **არანაირი browser icon არ ჩნდება** — არც dock-ში, არც სხვაგან.

## h2d URL Import — Historical vs Current Behavior

### ადრე (older versions):
- h2d URL import-ისას **user-ის გახსნილ browser-ში** ხდებოდა lazy scroll/loading
- ანუ h2d ადრე **user-ის browser-ს იყენებდა** URL import-ისთვისაც (extension CDP-ით)

### ახლა (v0.0.191):
- URL import-ისას **არანაირი browser activity არ ჩანს**
- არც Chrome icon dock-ში
- არც tab-ების ცვლილება
- არც lazy loading user-ის browser-ში
- **ყველა browser extension გაყინულია** (არაფერი იცვლება)

### დასკვნა:
**h2d ახლა სერვერზე ამუშავებს URL import-ს** — api.divriots.com-ზე headless browser-ით.

## ჩვენი მიდგომა vs h2d

| Aspect | W2W (ახლა) | h2d (ახლა) |
|--------|-----------|------------|
| URL import | **ლოკალური Puppeteer** (Chrome icon ჩნდება) | **სერვერზე** (არაფერი ჩანს) |
| Extension import | Browser Extension + CDP | Browser Extension + CDP |
| User experience | Chrome icon dock-ში (confusing) | Seamless (invisible) |

## როგორ გადავიდეთ სერვერულ მოდელზე?

### Option A: Serverless Browser (Recommended)

Cloud-based headless browser services:

1. **Browserless.io** — Puppeteer/Playwright as a service
   - API: `browserless.io/chromium` → connect via `puppeteer.connect()`
   - Pricing: $0.01-0.05 per session
   - Easy migration: replace `puppeteer.launch()` with `puppeteer.connect({ browserWSEndpoint })`

2. **AWS Lambda + Chromium** — Self-hosted serverless
   - `@sparticuz/chromium` package for Lambda
   - Free tier: 1M requests/month
   - Full control, no vendor lock-in

3. **Google Cloud Run** — Container-based
   - Docker container with Chrome + our extraction code
   - Auto-scaling, pay-per-use
   - Easy deployment

4. **Render.com / Railway.app** — Simple deployment
   - Docker-based, Puppeteer pre-installed
   - Fixed pricing, simpler setup

### Option B: Hybrid (Current Architecture Enhanced)

Keep Puppeteer in Plugin_Backend but:
1. Hide the browser window: `puppeteer.launch({ headless: 'new' })` (არა `headless: true`)
2. `--no-startup-window` flag
3. `--window-position=-10000,-10000` (off-screen)
4. Process-level hiding on macOS

### Option C: Full Server Migration

Dedicated capture server:
```
Plugin_Frontend → POST /api/capture { url, options }
  → Capture Server (separate service, scalable)
    → Headless Chrome
    → shared-extraction
    → Return JSON
  → Plugin_Frontend renders
```

## Recommended Path

**Short-term:** Option B — fix `headless: 'new'` + `--no-startup-window` (5 min fix)
**Medium-term:** Option C — separate capture server (1-2 days)
**Long-term:** Option A — serverless for scalability

### Immediate Fix (Plugin_Backend):

```typescript
// Plugin_Backend/lib/cdp/index.ts
const browser = await puppeteer.launch({
  headless: 'new',        // New headless mode (no visible window)
  args: [
    '--no-startup-window',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
});
```

ეს არ შეცვლის ფუნქციონალობას, მაგრამ Chrome icon აღარ გამოჩნდება dock-ში.
