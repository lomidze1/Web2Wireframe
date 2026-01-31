# Web2Wireframe (W2W) — TODO List

## Legend
- 🔴 Critical (MVP Blocker)
- 🟡 High Priority
- 🟢 Medium Priority
- ⚪ Low Priority / Post-MVP
- ✅ Done
- 🚧 In Progress

---

## 1. Figma Plugin Setup & Compliance

### 1.1 Manifest & Network Access ✅
- [x] Configure `manifest.json` with **Restricted** network access
- [x] Whitelist domains:
  - [x] `license.web2wireframe.design`
  - [x] `api.web2wireframe.design`
- [x] Ensure HTTPS-only connections
- [x] Test network access restrictions
- [x] Verify no unrestricted access warnings

### 1.2 Plugin Architecture ✅
- [x] Setup Plugin UI (Preact with @create-figma-plugin/ui)
- [x] Setup Plugin Backend (sandbox code in main.ts)
- [x] Establish UI ↔ Backend communication (postMessage pattern)
- [x] Add error handling & logging (logger.ts + errorHandler.ts)

---

## 2. Import Module — URL Import (Core Priority) 🔴

### 2.1 Backend API (Plugin_Backend) 🚧
- [x] Create `/api/import-url` endpoint
- [x] Integrate Puppeteer for website rendering
- [x] Implement HTML/CSS extraction
- [x] Parse DOM structure (nested tree)
- [x] Extract box model data (width, height, padding, margin)
- [x] Extract colors (background, border, text)
- [x] Extract fonts (family, size, weight)
- [x] Extract text content
- [x] Handle images/videos → placeholder data
- [x] Support multi-viewport rendering (1920, 1440, 1024, 768, 375)
- [x] Return structured JSON for Figma generation
- [ ] Improve extraction accuracy (scroll, lazy-load)

### 2.2 Plugin Backend (Figma API Integration) 🚧
- [x] Receive processed data from API
- [x] Create Figma Frames for each viewport
- [x] Generate layers from DOM tree structure
- [x] Apply box model (position, size, spacing)
- [x] Apply colors (Plugin Colors vs Website Colors)
- [x] Apply fonts (Plugin Fonts vs Website Fonts)
- [x] Apply text content (Placeholders/Lorem/Website)
- [x] Generate placeholder rectangles + icons for images
- [x] Preserve border-radius and rounding
- [x] Position frames with 100px spacing
- [ ] Improve layer accuracy (match html.to.design quality)

### 2.3 Testing & Validation
- [ ] Test with simple static sites
- [ ] Test with complex responsive sites
- [ ] Test with CSS Grid layouts
- [ ] Test with Flexbox layouts
- [ ] Test with absolute/fixed positioning
- [ ] Verify pixel-perfect accuracy
- [ ] Handle edge cases (empty elements, hidden elements)

---

## 3. Feature Controls UI 🟡

### 3.1 Viewports Control
- [ ] Multi-select UI component
- [ ] Default selection from config
- [ ] Options: 1920, 1440, 1024, 768, 375
- [ ] Save user preferences
- [ ] Validate at least 1 viewport selected

### 3.2 Colors Control
- [ ] Single-select radio UI
- [ ] Option: Plugin Colors (default palette)
- [ ] Option: Website Colors
- [ ] Load default palette from config
- [ ] Preview palette in UI

### 3.3 Fonts Control
- [ ] Single-select radio UI
- [ ] Option: Plugin Fonts (default: Montserrat)
- [ ] Option: Website Fonts
- [ ] Load default font from config
- [ ] Font selection dropdown (for Plugin Fonts)

### 3.4 Text Content Control
- [ ] Single-select radio UI
- [ ] Option: Semantic Placeholders
- [ ] Option: Lorem Ipsum
- [ ] Option: Website Text
- [ ] Preview examples in UI

### 3.5 Config Management 🚧
- [x] Create config file structure (ConfigContext.tsx)
- [x] Default viewports config
- [x] Default color palette config (6 colors)
- [x] Default font config
- [ ] Admin UI to update config (optional)

---

## 4. Screenshot Import 🟡

### 4.1 Backend Integration
- [ ] Create `/api/import/screenshot` endpoint
- [ ] Accept image upload (PNG, JPG)
- [ ] Integrate Vision/LLM model (Claude or OpenAI)
- [ ] Parse layout structure
- [ ] Extract approximate box model
- [ ] Extract colors and fonts (approximation)
- [ ] Return structured JSON

### 4.2 Plugin Integration
- [ ] Upload UI component
- [ ] Send screenshot to backend
- [ ] Generate wireframe from approximation
- [ ] Handle lower accuracy gracefully

---

## 5. HTML Import 🟢

### 5.1 Backend Processing
- [ ] Create `/api/import/html` endpoint
- [ ] Accept HTML + CSS input
- [ ] Parse with Cheerio/Puppeteer
- [ ] Extract structure (same as URL import)
- [ ] Fallback to Plugin Colors/Fonts if CSS missing
- [ ] Return structured JSON

### 5.2 Plugin Integration
- [ ] Code editor UI component (textarea or Monaco)
- [ ] Send HTML/CSS to backend
- [ ] Generate wireframe

---

## 6. Area Selection Import (.w2w file) 🟢

### 6.1 Browser Extension (separate project)
- [ ] Create Chrome/Firefox extension
- [ ] Selection tool UI (click to mark page/section)
- [ ] Extract selected area's HTML/CSS
- [ ] Export `.w2w` file format
- [ ] Embed viewport data in .w2w file

### 6.2 Plugin Integration
- [ ] File upload / drag-and-drop UI
- [ ] Parse `.w2w` file
- [ ] Send to backend for processing
- [ ] Generate wireframe (no settings override)

---

## 7. License Integration & Subscription 🔴

### 7.1 License Backend API
- [ ] Setup License_Backend service (port 3003)
- [ ] User authentication endpoints
- [ ] Trial period logic (3-7 days)
- [ ] Subscription tiers: Free, Plus, Pro
- [ ] Usage tracking (import count limits)
- [ ] License validation endpoint

### 7.2 Plugin License Check
- [ ] Auth UI (login/signup)
- [ ] License validation on plugin load
- [ ] Feature gating based on tier:
  - [ ] Free: limited imports
  - [ ] Plus: unlimited imports + settings
  - [ ] Pro: all features (AI/Library when added)
- [ ] Trial countdown UI
- [ ] Upgrade prompt UI

---

## 8. UI/UX Polish 🟡

### 8.1 Tab Navigation
- [ ] Tab component: URL, Screenshot, HTML, Area Selection
- [ ] Active tab highlighting
- [ ] Smooth tab transitions

### 8.2 Loading States
- [ ] Loading spinner during import
- [ ] Progress indicator for multi-viewport
- [ ] Error states with helpful messages
- [ ] Success confirmation

### 8.3 Responsive Design
- [ ] Plugin UI adapts to different Figma panel sizes
- [ ] Mobile-friendly (if applicable)

---

## 9. Testing & QA 🔴

### 9.1 Unit Tests
- [ ] Backend API endpoint tests
- [ ] DOM parsing logic tests
- [ ] Figma layer generation tests

### 9.2 Integration Tests
- [ ] End-to-end URL import flow
- [ ] Multi-viewport generation
- [ ] Feature controls application
- [ ] License gating

### 9.3 Manual Testing
- [ ] Test with 10+ diverse websites
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Performance testing (large pages)

---

## 10. Deployment & Figma Review 🔴

### 10.1 Pre-Launch Checklist
- [ ] Run TypeScript type-check
- [ ] Run ESLint
- [ ] Fix all critical errors
- [ ] Security audit (no vulnerabilities)
- [ ] Performance optimization

### 10.2 Figma Community Submission
- [ ] Create plugin description
- [ ] Add screenshots/demo GIF
- [ ] Submit to Figma Community
- [ ] Pass Figma review (Network Access: Restricted)
- [ ] Publish to Figma Community

### 10.3 Monitoring & Support
- [ ] Setup error tracking (Sentry or similar)
- [ ] Setup analytics (usage metrics)
- [ ] Create user documentation
- [ ] Setup support channel

---

## Post-MVP (Not Urgent)

### AI Generations ⚪
- [ ] Design AI generation features
- [ ] Integrate AI models
- [ ] UI for AI controls

### Library ⚪
- [ ] Design wireframe library structure
- [ ] Component categorization
- [ ] Search & filter UI
- [ ] Save custom wireframes

---

## Current Sprint Focus (MVP)

**Week 1-2:**
1. ✅ Project setup
2. URL Import backend (Puppeteer + DOM extraction)
3. Feature Controls UI

**Week 3-4:**
4. Plugin backend (Figma API integration)
5. License integration
6. Testing & bug fixes

**Week 5:**
7. UI polish
8. Figma Community submission prep
9. Submit for review

---

## 🚀 CDP IMPLEMENTATION - Browser Extension Approach

### რატომ CDP?
Puppeteer-ის `getComputedStyle` vs CDP `getMatchedStylesForNode`:
- CDP აბრუნებს original CSS rules (gradients, variables, hover states)
- Puppeteer მხოლოდ computed final values
- CDP = html.to.design-ის მიდგომა = 1:1 accuracy

### არქიტექტურა

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Browser Extension  │────▶│  Plugin_Backend  │────▶│  Figma Plugin   │
│  (CDP Capture)      │     │  (Processing)    │     │  (Rendering)    │
└─────────────────────┘     └──────────────────┘     └─────────────────┘
         │                           │
         │  Captures:                │  Processes:
         │  - DOM tree               │  - Normalizes data
         │  - Matched CSS rules      │  - Extracts fonts
         │  - Computed styles        │  - Bundles assets
         │  - Fonts (@font-face)     │  - Creates Figma JSON
         │  - Assets (images, SVGs)  │
         └───────────────────────────┘
```

---

## 11. Browser Extension (CDP Approach) ✅ COMPLETED

### 11.1 Extension Setup ✅
- [x] Create `Browser_Extension/` folder structure
- [x] Setup manifest.json (Manifest V3)
- [x] Configure permissions:
  - [x] `debugger` - CDP access
  - [x] `activeTab` - current tab access
  - [x] `scripting` - inject scripts
  - [x] `storage` - save settings
- [x] Setup build system (Vite)
- [x] TypeScript configuration
- [x] Watch mode for development
- [x] Root package.json integration (`npm run dev:extension`, `npm run build:extension`)

### 11.2 CDP Integration - Core ✅
- [x] Implement CDP connection via `chrome.debugger`
- [x] `DOM.getDocument` - სრული DOM tree
- [x] `CSS.getMatchedStylesForNode` - matched CSS rules (არა მხოლოდ computed!)
- [x] `CSS.getComputedStyleForNode` - computed styles backup
- [x] `DOM.getBoxModel` - element positioning
- [x] Scroll dimensions extraction

### 11.3 Style Extraction (Key Difference from Puppeteer) ✅
- [x] Extract gradients from `background-image` (via matched styles)
- [x] Extract CSS variables with resolved values
- [x] Extract `box-shadow` with all parameters
- [x] Extract `border-radius` (all corners)
- [x] Extract colors (background, border, text)
- [ ] Extract hover/focus/active states
- [ ] Extract media query breakpoints
- [ ] Extract animations/transitions

### 11.4 Font Extraction ✅
- [x] Detect `@font-face` declarations
- [x] Extract font file URLs (woff2, woff, ttf)
- [x] Map font-family to actual loaded fonts
- [x] Handle Google Fonts URLs
- [x] Handle system fonts fallback
- [x] Extract platform fonts for nodes

### 11.5 Asset Extraction ✅
- [x] Extract images (src, srcset)
- [x] Extract SVGs (inline and external)
- [x] Extract background images
- [x] Extract favicons/icons
- [x] Convert to base64 or URL references
- [ ] Handle lazy-loaded images (partial)

### 11.6 DOM Serialization ✅
- [x] Serialize DOM with CDP data
- [x] Recursive tree traversal
- [x] Handle video elements (poster/placeholder)
- [x] Preserve element hierarchy
- [x] Semantic naming (aria-label, id, class patterns)
- [ ] Handle Shadow DOM penetration
- [ ] Handle iframes (nested content)
- [ ] Handle canvas elements (screenshot)

### 11.7 Extension UI ✅
- [x] Popup UI (capture controls)
  - [x] "Capture Full Page" button
  - [x] Viewport selector
  - [x] Settings link
  - [ ] "Capture Selection" option (future)
- [x] Options page
  - [x] Backend URL configuration
  - [x] Default settings
  - [x] Theme (light/dark)
- [x] Status indicators (capturing, success, error)
- [x] Progress bar for large pages

### 11.8 Data Transfer ✅
- [x] Format captured data as JSON
- [x] Compress data (gzip for large pages)
- [x] Send to Plugin_Backend API
- [x] Option: Download as `.w2w` file
- [ ] Handle timeout for large pages
- [ ] Retry logic for failed requests

### 11.9 Plugin_Backend Updates
- [ ] New endpoint: `/api/import-cdp`
- [ ] Accept CDP-formatted data
- [ ] Process matched CSS rules (not just computed)
- [ ] Handle gradient parsing
- [ ] Handle shadow parsing
- [ ] Handle font bundling
- [ ] Return enhanced Figma JSON

### 11.10 Testing
- [ ] Test with simple static sites
- [ ] Test with CSS-heavy sites (gradients, shadows)
- [ ] Test with web fonts (Google Fonts, custom)
- [ ] Test with SPAs (React, Vue, Angular)
- [ ] Test with Shadow DOM (web components)
- [ ] Test with iframes
- [ ] Test private/logged-in pages
- [ ] Compare output with html.to.design

---

## Browser Extension File Structure

```
Browser_Extension/
├── manifest.json           # Manifest V3
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── background/
│   │   ├── index.ts        # Service worker
│   │   └── cdp/
│   │       ├── client.ts   # CDP client wrapper
│   │       ├── dom.ts      # DOM extraction
│   │       ├── css.ts      # CSS extraction
│   │       ├── fonts.ts    # Font extraction
│   │       └── assets.ts   # Asset extraction
│   ├── content/
│   │   └── index.ts        # Content script (if needed)
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   └── components/
│   ├── options/
│   │   ├── index.html
│   │   └── main.tsx
│   ├── shared/
│   │   ├── types.ts        # Shared types
│   │   ├── constants.ts
│   │   └── utils.ts
│   └── styles/
│       └── global.css
├── public/
│   └── icons/
│       ├── icon16.png
│       ├── icon48.png
│       └── icon128.png
└── dist/                   # Build output
```

---

## CDP vs Puppeteer Comparison

| Feature | Puppeteer (Current) | CDP Extension (New) |
|---------|--------------------|--------------------|
| DOM Access | `page.evaluate()` | `DOM.getDocument` |
| Styles | `getComputedStyle()` only | `getMatchedStylesForNode` + computed |
| Gradients | ❌ Lost in computation | ✅ Original CSS preserved |
| CSS Variables | ❌ Only resolved value | ✅ Variable name + resolved |
| Hover States | ❌ Cannot capture | ✅ Via pseudo-class rules |
| Shadow DOM | ⚠️ Limited | ✅ Full penetration |
| Fonts | ⚠️ Family name only | ✅ @font-face + files |
| Private Pages | ❌ Cannot access | ✅ User's session |
| Performance | Server-side render | Client-side capture |

---

## Implementation Priority

### Phase 1: MVP Extension (1-2 weeks)
1. Basic extension setup with CDP
2. DOM + Computed styles extraction
3. Send to Plugin_Backend
4. Basic popup UI

### Phase 2: Enhanced Extraction (1 week)
1. Matched CSS rules (gradients, shadows)
2. Font extraction
3. Asset extraction

### Phase 3: Polish (1 week)
1. Shadow DOM support
2. Iframe support
3. Options page
4. Error handling

---

## Notes

- MVP = URL Import + Feature Controls + License
- Screenshot/HTML/Area Selection = Post-MVP Phase 1
- AI/Library = Post-MVP Phase 2
- **NEW: CDP Browser Extension = Critical for quality match with html.to.design**
- Focus on URL Import accuracy and stability first
