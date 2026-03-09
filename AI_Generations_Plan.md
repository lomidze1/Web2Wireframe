# AI Generations — Implementation Plan

## სარჩევი

1. [არქიტექტურის მიმოხილვა](#1-არქიტექტურის-მიმოხილვა)
2. [Data Flow](#2-data-flow)
3. [Claude API Integration](#3-claude-api-integration)
4. [Simplified Wireframe Format (AI Output)](#4-simplified-wireframe-format-ai-output)
5. [Converter: Simplified → WireframeNode](#5-converter-simplified--wireframenode)
6. [Backend Endpoints](#6-backend-endpoints)
7. [Frontend Integration](#7-frontend-integration)
8. [License / Access Control](#8-license--access-control)
9. [Rate Limiting & Queue](#9-rate-limiting--queue)
10. [Error Handling](#10-error-handling)
11. [Testing Strategy](#11-testing-strategy)
12. [Implementation Phases](#12-implementation-phases)
13. [Cost Analysis](#13-cost-analysis)

---

## 1. არქიტექტურის მიმოხილვა

### მიზანი

AI-ით wireframe-ების გენერირება Figma-ში — plugin colors, plugin fonts, placeholder text/images, auto layout. User ირჩევს page type + sections + density + viewport → AI აგენერირებს → არსებული rendering pipeline რენდერავს Figma-ში.

### სისტემის კომპონენტები

```
┌─────────────────────────────────────────────────────────────────┐
│                        Plugin_Frontend                          │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  PageGeneration   │    │  BlockGeneration  │                  │
│  │  (UI Component)   │    │  (UI Component)   │                  │
│  └────────┬─────────┘    └────────┬──────────┘                  │
│           │ params                 │ params                      │
│           └──────────┬─────────────┘                             │
│                      ▼                                           │
│              fetch(/api/generate-page)                           │
│              fetch(/api/generate-block)                          │
│                      │                                           │
│                      ▼ response: { frames: WireframeFrame[] }   │
│           figma.ui.postMessage({                                 │
│             type: "render-wireframe",                            │
│             data: RenderWireframeData                            │
│           })                                                     │
│                      │                                           │
│  ┌───────────────────▼──────────────────────┐                   │
│  │         main.ts (Figma Sandbox)           │                  │
│  │  createWireframeFrame() → Figma Nodes     │                  │
│  │  (არსებული pipeline, ცვლილება არ სჭირდება) │                  │
│  └───────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Plugin_Backend                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │  POST /api/generate-page                          │           │
│  │  POST /api/generate-block                         │           │
│  │                                                    │           │
│  │  1. Validate request + license key                 │           │
│  │  2. Rate limit check                               │           │
│  │  3. Build Claude API prompt                        │           │
│  │  4. Call Claude API → Simplified JSON              │           │
│  │  5. Validate AI output                             │           │
│  │  6. Convert → WireframeNode tree                   │           │
│  │  7. Return { frames: WireframeFrame[] }            │           │
│  └──────────────────────────────────────────────────┘           │
│                          │                                       │
│                          ▼                                       │
│                 ┌─────────────────┐                              │
│                 │  Claude API      │                              │
│                 │  (Anthropic)     │                              │
│                 └─────────────────┘                              │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │  License Validation (License_Backend or inline)   │           │
│  │  Rate Limiting (in-memory or Redis)               │           │
│  │  Generation History (MongoDB, optional)            │           │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### რატომ ეს არქიტექტურა?

1. **Claude API key მხოლოდ backend-ზე** — user ვერასდროს ხედავს
2. **Converter backend-ზე** — AI output validation + transformation server-side
3. **არსებული rendering pipeline ხელუხლებელი** — main.ts და nodes.ts არ იცვლება
4. **License validation backend-ზე** — არ ენდობა client-side შემოწმებას

---

## 2. Data Flow

### Page Generation Flow (დეტალური)

```
Step 1: User Interaction
─────────────────────────
User selects:
  - pageType: "home"
  - sections: ["Hero", "Features", "Pricing", "FAQ", "Footer"]
  - density: "detailed"
  - viewports: [1440, 375]
  - notes: "SaaS landing page style"

Step 2: Frontend → Backend Request
──────────────────────────────────
POST /api/generate-page
{
  "userId": "figma-user-123",
  "licenseKey": "WF-XXXX-XXXX-XXXX",
  "pageType": "home",
  "sections": ["Hero", "Features", "Pricing", "FAQ", "Footer"],
  "density": "detailed",
  "viewports": [1440, 375],
  "notes": "SaaS landing page style",
  "pluginColors": {
    "text": "#11151A",
    "background": "#F1F2F0",
    "secondary": "#BDC1B2",
    "surface": "#AAB5C3",
    "accent": "#AFC6DC"
  },
  "pluginFont": "Montserrat"
}

Step 3: Backend Processing
──────────────────────────
3a. Validate license key → OK
3b. Check rate limit (user: 50 gen/month) → OK
3c. For each viewport:
    - Build Claude API prompt with context
    - Call Claude API → get Simplified Wireframe JSON
    - Validate AI output (Zod schema)
    - Convert to WireframeNode tree
    - Wrap in WireframeFrame { viewportWidth, viewportHeight, tree }

Step 4: Backend → Frontend Response
────────────────────────────────────
{
  "success": true,
  "wireframeData": {
    "frames": [
      { "viewportWidth": 1440, "viewportHeight": 4200, "tree": { ... } },
      { "viewportWidth": 375, "viewportHeight": 6800, "tree": { ... } }
    ]
  },
  "pluginColors": { ... },
  "generationId": "gen-abc123",
  "tokensUsed": 4500
}

Step 5: Frontend → Sandbox
──────────────────────────
figma.ui.postMessage({
  type: "render-wireframe",
  data: {
    frames: response.wireframeData.frames,
    sourceUrl: "ai://home-page",
    pluginColors: response.pluginColors,
    pluginFont: "Montserrat",
    variableMode: "direct",
    layoutMode: "autoLayout",
    colorMode: "plugin",
    fontMode: "plugin",
    textMode: "semantic"
  }
})

Step 6: Figma Rendering
───────────────────────
main.ts receives "render-wireframe" →
  createWireframeFrame(frame, "ai://home-page", context, 0) →
    recursive createNodeInFigma() →
      Figma nodes created on canvas
```

### Block Generation Flow

იგივე flow, მხოლოდ:
- Endpoint: `POST /api/generate-block`
- Input: `blockType` instead of `pageType` + `sections`
- Output: ერთი section-ის WireframeNode tree (არა სრული page)

---

## 3. Claude API Integration

### Setup

```javascript
// Plugin_Backend/lib/aiGenerator.js
const Anthropic = require("@anthropic-ai/sdk");

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,  // Plugin owner's API key
});
```

### Environment Variable

```env
# Plugin_Backend/.env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### API Call Structure

```javascript
async function generateWireframeStructure({
  type,          // "page" | "block"
  pageType,      // "home", "pricing", etc.
  blockType,     // "hero", "features", etc.
  sections,      // ["Hero", "Features", ...]
  density,       // "balanced" | "detailed"
  viewportWidth, // 1440
  notes,         // optional user notes
}) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",   // ან haiku ეკონომიისთვის
    max_tokens: 8000,
    system: WIREFRAME_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserPrompt({ type, pageType, blockType, sections, density, viewportWidth, notes }),
      },
    ],
  });

  // Parse JSON from response
  const content = response.content[0].text;
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || [null, content];
  return JSON.parse(jsonMatch[1]);
}
```

### System Prompt (WIREFRAME_SYSTEM_PROMPT)

```
You are a wireframe layout generator for a Figma plugin. You generate structured JSON
that describes wireframe layouts for web pages and UI blocks.

OUTPUT FORMAT:
Return a JSON object with this exact structure:

{
  "totalHeight": <number>,
  "sections": [
    {
      "name": "<Section Name>",
      "sectionType": "<hero|features|pricing|faq|...>",
      "height": <number>,
      "background": "<background|surface|accent|transparent>",
      "layout": "<center-stacked|two-column|three-column-grid|four-column-grid|sidebar-left|sidebar-right>",
      "padding": { "top": <n>, "right": <n>, "bottom": <n>, "left": <n> },
      "gap": <number>,
      "elements": [
        {
          "type": "<heading|subheading|paragraph|button|button-group|image|icon|card|input|nav-links|logo|divider|badge|list|avatar|stat>",
          ... type-specific fields ...
        }
      ]
    }
  ]
}

ELEMENT TYPES AND THEIR FIELDS:

heading:
  { "type": "heading", "text": "...", "level": 1|2|3|4, "align": "left|center|right" }

subheading:
  { "type": "subheading", "text": "...", "align": "left|center|right" }

paragraph:
  { "type": "paragraph", "text": "...", "align": "left|center|right", "maxWidth": <number|null> }

button:
  { "type": "button", "text": "...", "variant": "primary|secondary|outline|ghost", "size": "sm|md|lg" }

button-group:
  { "type": "button-group", "direction": "horizontal|vertical", "buttons": [
    { "text": "...", "variant": "primary|secondary|outline", "size": "sm|md|lg" }
  ]}

image:
  { "type": "image", "width": "full|half|third|quarter|<number>", "aspectRatio": "16:9|4:3|1:1|3:2", "rounded": true|false }

card:
  { "type": "card", "elements": [ ...nested elements... ], "padding": <number>, "rounded": true|false, "shadow": true|false, "background": "surface|background|transparent" }

input:
  { "type": "input", "label": "...", "placeholder": "...", "inputType": "text|email|password|textarea" }

nav-links:
  { "type": "nav-links", "links": ["Home", "About", "Pricing", "Contact"], "direction": "horizontal|vertical" }

logo:
  { "type": "logo", "size": "sm|md|lg" }

divider:
  { "type": "divider" }

badge:
  { "type": "badge", "text": "...", "variant": "accent|surface|secondary" }

list:
  { "type": "list", "items": ["Item 1", "Item 2", ...], "style": "bullet|numbered|check|none" }

avatar:
  { "type": "avatar", "size": "sm|md|lg" }

stat:
  { "type": "stat", "value": "99%", "label": "Uptime" }

icon:
  { "type": "icon", "size": "sm|md|lg" }

LAYOUT RULES:
- "center-stacked": All elements vertically centered, stacked
- "two-column": Split into left/right columns (use nested arrays or specify column assignment)
- "three-column-grid": 3 equal columns, typically for cards/features
- "four-column-grid": 4 equal columns

BACKGROUND COLOR ROLES:
- "background" = page background (light gray)
- "surface" = card/container background (blue-gray)
- "accent" = emphasis background (light blue)
- "transparent" = no background, inherits parent

DENSITY GUIDE:
- "balanced": Essential elements only, generous whitespace, standard spacing
- "detailed": More elements, denser layout, additional sub-elements, less whitespace

VIEWPORT GUIDE:
- 1920px: Extra wide desktop, max-width containers recommended
- 1440px: Standard desktop
- 1024px: Tablet landscape — reduce columns (3→2, 4→2)
- 768px: Tablet portrait — stack columns, reduce padding
- 375px: Mobile — single column, compact spacing, smaller text

IMPORTANT:
- Generate realistic placeholder text (not lorem ipsum unless told otherwise)
- Match the density level exactly
- All heights must be reasonable (a hero section = 500-700px, not 2000px)
- Sections should feel like a real website wireframe
- Only include the requested sections
- Respond ONLY with JSON, no explanation
```

### User Prompt Builder

```javascript
function buildUserPrompt({ type, pageType, blockType, sections, density, viewportWidth, notes }) {
  if (type === "page") {
    return `Generate a wireframe layout for a "${pageType}" page.
Viewport width: ${viewportWidth}px
Density: ${density}
Sections to include (in order): ${sections.join(", ")}
${notes ? `Special requirements: ${notes}` : ""}

Return the complete JSON structure.`;
  }

  if (type === "block") {
    return `Generate a wireframe layout for a single "${blockType}" block/section.
Viewport width: ${viewportWidth}px
Density: ${density}
${notes ? `Special requirements: ${notes}` : ""}

Return the complete JSON structure with a single section.`;
  }
}
```

### მოდელის არჩევა

| სიტუაცია | მოდელი | მიზეზი |
|----------|--------|--------|
| Default | `claude-sonnet-4-20250514` | ხარისხი/ფასის ბალანსი |
| Budget mode | `claude-haiku-4-5-20251001` | 3x იაფი, wireframe-ისთვის საკმარისი |
| Premium | `claude-opus-4-6` | მაქსიმალური ხარისხი, ძვირი |

Config-ით შეცვლადი:
```env
AI_MODEL=claude-sonnet-4-20250514
```

---

## 4. Simplified Wireframe Format (AI Output)

### სრული მაგალითი: Home Page (1440px, detailed)

```json
{
  "totalHeight": 4200,
  "sections": [
    {
      "name": "Header",
      "sectionType": "header",
      "height": 72,
      "background": "background",
      "layout": "two-column",
      "padding": { "top": 16, "right": 80, "bottom": 16, "left": 80 },
      "gap": 24,
      "elements": [
        { "type": "logo", "size": "md", "column": "left" },
        { "type": "nav-links", "links": ["Features", "Pricing", "About", "Blog"], "direction": "horizontal", "column": "right" },
        { "type": "button", "text": "Sign Up", "variant": "primary", "size": "sm", "column": "right" }
      ]
    },
    {
      "name": "Hero",
      "sectionType": "hero",
      "height": 600,
      "background": "transparent",
      "layout": "two-column",
      "padding": { "top": 80, "right": 80, "bottom": 80, "left": 80 },
      "gap": 48,
      "elements": [
        { "type": "badge", "text": "New Release", "variant": "accent", "column": "left" },
        { "type": "heading", "text": "Build better products with smart wireframes", "level": 1, "align": "left", "column": "left" },
        { "type": "paragraph", "text": "Transform your design workflow with AI-powered wireframe generation. Create stunning layouts in seconds, not hours.", "align": "left", "maxWidth": 520, "column": "left" },
        { "type": "button-group", "direction": "horizontal", "column": "left", "buttons": [
          { "text": "Get Started Free", "variant": "primary", "size": "lg" },
          { "text": "Watch Demo", "variant": "outline", "size": "lg" }
        ]},
        { "type": "image", "width": "half", "aspectRatio": "4:3", "rounded": true, "column": "right" }
      ]
    },
    {
      "name": "Features",
      "sectionType": "features",
      "height": 680,
      "background": "surface",
      "layout": "center-stacked",
      "padding": { "top": 80, "right": 80, "bottom": 80, "left": 80 },
      "gap": 48,
      "elements": [
        { "type": "subheading", "text": "Why teams choose us", "align": "center" },
        { "type": "heading", "text": "Everything you need to design faster", "level": 2, "align": "center" },
        {
          "type": "grid",
          "columns": 3,
          "gap": 32,
          "items": [
            { "type": "card", "padding": 24, "rounded": true, "shadow": false, "background": "background", "elements": [
              { "type": "icon", "size": "lg" },
              { "type": "heading", "text": "Lightning Fast", "level": 3 },
              { "type": "paragraph", "text": "Generate complete wireframes in seconds with our AI engine." }
            ]},
            { "type": "card", "padding": 24, "rounded": true, "shadow": false, "background": "background", "elements": [
              { "type": "icon", "size": "lg" },
              { "type": "heading", "text": "Fully Editable", "level": 3 },
              { "type": "paragraph", "text": "Every element is a native Figma component you can customize." }
            ]},
            { "type": "card", "padding": 24, "rounded": true, "shadow": false, "background": "background", "elements": [
              { "type": "icon", "size": "lg" },
              { "type": "heading", "text": "Responsive", "level": 3 },
              { "type": "paragraph", "text": "Automatically adapts to any viewport from desktop to mobile." }
            ]}
          ]
        }
      ]
    },
    {
      "name": "Pricing",
      "sectionType": "pricing",
      "height": 720,
      "background": "transparent",
      "layout": "center-stacked",
      "padding": { "top": 80, "right": 80, "bottom": 80, "left": 80 },
      "gap": 48,
      "elements": [
        { "type": "subheading", "text": "Simple pricing", "align": "center" },
        { "type": "heading", "text": "Choose the plan that fits your team", "level": 2, "align": "center" },
        {
          "type": "grid",
          "columns": 3,
          "gap": 24,
          "items": [
            { "type": "card", "padding": 32, "rounded": true, "shadow": true, "background": "background", "elements": [
              { "type": "heading", "text": "Starter", "level": 3 },
              { "type": "stat", "value": "$9", "label": "per month" },
              { "type": "list", "items": ["5 projects", "Basic wireframes", "Email support"], "style": "check" },
              { "type": "button", "text": "Start Free Trial", "variant": "outline", "size": "md" }
            ]},
            { "type": "card", "padding": 32, "rounded": true, "shadow": true, "background": "accent", "elements": [
              { "type": "badge", "text": "Popular", "variant": "accent" },
              { "type": "heading", "text": "Pro", "level": 3 },
              { "type": "stat", "value": "$29", "label": "per month" },
              { "type": "list", "items": ["Unlimited projects", "AI generation", "Priority support", "Team sharing"], "style": "check" },
              { "type": "button", "text": "Get Started", "variant": "primary", "size": "md" }
            ]},
            { "type": "card", "padding": 32, "rounded": true, "shadow": true, "background": "background", "elements": [
              { "type": "heading", "text": "Enterprise", "level": 3 },
              { "type": "stat", "value": "Custom", "label": "contact us" },
              { "type": "list", "items": ["Everything in Pro", "SSO & SAML", "Dedicated support", "Custom integrations"], "style": "check" },
              { "type": "button", "text": "Contact Sales", "variant": "outline", "size": "md" }
            ]}
          ]
        }
      ]
    },
    {
      "name": "FAQ",
      "sectionType": "faq",
      "height": 520,
      "background": "surface",
      "layout": "center-stacked",
      "padding": { "top": 80, "right": 120, "bottom": 80, "left": 120 },
      "gap": 24,
      "elements": [
        { "type": "heading", "text": "Frequently Asked Questions", "level": 2, "align": "center" },
        {
          "type": "accordion",
          "items": [
            { "question": "How does AI generation work?", "answer": "Our AI analyzes your requirements and creates optimized wireframe layouts based on industry best practices." },
            { "question": "Can I customize the generated wireframes?", "answer": "Every element is fully editable in Figma. You can modify colors, text, layout, and more." },
            { "question": "What file formats are supported?", "answer": "Wireframes are created directly in your Figma file as native components." },
            { "question": "Is there a free trial?", "answer": "Yes, all plans come with a 14-day free trial. No credit card required." }
          ]
        }
      ]
    },
    {
      "name": "Footer",
      "sectionType": "footer",
      "height": 280,
      "background": "background",
      "layout": "four-column-grid",
      "padding": { "top": 48, "right": 80, "bottom": 48, "left": 80 },
      "gap": 32,
      "elements": [
        { "type": "card", "background": "transparent", "padding": 0, "elements": [
          { "type": "logo", "size": "md" },
          { "type": "paragraph", "text": "Building better wireframes for design teams worldwide." }
        ]},
        { "type": "card", "background": "transparent", "padding": 0, "elements": [
          { "type": "heading", "text": "Product", "level": 4 },
          { "type": "nav-links", "links": ["Features", "Pricing", "Changelog", "Roadmap"], "direction": "vertical" }
        ]},
        { "type": "card", "background": "transparent", "padding": 0, "elements": [
          { "type": "heading", "text": "Company", "level": 4 },
          { "type": "nav-links", "links": ["About", "Blog", "Careers", "Press"], "direction": "vertical" }
        ]},
        { "type": "card", "background": "transparent", "padding": 0, "elements": [
          { "type": "heading", "text": "Support", "level": 4 },
          { "type": "nav-links", "links": ["Help Center", "Contact", "Status", "Terms"], "direction": "vertical" }
        ]}
      ]
    }
  ]
}
```

### Block Generation მაგალითი (hero block, 1440px)

```json
{
  "totalHeight": 600,
  "sections": [
    {
      "name": "Hero",
      "sectionType": "hero",
      "height": 600,
      "background": "transparent",
      "layout": "two-column",
      "padding": { "top": 80, "right": 80, "bottom": 80, "left": 80 },
      "gap": 48,
      "elements": [
        { "type": "heading", "text": "Your product headline goes here", "level": 1, "align": "left", "column": "left" },
        { "type": "paragraph", "text": "A brief description that explains your value proposition.", "align": "left", "column": "left" },
        { "type": "button-group", "direction": "horizontal", "column": "left", "buttons": [
          { "text": "Primary Action", "variant": "primary", "size": "lg" },
          { "text": "Secondary", "variant": "outline", "size": "lg" }
        ]},
        { "type": "image", "width": "half", "aspectRatio": "4:3", "rounded": true, "column": "right" }
      ]
    }
  ]
}
```

---

## 5. Converter: Simplified → WireframeNode

### ადგილმდებარეობა

```
Plugin_Backend/lib/wireframeConverter.js
```

### კონვერტერის როლი

AI-ს გამარტივებული JSON → სრულფასოვანი WireframeNode tree, რომელსაც არსებული rendering pipeline ელოდება.

### Design Tokens (Hardcoded values)

```javascript
// Plugin_Backend/lib/designTokens.js

const DESIGN_TOKENS = {
  // Font sizes by heading level
  fontSize: {
    h1: { desktop: 48, tablet: 40, mobile: 32 },
    h2: { desktop: 36, tablet: 32, mobile: 28 },
    h3: { desktop: 24, tablet: 22, mobile: 20 },
    h4: { desktop: 18, tablet: 17, mobile: 16 },
    subheading: { desktop: 18, tablet: 16, mobile: 14 },
    paragraph: { desktop: 16, tablet: 15, mobile: 14 },
    small: { desktop: 14, tablet: 13, mobile: 12 },
    badge: { desktop: 12, tablet: 12, mobile: 11 },
    nav: { desktop: 14, tablet: 14, mobile: 14 },
    stat_value: { desktop: 48, tablet: 40, mobile: 32 },
    stat_label: { desktop: 14, tablet: 13, mobile: 12 },
    button: { sm: 13, md: 14, lg: 16 },
    input_label: { desktop: 14, tablet: 14, mobile: 14 },
    input_placeholder: { desktop: 14, tablet: 14, mobile: 14 },
  },

  // Font weights
  fontWeight: {
    h1: 700, h2: 700, h3: 600, h4: 600,
    subheading: 500, paragraph: 400,
    badge: 600, nav: 500,
    button: 600,
  },

  // Line heights
  lineHeight: {
    heading: 1.2,
    subheading: 1.4,
    paragraph: 1.6,
    small: 1.4,
  },

  // Spacing
  spacing: {
    section_gap: 0,    // sections სტეკით ლაგდება, gap = 0
    element_gap: {
      balanced: { desktop: 24, tablet: 20, mobile: 16 },
      detailed: { desktop: 16, tablet: 14, mobile: 12 },
    },
  },

  // Button sizing
  button: {
    sm: { paddingH: 16, paddingV: 8, borderRadius: 6, height: 32 },
    md: { paddingH: 24, paddingV: 12, borderRadius: 8, height: 40 },
    lg: { paddingH: 32, paddingV: 16, borderRadius: 10, height: 48 },
  },

  // Image placeholder sizes
  imagePlaceholder: {
    aspectRatios: { "16:9": 0.5625, "4:3": 0.75, "1:1": 1, "3:2": 0.667 },
  },

  // Card defaults
  card: {
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
  },

  // Input defaults
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    padding: { top: 10, right: 12, bottom: 10, left: 12 },
  },

  // Avatar sizes
  avatar: {
    sm: 32,
    md: 48,
    lg: 64,
  },

  // Icon placeholder sizes
  icon: {
    sm: 20,
    md: 24,
    lg: 48,
  },

  // Logo placeholder
  logo: {
    sm: { width: 80, height: 24 },
    md: { width: 120, height: 32 },
    lg: { width: 160, height: 40 },
  },
};
```

### Viewport Breakpoints

```javascript
function getBreakpoint(viewportWidth) {
  if (viewportWidth >= 1024) return "desktop";
  if (viewportWidth >= 768) return "tablet";
  return "mobile";
}
```

### კონვერტერის მთავარი ფუნქცია

```javascript
// Plugin_Backend/lib/wireframeConverter.js

function convertToWireframeTree(simplifiedJSON, viewportWidth, pluginColors, pluginFont) {
  const breakpoint = getBreakpoint(viewportWidth);
  let nodeIdCounter = 0;

  function nextId() {
    return `ai-node-${++nodeIdCounter}`;
  }

  // Root body node
  const rootNode = {
    id: nextId(),
    name: "Body",
    type: "frame",
    tag: "body",
    x: 0, y: 0,
    width: viewportWidth,
    height: simplifiedJSON.totalHeight,
    layoutMode: "VERTICAL",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    layoutSizingHorizontal: "FIXED",
    layoutSizingVertical: "HUG",
    backgroundColor: pluginColors.background,
    fills: [solidFill(pluginColors.background)],
    textColor: pluginColors.text,
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    textContent: "",
    fontSize: 16,
    fontWeight: 400,
    fontFamily: pluginFont,
    textAlign: "left",
    lineHeight: 1.5,
    letterSpacing: 0,
    children: [],
  };

  // Convert each section
  let yOffset = 0;
  for (const section of simplifiedJSON.sections) {
    const sectionNode = convertSection(section, viewportWidth, breakpoint, pluginColors, pluginFont, yOffset);
    rootNode.children.push(sectionNode);
    yOffset += section.height;
  }

  return rootNode;
}

function convertSection(section, viewportWidth, breakpoint, colors, font, yOffset) {
  const bgColor = resolveBackgroundColor(section.background, colors);

  const sectionNode = {
    id: nextId(),
    name: section.name,
    type: "frame",
    tag: "section",
    x: 0, y: yOffset,
    width: viewportWidth,
    height: section.height,
    layoutMode: "VERTICAL",
    itemSpacing: section.gap || 24,
    padding: section.padding || { top: 64, right: 80, bottom: 64, left: 80 },
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    justifyContent: "center",
    alignItems: getAlignFromLayout(section.layout),
    backgroundColor: bgColor,
    fills: bgColor ? [solidFill(bgColor)] : [],
    // ... სხვა default ველები
    children: [],
  };

  // Layout-ის მიხედვით elements-ის განლაგება
  switch (section.layout) {
    case "center-stacked":
      sectionNode.children = convertCenterStacked(section.elements, ...);
      break;
    case "two-column":
      sectionNode.children = [convertTwoColumn(section.elements, viewportWidth, ...)];
      break;
    case "three-column-grid":
      sectionNode.children = [convertGrid(section.elements, 3, ...)];
      break;
    case "four-column-grid":
      sectionNode.children = [convertGrid(section.elements, 4, ...)];
      break;
  }

  return sectionNode;
}
```

### Element Converters (ძირითადი)

```javascript
function convertElement(element, viewportWidth, breakpoint, colors, font) {
  switch (element.type) {
    case "heading":
      return convertHeading(element, breakpoint, colors, font);
    case "paragraph":
      return convertParagraph(element, breakpoint, colors, font);
    case "button":
      return convertButton(element, colors, font);
    case "button-group":
      return convertButtonGroup(element, colors, font);
    case "image":
      return convertImagePlaceholder(element, viewportWidth);
    case "card":
      return convertCard(element, viewportWidth, breakpoint, colors, font);
    case "input":
      return convertInput(element, colors, font);
    case "nav-links":
      return convertNavLinks(element, colors, font);
    case "logo":
      return convertLogo(element, colors);
    case "divider":
      return convertDivider(colors);
    case "badge":
      return convertBadge(element, colors, font);
    case "list":
      return convertList(element, breakpoint, colors, font);
    case "avatar":
      return convertAvatar(element, colors);
    case "stat":
      return convertStat(element, breakpoint, colors, font);
    case "icon":
      return convertIcon(element, colors);
    case "grid":
      return convertGrid(element, viewportWidth, breakpoint, colors, font);
    case "accordion":
      return convertAccordion(element, breakpoint, colors, font);
    default:
      return null;
  }
}

// მაგალითი: heading converter
function convertHeading(element, breakpoint, colors, font) {
  const level = element.level || 2;
  const key = `h${level}`;
  return {
    id: nextId(),
    name: element.text.substring(0, 30),
    type: "text",
    tag: `h${level}`,
    x: 0, y: 0,
    width: 0, height: 0,  // HUG mode, renderer calculates
    layoutMode: "NONE",
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",
    itemSpacing: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    textContent: element.text,
    fontSize: DESIGN_TOKENS.fontSize[key][breakpoint],
    fontWeight: DESIGN_TOKENS.fontWeight[key],
    fontFamily: font,
    textAlign: element.align || "left",
    lineHeight: DESIGN_TOKENS.lineHeight.heading,
    letterSpacing: -0.5,
    textColor: colors.text,
    backgroundColor: null,
    fills: [],
    borderColor: null,
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    children: [],
  };
}

// მაგალითი: button converter
function convertButton(element, colors, font) {
  const size = element.size || "md";
  const variant = element.variant || "primary";
  const tokens = DESIGN_TOKENS.button[size];

  let bgColor, textColor, borderColor, borderWidth;
  switch (variant) {
    case "primary":
      bgColor = colors.accent;
      textColor = colors.text;
      borderColor = null;
      borderWidth = 0;
      break;
    case "secondary":
      bgColor = colors.surface;
      textColor = colors.text;
      borderColor = null;
      borderWidth = 0;
      break;
    case "outline":
      bgColor = "transparent";
      textColor = colors.text;
      borderColor = colors.secondary;
      borderWidth = 1;
      break;
    case "ghost":
      bgColor = "transparent";
      textColor = colors.text;
      borderColor = null;
      borderWidth = 0;
      break;
  }

  // Button = frame with text child
  return {
    id: nextId(),
    name: element.text,
    type: "frame",
    tag: "button",
    x: 0, y: 0,
    width: 0, height: tokens.height,
    layoutMode: "HORIZONTAL",
    layoutSizingHorizontal: "HUG",
    layoutSizingVertical: "FIXED",
    justifyContent: "center",
    alignItems: "center",
    itemSpacing: 8,
    padding: { top: tokens.paddingV, right: tokens.paddingH, bottom: tokens.paddingV, left: tokens.paddingH },
    backgroundColor: bgColor,
    fills: bgColor !== "transparent" ? [solidFill(bgColor)] : [],
    strokes: borderColor ? [{ color: hexToFigmaColor(borderColor), weight: borderWidth, position: "INSIDE", style: "SOLID" }] : [],
    borderRadius: tokens.borderRadius,
    borderColor, borderWidth,
    opacity: 1,
    textColor,
    textContent: "",
    fontSize: DESIGN_TOKENS.fontSize.button[size],
    fontWeight: DESIGN_TOKENS.fontWeight.button,
    fontFamily: font,
    textAlign: "center",
    lineHeight: 1.2,
    letterSpacing: 0,
    children: [
      {
        id: nextId(),
        name: element.text,
        type: "text",
        tag: "span",
        x: 0, y: 0, width: 0, height: 0,
        layoutMode: "NONE",
        layoutSizingHorizontal: "HUG",
        layoutSizingVertical: "HUG",
        itemSpacing: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        textContent: element.text,
        fontSize: DESIGN_TOKENS.fontSize.button[size],
        fontWeight: DESIGN_TOKENS.fontWeight.button,
        fontFamily: font,
        textAlign: "center",
        lineHeight: 1.2,
        letterSpacing: 0,
        textColor,
        backgroundColor: null,
        fills: [],
        borderColor: null, borderWidth: 0, borderRadius: 0,
        opacity: 1,
        children: [],
      },
    ],
  };
}

// მაგალითი: image placeholder converter
function convertImagePlaceholder(element, viewportWidth) {
  const widthMap = { full: viewportWidth, half: viewportWidth * 0.48, third: viewportWidth * 0.31, quarter: viewportWidth * 0.23 };
  const width = typeof element.width === "number" ? element.width : (widthMap[element.width] || viewportWidth);
  const ratio = DESIGN_TOKENS.imagePlaceholder.aspectRatios[element.aspectRatio] || 0.5625;
  const height = width * ratio;

  return {
    id: nextId(),
    name: "Image Placeholder",
    type: "placeholder",
    tag: "img",
    x: 0, y: 0,
    width, height,
    layoutMode: "NONE",
    layoutSizingHorizontal: element.width === "full" ? "FILL" : "FIXED",
    layoutSizingVertical: "FIXED",
    isPlaceholder: true,
    borderRadius: element.rounded ? 12 : 0,
    // ... other default fields
    children: [],
  };
}
```

### Utility Functions

```javascript
function solidFill(hexColor) {
  return {
    type: "SOLID",
    visible: true,
    opacity: 1,
    color: hexToFigmaColor(hexColor),
  };
}

function hexToFigmaColor(hex) {
  if (!hex || hex === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b, a: 1 };
}

function resolveBackgroundColor(role, colors) {
  switch (role) {
    case "background": return colors.background;
    case "surface": return colors.surface;
    case "accent": return colors.accent;
    case "transparent": return null;
    default: return null;
  }
}
```

---

## 6. Backend Endpoints

### POST /api/generate-page

```javascript
// Plugin_Backend/api/index.js

app.post("/api/generate-page", async (req, res) => {
  try {
    const {
      userId,
      licenseKey,
      pageType,
      sections,
      density = "balanced",
      viewports = [1440],
      notes = "",
      pluginColors,
      pluginFont = "Inter",
    } = req.body;

    // 1. Validation
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
    if (!pageType) return res.status(400).json({ success: false, error: "pageType is required" });
    if (!licenseKey) return res.status(403).json({ success: false, error: "License key required for AI generation" });

    const validPageTypes = ["home", "about", "pricing", "contact", "blog", "login", "register", "faq"];
    if (!validPageTypes.includes(pageType)) {
      return res.status(400).json({ success: false, error: `Invalid pageType: ${pageType}` });
    }

    // 2. License validation
    const licenseValid = await validateLicense(licenseKey, userId);
    if (!licenseValid) {
      return res.status(403).json({ success: false, error: "Invalid or expired license key" });
    }

    // 3. Rate limit check
    const rateOk = checkRateLimit(userId);
    if (!rateOk) {
      return res.status(429).json({ success: false, error: "Monthly generation limit reached" });
    }

    // 4. Generate for each viewport
    const frames = [];
    for (const vp of viewports) {
      // 4a. Call Claude API
      const simplified = await generateWireframeStructure({
        type: "page",
        pageType,
        sections,
        density,
        viewportWidth: vp,
        notes,
      });

      // 4b. Validate AI output
      const validated = validateSimplifiedFormat(simplified);
      if (!validated.success) {
        console.error("AI output validation failed:", validated.errors);
        // Retry once
        // ...
      }

      // 4c. Convert to WireframeNode tree
      const tree = convertToWireframeTree(simplified, vp, pluginColors, pluginFont);

      frames.push({
        viewportWidth: vp,
        viewportHeight: simplified.totalHeight,
        tree,
      });
    }

    // 5. Save to history (optional, MongoDB)
    if (mongoose.connection.readyState === 1) {
      await saveGenerationHistory(userId, {
        type: "page",
        pageType,
        sections,
        density,
        viewports,
        generatedAt: new Date(),
      });
    }

    // 6. Increment usage counter
    incrementUsage(userId);

    // 7. Return response
    res.json({
      success: true,
      wireframeData: { frames },
      pluginColors,
      sourceUrl: `ai://${pageType}-page`,
    });
  } catch (error) {
    console.error("Generation error:", error);

    if (error.status === 429) {
      return res.status(429).json({ success: false, error: "AI service rate limited. Please try again in a moment." });
    }

    res.status(500).json({ success: false, error: "Failed to generate wireframe" });
  }
});
```

### POST /api/generate-block

```javascript
app.post("/api/generate-block", async (req, res) => {
  // იგივე flow, მაგრამ:
  // - blockType instead of pageType
  // - sections არ სჭირდება (ერთი block = ერთი section)
  // - AI prompt block-specific
});
```

---

## 7. Frontend Integration

### PageGeneration.tsx — handleGenerate ცვლილება

```typescript
const handleGenerate = useCallback(async () => {
  setIsGenerating(true);
  setError(null);

  try {
    const response = await fetch(`${API_BASE_URL}/api/generate-page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: figmaUserId,
        licenseKey: userLicenseKey,
        pageType: selectedPage,
        sections: selectedSections,
        density,
        viewports,
        notes,
        pluginColors: config.pluginColors,
        pluginFont: config.pluginFont,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Generation failed");
    }

    // Send to Figma sandbox for rendering
    parent.postMessage(
      {
        pluginMessage: {
          type: "render-wireframe",
          data: {
            frames: data.wireframeData.frames,
            sourceUrl: data.sourceUrl,
            pluginColors: data.pluginColors,
            pluginFont: config.pluginFont,
            variableMode: "direct",
            layoutMode: "autoLayout",
            colorMode: "plugin",
            fontMode: "plugin",
            textMode: "semantic",
          },
        },
      },
      "*"
    );
  } catch (err) {
    setError(err.message);
  } finally {
    setIsGenerating(false);
  }
}, [selectedPage, selectedSections, density, viewports, notes, config]);
```

### BlockGeneration.tsx — ანალოგიური ცვლილება

```typescript
// Same pattern, POST /api/generate-block instead
```

### Loading State UX

```
[Generate] click
    → "Generating wireframe..." (spinner, 3-8 sec)
    → "Rendering in Figma..." (spinner, 1-3 sec)
    → "Done! Wireframe created on canvas." (success)
    OR
    → "Generation failed: [error message]" (error with retry button)
```

---

## 8. License / Access Control

### მიდგომა

AI generation ხელმისაწვდომია **მხოლოდ ლიცენზირებული** მომხმარებლებისთვის.

### License Key Flow

```
1. User purchases license (Website_Frontend → License_Backend)
2. Gets license key: "WF-XXXX-XXXX-XXXX"
3. Enters key in Plugin Settings
4. Key stored in figma.clientStorage
5. On generation → key sent to Plugin_Backend
6. Plugin_Backend validates key with License_Backend
7. If valid → proceed with generation
```

### Validation Endpoint

```javascript
// Plugin_Backend/lib/licenseValidator.js

async function validateLicense(licenseKey, userId) {
  try {
    const response = await fetch(`${LICENSE_BACKEND_URL}/api/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEV_TOKEN}`,
      },
      body: JSON.stringify({ key: licenseKey, userId }),
    });

    const data = await response.json();
    return data.valid === true;
  } catch {
    // If License_Backend is down, cache previous validation
    return getCachedValidation(licenseKey, userId);
  }
}
```

### Plan Tiers (მომავალი)

| Plan | ფასი | Generations/თვე | Viewports |
|------|------|----------------|-----------|
| Free | $0 | 3 | 1 (1440 only) |
| Pro | $9/mo | 50 | All 5 |
| Team | $19/mo | 200 | All 5 + priority |
| Enterprise | Custom | Unlimited | All + custom |

---

## 9. Rate Limiting & Queue

### In-Memory Rate Limiter

```javascript
// Plugin_Backend/lib/rateLimiter.js

const userUsage = new Map(); // userId → { count, resetAt }

function checkRateLimit(userId, maxPerMonth = 50) {
  const now = Date.now();
  const usage = userUsage.get(userId);

  if (!usage || now > usage.resetAt) {
    userUsage.set(userId, {
      count: 0,
      resetAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
    });
    return true;
  }

  return usage.count < maxPerMonth;
}

function incrementUsage(userId) {
  const usage = userUsage.get(userId);
  if (usage) usage.count++;
}
```

### Concurrent Request Protection

```javascript
const activeRequests = new Map(); // userId → Promise

app.post("/api/generate-page", async (req, res) => {
  const { userId } = req.body;

  // Prevent double-click / concurrent generations
  if (activeRequests.has(userId)) {
    return res.status(429).json({ success: false, error: "Generation already in progress" });
  }

  const promise = handleGeneration(req, res);
  activeRequests.set(userId, promise);

  try {
    await promise;
  } finally {
    activeRequests.delete(userId);
  }
});
```

---

## 10. Error Handling

### Error Types & Responses

| Error | HTTP Code | User Message | Action |
|-------|-----------|-------------|--------|
| Invalid params | 400 | "Please select a page type" | Show in UI |
| No license | 403 | "License key required" | Redirect to settings |
| Invalid license | 403 | "License expired or invalid" | Show renewal link |
| Rate limit (user) | 429 | "Monthly limit reached (50/50)" | Show upgrade option |
| Rate limit (API) | 429 | "Service busy, retrying..." | Auto-retry 1x |
| AI output invalid | 500 | "Generation failed, retrying..." | Auto-retry 1x |
| API key missing | 500 | "Service configuration error" | Admin notification |
| Network error | 500 | "Connection error" | Show retry button |

### Retry Logic

```javascript
async function generateWithRetry(params, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateWireframeStructure(params);
      const validated = validateSimplifiedFormat(result);

      if (validated.success) return result;

      if (attempt < maxRetries) {
        console.warn(`AI output validation failed, retry ${attempt + 1}/${maxRetries}`);
        continue;
      }
      throw new Error("AI output validation failed after retries");
    } catch (error) {
      if (attempt < maxRetries && error.status !== 401) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw error;
    }
  }
}
```

---

## 11. Testing Strategy

### Unit Tests

```
Plugin_Backend/__tests__/
├── wireframeConverter.test.js    # Converter logic
├── designTokens.test.js          # Token values
├── aiGenerator.test.js           # Prompt building (mock API)
├── rateLimiter.test.js           # Rate limiting
└── licenseValidator.test.js      # License validation (mock)
```

### Integration Tests

```
Plugin_Backend/__tests__/integration/
├── generatePage.test.js          # Full endpoint test (mock Claude API)
└── generateBlock.test.js         # Block endpoint test
```

### ტესტის მაგალითი

```javascript
// wireframeConverter.test.js
describe("convertToWireframeTree", () => {
  test("converts hero section correctly", () => {
    const input = {
      totalHeight: 600,
      sections: [{
        name: "Hero",
        sectionType: "hero",
        height: 600,
        background: "transparent",
        layout: "center-stacked",
        padding: { top: 80, right: 80, bottom: 80, left: 80 },
        gap: 24,
        elements: [
          { type: "heading", text: "Hello World", level: 1, align: "center" }
        ]
      }]
    };

    const tree = convertToWireframeTree(input, 1440, defaultColors, "Inter");

    expect(tree.type).toBe("frame");
    expect(tree.tag).toBe("body");
    expect(tree.layoutMode).toBe("VERTICAL");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe("Hero");
    expect(tree.children[0].children[0].type).toBe("text");
    expect(tree.children[0].children[0].textContent).toBe("Hello World");
    expect(tree.children[0].children[0].fontSize).toBe(48); // desktop h1
  });

  test("adjusts sizes for mobile viewport", () => {
    const tree = convertToWireframeTree(input, 375, defaultColors, "Inter");
    const heading = tree.children[0].children[0];
    expect(heading.fontSize).toBe(32); // mobile h1
  });
});
```

---

## 12. Implementation Phases

### Phase 1: Foundation (3-4 days)

**Goal:** Claude API integration + Converter + ერთი endpoint, ტესტირება

```
Tasks:
├── 1.1 npm install @anthropic-ai/sdk (Plugin_Backend)
├── 1.2 Create Plugin_Backend/lib/designTokens.js
├── 1.3 Create Plugin_Backend/lib/wireframeConverter.js
│     ├── convertToWireframeTree()
│     ├── Element converters (heading, paragraph, button, image, card)
│     └── Layout converters (center-stacked, two-column, grid)
├── 1.4 Create Plugin_Backend/lib/aiGenerator.js
│     ├── System prompt
│     ├── User prompt builder
│     └── generateWireframeStructure()
├── 1.5 Add POST /api/generate-page endpoint
├── 1.6 Write unit tests for converter
└── 1.7 Manual testing: curl → check JSON output
```

### Phase 2: Frontend Integration (2-3 days)

**Goal:** UI → Backend → Figma rendering, end-to-end

```
Tasks:
├── 2.1 Update PageGeneration.tsx handleGenerate()
├── 2.2 Update BlockGeneration.tsx handleGenerate()
├── 2.3 Add POST /api/generate-block endpoint
├── 2.4 Loading/error states in UI
├── 2.5 End-to-end testing in Figma
└── 2.6 Iterate on system prompt based on output quality
```

### Phase 3: License & Rate Limiting (2-3 days)

**Goal:** Access control, usage tracking

```
Tasks:
├── 3.1 License key validation integration
├── 3.2 Rate limiter implementation
├── 3.3 Usage tracking (MongoDB)
├── 3.4 Settings UI for license key input
└── 3.5 Error messages for unauthorized access
```

### Phase 4: Polish & Optimization (2-3 days)

**Goal:** ხარისხი, სტაბილურობა

```
Tasks:
├── 4.1 System prompt tuning (5+ iterations)
├── 4.2 Mobile viewport optimization
├── 4.3 Library tab: real data instead of mock
├── 4.4 Generation history (MongoDB)
├── 4.5 Retry logic
└── 4.6 Performance optimization (caching, etc.)
```

---

## 13. Cost Analysis

### Per-Generation Cost

```
System prompt:     ~800 tokens
User prompt:       ~150 tokens
AI output (page):  ~3,000-6,000 tokens
AI output (block): ~500-1,500 tokens

Per page generation:
  Sonnet:  ($3/M × 1K) + ($15/M × 5K) = $0.003 + $0.075 = ~$0.08
  Haiku:   ($0.80/M × 1K) + ($4/M × 5K) = $0.0008 + $0.02 = ~$0.02

Per block generation:
  Sonnet:  ($3/M × 1K) + ($15/M × 1K) = $0.003 + $0.015 = ~$0.02
  Haiku:   ($0.80/M × 1K) + ($4/M × 1K) = $0.0008 + $0.004 = ~$0.005

Multi-viewport (3 viewports):
  Sonnet page:  ~$0.24
  Haiku page:   ~$0.06
```

### Monthly Projections

| Users | Avg gen/user/mo | Total gen/mo | Sonnet cost | Haiku cost |
|-------|----------------|-------------|-------------|------------|
| 100 | 10 | 1,000 | $80 | $20 |
| 500 | 10 | 5,000 | $400 | $100 |
| 1,000 | 15 | 15,000 | $1,200 | $300 |
| 5,000 | 15 | 75,000 | $6,000 | $1,500 |

### Revenue vs Cost (@ $20/user/month)

| Users | Revenue | Sonnet Cost | Profit | Margin |
|-------|---------|-------------|--------|--------|
| 100 | $2,000 | $80 | $1,920 | 96% |
| 1,000 | $20,000 | $1,200 | $18,800 | 94% |
| 5,000 | $100,000 | $6,000 | $94,000 | 94% |

### ტესტირების ხარჯი ($5 API deposit)

```
$5 ÷ $0.08/generation (Sonnet) = ~62 page generations
$5 ÷ $0.02/generation (Haiku) = ~250 page generations

20-30 test generations = $1.60 - $2.40 (Sonnet)
                       = $0.40 - $0.60 (Haiku)
```

**$5 deposit სრულებით საკმარისია ტესტირებისთვის.**

---

## ფაილების სტრუქტურა (ახალი ფაილები)

```
Plugin_Backend/
├── lib/
│   ├── aiGenerator.js          # Claude API integration
│   ├── wireframeConverter.js   # Simplified → WireframeNode
│   ├── designTokens.js         # Design system constants
│   ├── rateLimiter.js          # Usage rate limiting
│   └── licenseValidator.js     # License key validation
├── __tests__/
│   ├── wireframeConverter.test.js
│   ├── designTokens.test.js
│   └── aiGenerator.test.js
└── .env                        # + ANTHROPIC_API_KEY

Plugin_Frontend/
├── src/ui/pages/aiGeneration/
│   ├── PageGeneration.tsx      # Modified: handleGenerate()
│   └── BlockGeneration.tsx     # Modified: handleGenerate()
```

---

## მნიშვნელოვანი შენიშვნები

1. **არსებული rendering pipeline არ იცვლება** — main.ts, nodes.ts, text.ts ხელუხლებელი რჩება
2. **Plugin_Backend = JavaScript/CommonJS** — ახალი ფაილებიც `require/module.exports`
3. **API key მხოლოდ server-side** — user ვერასდროს ხედავს
4. **მინიმალური latency:** Claude API ~2-5 sec + converter <100ms + rendering ~1-3 sec = **~4-8 sec total**
5. **Haiku vs Sonnet:** დასაწყისში Sonnet (ხარისხი), scale-ზე Haiku (ეკონომია)
6. **Viewport-ები ცალ-ცალკე გენერირდება** — 3 viewport = 3 API call. ალტერნატივა: ერთი call + converter-ში resize, მაგრამ ხარისხი დაბალი

---

## შემდეგი ნაბიჯი

Phase 1-ის დასაწყებად საჭიროა:
1. Anthropic API account + $5 deposit (console.anthropic.com)
2. API key Plugin_Backend/.env-ში
3. `npm install @anthropic-ai/sdk` Plugin_Backend-ში
4. designTokens.js + wireframeConverter.js + aiGenerator.js შექმნა
5. ტესტები + manual testing
