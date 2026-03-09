# Screenshot Import — Vision AI Implementation Plan

## სარჩევი

1. [არქიტექტურის მიმოხილვა](#1-არქიტექტურის-მიმოხილვა)
2. [Data Flow](#2-data-flow)
3. [Claude Vision API Integration](#3-claude-vision-api-integration)
4. [Backend Endpoint](#4-backend-endpoint)
5. [Frontend Integration](#5-frontend-integration)
6. [Simplified JSON Reuse](#6-simplified-json-reuse)
7. [განსხვავებები PageGen/BlockGen-ისგან](#7-განსხვავებები-pagegenblockgen-ისგან)
8. [Error Handling](#8-error-handling)
9. [Testing Strategy](#9-testing-strategy)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. არქიტექტურის მიმოხილვა

### მიზანი

User ატვირთავს ვებსაიტის screenshot-ს → Claude Vision აანალიზებს → Simplified Wireframe JSON → არსებული converter + rendering pipeline → Figma wireframe.

**AI_Generations_Plan.md-ის მესამე mode** — იყენებს იმავე:
- Simplified Wireframe Format (sections, elements)
- Converter: Simplified → WireframeNode
- Rendering pipeline (main.ts → nodes.ts)
- License validation + rate limiting

### სისტემის კომპონენტები

```
┌─────────────────────────────────────────────────────────────────┐
│                        Plugin_Frontend                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  Screenshot.tsx (არსებული UI)                        │       │
│  │  - სურათის ატვირთვა ✅ (უკვე მზადაა)                 │       │
│  │  - Preview ✅ (უკვე მზადაა)                           │       │
│  │  - Settings Panel ✅ (უკვე მზადაა)                    │       │
│  │  - handleGenerate() ❌ (TODO — ეს უნდა დავწეროთ)     │       │
│  └────────────┬─────────────────────────────────────────┘       │
│               │ fetch(/api/import-screenshot)                    │
│               │ body: { imageBase64, viewportWidth, ... }       │
│               ▼                                                  │
│      response: { frames: WireframeFrame[] }                     │
│               │                                                  │
│   parent.postMessage({                                          │
│     type: "render-wireframe",                                   │
│     data: RenderWireframeData                                   │
│   })                                                            │
│               │                                                  │
│  ┌────────────▼────────────────────────────────┐                │
│  │   main.ts (Figma Sandbox)                    │                │
│  │   createWireframeFrame() → Figma Nodes       │                │
│  │   (არსებული pipeline, ცვლილება არ სჭირდება)  │                │
│  └──────────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Plugin_Backend                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │  POST /api/import-screenshot                      │           │
│  │                                                    │           │
│  │  1. Validate request (image, size limits)          │           │
│  │  2. License check (optional — Phase 2)             │           │
│  │  3. Rate limit check                               │           │
│  │  4. Call Claude Vision API (image + prompt)        │           │
│  │  5. Parse Simplified JSON                          │           │
│  │  6. Validate output (Zod schema — shared with AI)  │           │
│  │  7. Convert → WireframeNode tree (shared converter)│           │
│  │  8. Return { frames: WireframeFrame[] }            │           │
│  └──────────────────────────────────────────────────┘           │
│                          │                                       │
│                          ▼                                       │
│                 ┌─────────────────┐                              │
│                 │  Claude Vision   │                              │
│                 │  API (Anthropic) │                              │
│                 └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

### რატომ ეს მიდგომა?

1. **მაქსიმალური reuse** — Simplified Format, Converter, Rendering = იგივე კოდი PageGen/BlockGen-ისა
2. **Claude Vision = საუკეთესო ხარისხი** — ადამიანივით "ხედავს" UI ელემენტებს, layout-ს, hierarchy-ს
3. **არ სჭირდება CV/ML pipeline** — ტრადიციული computer vision-ზე ბევრად უკეთესია AI Vision
4. **არსებული UI უკვე მზადაა** — მხოლოდ `handleGenerate()` ფუნქცია უნდა დავწეროთ

---

## 2. Data Flow

### Screenshot Import Flow (დეტალური)

```
Step 1: User Interaction
─────────────────────────
User:
  - ატვირთავს screenshot (PNG/JPG/WebP)
  - ხედავს preview-ს
  - (optional) Settings: viewports, colorMode, textMode...
  - აჭერს "Generate Wireframe"

Step 2: Frontend → Backend Request
──────────────────────────────────
POST /api/import-screenshot
{
  "userId": "figma-user-123",
  "imageBase64": "data:image/png;base64,iVBOR...",    // ან raw base64
  "imageWidth": 1440,                                  // ორიგინალი სურათის ზომა
  "imageHeight": 3200,
  "viewports": [1440],                                 // რომელ viewport-ებში
  "pluginColors": {
    "text": "#11151A",
    "background": "#F1F2F0",
    "secondary": "#BDC1B2",
    "surface": "#AAB5C3",
    "accent": "#AFC6DC"
  },
  "pluginFont": "Montserrat",
  "colorMode": "plugin",                               // plugin (wireframe) | website (original)
  "textMode": "website"                                 // website (original text) | lorem | semantic
}

Step 3: Backend Processing
──────────────────────────
3a. Validate image (format, size ≤ 5MB, dimensions)
3b. Rate limit check (user: X screenshots/day)
3c. Call Claude Vision API:
    - Send image as base64 content
    - System prompt: Simplified Wireframe Format instructions (shared with PageGen)
    - User prompt: "Analyze this screenshot and convert to wireframe structure"
3d. Parse Claude's JSON response
3e. Validate with Zod schema (shared with PageGen/BlockGen)
3f. For each requested viewport:
    - If viewport ≠ original width → scale/adapt layout
    - Convert Simplified JSON → WireframeNode tree (shared converter)
    - Wrap in WireframeFrame

Step 4: Backend → Frontend Response
────────────────────────────────────
{
  "success": true,
  "wireframeData": {
    "frames": [
      { "viewportWidth": 1440, "viewportHeight": 3200, "tree": { ... } }
    ]
  },
  "pluginColors": { ... },
  "tokensUsed": 6000,
  "analysisDetails": {                    // optional, for debugging
    "sectionsDetected": 5,
    "elementsDetected": 23,
    "layoutComplexity": "medium"
  }
}

Step 5: Frontend → Sandbox
──────────────────────────
parent.postMessage({
  pluginMessage: {
    type: "render-wireframe",
    data: {
      frames: response.wireframeData.frames,
      sourceUrl: "screenshot://uploaded-image",
      pluginColors: response.pluginColors,
      pluginFont: "Montserrat",
      variableMode: "direct",
      layoutMode: "autoLayout",
      colorMode: "plugin",
      fontMode: "plugin",
      textMode: "website"
    }
  }
}, "*");

Step 6: Figma Rendering
───────────────────────
main.ts receives "render-wireframe" →
  executeRender() →
    createWireframeFrame() →
      recursive node builder →
        Figma canvas ✅
```

---

## 3. Claude Vision API Integration

### API Call Structure

```javascript
// Plugin_Backend/lib/aiGenerator.js (extends existing file)

async function analyzeScreenshot({
  imageBase64,
  imageWidth,
  imageHeight,
  viewportWidth,
  textMode,
}) {
  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const mediaType = detectMediaType(imageBase64); // "image/png", "image/jpeg", etc.

  const response = await anthropic.messages.create({
    model: process.env.AI_MODEL || "claude-sonnet-4-20250514",
    max_tokens: 8000,
    system: SCREENSHOT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: "text",
            text: buildScreenshotUserPrompt({ viewportWidth, imageWidth, imageHeight, textMode }),
          },
        ],
      },
    ],
  });

  const content = response.content[0].text;
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || [null, content];
  return JSON.parse(jsonMatch[1]);
}
```

### Screenshot System Prompt (SCREENSHOT_SYSTEM_PROMPT)

```
You are a wireframe layout analyzer for a Figma plugin. You analyze website screenshots
and convert them into structured JSON wireframe descriptions.

YOUR TASK:
1. Identify all visual sections in the screenshot (header, hero, features, footer, etc.)
2. For each section, identify the layout type and all UI elements
3. Output a structured JSON that describes the wireframe layout

OUTPUT FORMAT:
Return a JSON object with this exact structure:

{
  "totalHeight": <number>,
  "sections": [
    {
      "name": "<Section Name>",
      "sectionType": "<header|hero|features|pricing|faq|cta|footer|testimonials|team|stats|gallery|form|content|sidebar-layout>",
      "height": <number>,
      "background": "<background|surface|accent|transparent>",
      "layout": "<center-stacked|two-column|three-column-grid|four-column-grid|sidebar-left|sidebar-right>",
      "padding": { "top": <n>, "right": <n>, "bottom": <n>, "left": <n> },
      "gap": <number>,
      "elements": [ ... ]
    }
  ]
}

[same ELEMENT TYPES as AI_Generations_Plan.md — heading, subheading, paragraph,
 button, button-group, image, icon, card, input, nav-links, logo, divider,
 badge, list, avatar, stat, grid, accordion]

SCREENSHOT ANALYSIS RULES:
1. IDENTIFY the visual hierarchy — what are the main sections from top to bottom?
2. DETECT layout patterns — is it single column, two-column split, grid of cards?
3. READ text content — extract actual text from the screenshot when visible
4. ESTIMATE sizes — approximate section heights based on proportions
5. CLASSIFY elements — map visual elements to the available element types
6. PRESERVE structure — maintain the visual hierarchy and nesting

IMPORTANT:
- Analyze the screenshot carefully, section by section, top to bottom
- Map what you SEE to the available element types (don't invent new types)
- If you can read text in the screenshot, use the actual text
- If text is too small/blurry, use realistic placeholder text
- Estimate heights proportionally based on the screenshot dimensions
- Background colors should be mapped to roles: background, surface, accent, transparent
- Layout detection: if elements are side by side = two-column or grid; if stacked = center-stacked
- Respond ONLY with JSON, no explanation
```

### User Prompt Builder (Screenshot-specific)

```javascript
function buildScreenshotUserPrompt({ viewportWidth, imageWidth, imageHeight, textMode }) {
  let textInstruction = "";

  if (textMode === "website") {
    textInstruction = "Extract and use the actual text visible in the screenshot.";
  } else if (textMode === "lorem") {
    textInstruction = "Replace all text with lorem ipsum placeholder text of similar length.";
  } else if (textMode === "semantic") {
    textInstruction = "Replace text with semantic placeholders that describe the content role (e.g., 'Main Heading', 'Feature description paragraph').";
  }

  return `Analyze this website screenshot and convert it to a wireframe structure.

Screenshot dimensions: ${imageWidth}px × ${imageHeight}px
Target viewport width: ${viewportWidth}px
${textInstruction}

Identify all sections from top to bottom, detect the layout of each section,
and list all UI elements within each section.

Return the complete JSON structure.`;
}
```

### მოდელის არჩევა (Vision-ისთვის)

| სიტუაცია | მოდელი | მიზეზი |
|----------|--------|--------|
| Default | `claude-sonnet-4-20250514` | Vision ხარისხი + ფასის ბალანსი |
| Budget | `claude-haiku-4-5-20251001` | იაფი, მარტივი screenshots-ისთვის საკმარისი |
| Premium | `claude-opus-4-6` | რთული, დეტალური screenshots-ისთვის |

**Vision API ფასი:** სურათის ზომაზეა დამოკიდებული (tokens). ~1000-1500 image tokens ტიპიური screenshot-ისთვის.

---

## 4. Backend Endpoint

### POST /api/import-screenshot

```javascript
// Plugin_Backend/api/index.js — ახალი endpoint

app.post("/api/import-screenshot", async (req, res) => {
  try {
    const {
      userId,
      imageBase64,
      imageWidth,
      imageHeight,
      viewports = [1440],
      pluginColors = DEFAULT_PLUGIN_COLORS,
      pluginFont = "Montserrat",
      colorMode = "plugin",
      textMode = "website",
    } = req.body;

    // 1. Validation
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: "Image is required" });
    }

    // Image size check (base64 string → roughly file size * 1.37)
    const imageSizeBytes = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ""),
      "base64"
    ).length;

    if (imageSizeBytes > 5 * 1024 * 1024) { // 5MB limit
      return res.status(400).json({ success: false, error: "Image too large (max 5MB)" });
    }

    // 2. Rate limit check (TODO: implement with PageGen/BlockGen shared limiter)

    // 3. For each viewport, analyze screenshot
    const frames = [];
    for (const vw of viewports) {
      // Call Claude Vision API
      const simplifiedJson = await analyzeScreenshot({
        imageBase64,
        imageWidth: imageWidth || 1440,
        imageHeight: imageHeight || 900,
        viewportWidth: vw,
        textMode,
      });

      // 4. Validate with Zod schema (shared with PageGen/BlockGen)
      const validated = wireframeSchema.parse(simplifiedJson);

      // 5. Convert Simplified → WireframeNode tree (shared converter)
      const wireframeTree = convertSimplifiedToWireframeNode(validated, {
        viewportWidth: vw,
        pluginColors,
        pluginFont,
        colorMode,
      });

      frames.push({
        viewportWidth: vw,
        viewportHeight: validated.totalHeight,
        tree: wireframeTree,
      });
    }

    // 6. Return standard response
    res.json({
      success: true,
      wireframeData: { frames },
      frameCount: frames.length,
      pluginColors,
    });

  } catch (error) {
    console.error("[import-screenshot] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Screenshot analysis failed",
    });
  }
});
```

### რა არის shared (PageGen/BlockGen-თან საერთო):

| კომპონენტი | ფაილი | Shared? |
|-------------|-------|---------|
| `analyzeScreenshot()` | `lib/aiGenerator.js` | ❌ ახალი (Vision-სპეციფიკური) |
| `SCREENSHOT_SYSTEM_PROMPT` | `lib/aiGenerator.js` | ❌ ახალი (Screenshot-სპეციფიკური) |
| `wireframeSchema` (Zod) | `lib/aiValidator.js` | ✅ shared |
| `convertSimplifiedToWireframeNode()` | `lib/aiConverter.js` | ✅ shared |
| `DEFAULT_PLUGIN_COLORS` | `utils/styleUtils.js` | ✅ shared |
| Rate limiter | `lib/rateLimiter.js` | ✅ shared |

---

## 5. Frontend Integration

### Screenshot.tsx ცვლილებები

```tsx
// Plugin_Frontend/src/ui/pages/import/screenshot/Screenshot.tsx

const handleGenerate = async () => {
  if (!imagePreview) return;

  setIsGenerating(true);  // ახალი state
  setError(null);         // ახალი state

  try {
    // 1. Get image dimensions
    const img = new Image();
    img.src = imagePreview;
    await new Promise((resolve) => { img.onload = resolve; });

    // 2. Call backend
    const response = await fetch(`${API_URL}/api/import-screenshot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: config.userId,
        imageBase64: imagePreview,
        imageWidth: img.naturalWidth,
        imageHeight: img.naturalHeight,
        viewports: settings.localViewports
          .filter((v) => v.enabled)
          .map((v) => parseInt(v.width)),
        pluginColors: config.pluginColors,
        pluginFont: config.pluginFont,
        colorMode: settings.localColorMode,
        textMode: settings.localTextMode,
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Screenshot analysis failed");
    }

    // 3. Send to Figma sandbox for rendering
    parent.postMessage({
      pluginMessage: {
        type: "render-wireframe",
        data: {
          frames: data.wireframeData.frames,
          sourceUrl: "screenshot://uploaded-image",
          pluginColors: data.pluginColors || config.pluginColors,
          pluginFont: config.pluginFont,
          variableMode: config.cssVariablesDefault || "direct",
          layoutMode: config.layoutModeDefault || "autoLayout",
          colorMode: settings.localColorMode,
          fontMode: "plugin",
          textMode: settings.localTextMode,
        },
      },
    }, "*");

  } catch (err) {
    setError(err.message);
  } finally {
    setIsGenerating(false);
  }
};
```

### ახალი States

```tsx
const [isGenerating, setIsGenerating] = useState(false);
const [error, setError] = useState<string | null>(null);
```

### UI ცვლილებები

```tsx
{/* Error message */}
{error && (
  <div class={styles.errorMessage}>{error}</div>
)}

{/* Generate Button — updated */}
<button
  class={styles.screenshotBtn}
  onClick={handleGenerate}
  disabled={!imagePreview || isGenerating}
>
  {isGenerating ? "Analyzing Screenshot..." : "Generate Wireframe"}
</button>
```

### რა არ იცვლება Screenshot.tsx-ში:

- სურათის ატვირთვა ✅
- Preview ✅
- Delete ✅
- Settings Panel ✅
- CSS ✅

---

## 6. Simplified JSON Reuse

### AI_Generations_Plan.md-ის ფორმატი = Screenshot-ის output

Screenshot-ისთვის Claude Vision **ზუსტად იგივე Simplified Wireframe JSON** აბრუნებს რაც PageGen-ი:

```json
{
  "totalHeight": 3200,
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
        { "type": "nav-links", "links": ["Home", "About", "Services"], "direction": "horizontal", "column": "right" },
        { "type": "button", "text": "Contact", "variant": "primary", "size": "sm", "column": "right" }
      ]
    },
    {
      "name": "Hero Section",
      "sectionType": "hero",
      "height": 560,
      "background": "transparent",
      "layout": "two-column",
      ...
    }
  ]
}
```

### Converter Pipeline (shared)

```
Screenshot → Claude Vision → Simplified JSON
PageGen    → Claude Text   → Simplified JSON   } → იგივე converter → WireframeNode → Figma
BlockGen   → Claude Text   → Simplified JSON
```

Converter (`lib/aiConverter.js`) არ უნდა იცოდეს input-ის წყარო — მხოლოდ Simplified JSON → WireframeNode.

---

## 7. განსხვავებები PageGen/BlockGen-ისგან

| ასპექტი | PageGen/BlockGen | Screenshot Import |
|----------|-----------------|-------------------|
| **Input** | ტექსტი (pageType, sections, density) | სურათი (base64 image) |
| **Claude API** | Text-only messages | **Vision** (image + text) |
| **System Prompt** | "Generate wireframe layout" | "**Analyze** screenshot, convert to wireframe" |
| **User Control** | ირჩევს sections, density | მხოლოდ settings (viewports, colorMode...) |
| **Text Content** | AI-generated placeholder | **Screenshot-დან ამოკითხული** (or lorem/semantic) |
| **Section Detection** | User-defined | **AI-detected** (Vision analyzes image) |
| **API Cost** | ~3K-5K tokens | ~5K-7K tokens (image tokens + output) |
| **Accuracy** | 100% (AI generates from scratch) | ~80-90% (depends on screenshot clarity) |
| **Backend Endpoint** | `/api/generate-page`, `/api/generate-block` | `/api/import-screenshot` |
| **Frontend** | PageGeneration.tsx, BlockGeneration.tsx | Screenshot.tsx (existing UI) |

### რა არის SHARED:

- ✅ Simplified Wireframe JSON Format
- ✅ Zod Validation Schema
- ✅ Converter (Simplified → WireframeNode)
- ✅ Rendering Pipeline (main.ts → nodes.ts)
- ✅ Plugin Colors, Plugin Font
- ✅ Settings Panel, ConfigContext
- ✅ Rate Limiter, License Validation
- ✅ Message Protocol (`render-wireframe`)
- ✅ Font Fallback Flow

---

## 8. Error Handling

### Frontend Errors

| Error | UI Message | Action |
|-------|-----------|--------|
| Image too large (>5MB) | "Image is too large. Max 5MB." | Prevent upload |
| Network error | "Failed to connect to server" | Show retry button |
| API timeout | "Analysis took too long. Try a simpler screenshot." | Show retry |
| Invalid response | "Failed to analyze screenshot" | Show retry |
| Rate limit | "Too many requests. Try again later." | Show cooldown timer |

### Backend Errors

| Error | Status | Response |
|-------|--------|----------|
| Missing image | 400 | `{ error: "Image is required" }` |
| Image too large | 400 | `{ error: "Image too large (max 5MB)" }` |
| Invalid format | 400 | `{ error: "Unsupported image format" }` |
| Claude API error | 502 | `{ error: "AI service unavailable" }` |
| Invalid AI output | 500 | `{ error: "Failed to parse AI response" }` |
| Rate limited | 429 | `{ error: "Rate limit exceeded" }` |

---

## 9. Testing Strategy

### Frontend Tests (Plugin_Frontend)

```
Plugin_Frontend/src/__tests__/screenshot-import.test.tsx

1. ✅ renders upload area and generate button
2. ✅ generate button disabled without image
3. ✅ generate button enabled with image
4. ✅ shows "Analyzing Screenshot..." during generation
5. ✅ calls fetch with correct payload
6. ✅ sends render-wireframe message on success
7. ✅ shows error message on failure
8. ✅ handles network errors gracefully
```

### Backend Tests (Plugin_Backend — if added later)

```
1. ✅ POST /api/import-screenshot — success with valid image
2. ✅ rejects missing image
3. ✅ rejects oversized image (>5MB)
4. ✅ rejects invalid image format
5. ✅ returns WireframeFrame[] in correct format
6. ✅ handles Claude API errors
7. ✅ handles invalid Claude response (bad JSON)
8. ✅ rate limiting works
```

---

## 10. Implementation Phases

### Phase 1: MVP (Core functionality)

**რა უნდა გაკეთდეს:**

1. **Backend: `analyzeScreenshot()` function** — `Plugin_Backend/lib/aiGenerator.js`
   - Claude Vision API call
   - Screenshot system prompt
   - JSON parsing

2. **Backend: `POST /api/import-screenshot` endpoint** — `Plugin_Backend/api/index.js`
   - Request validation
   - Call `analyzeScreenshot()`
   - Shared converter (← depends on PageGen converter being ready)
   - Response formatting

3. **Frontend: `handleGenerate()` implementation** — `Plugin_Frontend/src/ui/pages/import/screenshot/Screenshot.tsx`
   - Fetch to backend
   - Send `render-wireframe` message
   - Loading state + error handling

4. **Frontend: UI updates** — Loading indicator, error display

**Prerequisites (from AI_Generations_Plan.md):**
- ✅ `ANTHROPIC_API_KEY` env var in Plugin_Backend
- ✅ `convertSimplifiedToWireframeNode()` converter (shared)
- ✅ `wireframeSchema` Zod validation (shared)

### Phase 2: Polish

5. **Image validation** — size limits, format checks, dimension detection
6. **Progress indicator** — "Analyzing screenshot..." → "Building wireframe..." → "Rendering..."
7. **Rate limiting** — shared with PageGen/BlockGen
8. **Library integration** — save screenshot imports to Library

### Phase 3: Advanced (optional)

9. **Multi-viewport** — analyze once, adapt to multiple viewports
10. **Partial screenshot** — crop/select area of screenshot
11. **Comparison view** — side-by-side original screenshot vs wireframe
12. **Drag & drop** — drag image directly onto plugin (minor UX improvement)

---

## Dependency Graph

```
AI_Generations_Plan.md (PageGen/BlockGen)
  │
  ├── Simplified Wireframe Format     ─── shared ───┐
  ├── Zod Validation Schema           ─── shared ───┤
  ├── Converter (Simplified → Node)   ─── shared ───┤
  ├── Anthropic SDK setup             ─── shared ───┤
  └── Rate Limiter                    ─── shared ───┤
                                                     │
Screenshot Import (this plan)  ◄─────────────────────┘
  │
  ├── analyzeScreenshot()       ← NEW (Vision API call)
  ├── SCREENSHOT_SYSTEM_PROMPT  ← NEW (Vision-specific prompt)
  ├── POST /api/import-screenshot ← NEW (endpoint)
  └── handleGenerate()          ← NEW (Frontend, ~30 lines)
```

**დასკვნა:** Screenshot Import-ის ~70% კოდი shared-ია PageGen/BlockGen-თან. ახალი კოდი მხოლოდ:
- Vision API call (~40 ხაზი)
- Screenshot prompt (~50 ხაზი)
- Backend endpoint (~60 ხაზი)
- Frontend handleGenerate (~40 ხაზი)

**სულ: ~200 ხაზი ახალი კოდი** (+ shared infrastructure from AI_Generations_Plan.md)
