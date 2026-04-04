# h2d JSON Structure Analysis

## Top-Level Schema

```typescript
interface H2DFile {
  name: string;           // URL of captured page
  url: string;            // Same URL
  theme: string;          // "default" | "dark" | etc.
  width: number;          // Viewport width (1440)
  doc: H2DDoc;            // Page metadata
  frame: H2DNode;         // Root node (recursive tree)
  assets: Record<string, H2DAsset>;  // URL → base64 image data
  fonts: H2DFont[];       // @font-face entries
  alternatives?: H2DNode[]; // Multi-theme/width captures
}
```

## Doc (Page Metadata)

```typescript
interface H2DDoc {
  title: string;          // document.title
  innerHeight: number;    // window.innerHeight (900)
  innerWidth: number;     // window.innerWidth (1440)
  fontSize: number;       // Root font-size (14-16)
  baseURI: string;        // document.baseURI
  bgColor: string;        // Body background color "rgb(255, 255, 255)"
}
```

## Node Types

h2d uses only **3 node types**:

| Type | Count (Tesla) | Description |
|------|---------------|-------------|
| `FRAME` | 695 | Any container/element (div, section, img, button, etc.) |
| `TEXT` | 99 | Pure text content |
| `SVG` | 12 | SVG elements with full markup |

### FRAME Node

```typescript
interface H2DFrameNode {
  type: "FRAME";
  tag: string;            // HTML tag: "div", "img", "section", "a", etc.
  x: number;              // Left position (absolute, from page origin)
  y: number;              // Top position
  width: number;
  height: number;
  quad: [x1,y1, x2,y2, x3,y3, x4,y4];  // 4-corner coordinates (rotation-aware)
  classList: string[];    // CSS classes
  attr: Record<string, any>;  // HTML attributes (id, alt, naturalWidth, naturalHeight, srcset...)
  styles: Record<string, string | number>;  // 80 CSS properties (RAW values)
  children?: H2DNode[];
  isScrollingElt?: boolean;

  // Image reference
  $url?: string;          // Points to assets{} dict key

  // Hover state (full sub-tree clone with hover styles)
  hover?: H2DFrameNode;
}
```

### TEXT Node

```typescript
interface H2DTextNode {
  type: "TEXT";
  x: number;
  y: number;
  width: number;
  height: number;
  quad: [x1,y1, x2,y2, x3,y3, x4,y4];
  value: string;          // Text content
  font: string;           // Rendered font name (e.g. "Universal Sans Text Medium")
  platformFont: {
    familyName: string;   // e.g. "Universal Sans Text Medium"
    postScriptName: string; // e.g. "UniversalSans-Medium"
  };
  // NO styles object — text inherits from parent FRAME
  // NO fontSize, fontWeight, color — all on parent
}
```

**Key insight:** TEXT nodes are MINIMAL. They only carry the text value and platform font info.
All typography styles (fontSize, fontWeight, color, lineHeight) live on the parent FRAME node.

### SVG Node

```typescript
interface H2DSVGNode {
  type: "SVG";
  x: number;
  y: number;
  width: number;
  height: number;
  quad: [x1,y1, x2,y2, x3,y3, x4,y4];
  svg: string;            // Full SVG markup (with h2d-* classes, viewBox, dimensions)
}
```

## Asset Format

```typescript
interface H2DAsset {
  base64Encoded: boolean;  // true for binary (images)
  content: string;         // base64 data (no data:URI prefix)
  mimeType: string;        // "image/jpeg", "image/png", "image/webp", etc.
}
```

Assets are stored in a flat dict keyed by original URL:
```json
{
  "assets": {
    "https://example.com/hero.jpg": {
      "base64Encoded": true,
      "content": "/9j/4AAQSkZJRg...",
      "mimeType": "image/jpeg"
    }
  }
}
```

Nodes reference assets via `$url` property pointing to the same URL key.

### Asset Extraction Method
h2d uses `Page.getResourceTree()` + `Page.getResourceContent()` to extract images from browser cache.
- Zero additional HTTP requests
- No CORS issues
- Original quality preserved
- Works for all formats: JPEG, PNG, WebP, GIF, SVG, CSS, fonts

## Font Format

```typescript
interface H2DFont {
  fontDisplay: string;         // "auto" | "swap" | etc.
  fontFamily: string;          // CSS font-family name
  fontStretch: string;         // "normal" | "100%"
  fontStyle: string;           // "normal" | "italic"
  fontVariant: string;         // "normal"
  fontWeight: string;          // "400" | "500" | "100 900" (range)
  platformFontFamily: string;  // Actual platform name
  src: string;                 // @font-face src URL
  unicodeRange?: string;       // Unicode range subset
  fontVariationAxes?: Array<{  // Variable font axes
    name: string;              // "Weight"
    tag: string;               // "wght"
    defaultValue: number;
    minValue: number;
    maxValue: number;
  }>;
}
```

## Hover State Format

Nodes with CSS hover effects include a complete `hover` sub-tree:
```json
{
  "type": "FRAME",
  "tag": "button",
  "styles": { /* default styles */ },
  "hover": {
    "type": "FRAME",
    "tag": "button",
    "x": 512.7, "y": 12,
    "styles": { /* hover styles — full re-capture with :hover forced */ },
    "children": [/* hover children */]
  }
}
```

h2d forces pseudo states via `CSS.forcePseudoState` CDP command, then re-captures the element tree.

## Statistics Across Sites

| Metric | Tesla | Apple iPhone | Stamatiou |
|--------|-------|-------------|-----------|
| Total nodes | 806 | varies | varies |
| FRAME nodes | 695 | — | — |
| TEXT nodes | 99 | — | — |
| SVG nodes | 12 | — | — |
| Assets | 45 | 36 | 27 |
| Fonts | 14 | 0 | 7 |
| Style properties | 80 | — | — |
| .h2d size | 2.0 MB | 3.0 MB | 2.7 MB |
| JSON size | 3.5 MB | 6.7 MB | 4.6 MB |

## HTML Tags Found (Tesla)

```
a, body, button, canvas, div, footer, gmp-internal-camera-control,
h1, h4, h5, header, html, iframe, img, input, li, main, nav, ol,
p, picture, section, slot, source, span, sup, svg, ul
```
