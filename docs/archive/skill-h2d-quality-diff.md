> # ⛔ არქივი — გაუქმებული skill (ყოფილი `.claude/skills/h2d-quality-diff/SKILL.md`)
>
> **რატომ მოიხსნა:** მისი სამივე შემავალი გზა — `docs/studyH2D/decoded/`,
> `docs/studyH2W/`, `h2d-codec.js` — აღარსად არსებობს, ამიტომ skill-ი
> ყოველ გაშვებაზე ვარდებოდა.
>
> **რა ჩაანაცვლა:** `_research/figma-extension/` (Figma-ს მიერ შეძენილი
> h2d-ის **ნამდვილი** ძრავა) + [`../plans/FIGMA-CAPTURE-ADOPTION.md`](../plans/FIGMA-CAPTURE-ADOPTION.md).
> ეს baseline მკაცრად უკეთესია: 112 vs 163 CSS თვისების გაზომილი სხვაობა,
> ქვემოთ აღწერილი 89-თვისებიანი reverse-engineered სიის ნაცვლად.
>
> ქვემოთ checklist-ს ჯერ კიდევ აქვს ღირებულება როგორც **კითხვების სიას**
> — მაგრამ როგორც სკრიპტი აღარ მუშაობს.

---

---
name: h2d-quality-diff
description: Compare Web2Wireframe JSON output against html.to.design (h2d) baseline for the same website. Surfaces missing CSS properties, node-type mismatches, and structural gaps that cause quality regressions vs. h2d's 1:1 rendering. Use when debugging visual differences (e.g. Apple.com, Tesla.com) or verifying a CSS-converter change didn't regress quality.
disable-model-invocation: true
---

# h2d Quality Diff Skill

Web2Wireframe-ის მიზანია **html.to.design დონის 1:1 ხარისხი**. ეს skill ადარებს ჩვენს JSON output-ს h2d-ის JSON-ს იგივე საიტისთვის და უჩვენებს სად ვჩამორჩებით.

## როდის გამოვიყენო

- CSS converter-ის რეფაქტორინგის შემდეგ (`packages/figma-plugin/src/rendering/css-converter.ts`)
- Tree-builder-ის ცვლილების შემდეგ (`packages/shared/src/tree-builder.ts`)
- ახალი საიტის import-ის შემდეგ — იდენტიფიცირება რა გვაკლია
- Apple.com / Tesla.com visual regression-ის debugging-ში

## Usage

```
/h2d-quality-diff <website-name>
/h2d-quality-diff apple
/h2d-quality-diff tesla
```

## Input Files

**W2W output:** `docs/studyH2W/ჩვენი-პლაგინიდან/*_w2w.json`
**h2d baseline:** `docs/studyH2D/decoded/*.json` (decoded from .h2d via `h2d-codec.js`)

თუ h2d baseline არ არის decoded-ი:
```bash
node docs/studyH2D/h2d\ encoding\ way/h2d-codec.js decode <file.h2d>
```

## Reference Documents (Research)

- **89 CSS properties that h2d captures:** `docs/studyH2D/research/03-style-properties-complete.md`
- **h2d vs W2W comparison:** `docs/studyH2D/research/04-h2d-vs-w2w-comparison.md`
- **Final summary:** `docs/studyH2D/research/10-FINAL-SUMMARY.md`
- **h2d codec:** `docs/studyH2D/h2d encoding way/h2d-codec.js`

## Diff Checklist

### 1. Node Type Coverage

h2d იყენებს მხოლოდ 3 node type: **FRAME / TEXT / SVG**.

- [ ] ყველა element სწორი node type-ით არის?
- [ ] SVG-ები inline markup-ით არის შენახული (h2d-ის მიდგომა)?
- [ ] TEXT node-ები მინიმალურია (მხოლოდ value + font)?
- [ ] Typography styles PARENT FRAME-ზეა, არა TEXT-ზე?

### 2. CSS Property Coverage (89 properties)

შეადარე 89 properties-ის სია (research/03) ვიდრე ჩვენი tree-builder.ts / css-converter.ts-ის output-ი. ფოკუსი:

**Layout:**
- [ ] `display`, `position`, `float`, `clear`
- [ ] `flexbox` properties (flex-*, justify-*, align-*)
- [ ] `grid` properties (gridTemplate*, gridArea, gridGap) — **W2W ხშირად ვერ ახერხებს**
- [ ] `gap`, `row-gap`, `column-gap`

**Box model:**
- [ ] `margin`, `padding`, `border-*` (per-side)
- [ ] `box-sizing`, `overflow-*`

**Typography:**
- [ ] `font-family`, `font-size`, `font-weight`, `font-style`
- [ ] `line-height`, `letter-spacing`, `text-align`, `text-transform`
- [ ] `text-decoration`, `text-shadow`

**Visual:**
- [ ] `background-*` (color, image, gradient, position, size)
- [ ] `border-radius` (per-corner)
- [ ] `box-shadow`, `opacity`, `filter`
- [ ] `mix-blend-mode`, `backdrop-filter`

**Transforms:**
- [ ] `transform`, `transform-origin`

### 3. Structural Diff

- [ ] Node count-ი მსგავსია? (±10% ოქეი)
- [ ] Depth of tree მსგავსია?
- [ ] Text content-ი იგივეა? (ხშირად text missing-ია W2W-ში)
- [ ] Assets/images იდენტურია?

### 4. h2d-specific Patterns

- [ ] **fit-content detection** — h2d temporarily changes parent padding (research/09)
- [ ] **computedStyleMap() usage** — W2W იყენებს მხოლოდ getComputedStyle
- [ ] **Raw CSS storage** — h2d stores raw CSS, plugin converts; W2W converts in tree-builder

## Output Format

```markdown
## h2d Quality Diff: <website>

### 📊 Summary
- W2W nodes: N, h2d nodes: M (diff: ±X%)
- CSS properties covered: A/89 (vs h2d: B/89)
- Missing SVGs: N
- Missing text nodes: M

### 🚨 Critical Gaps
- [ ] Grid layout not converted (element: `.footer-grid`, line: X in tree-builder.ts)
- [ ] fit-content width missing for `.card-container`
- [ ] SVG marker not extracted in li element

### ⚠️ Moderate Gaps
- [ ] box-shadow per-side missing
- [ ] backdrop-filter not supported

### ✅ Parity
- Typography: line-height, letter-spacing working
- Border-radius: per-corner OK

### 📍 Recommended Fixes (priority order)
1. `packages/shared/src/tree-builder.ts:XXXX` — add grid property extraction
2. `packages/figma-plugin/src/rendering/css-converter.ts:XXXX` — fit-content handling
3. ...
```

## Workflow

1. **Locate both JSON files** (W2W + h2d baseline for same website)
2. **Parse both** — count nodes, extract CSS properties used
3. **Run checklist** — each section above
4. **Cross-reference with source** — for each gap, find exact file:line in:
   - `packages/shared/src/tree-builder.ts`
   - `packages/figma-plugin/src/rendering/css-converter.ts`
   - `packages/figma-plugin/src/rendering/nodes.ts`
5. **Prioritize fixes** — critical (visual blocker) > moderate > minor
6. **Write output** to `docs/studyH2W/reports/<website>-<YYYY-MM-DD>.md` (create if needed)

## Example Invocation

```
User: /h2d-quality-diff apple
Assistant:
1. Reads docs/studyH2W/ჩვენი-პლაგინიდან/apple_com_1440_w2w.json
2. Reads docs/studyH2D/decoded/apple_com_1440.json
3. Parses, counts, diffs
4. Writes report to docs/studyH2W/reports/apple-2026-04-18.md
5. Returns summary with top 3 critical gaps + file:line references
```

## Notes

- **h2d JSON is the source of truth for 1:1 quality** — if h2d has it, we should too
- **Don't blindly copy h2d's approach** — some h2d patterns (raw CSS → plugin) are architectural choices we deliberately don't follow
- **Grid support is the biggest known gap** (per MEMORY.md research) — always check first
- **Update file-map.md** if you touch new files during fixes
