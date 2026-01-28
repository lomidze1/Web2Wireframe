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

### 1.2 Plugin Architecture
- [ ] Setup Plugin UI (HTML/CSS/React)
- [ ] Setup Plugin Backend (sandbox code)
- [ ] Establish UI ↔ Backend communication
- [ ] Add error handling & logging

---

## 2. Import Module — URL Import (Core Priority) 🔴

### 2.1 Backend API (Website_Backend)
- [ ] Create `/api/import/url` endpoint
- [ ] Integrate Puppeteer for website rendering
- [ ] Implement HTML/CSS extraction
- [ ] Parse DOM structure
- [ ] Extract box model data (width, height, padding, margin)
- [ ] Extract colors (background, border, text, shadow)
- [ ] Extract fonts (family, size, weight)
- [ ] Extract text content
- [ ] Handle images/videos → placeholder data
- [ ] Support multi-viewport rendering (1920, 1440, 1024, 768, 375)
- [ ] Return structured JSON for Figma generation

### 2.2 Plugin Backend (Figma API Integration)
- [ ] Receive processed data from API
- [ ] Create Figma Frames for each viewport
- [ ] Generate layers 1:1 from DOM structure
- [ ] Apply box model (position, size, spacing)
- [ ] Apply colors (Plugin Colors vs Website Colors)
- [ ] Apply fonts (Plugin Fonts vs Website Fonts)
- [ ] Apply text content (Placeholders/Lorem/Website)
- [ ] Generate placeholder rectangles + icons for images
- [ ] Preserve border-radius and rounding
- [ ] Position frames with 100-200px spacing

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

### 3.5 Config Management
- [ ] Create config file structure
- [ ] Default viewports config
- [ ] Default color palette config (4 colors)
- [ ] Default font config
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

## Notes

- MVP = URL Import + Feature Controls + License
- Screenshot/HTML/Area Selection = Post-MVP Phase 1
- AI/Library = Post-MVP Phase 2
- Focus on URL Import accuracy and stability first
