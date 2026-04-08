# New Way Continuation Plan — h2d Parity

> **მიზანი:** ჩვენი ექსპორტი 100% h2d-ის ტოლი ან უკეთესი.
> **ბრენჩი:** `new-way`
> **რეფერენსი:** `studyH2D/decoded/H2D-localhost.json`, `studyH2D/decoded/H2D-pricing.json`
> **ჩვენი result:** `studyH2D/our-result/new-way-localhost.json`, `studyH2D/our-result/new-way-pricing.json`

---

## მიმდინარე სტატუსი (2026-04-07)

| მეტრიკა | ჩვენი (localhost) | H2D (localhost) | Gap |
|---|---|---|---|
| **Total nodes** | 121 | 140 | -19 |
| **FRAME** | 79 | 88 | -9 (pseudo-elements) |
| **TEXT** | 42 | 52 | -10 (line splitting) |
| **SVG** | 0 | 0 | ✅ |
| **platformFont on TEXT** | **0%** | 100% | ❌ Critical |
| **Pseudo-elements** | **0** | 9 | ❌ |
| **Hover states** | **0** | 16 (pricing) | ❌ |
| **Font assets** | **0** | 3 | ❌ |
| **Image assets** | 5 | 5 | ✅ Identical |
| **Style value match** | 97.5%+ | — | ✅ Good |

---

## Gap 1: platformFont = 0% (CRITICAL)

### პრობლემა
ყველა TEXT node-ს უნდა ჰქონდეს `platformFont: { familyName, postScriptName }`. ახლა 0/42 TEXT-ს აქვს. Service worker-ის enrichment კოდი არსებობს (`h2dEnrichAllTextNodes`), მაგრამ **არ მუშაობს**.

### Root Cause
Content script-ში `data-w2w-idx` attribute მხოლოდ FRAME-ებს ეწერება, რომლებსაც TEXT children ჰყავთ. Service worker-ში `DOM.querySelectorAll("[data-w2w-idx]")` პოულობს ამ ელემენტებს და `CSS.getPlatformFontsForNode`-ს ეძახის. **მაგრამ:** ინდექსის mapping სავარაუდოდ არ ემთხვევა — DFS order content script-ში vs DOM.querySelectorAll order-ი DOM-ში შეიძლება განსხვავდეს.

### გამოსწორება

**ფაილი: `packages/browser-extension/src/content/extractor.ts`**

1. `data-w2w-idx` attribute-ში **backendNodeId-ის ნაცვლად unique counter-ი** უკვე წერია. მაგრამ service worker-ში `DOM.getAttributes`-ის შედეგთან matching არ მუშაობს.

2. **ახალი მიდგომა:** Content script-ში არ ვიყენებთ `data-w2w-idx`-ს ფონტებისთვის. ნაცვლად:
   - Service worker-ში `Runtime.evaluate` გამოვიყენოთ: content script-ში ფუნქცია რომელიც ყველა TEXT-ის მშობელ ელემენტს CSS selector-ით იდენტიფიცირებს
   - ან უფრო მარტივი: **content script-ში extractPage()-ს დროს, ტექსტის მშობელ ელემენტს ვანიჭებთ unique `id` attribute-ს** (e.g., `w2w-text-0`, `w2w-text-1`...), service worker-ში `DOM.querySelector("#w2w-text-0")` → `CSS.getPlatformFontsForNode`

3. **გამოსწორების ნაბიჯები:**

```
Step 1: extractor.ts — text-hosting frame-ებს unique id ანიჭოს:
  el.setAttribute('data-w2w-text', String(textIdx++));

Step 2: extractPage() აბრუნებს textHostCount-ს result-ში

Step 3: background/index.ts — handleCapturePageH2D()-ში:
  for (let i = 0; i < textHostCount; i++) {
    const qResult = await client.send("DOM.querySelector", {
      nodeId: rootNodeId,
      selector: `[data-w2w-text="${i}"]`
    });
    const fonts = await client.send("CSS.getPlatformFontsForNode", { nodeId: qResult.nodeId });
    fontsByIdx.set(i, primaryFont(fonts));
  }

Step 4: h2dEnrichAllTextNodes(frame, fontsByIdx) — უკვე არსებობს, უნდა იმუშაოს

Step 5: cleanup — content script-ში data-w2w-text attributes-ის წაშლა
```

### ტესტი
- ექსპორტი localhost-ზე → JSON-ში ყველა TEXT node-ს აქვს `platformFont`
- `platformFont.familyName` === "Space Grotesk Light" (არა "Space Grotesk Bold")
- `platformFont.postScriptName` შეიცავს variable font info-ს

---

## Gap 2: Font Assets = 0 (HIGH)

### პრობლემა
H2D ასეტებში 3 font ფაილი აქვს (woff2 binaries), ჩვენთან — 0.
- `Space Grotesk woff2` — Google Font
- `fa-brands-400.woff2` — Font Awesome icons (152KB)
- `fa-solid-900.woff2` — Font Awesome solid (203KB)

### Root Cause
`handleCapturePageH2D()`-ში font binary-ების ექსტრაქცია `fontResourceMap`-დან ხდება, მაგრამ `extractFonts()`-ის შემდეგ `font.src` property-ში URL `url(...)` wrapper-ითაა, regex ვერ პოულობს.

### გამოსწორება

**ფაილი: `packages/browser-extension/src/background/index.ts`** (handleCapturePageH2D)

```
Step 1: extractFonts()-ის შედეგიდან ყველა font URL ამოვიღოთ
Step 2: buildResourceMap()-დან მოვძებნოთ + getResourceBase64()-ით ამოვიღოთ
Step 3: assets dict-ში ჩავამატოთ: assets[fontUrl] = { base64Encoded: true, content, mimeType }
Step 4: ასევე Page.getResourceTree-ში font MIME types-ით ვიფილტროთ:
  - "font/woff2", "font/woff", "font/ttf", "font/otf"
  - "application/octet-stream" (woff2 ხშირად ამ MIME-ით მოდის)
  - "application/font-woff2"
```

**დამატებით:** font src URL-ის parsing გავაუმჯობესოთ — `url(...)` wrapper-ის strip-ი:
```typescript
const cleanUrl = fontSrc.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, '$1');
```

### ტესტი
- localhost ექსპორტში `assets` სექციაში 8 entry (5 image + 3 font)
- pricing ექსპორტში `assets` სექციაში 2 entry (1 SVG + 1 font)

---

## Gap 3: Pseudo-elements = 0 (MEDIUM-HIGH)

### პრობლემა
H2D-ს localhost-ზე 9, pricing-ზე 18 pseudo-element node აქვს. ჩვენთან — 0.

### H2D-ის მიდგომა
H2D **DOM-ში wrapper span-ებს ინჯექტავს** pseudo-element content-ისთვის:
1. ელემენტს `::before` content-ი აქვს → ახალი `<span class="__h2d-remove-before">` შვილი იქმნება
2. ამ span-ს pseudo-element-ის computed styles ენიჭება
3. Content text (unicode glyph, bullet, etc.) span-ში ჩაიწერება
4. ნორმალური DOM traversal ამ span-ს როგორც ჩვეულებრივ ელემენტს ექსტრაქტავს

### ჩვენი მიდგომა (ნაწილობრივ არსებობს)
`extractor.ts`-ში `extractPseudoElement()` ფუნქცია უკვე არსებობს, მაგრამ:
- `getBoundingClientRect()` ვერ მოქმედებს pseudo-elements-ზე (DOM API limitation)
- ზომები estimated-ია (არაზუსტი)
- ბევრი pseudo-element ფილტრავდება zero-size check-ით

### გამოსწორება

**ფაილი: `packages/browser-extension/src/content/extractor.ts`**

**ვარიანტი A: DOM Injection (h2d-ის ზუსტი მიდგომა)**
```
Step 1: traverseElement()-ის დასაწყისში, ::before/::after detection:
  const beforeStyle = getComputedStyle(el, '::before');
  if (beforeStyle.content !== 'none' && beforeStyle.content !== 'normal') {
    // Create wrapper span
    const span = document.createElement('span');
    span.className = '__w2w-pseudo-before';
    span.textContent = stripQuotes(beforeStyle.content);

    // Copy pseudo-element's computed styles to span
    copyPseudoStylesToSpan(beforeStyle, span);

    // Insert as first child
    el.insertBefore(span, el.firstChild);
  }

Step 2: ანალოგიური ::after-ისთვის (appendChild)

Step 3: extractPage() ბოლოს cleanup — ყველა __w2w-pseudo-* span-ის წაშლა

Step 4: traverseElement() ამ span-ებს ჩვეულებრივ FRAME/TEXT node-ებად ექსტრაქტავს
```

**ვარიანტი B: Synthetic Nodes (DOM modification-ის გარეშე)**
```
Step 1: extractPseudoElement()-ში getComputedStyle(el, '::before') styles-ის სრული ექსტრაქცია
Step 2: DOM injection temporary span-ით ზომის გასაზომად:
  const tempSpan = document.createElement('span');
  tempSpan.style.cssText = /* copy all styles */;
  tempSpan.textContent = content;
  el.insertBefore(tempSpan, el.firstChild);
  const rect = tempSpan.getBoundingClientRect(); // ახლა ზუსტი ზომა
  el.removeChild(tempSpan);
Step 3: ზუსტი ზომით FRAME/TEXT node შეიქმნას
```

**რეკომენდაცია: ვარიანტი A** (h2d-ის ზუსტი მიდგომა, უფრო მარტივი)

### ტესტი
- localhost: 9 pseudo-element node (Font Awesome icons)
- pricing: 18 pseudo-element node (list bullets)
- pseudo-element sizes ემთხვევა h2d-ს (±2px)

---

## Gap 4: Hover States = 0 (MEDIUM)

### პრობლემა
H2D pricing-ზე 16 hover state აქვს. ჩვენთან — 0. hover field = სრული subtree (არა style diff).

### H2D-ის მიდგომა
1. Interactive elements-ის იდენტიფიკაცია (a, button, [role="button"])
2. `CSS.forcePseudoState` CDP call — :hover state იძულებით
3. ელემენტის re-capture (content script-ით)
4. hover field-ში სრული H2DFrameNode subtree შენახვა
5. :hover state-ის გაუქმება

### გამოსწორება

**ფაილი: `packages/browser-extension/src/background/index.ts`** (handleCapturePageH2D)

```
Step 1: DOM extraction-ის შემდეგ, interactive ელემენტების პოვნა:
  - frame tree-ში tags: a, button + [role="button"]
  - ელემენტები რომლებსაც cursor: pointer style აქვთ

Step 2: თითოეულისთვის:
  a) DOM.querySelector — ელემენტის nodeId მოძებნა
  b) CSS.forcePseudoState(nodeId, ["hover"]) — :hover იძულება
  c) chrome.tabs.sendMessage(tabId, { type: "EXTRACT_SUBTREE", selector: ".specific-class" })
     — content script-ში ახალი message handler: ელემენტის subtree-ის re-extraction
  d) CSS.forcePseudoState(nodeId, []) — :hover გაუქმება
  e) frame.hover = extractedSubtree

Step 3: content script-ში ახალი EXTRACT_SUBTREE handler:
  - CSS selector-ით ელემენტის პოვნა
  - traverseElement() მხოლოდ ამ ელემენტის subtree-ზე
  - შედეგის დაბრუნება
```

### ტესტი
- pricing ექსპორტში 16 node-ს აქვს `hover` field
- hover.styles განსხვავდება default styles-ისგან (backgroundColor, color ცვლილებები)

---

## Gap 5: Font Entry Metadata (MEDIUM)

### პრობლემა
ჩვენი font entry-ები 5 field-ს შეიცავს, H2D — 11 field-ს. აკლია:
- `fontDisplay` (swap/block)
- `fontStretch` (normal/condensed)
- `fontVariant` (normal/small-caps)
- `fontVariationAxes` (variable font axes: Weight min/max/default)
- `unicodeRange` (character range)
- `source.tabId`

### Root Cause
`extractFonts()` ფუნქცია `cdp/fonts.ts`-ში @font-face rules-ს parse-ავს CSS stylesheet text-იდან, მაგრამ მხოლოდ ძირითად fields-ს იღებს.

### გამოსწორება

**ფაილი: `packages/browser-extension/src/background/cdp/fonts.ts`** (extractFonts)

```
Step 1: @font-face parsing-ში ახალი fields-ის ექსტრაქცია:
  - font-display → fontDisplay
  - font-stretch → fontStretch
  - font-variant → fontVariant
  - unicode-range → unicodeRange

Step 2: fontVariationAxes — CSS.getPlatformFontsForNode არ აბრუნებს ამას.
  ნაცვლად: @font-face-ში font-weight range parsing:
  font-weight: 300 700; → { tag: "wght", minValue: 300, maxValue: 700, defaultValue: 300 }

Step 3: handleCapturePageH2D()-ში font entry format-ის ადაპტაცია:
  - src: url() wrapper strip
  - platformFontFamily: platformFont-ის familyName-დან
```

### ტესტი
- fonts array entry-ს აქვს fontVariationAxes: [{tag: "wght", minValue: 300, maxValue: 700}]
- fontDisplay: "swap" (Google Fonts-ისთვის)

---

## Gap 6: Text Line Splitting (LOW-MEDIUM)

### პრობლემა
H2D ტექსტს **ვიზუალურ ხაზებად** ყოფს. "Hello World Long Text" → 2 TEXT node თუ 2 ხაზზეა. ჩვენ 1 TEXT node.

### H2D-ის მიდგომა
Content script-ში `Range` API + `getClientRects()`:
```javascript
const range = document.createRange();
range.selectNodeContents(textNode);
const rects = range.getClientRects(); // თითოეული ხაზი ცალკე rect
```

### გამოსწორება

**ფაილი: `packages/browser-extension/src/content/extractor.ts`** (extractTextNode)

```
Step 1: extractTextNode()-ში getClientRects() გამოყენება:
  range.selectNodeContents(textNode);
  const rects = range.getClientRects();

Step 2: თუ rects.length > 1 — ტექსტის per-line splitting:
  - Character-by-character range advancement
  - ყოველი ახალი rect.top → ახალი TEXT node

Step 3: result-ად TEXT[] array-ის დაბრუნება (არა single TEXT)
```

### ტესტი
- `<h1>` ტექსტი რომელიც 2 ხაზზეა → 2 TEXT node
- თითოეულ TEXT-ს სწორი x, y, width, height

---

## Gap 7: Always-on Style Keys (LOW)

### პრობლემა
H2D 6 style key-ს ყველა node-ზე წერს: `opacity`, `order`, `flexGrow`, `flexShrink`, `textDecoration`, `left/top/right/bottom`. ჩვენ მხოლოდ არადეფოლტურს ვწერთ.

### გამოსწორება

**ფაილი: `packages/browser-extension/src/content/styles.ts`**

```
Step 1: DEFAULT_VALUES-დან ამოვიღოთ ეს keys:
  delete DEFAULT_VALUES.opacity;      // always emit
  delete DEFAULT_VALUES.order;        // always emit
  delete DEFAULT_VALUES.flexGrow;     // always emit
  delete DEFAULT_VALUES.flexShrink;   // always emit
  delete DEFAULT_VALUES.textDecoration; // always emit
  delete DEFAULT_VALUES.left;         // always emit
  delete DEFAULT_VALUES.top;          // always emit
  delete DEFAULT_VALUES.right;        // always emit
  delete DEFAULT_VALUES.bottom;       // always emit

Step 2: borderTopStyle/borderRightStyle/borderBottomStyle/borderLeftStyle/borderStyle
  ასევე always emit (even "none")
```

### ტესტი
- ყველა FRAME node-ს აქვს `opacity: 1`, `order: 0`, `flexGrow: 0` etc.
- borderTopStyle: "none" ყველა borderless ელემენტზე

---

## Gap 8: doc.bgColor Resolution (LOW)

### პრობლემა
ჩვენი: `rgba(0, 0, 0, 0)`, H2D: `rgb(255, 255, 255)`. H2D transparent-ს white-ად resolve-ავს.

### გამოსწორება

**ფაილი: `packages/browser-extension/src/content/extractor.ts`** (extractDocMeta)

```
const bgColor = bodyStyle?.backgroundColor || 'rgb(255, 255, 255)';
// If transparent, fall back to white
if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
  return 'rgb(255, 255, 255)';
}
```

---

## Implementation Order (პრიორიტეტით)

| # | Gap | ფაილები | სავარაუდო დრო | Impact |
|---|---|---|---|---|
| **1** | platformFont enrichment fix | extractor.ts, background/index.ts | 1-2 საათი | CRITICAL |
| **2** | Font assets extraction | background/index.ts | 1 საათი | HIGH |
| **3** | Pseudo-elements (DOM injection) | extractor.ts | 2-3 საათი | HIGH |
| **4** | Always-on style keys | styles.ts | 15 წუთი | LOW (easy win) |
| **5** | doc.bgColor resolution | extractor.ts | 5 წუთი | LOW (easy win) |
| **6** | Hover states | background/index.ts, extractor.ts | 2-3 საათი | MEDIUM |
| **7** | Font entry metadata | cdp/fonts.ts, background/index.ts | 1 საათი | MEDIUM |
| **8** | Text line splitting | extractor.ts | 2-3 საათი | LOW-MEDIUM |

**სავარაუდო ჯამური დრო: 10-14 საათი**

---

## Validation Checklist

ყოველი ცვლილების შემდეგ:
1. `pnpm build` — 5/5 pass
2. `pnpm test` — shared 663, plugin 919, api 318+
3. Extension rebuild + Chrome reload
4. localhost:8000 და web2wireframe.design/pricing ექსპორტი
5. JSON შედარება H2D reference-თან:
   - Node counts: FRAME, TEXT match (±2)
   - platformFont: 100% TEXT nodes
   - Assets: images + fonts all present
   - Pseudo-elements: count matches
   - Style keys: always-on keys present
