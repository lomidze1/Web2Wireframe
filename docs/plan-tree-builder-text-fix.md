# Plan: Tree-Builder Text Node Refactoring

**ფაილი:** `packages/shared/src/tree-builder.ts` (2590 lines)
**ბრენჩი:** `dev`-დან ახალ feature branch-ზე
**პრიორიტეტი:** High — ტექსტის გაქრობის ბაგი production-ში

---

## Context

### რატომ არის ეს ცვლილება საჭირო

ამჟამინდელი tree-builder ფილტრავს text node-ებს (nodeType === 3) line 1377-ზე (`if (node.nodeType !== 1) return null`) და მათ შიგთავსს აგრეგირებს მშობელ ელემენტებში **სინთეტიკური text child** ლოგიკით (~200 ხაზი კოდი). ეს იწვევს ბაგებს, სადაც:

- **`<li>` ელემენტებში ტექსტი ქრება** — როცა `<li>`-ს icon font child აქვს (მაგ., Font Awesome `<i>` tag), `hasChildrenWithText` ამოწმებს children-ს, პოულობს icon glyph-იან child-ს, და **არ ამატებს** სინთეტიკურ text child-ს, რადგან "children already have text". მაგრამ icon glyph არის ერთი სიმბოლო, არა ნამდვილი ტექსტი.
- **Duplicate text** — `collectAllInlineText` რეკურსიულად აგროვებს ტექსტს ყველა inline child-დან, მერე `isListItemWithText` / `isLinkWithText` ამოწმებს ხომ არ არის უკვე ეს ტექსტი children-ში — ეს ლოგიკა მყიფეა და edge case-ები ბევრია.
- **კომპლექსურობა** — 4 სხვადასხვა სინთეტიკური child creation path, 3 duplicate-detection მექანიზმი, 2 text aggregation ფუნქცია.

### მიმდინარე მიდგომა vs შემოთავაზებული

| | მიმდინარე | შემოთავაზებული |
|---|---|---|
| Text nodes | ფილტრდება (`nodeType !== 1`) | პირდაპირ children-ად რჩება |
| Text content | აგრეგაცია parent-ში | ტექსტი text node-ზეა |
| `<li>` text | სინთეტიკური child + bullet prefix | DOM text node + ::marker child |
| `<a>` text | სინთეტიკური child | DOM text node |
| `<button>` text | სინთეტიკური frame+text | DOM text node |
| კოდის რაოდენობა | ~200 ხაზი სინთეტიკური pipeline | ~30 ხაზი text node handling |

### h2d-ის მიდგომა (reference)

html.to.design იყენებს 3 node type-ს: FRAME, TEXT, SVG. TEXT leaf node-ები იქმნება პირდაპირ DOM text node-ებიდან, მშობლის სტილებით. არავითარი სინთეტიკური child-ები — DOM-ის სტრუქტურა პირდაპირ გადაიტანება.

---

## Current Architecture

### ტექსტის მიმდინარე flow tree-builder-ში

```
DOMSnapshot → ParsedSnapshotNode[] → buildNode() → ExtractedElement
                                         |
                                         ├── line 1377: nodeType !== 1 → return null (text nodes filtered!)
                                         ├── line 1740-1761: aggregatedText = collectDirectText / collectAllInlineText
                                         ├── line 1810-1836: styledSegments = collectStyledText (inline children)
                                         ├── line 1907-1911: needsSyntheticTextChild decision
                                         └── lines 2263-2454: 3x createSyntheticTextChild blocks
```

### სინთეტიკური text pipeline (ფუნქციები)

| ფუნქცია | ხაზები | დანიშნულება |
|---|---|---|
| `collectDirectText()` | 383-417 | მხოლოდ პირდაპირი text node children-ის ტექსტი |
| `collectAllInlineText()` | 422-470 | რეკურსიული — ყველა inline child-ის ტექსტი |
| `collectStyledText()` | 781-930 | რეკურსიული — styled segments (bold, link, etc.) |
| `createSyntheticTextChild()` | 1177-1243 | ExtractedElement-ის შექმნა type:"text"-ით |

### Duplicate detection ლოგიკა

| ცვლადი / შემოწმება | ხაზი | დანიშნულება |
|---|---|---|
| `isListItemWithText` | 1907 | `tag === "li" && !!finalText` |
| `isLinkWithText` | 1908 | `tag === "a" && !!finalText` |
| `shouldBeFrameWithTextChild` | 1853 | `wouldBeText && requiresWrapper` |
| `needsSyntheticTextChild` | 1909-1910 | OR ზემოთა სამისა |
| `frameTextContent` | 1911 | needsSynth ? "" : finalText |
| `hasTextChild` (li block) | 2265-2267 | children-ში ზუსტად იგივე ტექსტი |
| `hasChildrenWithText` (li block) | 2271-2274 | **ეს არის ბაგის წყარო** — icon glyph-ს text-ად ითვლის |
| `hasTextInDescendants` (a block) | 2406-2416 | რეკურსიული duplicate check |

### კოდის ბლოკები წასაშლელი (~200 ხაზი)

- **li synthetic child:** ხაზები 2263-2359 (~97 ხაზი)
- **frame+text synthetic child:** ხაზები 2361-2398 (~37 ხაზი)
- **a synthetic child:** ხაზები 2400-2454 (~54 ხაზი)
- **needsSyntheticTextChild ლოგიკა:** ხაზები 1907-1911 (~5 ხაზი)
- **text aggregation (partial):** ხაზები 1756-1761 (~6 ხაზი)

---

## Proposed Changes

### Step 1: Text node-ების გატარება buildNode-ში

**ფაილი:** `tree-builder.ts`, line 1377

**მიმდინარე:**
```typescript
// Skip non-element nodes
if (node.nodeType !== 1) return null;
```

**შემოთავაზებული:**
```typescript
// Handle text nodes (nodeType === 3) as leaf TEXT elements
if (node.nodeType === 3) {
  const textContent = (node.textContent || "").replace(/[\r\n\t]+/g, " ").trim();
  if (!textContent) return null; // Skip whitespace-only

  // Inherit typography from parent
  const parentStyles = parentElement?.computedStyles || {};
  // Use parent's textBoxes for bounds (text nodes don't have individual bounds in DOMSnapshot)
  const parentBounds = parentElement?.bounds || node.bounds;

  return createSyntheticTextChild(
    parentBounds.width,    // or textBounds width
    parentBounds.height,   // or textBounds height
    parentStyles.color || null,
    parentStyles.fontFamily || "Inter",
    parseFloat(parentStyles.fontSize) || 14,
    parseFloat(parentStyles.fontWeight) || 400,
    parentStyles.lineHeight || "normal",
    parseFloat(parentStyles.letterSpacing) || 0,
    parentStyles.textAlign || "left",
    textContent,
    0, 0,                  // offsets — relative to parent
    undefined,             // browserLineCount
    parentStyles,
    undefined              // selector
  );
}

// Skip other non-element nodes (comments, etc.)
if (node.nodeType !== 1) return null;
```

**საკვანძო სირთულე:** `buildNode` ამჟამად მხოლოდ parent node-ს იღებს context-ად. Text node-ისთვის parent-ის computedStyles ხელმისაწვდომი უნდა იყოს. ორი ვარიანტი:
1. **buildNode-ს გადავცემთ parentComputedStyles** — ინტერფეისის ცვლილება, მაგრამ სუფთა
2. **nodes array-დან parent-ს ვპოულობთ** — childrenMap-ის reverse lookup, ნელი

**რეკომენდაცია:** ვარიანტი 1 — parentComputedStyles პარამეტრი.

### Step 2: სინთეტიკური text child pipeline-ის წაშლა

წასაშლელი ბლოკები (თანმიმდევრობით):

#### 2a. `isListItemWithText` ბლოკი (ხაზები 2263-2359)
```
// Add synthetic text child for list items
if (isListItemWithText && finalText) { ... }
```
მთლიანად წაშლა. `<li>`-ის ტექსტი DOM text node-იდან მოვა.

#### 2b. `shouldBeFrameWithTextChild` ბლოკი (ხაზები 2361-2398)
```
// Add synthetic text child for wrapped text elements (buttons, etc.)
if (shouldBeFrameWithTextChild && finalText && !isListItemWithText) { ... }
```
მთლიანად წაშლა. Button/wrapped text-ის ტექსტი DOM text node-იდან მოვა.

#### 2c. `isLinkWithText` ბლოკი (ხაზები 2400-2454)
```
// Add synthetic text child for links
if (isLinkWithText && finalText) { ... }
```
მთლიანად წაშლა. Link ტექსტი DOM text node-იდან მოვა.

#### 2d. `needsSyntheticTextChild` ლოგიკა (ხაზები 1907-1911)
```typescript
const isListItemWithText = tag === "li" && !!finalText;
const isLinkWithText = tag === "a" && !!finalText;
const needsSyntheticTextChild = isListItemWithText || shouldBeFrameWithTextChild || isLinkWithText;
const frameTextContent = needsSyntheticTextChild ? "" : finalText;
```
წაშლა. `frameTextContent` → `finalText` პირდაპირ.

#### 2e. `createSyntheticTextChild` ფუნქცია — **შევინარჩუნოთ**
ფუნქცია საჭიროა:
- Step 1-ში text node-ების ExtractedElement-ად გადაქცევისთვის
- Pseudo-element text child-ებისთვის (::before, ::after content — ხაზი 2081)

### Step 3: Text aggregation-ის გამარტივება

#### 3a. `collectDirectText` — წაშლა ან დეპრეკაცია
აღარ იქნება საჭირო — ტექსტი text node-ებიდან პირდაპირ მოვა.

**გამონაკლისი:** ხაზი 2504 (`iframeTextContent`) — iframe text extraction-ისთვის ჯერ შევინარჩუნოთ.

#### 3b. `collectAllInlineText` — წაშლა ან დეპრეკაცია
აღარ იქნება საჭირო `<li>` და `<a>` text aggregation-ისთვის.

**გამონაკლისი:** iframe text extraction (ხაზი 2504) — შეიძლება საჭირო იყოს.

#### 3c. `collectStyledText` — **შევინარჩუნოთ**
სტილიზებული სეგმენტები (inline bold, italic, link ტექსტი) ჯერ კიდევ საჭიროა. მაგრამ:
- ამჟამად parent ელემენტზე მუშაობს
- რეფაქტორინგის შემდეგ text node-ები children-ში იქნება
- შეიძლება დაგვჭირდეს ადაპტაცია — styled segments text node-ებზე მიწერა

#### 3d. Text aggregation block (ხაზები 1740-1836)
გამარტივდება. `aggregatedText` აღარ იქნება საჭირო სინთეტიკური child-ებისთვის.
- **`shouldBeText` path:** parent ელემენტი type:"text" ხდება — ეს დარჩება, მაგრამ `finalText` ახლა text node children-დან მოვა
- **Pseudo-element stripping (1787-1806):** ეს ლოგიკა რჩება, მაგრამ მხოლოდ parent-ის textContent-ისთვის

### Step 4: Edge Case-ების დამუშავება

#### 4a. Bullet characters `<li>`-ისთვის
**მიმდინარე:** სინთეტიკური child-ში bullet prefix ემატება (`getBulletCharacter`).
**ახალი:** ::marker pseudo-element უკვე იქნება child-ად (DOMSnapshot-ში ::marker separate node-ად მოდის). თუ ::marker არ არის:
- `list-style-type` computedStyle-დან bullet character-ის გენერაცია
- Styled segment-ად დამატება text node-ზე (არა separate child)

#### 4b. `<a>` link text
**მიმდინარე:** სინთეტიკური child + duplicate detection.
**ახალი:** DOM text node პირდაპირ child-ად. Duplicate detection აღარ იქნება საჭირო.

#### 4c. Wrapped text (buttons with padding)
**მიმდინარე:** `shouldBeFrameWithTextChild` — frame wrapper + synthetic text child.
**ახალი:** Button რჩება frame-ად, DOM text node იქნება child-ად. Padding frame-ზეა, text node-ს layout position frame-ის შიგნით ექნება.

#### 4d. Empty/whitespace text nodes
Step 1-ში ფილტრი: `textContent.trim()` → skip empty.

#### 4e. Pseudo-element text (::before, ::after)
**არ იცვლება.** Pseudo-elements უკვე ცალკე node-ებად მუშავდება (ხაზი 2045-2115). ეს pipeline დამოუკიდებელია სინთეტიკური text child-ისგან.

#### 4f. Icon font glyphs
**მიმდინარე ბაგი:** `hasChildrenWithText` icon glyph-ს ნამდვილ ტექსტად ითვლის.
**ახალი:** ეს შემოწმება წაიშლება Step 2a-ში. Icon font child-ები ცალკე node-ებად დარჩება, ტექსტი ცალკე text node-ად.

#### 4g. `<br>` ელემენტები
Text node-ებს შორის `<br>` არის nodeType === 1. ამჟამად `collectDirectText`-ში `\n`-ად გარდაიქმნება. ახალ მიდგომაში `<br>` ცალკე child-ად დარჩება — Figma-ში line break-ად უნდა გარდაიქმნას. **საჭიროებს დამატებით ლოგიკას** — ან `<br>` → empty text node with "\n", ან rendering layer-ში handling.

---

## Files to Modify

| ფაილი | ცვლილება | სირთულე |
|---|---|---|
| `packages/shared/src/tree-builder.ts` | მთავარი ცვლილებები (Steps 1-4) | **მაღალი** |
| `packages/shared/src/__tests__/` | ტესტების განახლება + ახალი ტესტები | **მაღალი** |
| `packages/shared/src/index.ts` | Export-ების ცვლილება (თუ `collectDirectText` / `collectAllInlineText` export-ირდება) | დაბალი |

### არ იცვლება
- `packages/figma-plugin/src/rendering/nodes.ts` — text type-ის handling უკვე არსებობს
- `packages/api/` — tree-builder-ს shared-დან იმპორტირებს
- `packages/browser-extension/` — CDP extraction არ იცვლება

---

## Testing Strategy

### არსებული ტესტები
- **639 shared tests** — ბევრი დაკავშირებულია text handling-თან
- ტესტების უმეტესობა snapshot-based ან specific text output-ის შემოწმება
- **მოსალოდნელია 50-100+ ტესტის ჩავარდნა** — ეს ნორმალურია, რადგან output სტრუქტურა იცვლება

### ახალი ტესტები (TDD — იმპლემენტაციამდე)

```typescript
// 1. ძირითადი text node extraction
it("should create text element from DOM text node", () => {
  // <p>Hello world</p> → p(frame) > "Hello world"(text)
});

// 2. li + icon font (მთავარი ბაგი)
it("should preserve text in li with icon font child", () => {
  // <li><i class="fa">&#xf00c;</i> Item text</li>
  // → li(frame) > [icon(text), "Item text"(text)]
});

// 3. Mixed content
it("should handle mixed text and element children", () => {
  // <p>Hello <strong>bold</strong> world</p>
  // → p(frame) > ["Hello "(text), strong(text:"bold"), " world"(text)]
});

// 4. Whitespace filtering
it("should skip whitespace-only text nodes", () => {
  // <div>\n  <span>text</span>\n</div>
  // → div(frame) > [span(text:"text")] (no whitespace nodes)
});

// 5. Pseudo-elements (არ უნდა დაირღვეს)
it("should still extract ::before/::after content", () => {
  // <div> with ::before { content: ">" } and text
});

// 6. Styled inline text
it("should handle styled segments in text nodes", () => {
  // <p>Normal <em>italic</em> text</p>
});

// 7. Links
it("should handle text in anchor elements", () => {
  // <a href="#">Click here</a> → a(frame) > "Click here"(text)
});

// 8. Buttons with padding
it("should handle button text as child node", () => {
  // <button>Submit</button> → button(frame) > "Submit"(text)
});

// 9. Nested lists
it("should handle nested list items", () => {
  // <ul><li>Item<ul><li>Sub-item</li></ul></li></ul>
});

// 10. br elements
it("should handle br elements between text nodes", () => {
  // <p>Line 1<br>Line 2</p>
});
```

### Real-world ტესტირება
- Apple.com import — header/nav text
- Demo page with `<li>` + Font Awesome icons
- Wikipedia article — mixed inline styling
- Button-heavy UI (SaaS landing page)

---

## Risks

### 1. Bounds accuracy (მაღალი რისკი)
DOMSnapshot-ში ინდივიდუალურ text node-ებს **არ აქვთ** ცალკე bounds. `textBoxes` მშობელ ელემენტზეა. ეს ნიშნავს რომ text node-ის x/y/width/height მშობლიდან უნდა გამოვთვალოთ.

**Mitigation:** textBoxes-ს parent-ზე ვიყენებთ; text node-ს relative position (0,0) ექნება parent-ის მიმართ.

### 2. Styled segments (საშუალო რისკი)
`collectStyledText` ამჟამად parent-დან რეკურსიულად მუშაობს. Text node children-ის შემთხვევაში:
- `<p>Hello <strong>bold</strong> world</p>` → 3 child: text("Hello "), strong, text(" world")
- Styled segments ახლა strong-ის children-ზე შედგება, არა p-ზე

**Mitigation:** collectStyledText ან ადაპტირდება, ან text node-ებზე individual styles მიეწერება.

### 3. 639 ტესტი (მაღალი რისკი)
ტესტების უმეტესობა ელოდება სინთეტიკურ text children-ს. Output სტრუქტურა მნიშვნელოვნად იცვლება.

**Mitigation:** batch test update — ჯერ ყველა ჩავარდნილი ტესტი დავაჯგუფოთ (text output, structure, duplicate detection), მერე სისტემატურად განვაახლოთ.

### 4. tree-builder.ts = ყველაზე კრიტიკული ფაილი
ეს ფაილი არის entire extraction pipeline-ის core. ნებისმიერმა regression-მა შეიძლება გატეხოს ყველა import.

**Mitigation:**
- Feature branch
- ეტაპობრივი ცვლილებები (Step 1 → test → Step 2 → test → ...)
- Real-world A/B testing dev branch-ის output-თან შედარებით

### 5. iframe text extraction
`collectDirectText` და `collectAllInlineText` გამოიყენება iframe-ის text extraction-შიც (ხაზი 2504). iframe pipeline ცალკე buildNode-ს იძახებს (ხაზი 2474).

**Mitigation:** iframe text extraction-ისთვის ფუნქციები დროებით შევინარჩუნოთ.

---

## Execution Order

```
1. [TDD] ახალი ტესტების დაწერა (Step 1-ის შესაბამისი)
2. Step 1: text node handling buildNode-ში
3. ტესტების გაშვება — ახალი ტესტები pass, არსებული შეიძლება fail
4. Step 2: სინთეტიკური pipeline-ის წაშლა
5. Step 3: text aggregation გამარტივება
6. არსებული ტესტების განახლება (batch update)
7. Step 4: edge cases
8. Final: pnpm build && pnpm test — ყველა pass
9. Real-world ტესტირება
```

---

## Verification

```bash
# Build + test (ყველა package)
pnpm build && pnpm test

# მხოლოდ shared package
cd packages/shared && pnpm test

# Type check
pnpm type-check
```

### Manual verification
- Figma plugin-ით import: apple.com, wikipedia.org
- `<li>` + icon font demo page
- Button-heavy landing page
- Output შედარება dev branch-ის output-თან (JSON diff)

---

## Estimated Impact

| მეტრიკა | მიმდინარე | ცვლილების შემდეგ |
|---|---|---|
| სინთეტიკური text pipeline | ~200 ხაზი | ~0 ხაზი (წაშლილი) |
| Text node handling in buildNode | 0 ხაზი | ~30 ხაზი |
| Duplicate detection logic | 3 მექანიზმი | 0 |
| Edge case bugs (li+icon, etc.) | აქტიური | გამოსწორებული |
| ტესტების განახლება | — | ~50-100 ტესტი |
| წმინდა კოდის შემცირება | — | ~170 ხაზით ნაკლები |
