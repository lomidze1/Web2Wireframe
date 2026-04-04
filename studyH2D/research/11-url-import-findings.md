# h2d URL Import Analysis (2026-03-28)

## Spy Results

Figma DevTools Console-ში network spy (Script 09) გავუშვით h2d URL import-ის დროს.

### Key Finding: 0 requests to h2d/divriots servers visible

69 network requests intercepted — ALL were Figma-internal:
- `www.figma.com` (49) — monitoring, logging, metrics
- `127.0.0.1:44950` (10) — Figma Desktop local font server
- Figma relative APIs (6) — design systems, notifications
- `events.statsigapi.net` (3) — Statsig analytics
- 0 postMessages with h2d data
- 0 errors

### Why the spy didn't catch h2d traffic

Figma plugins have a dual architecture:
1. **Plugin UI** — runs in an `<iframe>` with its own JavaScript context
2. **Plugin Sandbox** — runs in Figma's main thread, has access to `figma.*` API

Our spy intercepted the **Figma main window** context. But h2d's fetch calls happen inside the **plugin UI iframe**, which has its own `window.fetch`.

Communication between UI and sandbox uses `figma.ui.postMessage()` / `figma.ui.onmessage` — an internal Figma channel that doesn't go through `window.postMessage`.

### Conclusion: h2d URL Import Architecture

Based on:
1. The extension research showing `saveLocation: "gstorage"` (Google Cloud Storage upload)
2. The plugin code showing `api.divriots.com` references
3. The URL import UI having server-configurable options (Viewports, Themes, Languages)
4. Zero local headless browser processes observed during import

**h2d URL import uses a server-side headless browser:**

```
h2d Plugin UI iframe
  → fetch('https://api.divriots.com/h2d/capture', { url, options })
  → divriots server: launches headless Chrome, runs content script
  → returns: same .h2d format (JSON → deflate → XOR 57)
  → Plugin UI: receives data
  → figma.ui.postMessage(data) → Plugin Sandbox
  → Sandbox: CSS→Figma conversion (same 2MB engine)
```

This means **both paths (Extension and URL) produce identical .h2d format** — the only difference is WHERE the content script runs:
- Extension: in user's browser (client-side)
- URL import: on divriots server (server-side headless browser)

### Implications for W2W

1. **Our Puppeteer path IS the right approach** — h2d does the same thing for URL import
2. **Quality should be identical** between URL and Extension paths IF we use the same extraction code
3. **Our problem is not the architecture but the extraction quality** — tree-builder needs improvements from the IMPROVEMENT-PLAN
4. **Anti-bot sites (Tesla)** will fail in URL import for both h2d and W2W — only the Extension path works for those

### How to intercept h2d's URL import traffic (future)

To actually see the API calls, we would need to:
1. Find the h2d plugin UI iframe in Figma DevTools
2. Navigate to it in the Elements panel
3. Switch Console context to the iframe
4. Then run the spy script in that context

Or use a network proxy (Charles/mitmproxy) to capture all HTTPS traffic.
