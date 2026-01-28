# Web2Wireframe (W2W) — Product Specification

## 1. Figma Compliance

### 1.1 Network Access (Figma Review Requirement)
**Required: Restricted network access**
- ✅ Whitelisted domains only in manifest
- `license.web2wireframe.design` — License API
- `api.web2wireframe.design` — Import API
- HTTPS only, no unrestricted access

### 1.2 Subscription Model
- Trial: 3-7 days (all users)
- Free: limited functionality
- Plus: Import + Settings (no AI/Library)
- Pro: Full access (Import + AI + Library)

---

## 2. Value Proposition

**W2W converts websites to pixel-perfect Figma wireframes**
- Website → Wireframe converter
- Wireframe generator
- Wireframe library

**Strict preservation:**
Structure, layout, dimensions, spacing, hierarchy, layer logic
No real content (images/videos → placeholders)

---

## 3. Core Architecture (MVP Focus)

### A) Import Module (Core Revenue Driver) — MVP PRIORITY

**Input methods:**
1. Website URL (primary focus)
2. Screenshot
3. HTML/CSS code
4. .w2w file (Browser Extension)

**Output:**
- Pixel-perfect wireframes
- Multi-viewport support (1920, 1440, 1024, 768, 375)
- Each viewport → separate Figma Frame
- 100-200px spacing between frames

#### Feature Controls (all tabs except Area Selection)

**Viewports** (multi-select)
- Default: config-managed
- User can override per tab
- Area Selection: uses .w2w file values

**Colors** (single-select)
- Plugin Colors: W2W default palette (4 colors, config-managed)
- Website Colors: preserves original colors (bg, border, text, shadow)

**Fonts** (single-select)
- Plugin Fonts: default fallback (e.g., Montserrat)
- Website Fonts: uses website fonts (user installs if needed)

**Text Content** (single-select)
- Semantic Placeholders: Heading/Paragraph/Label structure
- Lorem Ipsum: same length and size as original
- Website Text: 1:1 copy

#### Import Types

**URL Import** (highest accuracy)
- Box model preservation
- 1:1 layer logic
- Placeholder rectangles + icons for images/videos
- Border-radius matching

**Screenshot Import** (approximation)
- Vision/LLM model recognition
- Approximate layout structure
- Font matching or Plugin Fonts fallback

**HTML Import** (URL-like accuracy)
- Same rules as URL import
- Plugin Colors/Fonts as fallback if CSS missing

**Area Selection Import** (.w2w file)
- Browser Extension → mark Page/Section → export .w2w
- Upload to plugin → wireframe generation
- No settings UI (fastest path)

---

### B) AI Generations — NOT IN MVP
Focus entirely on Import module.

---

### C) Library — NOT IN MVP
Conceptual structure only.

---

## MVP Summary

**Ship Priority:**
1. URL Import (pixel-perfect, stable)
2. Feature Controls (Viewports, Colors, Fonts, Text)
3. License integration (Trial → Free/Plus/Pro)
4. Screenshot/HTML/Area Selection imports

**Not in MVP:**
- AI Generations
- Library

**Compliance Checklist:**
- ✅ Restricted network access in manifest
- ✅ HTTPS-only domains
- ✅ Trial period for paid plugin
