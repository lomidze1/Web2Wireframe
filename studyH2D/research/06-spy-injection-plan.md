# Spy & Injection Plan — რა უნდა შევისწავლოთ

## უკვე ვიცით
- [x] .h2d ფაილის ფორმატი (deflate + XOR 57)
- [x] JSON სტრუქტურა (80 CSS properties, 3 node types)
- [x] CDP commands (რა და რამდენჯერ)
- [x] Message protocol (webext-bridge)
- [x] Asset extraction (Page.getResourceContent)
- [x] Architecture flow (content script → background → file)

## რა არ ვიცით / უნდა გავარკვიოთ

### 1. Content Script DOM Traversal Logic
**კითხვა:** როგორ წყვეტს content script რომელი ელემენტი ხილულია, რომელი გამოტოვოს?
- visibility/display:none filtering
- min size thresholds
- z-index stacking resolution
- overflow:hidden clipping

**Spy method:** Content script deobfuscation + injection

### 2. CSS → Node Type Decision
**კითხვა:** როგორ წყვეტს content script ელემენტი FRAME, TEXT თუ SVG გახდეს?
- TEXT = leaf text node? ან ტექსტის შემცველი ელემენტი?
- როდის ხდება ელემენტი FRAME+TEXT children-ით vs ერთი TEXT?

**Spy method:** ერთი კონკრეტული ელემენტის tracking

### 3. Style Filtering Logic
**კითხვა:** 80 property-ს როგორ ირჩევს? არა ყველა 350+ computed style-ს.
- რა default values-ს ფილტრავს?
- რა criteria-ით ხდება "interesting" property-ის შერჩევა?

**Spy method:** Content script deobfuscation

### 4. Figma Plugin Conversion Engine
**კითხვა:** Figma plugin როგორ აქცევს raw CSS-ს Figma nodes-ად?
- `width: "auto"` + `display: "flex"` → layoutMode: "HORIZONTAL", sizing: "HUG"?
- `gap: "24px"` → itemSpacing: 24?
- `boxShadow` → dropShadow/innerShadow?
- `transform: matrix(...)` → rotation + position?

**Spy method:** Figma plugin code analysis (DevTools → Plugin console)

### 5. Quality Comparison (Specific Elements)
**კითხვა:** კონკრეტულად სად კარგავს ჩვენი tool ხარისხს?
- Layout accuracy (auto layout detection)
- Text positioning
- Image sizing (object-fit)
- Border rendering
- Shadow accuracy

**Spy method:** Side-by-side Figma import comparison

## Spy Scripts to Create

### Script 1: Content Script Message Interceptor
```javascript
// Inject before h2d content script
// Intercept ALL postMessage / webext-bridge messages
// Log: element selector, styles captured, assets requested
```

### Script 2: DOM Traversal Tracker
```javascript
// Monkey-patch getComputedStyle
// Log every element that h2d reads styles from
// Record: element, tag, classes, which properties read
```

### Script 3: CDP Command Logger (Background)
```javascript
// Already have this from previous session
// Enhance: log full request/response payloads
// Focus on: getResourceContent responses, forcePseudoState targets
```

### Script 4: Figma Plugin Inspector
```javascript
// In Figma DevTools console
// After h2d import: traverse all nodes
// Export: node tree with all Figma properties
// Compare with our import of same site
```

### Script 5: Side-by-Side Exporter
```javascript
// Figma plugin script
// Import same URL with h2d AND W2W
// Export both node trees as JSON
// Diff: find property-level differences
```
