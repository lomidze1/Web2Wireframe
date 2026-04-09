# h2d Spy Scripts — Usage Guide

## Quick Start (ALL-IN-ONE)

რეკომენდებული: `07-all-in-one-spy.js`

### ნაბიჯები:
1. გახსენი target ვებსაიტი (მაგ. tesla.com)
2. DevTools → Console → paste `07-all-in-one-spy.js`
3. h2d extension-ით capture გაუშვი
4. capture დასრულების შემდეგ Console-ში:
   - `exportAllSpyData()` — console-ში report
   - `downloadSpyReport()` — JSON ფაილად download
5. `restoreAll()` — hooks-ის მოხსნა

## Individual Scripts

### Content Script Side (inject in page DevTools Console):

| Script | Purpose |
|--------|---------|
| `01-getComputedStyle-interceptor.js` | რომელ CSS properties-ს კითხულობს |
| `02-message-interceptor.js` | content script ↔ background messages |
| `03-dom-traversal-tracker.js` | DOM traversal order, visibility checks |
| `06-h2d-storeSerializedFrame-interceptor.js` | Final serialized data before compression |

### Background Service Worker Side:

| Script | Purpose |
|--------|---------|
| `04-background-cdp-logger.js` | ყველა CDP command full request/response |

**გამოყენება:** chrome://extensions → h2d → "Service Worker" link → DevTools Console → paste script

### Figma Plugin Side:

| Script | Purpose |
|--------|---------|
| `05-figma-node-exporter.js` | Export Figma node tree after import |

**გამოყენება:** Figma → Menu → Plugins → Development → Open Console → paste script

## Full Research Procedure

### Phase 1: Capture Data Collection
1. **Page DevTools:** inject `07-all-in-one-spy.js` + `06-h2d-storeSerializedFrame-interceptor.js`
2. **Background DevTools:** inject `04-background-cdp-logger.js`
3. Run h2d capture
4. Export all data from both consoles

### Phase 2: Figma Analysis
1. After h2d import in Figma: run `05-figma-node-exporter.js` → `exportSelectedTree('h2d')`
2. After W2W import of same site: run `exportSelectedTree('w2w')`
3. `downloadComparison()` → get side-by-side JSON

### Phase 3: Analysis
- Compare h2d spy report vs our extraction
- Compare Figma node trees
- Identify specific quality gaps
