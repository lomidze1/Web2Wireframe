# Plugin Backend Technical Documentation

This document describes the current plugin backend architecture based on the repository layout.

## Components

```
Web 2 Wireframe/
├── Plugin_Frontend/   # Figma plugin UI (Create Figma Plugin)
└── Plugin_Backend/    # Express API + MongoDB + Puppeteer
```

## Backend Structure (`Plugin_Backend`)

```
Plugin_Backend/
├── api/index.js           # Express API entry
├── lib/htmlExtractor.js   # Puppeteer + Cheerio logic
├── models/                # Mongoose models
├── utils/                 # HTML/style helpers
└── .env.example
```

## API Endpoints (from `api/index.js`)

- `POST /api/import-url`
- `GET /api/wireframe/:id`
- `GET /api/wireframe-history/:userId`
- `POST /api/save-settings`
- `GET /api/settings/:userId`
- `GET /api/health`

Request body for `/api/import-url`:

```json
{
  "userId": "figma-user-123",
  "sourceUrl": "https://example.com",
  "viewports": [1440, 375],
  "colorMode": "plugin-colors",
  "typographyMode": "plugin-fonts"
}
```

Defaults are applied in `api/index.js` if values are missing.

## Data Flow (High-Level)

```
Plugin_Frontend → POST /api/import-url → Puppeteer render → Cheerio parse → MongoDB save → response JSON
```

## Environment Variables

See `Plugin_Backend/.env.example` for required variables and defaults.

## Needs Verification

- Any UI layout or screen size details for the plugin UI.
- Deployment target and hosting setup for `Plugin_Backend`.

Applies:

- Position & size
- Background color
- Border color & width
- Border radius
- Opacity
- Shadow (simplified)

#### `hexToFigmaRGB(hex)`

Converts hex color (#264653) to Figma RGB format:

```typescript
{ r: 0.15, g: 0.275, b: 0.325 }
```

#### `createLocalStyles(localStyles, colorMode)`

Creates Figma paint styles from color data:

- `Web2Wireframe/Primary`
- `Web2Wireframe/Accent`
- `Web2Wireframe/Additional`

---

## 🔌 Backend API (Express)

### Environment Setup

**MongoDB Atlas Connection String:**

```
mongodb+srv://username:password@cluster.mongodb.net/web2wireframe
```

**Environment Variables (.env):**

```
MONGODB_URI=mongodb+srv://...
NODE_ENV=production
API_PORT=3001
CORS_ORIGIN=https://www.figma.com,http://localhost:3000
```

### API Endpoints

#### POST `/api/import-url`

**Purpose:** Import website and generate wireframe

**Request:**

```json
{
  "userId": "figma-user-123",
  "sourceUrl": "https://example.com",
  "viewports": [1440, 375],
  "colorMode": "plugin-colors",
  "typographyMode": "plugin-fonts"
}
```

**Response:**

```json
{
  "success": true,
  "wireframeId": "507f...",
  "sourceUrl": "https://example.com",
  "viewports": [1440, 375],
  "colorMode": "plugin-colors",
  "frames": 2,
  "localStyles": {
    "colors": [
      { "id": "color-primary", "name": "Primary", "value": "#264653" },
      { "id": "color-accent", "name": "Accent", "value": "#2a9d8f" },
      { "id": "color-additional", "name": "Additional", "value": "#e9c46a" }
    ],
    "typography": [
      {
        "id": "typography-heading",
        "name": "Heading",
        "fontFamily": "Montserrat",
        "fontSize": 24,
        "fontWeight": 600
      },
      {
        "id": "typography-body",
        "name": "Body",
        "fontFamily": "Open Sans",
        "fontSize": 14,
        "fontWeight": 400
      }
    ]
  }
}
```

**Process:**

1. Validate URL format
2. Create Wireframe document (status: "processing")
3. For each viewport:
   - Render website at viewport width with Puppeteer
   - Parse HTML with Cheerio
   - Extract DOM structure, colors, fonts, sizes
   - Create wireframe element JSON
4. Save wireframe data to MongoDB
5. Return response with embedded frame data

#### GET `/api/wireframe/:id`

Retrieve specific wireframe by ID.

#### GET `/api/wireframe-history/:userId`

Get user's wireframe history (with pagination).

#### POST `/api/save-settings`

Save user preferences.

#### GET `/api/settings/:userId`

Get user settings.

---

## 📊 Data Models (MongoDB)

### Wireframe Collection

```javascript
{
  _id: ObjectId,
  userId: "figma-user-123",
  sourceUrl: "https://example.com",
  viewports: [1440, 375],
  colorMode: "plugin-colors",
  typographyMode: "plugin-fonts",
  wireframeData: {
    frames: [
      {
        viewportWidth: 1440,
        viewportHeight: 1080,
        backgroundColor: "#ffffff",
        elements: [
          {
            id: 0,
            type: "heading",
            x: 20,
            y: 20,
            width: 200,
            height: 40,
            backgroundColor: "#ffffff",
            textColor: "#264653",
            borderColor: "#cccccc",
            borderWidth: 1,
            borderStyle: "solid",
            fontFamily: "Montserrat",
            fontSize: 24,
            fontWeight: 600,
            textAlign: "left",
            content: "Lorem Ipsum Neque",
            gradient: "",
            shadow: "",
            opacity: 1,
            borderRadius: 0
          }
          // ... more elements
        ]
      }
      // ... more frames
    ]
  },
  localStyles: { ... },
  status: "completed",
  figmaFrameId: "frame-id",
  figmaFileId: "file-id",
  createdAt: Date,
  updatedAt: Date
}
```

### UserSettings Collection

```javascript
{
  userId: "figma-user-123",
  defaultColorMode: "plugin-colors",
  defaultViewports: [1440, 375],
  defaultTypographyMode: "plugin-fonts",
  apiUsage: {
    count: 10,
    reset: Date
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🌐 HTML Extraction Process

### Puppeteer Rendering

```javascript
// 1. Launch browser
const browser = await puppeteer.launch({ headless: "new" });

// 2. Create page with viewport
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1080 });

// 3. Navigate to URL
await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

// 4. Get rendered HTML
const html = await page.content();
await browser.close();
```

### DOM Extraction with Cheerio

```javascript
const $ = cheerio.load(html);

// Remove scripts, styles
$("script, style, noscript").remove();

// Process each element
$("body *").each(function () {
  const tag = this.name;
  const text = $(this).text();
  const styles = $(this).attr("style");

  // Determine element type
  let elementType = "div";
  if (["h1", "h2", "h3"].includes(tag)) elementType = "heading";
  else if (["img"].includes(tag)) elementType = "image";

  // Parse inline styles
  const computedStyle = parseInlineStyles(styles);

  // Create element object
  const element = {
    type: elementType,
    x: 20, // Placeholder positioning
    y: 20,
    width: 100,
    height: 40,
    backgroundColor: computedStyle.backgroundColor,
    textColor: computedStyle.color,
    // ... more properties
  };
});
```

### Inline Style Parsing

```javascript
function parseInlineStyles(styleStr) {
  const styles = {
    backgroundColor: null,
    color: null,
    borderColor: null,
    borderWidth: 0,
    fontFamily: null,
    fontSize: 14,
    fontWeight: 400,
    // ... more
  };

  if (!styleStr) return styles;

  styleStr.split(";").forEach((decl) => {
    const [prop, value] = decl.split(":").map((s) => s.trim());

    if (prop.toLowerCase() === "background-color") {
      styles.backgroundColor = normalizeColor(value);
    }
    // ... handle other properties
  });

  return styles;
}
```

### Lorem Ipsum Generation

```javascript
function generateLoremIpsum(wordCount) {
  const loremWords = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', ...];

  let result = [];
  for (let i = 0; i < wordCount; i++) {
    result.push(loremWords[Math.floor(Math.random() * loremWords.length)]);
  }

  return result.join(' ');
}

// Extract original text word count
const originalText = "This is some text...";
const wordCount = countWords(originalText); // 4

// Generate matching Lorem Ipsum
const placeholder = generateLoremIpsum(wordCount); // "lorem ipsum dolor sit"
```

---

## 🚀 Deployment

### Backend Deployment to Vercel

1. **GitHub Repository Setup**

   ```bash
   cd /Users/giorgi/Web2Wireframe-Backend
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <repo-url>
   git push -u origin main
   ```

2. **Vercel Dashboard**

   - Import GitHub repository
   - Add environment variables:
     - `MONGODB_URI`: Your MongoDB connection string
     - `NODE_ENV`: production
   - Deploy

3. **Get Vercel URL**
   - After deployment: `https://your-project.vercel.app`
   - Update `API_URL` in `code.ts`:
     ```typescript
     const API_URL = "https://your-project.vercel.app";
     ```

### Plugin Installation

1. Compile TypeScript: `npm run build`
2. In Figma: Plugins → Development → Import plugin from manifest
3. Select `/Users/giorgi/Web2Wireframe/manifest.json`

---

## 🎨 Color Modes

### 1. Website Colors

- Extract original colors from website
- Apply directly to wireframe elements

### 2. Plugin Colors (Default)

- Use predefined neutral colors:
  - Background: #f5f5f5
  - Text: #333333
  - Borders: #cccccc
  - Boxes: #eeeeee

### 3. Figma Local Styles

- Read from user's existing Local Styles
- Pick first 3 colors and 2 fonts
- Apply to elements

### 4. Create Local Styles

- Extract 3 colors from website
- Create Figma paint styles
- Apply to elements

---

## 🔄 Data Flow Example

### User Workflow

1. **Open Plugin**

   - UI loads with saved settings
   - Default: Plugin Colors, viewports [1440, 375]

2. **Configure Settings**

   - Select: Website Colors
   - Select: 1440px, 1024px, 768px viewports
   - Click "Generate"

3. **Generate Wireframe**

   - Prompted for URL: `https://airbnb.com`
   - Backend process:
     - Render at 1440px, extract DOM
     - Render at 1024px, extract DOM
     - Render at 768px, extract DOM
     - Extract colors from website
     - Generate Lorem Ipsum for text
   - Response: 3 frames with wireframe data

4. **Figma Frames Created**

   - Frame 1: "Wireframe - https://airbnb.com (1440px)"
     - 50+ elements (rectangles + text)
     - Colors from Airbnb website
     - Placeholder text matching original length
   - Frame 2: 1024px version
   - Frame 3: 768px version

5. **Local Styles Created** (if "Create Local Styles" selected)
   - Paint Style: Web2Wireframe/Primary (#FF5A5F)
   - Paint Style: Web2Wireframe/Accent (#00A699)
   - Paint Style: Web2Wireframe/Additional (#FFB400)

---

## 🐛 Error Handling

### Plugin Side

```typescript
try {
  await generateWireframeFromBackend(...);
} catch (error) {
  figma.notify("Error: " + error.message, { timeout: 5 });
  figma.closePlugin();
}
```

### Backend Side

```javascript
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});
```

---

## 📝 Performance Considerations

- **Puppeteer timeout:** 30 seconds per webpage
- **Elements limit:** ~100 elements per frame
- **MongoDB query:** Indexed by userId for fast history lookup
- **localStorage:** Settings cached in browser

---

## 🔐 Security

- **CORS:** Restricted to Figma.com domain
- **API validation:** URL format checking
- **Input sanitization:** HTML cleaning before parsing
- **MongoDB:** Atlas free tier with password protection

---

## 📱 Responsive Behavior

Plugin UI is fixed 440x800px (Figma plugin constraint).
Wireframe frames are created at selected viewports:

- 1920px - Desktop
- 1440px - Desktop (default)
- 1024px - Tablet
- 768px - Tablet
- 375px - Mobile (default)

Elements scale appropriately within each viewport.

---

## 🎯 Future Enhancements

- [ ] Screenshot analysis (OCR-based)
- [ ] AI wireframe generation from prompts
- [ ] Browser extension for easier region selection
- [ ] Batch URL processing
- [ ] Export to Figma components
- [ ] Advanced typography mapping
- [ ] Accessibility analysis
- [ ] Design system integration

---

**Version:** 1.0.0  
**Last Updated:** November 23, 2025  
**Status:** MVP Ready
