# Web2Wireframe — TODO

## Legend
- ✅ Done
- 🚧 In Progress
- 🔴 Critical
- 🟡 High Priority
- 🟢 Medium Priority
- ⚪ Post-MVP

---

## ✅ Completed

### Plugin Setup & Architecture
- [x] Manifest V3 with restricted network access
- [x] Whitelisted domains (license.web2wireframe.design, api.web2wireframe.design)
- [x] Plugin UI (Preact with @create-figma-plugin/ui)
- [x] Plugin sandbox (main.ts) ↔ UI communication
- [x] Error handling & logging (logger.ts, errorHandler.ts)

### URL Import — Backend API (Plugin_Backend)
- [x] `/api/import-url` endpoint
- [x] Puppeteer website rendering (fallback)
- [x] HTML/CSS extraction with DOM tree parsing
- [x] Box model data (width, height, padding, margin)
- [x] Color extraction (background, border, text)
- [x] Font extraction (family, size, weight)
- [x] Text content extraction
- [x] Image/video → placeholder data
- [x] Multi-viewport rendering (1920, 1440, 1024, 768, 375)
- [x] Structured JSON output for Figma

### URL Import — Figma Rendering (Plugin_Frontend)
- [x] Receive and render processed data
- [x] Create Figma Frames per viewport
- [x] Generate layers from DOM tree
- [x] Apply box model (position, size, spacing)
- [x] Apply colors (Plugin Colors / Website Colors)
- [x] Apply fonts (Plugin Fonts / Website Fonts)
- [x] Apply text content (Placeholders / Lorem / Website)
- [x] Placeholder rectangles + icons for images/videos
- [x] Border-radius preservation
- [x] Frame positioning with spacing

### Feature Controls
- [x] ConfigContext (Preact) for state management
- [x] Viewports multi-select (1920, 1440, 1024, 768, 375)
- [x] Colors control (Plugin Colors / Website Colors)
- [x] Fonts control (Plugin Fonts / Website Fonts)
- [x] Text content control (Semantic / Lorem / Website)
- [x] Default color palette (config-managed)

### Browser Extension (CDP)
- [x] Extension setup (Manifest V3, Vite build, TypeScript)
- [x] Permissions: debugger, activeTab, scripting, storage
- [x] CDP client wrapper (chrome.debugger)
- [x] DOM extraction (DOM.getDocument, DOM.getBoxModel)
- [x] CSS extraction (CSS.getMatchedStylesForNode — preserves gradients/variables!)
- [x] Computed styles fallback (CSS.getComputedStyleForNode)
- [x] Font extraction (@font-face, Google Fonts, platform fonts)
- [x] Asset extraction (images, SVGs, background images)
- [x] DOM serialization with recursive tree traversal
- [x] Semantic naming (aria-label, id, class patterns)
- [x] Popup UI (Preact) with capture controls
- [x] Options page (backend URL, settings, theme)
- [x] Data compression and JSON transfer
- [x] Send to Plugin_Backend (/api/import-cdp)
- [x] Download as .w2w file option

### shared-extraction Library
- [x] Unified CDP extraction logic (used by Extension + Plugin_Backend)
- [x] DOMSnapshot.captureSnapshot integration
- [x] CSS → Figma fill/stroke/effect parsing
- [x] Tree builder (DOM → ExtractedElement)
- [x] Style parsers with gradient support
- [x] Test suite (Vitest)

### License Backend
- [x] Express server (port 3003)
- [x] Bearer token authentication
- [x] License plans (free, plus, pro)
- [x] Usage tracking and limits
- [x] Admin license management

### Website (Frontend + Backend)
- [x] Marketing site pages (Home, Docs, HowItWorks, Pricing, Support, Privacy, Terms)
- [x] Support form with Zod validation
- [x] Email delivery via Resend
- [x] Rate limiting, CORS, session management
- [x] Figma OAuth flow

### Recent Style Improvements
- [x] Aspect-ratio-aware linear gradient transforms
- [x] Symbol preservation in Lorem mode + width-based trimming
- [x] Semantic placeholders for URL and JSON imports
- [x] Compound fill style naming fixes
- [x] Text style linking and per-range fixes
- [x] Variable-first CSS architecture
- [x] CSS variable extraction and Figma variable creation

---

## 🚧 In Progress / Remaining

### Extraction Accuracy 🔴
- [ ] Improve layer accuracy (match html.to.design quality)
- [ ] Improve scroll and lazy-load handling
- [ ] Handle Shadow DOM penetration
- [ ] Handle iframes (nested content)
- [ ] Handle canvas elements

### CDP Enhancements 🟡
- [ ] Multi-viewport via `Emulation.setDeviceMetricsOverride` (for Browser Extension)
- [ ] Hover/Focus state capture via `CSS.forcePseudoState`
- [ ] Media query breakpoint extraction
- [ ] Font CSS direct access via `Page.getResourceContent`
- [ ] Timeout handling for large pages
- [ ] Retry logic for failed requests

### Testing & QA 🟡
- [ ] Test with diverse websites (static, SPA, CSS-heavy)
- [ ] Test CSS Grid and Flexbox layouts
- [ ] Test absolute/fixed positioning
- [ ] Compare output with html.to.design
- [ ] Test private/logged-in pages (CDP)
- [ ] Performance testing (large pages)

### Import Methods 🟢
- [ ] Screenshot Import (Vision/LLM model recognition)
- [ ] HTML Import (paste HTML + CSS)
- [ ] Area Selection (partial page capture via extension)

### UI/UX Polish 🟢
- [ ] Loading progress indicator improvements
- [ ] Error states with actionable messages
- [ ] Plugin UI responsive to Figma panel sizes

---

## ⚪ Post-MVP

### AI Generations
- [ ] Design AI generation features
- [ ] Integrate AI models
- [ ] AI controls UI

### Library
- [ ] Wireframe library structure
- [ ] Component categorization
- [ ] Search & filter UI
- [ ] Save custom wireframes

### Deployment & Launch
- [ ] Figma Community submission
- [ ] Plugin description and demo GIF
- [ ] Error tracking (Sentry or similar)
- [ ] Usage analytics
- [ ] User documentation
