# New Way Continuation Plan v2 — Final Gaps

> **სტატუსი:** 93.6% node match (131/140), TEXT 100% match (52/52), styles 97%+ match
> **ბრენჩი:** `new-way`
> **ფაილების შედარება:**
> - ჩვენი: `studyH2D/new-exporting-way/new-way-localhost.json`
> - H2D: `studyH2D/decoded/H2D-localhost.json`

---

## რა მოგვარდა ✅

| მეტრიკა | სტატუსი |
|---|---|
| TEXT node count | 52/52 — იდენტური |
| platformFont on TEXT | 100% — ყველა TEXT-ზე |
| doc metadata | 6/6 field ემთხვევა |
| Image assets | 5/5 byte-identical |
| Always-on style keys | opacity, order, flexGrow, flexShrink, textDecoration, left/top/right/bottom, display, backgroundColor, borderStyles — ყველა |
| Text line splitting | per-visual-line — მუშაობს |
| Hover states | 3 captured (h2d-ს 0 აქვს ამ გვერდზე) |
| Top-level structure | 8/8 keys match + ჩვენ extra cssVariables |

---

## დარჩენილი 7 Gap

### Gap A: Pseudo-elements არ მუშაობს (9 missing nodes)

**პრობლემა:** `injectPseudoSpan()` კოდი არსებობს `extractor.ts`-ში, მაგრამ output-ში 0 pseudo-element node. სავარაუდო მიზეზები:

1. **content attribute parsing** — CSS `content: "\f0c9"` (unicode escape) შეიძლება `'none'` ან `'normal'` check-ით ფილტრავდეს
2. **Zero-size detection** — injected span-ის `getBoundingClientRect()` შეიძლება 0x0 აბრუნებდეს თუ font ჯერ არ ჩაიტვირთა
3. **Cleanup timing** — span-ს `remove()` ეძახის traversal-ის დროს, მაგრამ child nodes iteration-მა შეიძლება already removed element-ზე გადაიაროს

**დებაგის გეგმა:**
```
Step 1: console.log-ებით დებაგი — extractPage()-ში, injectPseudoSpan()-ში:
  - რამდენ ელემენტზე ეძახის?
  - content რა მნიშვნელობაა? ("none"? "normal"? "\f0c9"?)
  - span injection ხდება?
  - span-ის rect რა ზომაა?

Step 2: localhost:8000-ის DevTools Console-ში ხელით შემოწმება:
  getComputedStyle(document.querySelector('i.fas'), '::before').content
  // უნდა დააბრუნოს: '"\\f0c9"' ან '"hamburger"' ტიპის string

Step 3: Fix based on findings
```

**ფაილი:** `packages/browser-extension/src/content/extractor.ts` — `injectPseudoSpan()` ფუნქცია

**სავარაუდო fix:** content value check-ში `'""'` და `"''"` (empty quotes) check-ის გარდა, ნებისმიერი non-empty string-ისთვის span injection.

---

### Gap B: Font Assets — 3 font binary აკლია (5 vs 8)

**აკლია:**
- `fonts.gstatic.com/.../spacegrotesk/.woff2` (29KB)
- `cdnjs.cloudflare.com/.../fa-brands-400.woff2` (157KB)
- `cdnjs.cloudflare.com/.../fa-solid-900.woff2` (209KB)

**პრობლემა:** `buildResourceMap()` ამ URL-ებს ვერ პოულობს `Page.getResourceTree`-ში, ან MIME type matching არ მუშაობს. `application/octet-stream` MIME type-ით ფონტები მოდის CDN-ებიდან.

**დებაგის გეგმა:**
```
Step 1: handleCapturePageH2D()-ში, font extraction loop-ის წინ:
  console.log('[W2W-H2D] Resource map entries:', resourceMap.size);
  for (const [url, resource] of resourceMap) {
    if (url.includes('woff') || url.includes('font')) {
      console.log('  Font resource:', url, resource.mimeType);
    }
  }

Step 2: შევამოწმოთ buildResourceMap() ბრუნებს თუ არა ამ URL-ებს
  - თუ არა: Page.getResourceTree response-ში საერთოდ არ არის
  - თუ კია მაგრამ MIME არ ემთხვევა: fontMimeTypes set-ში დაამატე

Step 3: თუ resourceMap-ში არ არის — alternative: font URL-ები extractFonts()-ის src-დან
  ამოვიღოთ და პირდაპირ Page.getResourceContent-ით ვცადოთ
```

**ფაილი:** `packages/browser-extension/src/background/index.ts` — font extraction block

---

### Gap C: Font Metadata — 4 field output-ში არ ჩანს

**აკლია output-ში:** `fontStretch`, `fontVariant`, `fontVariationAxes`, `source`

**პრობლემა:** `fontCssParser.ts`-ში parsing დაემატა, მაგრამ `handleCapturePageH2D()`-ში h2dFonts mapping-ში ეს fields-ები არ გადის output-ში.

**დებაგი:**
```
Step 1: console.log extractedFonts[0] — ახალი fields-ით არის?
Step 2: h2dFonts mapping-ში ყველა field გადავიტანოთ:
  fontStretch: f.fontStretch,
  fontVariant: f.fontVariant,
  fontVariationAxes: f.fontVariationAxes,
  source: { tabId: tabId },
```

**ფაილი:** `packages/browser-extension/src/background/index.ts` — h2dFonts mapping

**სავარაუდო fix:** mapping-ში ახალი fields-ების დამატება (1 წუთის საქმეა)

---

### Gap D: Over-emission — `gridArea`, `boxSizing`, `transformOrigin`

**პრობლემა:** ჩვენ ეს 3 property 100% node-ზე ვწერთ, h2d მხოლოდ ~10%-ზე.

**Fix:**
```typescript
// styles.ts — DEFAULT_VALUES-ში დაამატე:
gridArea: 'auto / auto / auto / auto',
boxSizing: 'content-box',  // ან 'border-box' — depends on browser default
```

`transformOrigin` — browser `"720px 1351.85px"` pixel values-ს აბრუნებს, არა `"50% 50%"`.
**Fix:** extractStyles()-ში transformOrigin-ისთვის special check:
```typescript
if (prop === 'transformOrigin') {
  // Skip if it's just the center point (default)
  // Default is 50% 50% which resolves to width/2 height/2
  const parts = value.split(' ').map(v => parseFloat(v));
  if (Math.abs(parts[0] - width/2) < 1 && Math.abs(parts[1] - height/2) < 1) continue;
}
```

**ფაილი:** `packages/browser-extension/src/content/styles.ts`, `extractor.ts`

---

### Gap E: Under-emission — `minWidth`, `minHeight` (30% vs 73%)

**პრობლემა:** h2d `"0px"` values-ს ყველა node-ზე წერს, ჩვენ DEFAULT_VALUES ფილტრავს.

**Fix:**
```typescript
// styles.ts — DEFAULT_VALUES-დან წაშალე:
// minWidth: '0px',   ← ამოშალე
// minHeight: '0px',  ← ამოშალე
```

**ფაილი:** `packages/browser-extension/src/content/styles.ts`

---

### Gap F: Computed vs Original CSS Values

**ეს ყველაზე რთული gap-ია.** `getComputedStyle()` resolved pixel values-ს აბრუნებს:
- `width: "1100px"` ნაცვლად `"min(1100px, 90%)"`
- `marginRight: "170px"` ნაცვლად `"auto"`
- `gridTemplateColumns: "620.664px 443.328px"` ნაცვლად `"1.4fr 1fr"`

**h2d-ის მიდგომა:** `computedStyleMap()` API — CSSStyleValue objects-ს აბრუნებს:
```javascript
el.computedStyleMap().get('width')
// → CSSKeywordValue { value: 'auto' } ან
// → CSSUnitValue { value: 1100, unit: 'px' }

el.computedStyleMap().get('margin-right')
// → CSSKeywordValue { value: 'auto' }
```

**ჩვენ `computedStyleMap()`-ს მხოლოდ `AUTO_DETECT_PROPERTIES` set-ისთვის ვიყენებთ** (width, height, left, top, right, bottom). `margin*` და `gridTemplateColumns` არ არის ამ set-ში.

**Fix:**
```typescript
// styles.ts — AUTO_DETECT_PROPERTIES-ში დაამატე:
'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
'gridTemplateColumns', 'gridTemplateRows',
```

**გარდა ამისა:** `min()`, `max()`, `clamp()`, `fr` units — `computedStyleMap()` ვერ აბრუნებს ამას. ეს CSS ფუნქციები computed level-ზე resolve-დება. ერთადერთი გზა: **CSS matched rules** (CSS.getMatchedStylesForNode) — მაგრამ ჩვენ ეს CDP call ამოვიღეთ h2d pipeline-იდან.

**შუალედური fix:** `computedStyleMap()` `auto` detection margin-ებისთვის + grid-ისთვის. `min()`/`fr` values-ის ამოღება შეუძლებელია content script-იდან — ეს h2d-ის ლიმიტაციაცაა (h2d-ც resolved values-ს ინახავს grid-ისთვის, მხოლოდ auto/keyword values-ს იჭერს).

**ფაილი:** `packages/browser-extension/src/content/styles.ts`, `extractor.ts`

---

### Gap G: Whitespace Normalization (3 TEXT node)

**პრობლემა:** ჩვენი: `"same\n            polished structure."`, h2d: `"same polished structure."`

**Fix:**
```typescript
// extractor.ts — extractTextNodes()-ში, value-ის normalize:
value: text.replace(/\s+/g, ' ').trim(),
```

**ფაილი:** `packages/browser-extension/src/content/extractor.ts`

---

## Implementation Order

| # | Gap | სირთულე | დრო | Impact |
|---|---|---|---|---|
| **1** | G: Whitespace normalization | Easy | 2 წუთი | Low but easy win |
| **2** | E: minWidth/minHeight under-emission | Easy | 2 წუთი | Low but easy win |
| **3** | D: gridArea/boxSizing over-emission | Easy | 5 წუთი | Reduces noise |
| **4** | C: Font metadata fields | Easy | 5 წუთი | Completeness |
| **5** | A: Pseudo-elements debug + fix | Medium | 30-60 წუთი | **9 missing nodes** |
| **6** | B: Font assets debug + fix | Medium | 30 წუთი | **3 missing assets** |
| **7** | F: Computed vs original CSS | Hard | 1-2 საათი | Responsive fidelity |

**სავარაუდო ჯამი: 2.5-4 საათი**

---

## Validation

ყოველი ცვლილების შემდეგ:
1. Extension build: `cd packages/browser-extension && pnpm run build`
2. Chrome reload extension
3. localhost:8000 + pricing page ექსპორტი "New Capture"-ით
4. JSON შედარება:
   - Node count: 140/140 (target)
   - TEXT: 52/52 with platformFont
   - Assets: 8/8 (5 images + 3 fonts)
   - Pseudo-elements: 9/9
   - Style mismatches: <100 (from 555)
