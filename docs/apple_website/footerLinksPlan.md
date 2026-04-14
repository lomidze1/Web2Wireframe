# Fix: `float` და `display: inline-block` Layout Detection

## Context

Apple.com-ის footer legal section (`ac-gf-footer-legal-links`) არასწორად რენდერდება Figma-ში:
- Copyright ტექსტი და legal ლინკები ვერტიკალურად ეწყობა, ნაცვლად ჰორიზონტალურისა (float: inline-start)
- Legal link items (Privacy Policy, Terms of Use, etc.) ვერტიკალურად ჩამოწყობილი, ნაცვლად ერთ ხაზზე (display: inline-block)

**Root cause:** ჩვენი CSS converter-ი `float` property-ს საერთოდ არ ამუშავებს, ხოლო `display: inline-block` children-ები parent-ს HORIZONTAL-ად არ აქცევს.

---

## Original vs Figma სტრუქტურა

### Original (live):
```
div.ac-gf-footer-legal (display:block, width:746px)
  ├── copyright (float:inline-start, width:267px) ─┐ ერთ ხაზზე
  └── ul.legal-links (float:inline-start, width:419px) ─┘
      ├── li (inline-block) "Privacy Policy"
      ├── li (inline-block) "Terms of Use"     ──── ერთ ხაზზე
      ├── li (inline-block) "Sales and Refunds"
      ├── li (inline-block) "Legal"
      └── li (inline-block) "Site Map"
```

### Figma (ცვლილებამდე):
```
div.ac-gf-footer-legal (VERTICAL, 140x26) ❌
  ├── copyright (VERTICAL, 140x21)  ──── ვერტიკალურად
  └── ul.legal-links (VERTICAL, 110x21) ❌
      ├── li (84x21) "Privacy Policy"
      ├── li (80x21) "Terms of Use"  ──── ვერტიკალურად
      └── ...
```

---

## 3 Root Cause

| # | პრობლემა | ადგილი | შედეგი |
|---|----------|--------|--------|
| 1 | `float` არ ექსტრაქტდება | styles.ts, w2w-types.ts | float ინფორმაცია არ მოდის |
| 2 | `float` children არ აქცევს parent-ს HORIZONTAL-ად | css-converter.ts `getLayoutMode()` | parent NONE → VERTICAL |
| 3 | `inline-block` children არ აქცევს parent-ს HORIZONTAL-ად | css-converter.ts `getLayoutMode()` | parent NONE → VERTICAL |

---

## Implementation (დასრულებულია ✅)

### Step 1: ტესტები (TDD) ✅

**ფაილი:** `packages/figma-plugin/src/__tests__/css-converter-float-layout.test.ts`

6 ტესტი:
1. Float children → parent HORIZONTAL
2. Float children → FIXED sizing
3. `float: inline-start` = `left`
4. Inline-block children → parent HORIZONTAL
5. Regression: block children → VERTICAL (უცვლელი)
6. `display: inline` non-text children → parent HORIZONTAL

### Step 2: `cssFloat` ექსტრაქცია ✅

4 ფაილში:
- `packages/browser-extension/src/content/styles.ts` — CSS_PROPERTIES + DEFAULT_VALUES
- `packages/shared/src/w2w-types.ts` — W2WStyles + W2W_CSS_PROPERTIES
- `packages/shared/src/tree-builder.ts` — CSS_DEFAULT_VALUES

### Step 3: `inferLayoutFromChildren()` ✅

`packages/figma-plugin/src/rendering/css-converter.ts`:
- ახალი ფუნქცია: `inferLayoutFromChildren()` — ამოწმებს children-ების `cssFloat` და `display: inline-block/inline`
- `convertFrame()`-ში: `getLayoutMode() === NONE` && !absolute → `inferLayoutFromChildren()` fallback
- **INLINE_TEXT_TAGS exclusion:** span, a, strong-ით text-only children-ები გამოირიცხება (text coalescing-ის შენარჩუნება)

### Step 4: Float sizing fix ✅

`getSizing()`: float children → `horizontal: 'FIXED'` (ნაცვლად FILL)

---

## ტესტის შედეგები

- shared: 699/699 ✅
- plugin-frontend: 1075/1075 ✅ (6 ახალი + 1069 არსებული)
- api: 323/324 (1 pre-existing failure, ჩვენთან კავშირი არ აქვს)

## ცვლილების ფაილები

| ფაილი | ცვლილება |
|-------|---------|
| `packages/figma-plugin/src/__tests__/css-converter-float-layout.test.ts` | **NEW** — 6 ტესტი |
| `packages/figma-plugin/src/rendering/css-converter.ts` | `inferLayoutFromChildren()` + `convertFrame()` + `getSizing()` |
| `packages/browser-extension/src/content/styles.ts` | `cssFloat` CSS_PROPERTIES + DEFAULT_VALUES |
| `packages/shared/src/w2w-types.ts` | `cssFloat` W2WStyles + W2W_CSS_PROPERTIES |
| `packages/shared/src/tree-builder.ts` | `"float": ["none"]` CSS_DEFAULT_VALUES |
