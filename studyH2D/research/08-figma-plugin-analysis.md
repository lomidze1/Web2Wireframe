# h2d Figma Plugin Analysis

## Plugin Architecture

h2d Figma plugin consists of 3 main files loaded from `h2d.to.design`:

| File | Size | Purpose |
|------|------|---------|
| `___main___rawbundle-*.js` | ~2MB (uncompressed) | **Figma sandbox code** — CSS→Figma conversion engine |
| `App-*.js` | ~1.9MB | Plugin UI (Preact-based) |
| `vendors-App-*.js` | ~3.9MB | Vendor libraries |
| `vendors-common-*.js` | ~126KB | Shared vendors |
| `worker-*.js` | ~39KB | Background worker |

Total plugin: ~8MB of JavaScript.

### How to access:
Plugin code is hosted on CDN. Latest discovered URL:
```
https://h2d.to.design/assets/___main___rawbundle-COlGrugO.js
```

## Main Bundle Structure (___main___rawbundle)

The entire file is wrapped in `const n = \`...\`` — a template literal containing the plugin sandbox code.

### Key Functions Identified

#### `Cl(b, c, d)` — Node Factory
Creates Figma nodes based on h2d type:
```javascript
if (b['type'] === 'FRAME')
    return d ? figma.createComponent() : figma.createFrame();
if (b['type'] === 'SVG')
    return figma.createNodeFromSvg(b['svg']);
if (b['type'] === 'TEXT')
    return figma.createText();
```

#### `kl(b, d, e, f, g)` — Property Assignment Switch
Main CSS→Figma property mapper. Uses a `switch(e)` on property names:
- `x`, `y` — position
- `gridRowSizes`, `gridColumnSizes` — grid layout
- Delegates to specialized functions for complex properties

#### `Ll(b, c)` — Layout Properties
Sets auto-layout properties:
```javascript
b.itemSpacing = c.itemSpacing ?? c.padding ?? 0;
b.paddingBottom = Math.max(0, c.paddingBottom ?? c.padding ?? 0);
// ... etc
```

#### `Ex(b)` — Display Normalization
Converts CSS display values:
```javascript
// inline → block (Figma has no inline)
// inline-flex → flex
// inline-grid → grid
if (d === 'inline') d = 'block';
else d = d.replace(/inline-/, '');
```

#### `C5(b, c)` — Layout Size Validation
Validates auto-layout sizing doesn't exceed container.

### Image Handling
```javascript
// From h2d data: $url → assets{base64}
figma.createImage(data) // returns hash
node.fills = [{ type: 'IMAGE', imageHash: hash, scaleMode: 'FILL' }];

// Fallback: async from URL (via divriots proxy)
figma.createImageAsync('https://redir2.divriots.com?url=' + encodedUrl);
```

### SVG Handling
```javascript
// Clean SVG markup
b['svg'] = b['svg'].replace(/ "="">/g, '>');
// Create vector node
let g = figma.createNodeFromSvg(b['svg']);
// If it becomes a GROUP, wrap in FRAME for layout compatibility
if (g.type === 'GROUP') {
    let h = figma.createFrame();
    h.fills = [];
    h.resize(g.width, g.height);
    g.children.forEach(j => h.appendChild(j));
}
```

### Property List (W5 — skip list)
Properties that are NOT set via the generic `kl()` switch:
```javascript
const W5 = [
    'type', 'width', 'height', 'svg', 'children', 'characters',
    'platformFont', 'platformFontFamily', 'fontFamily', 'fontWeight',
    'fontStretch', 'fontFeatures', 'fontVariations', 'fontOpticalSizing',
    'fontStyle', 'ranges', 'reactions'
];
```
These are handled by specialized code paths.

## Key Insight: h2d has TWO conversion stages

### Stage 1: CSS → Intermediate Format (content script → `.h2d`)
Raw CSS values from `getComputedStyle()` stored as-is.

### Stage 2: Intermediate → Figma API (plugin sandbox)
The plugin interprets CSS values and maps them to Figma's API.

This is fundamentally different from W2W, where Stage 2 barely exists —
our tree-builder does almost everything in Stage 1.

## Obfuscation

The main bundle uses:
- Bracket notation for all property access: `b['layoutMode']` not `b.layoutMode`
- Hex number literals: `0x0` for 0, `0xa` for 10
- Minified variable names: single/double letter
- No source maps available publicly (`.map` files behind auth)
- CSS property names are NOT obfuscated (they're runtime strings)

## What We Can Learn

1. **Display normalization**: `inline-*` → `*` (Figma has no inline concept)
2. **Image proxy**: `redir2.divriots.com` as CORS proxy for async images
3. **Grid support**: Full CSS Grid → Figma Grid layout mapping
4. **SVG cleanup**: Various SVG sanitization before `createNodeFromSvg`
5. **Layout validation**: Post-layout size checks to catch auto-layout sizing bugs
6. **Property assignment**: Generic switch-based approach for property mapping

## For Deeper Analysis

The plugin code is ~2MB minified+obfuscated. Full deobfuscation would require:
1. JS beautifier
2. Variable renaming based on context
3. Source map (if obtainable)

The most valuable sections to deobfuscate:
- **CSS display → Figma layoutMode** conversion
- **CSS width/height → Figma sizing** (FIXED/HUG/FILL)
- **CSS gap → Figma itemSpacing** mapping
- **CSS boxShadow → Figma effects** parsing
- **CSS transform → Figma rotation/position** calculation
