# www.iwm.org.uk — Import Findings (ფაზა 1)

**Reference:** https://www.iwm.org.uk/ · **Figma:** section `4628:3865` → frame `4628:1432` (1440px)
**თარიღი:** 2026-08-05 · **Payload:** `iwm_org_uk_1440_1024_768_375_wireframe.w2w` (decoded, 15 MB)

## რაზე დაფუძნებულია დასკვნები

| წყარო | სტატუსი |
|---|---|
| ცოცხალი საიტი @1440 | ✅ Playwright, `getComputedStyle` + `getBoundingClientRect` |
| Reference screenshot (`17-12-14`) | ✅ ეტალონად ავიღე (მეორეში cookie banner ღიაა და სურათები ჩაუტვირთავია) |
| `iwm-1440-reference.png` | ✅ ჩემი გადაღებული, **ზუსტად 1440px** — user-ის screenshot 1713 CSS px @2× აღმოჩნდა |
| `.w2w` payload (extraction output) | ✅ `scripts/w2w-decode.mjs`-ით გაშიფრული |
| Figma layer tree (render output) | ✅ REST `/v1/files?ids=…` — 486 FRAME + 84 TEXT + 29 VECTOR |
| Figma PNG render | ⏳ `/v1/images` 429 rate-limited (retry მიმდინარეობს) — სტრუქტურული შედარება PNG-ის გარეშე გაკეთდა |

**ძირითადი უპირატესობა:** payload-ის ხელში ქონა ნიშნავს, რომ **extraction vs render დიაგნოზი უკვე
გაკეთებულია** თითოეულ პრობლემაზე — არა ვარაუდით, არამედ იმის შედარებით, რა შევიდა და რა გამოვიდა.

---

## განსხვავებების sheet

| # | სექცია / ელემენტი | რეალურ საიტზე | Figma-ში დაიმპორტდა | Sev | სად | სტატუსი |
|---|---|---|---|---|---|---|
| 1 | **მთელი ტიპოგრაფია** | `Interface` (3 @font-face: 400/700 normal, 400 italic, `.woff2`, same-origin) | **ყველა 84 TEXT node = `Inter`**; მოდალი: „Fonts Not Available: **Interface, .**"; `fonts.zip` **22 ბაიტი, 0 ფაილი** | 🔴 P0 | plugin + 🔴 extension | ⚠️ **ნაწილობრივ** |
| 2 | **6 ფოტო**: hero (1440×675) + Our Museums-ის 5-ვე ბარათი | რეალური სურათები | **ნაცრისფერი placeholder** (SOLID #CED8E4 @0.6 + „Image Icon") | 🔴 P0 | 🔴 extraction | ⛔ **დაბლოკილი** |
| 3 | **„Our Museums" mozaika** | `flex-direction: row-reverse` + `wrap` → IWM London **მარჯვნივ**, Churchill **მარცხნივ** | **სარკისებურად შებრუნებული** — London მარცხნივ, Churchill მარჯვნივ | 🔴 P0 | render (layout) | ✅ **გასწორდა** |
| 3b | ↳ Churchill ბარათის ვერტიკალი | `align-self: flex-end` → ქვე-სწორება (y=1035, ბოლო=1285, London-თან ერთად) | ზედა-სწორება (იგივე y რაც London) | 🔴 P0 | render (layout) | ✅ **გასწორდა** |
| ~~3c~~ | ~~IWM Duxford-ის სიგანე~~ | ~~424px~~ | ~~531px~~ | — | — | ❌ **ცრუ განგაში** — 531 = `li:margin` wrapper (424 + 106px margin-right). სიგანე სწორი იყო. |
| 4 | **Hero-ს „IMPERIAL WAR MUSEUMS" ლოგო** | `background-image: url(data:image/svg+xml,…)` 625×96, `contain`, `50% 100%` | **მუქი-ნაცრისფერი ოთხკუთხედი** (SOLID #AAB5C3) + **გაწელილი 625 → 833** | 🟡 P1 | render (fills + sizing) | ✅ **ლოგო გასწორდა** / ⚠️ სიგანე დარჩა |
| 5 | **2 SVG asset** — `teaser/logo.svg` (×6), `footer/logo-title.svg` | ჩანს | ცარიელი frame-ები (fill არ აქვს) | 🟡 P1 | 🔴 extraction | ⛔ **დაბლოკილი** |
| 6 | **სიების უარყოფითი margin** | `ul.branch-showcase__list` = 1273px (`margin: 0 -6px`) | **1261px** (−12) | 🟡 P1 | render (sizing) | ✅ **გასწორდა** |
| 7 | **`<picture>`-ის `<source>` ელემენტები** | არ ირენდერება (0 ზომა) | **4 ცალი 1×19 / 1×22 junk frame თითო `<picture>`-ში** → `picture` 1440×**678** vs `img` 1440×675 | 🔵 P2 | render (skip rules) | ✅ **გასწორდა** |
| 8 | **OneTrust cookie ღილაკი** | `position: fixed`, ქვედა-მარცხენა კუთხე | **ორჯერ**: `#onetrust-consent-sdk`-ში + `body.node`-ის გვერდით top-level-ზე; label ტექსტი დაკარგული | 🔵 P2 | render (fixed positioning) | ⏳ **გადადებული** |

---

## ✅ შემოწმებული და გამართული (ფაზა 2-ში არ შედის)

ეს რომ არ გადამოწმებულიყო, სავარაუდო ბაგებად ჩაითვლებოდა — ამიტომ ვწერ:

- **ტექსტის შიგთავსი სრულია.** payload-ში 112 ხაზ-ფრაგმენტია, Figma-ში 84 node — ეს **სწორი
  გაერთიანებაა** (multi-line TEXT), არა დანაკარგი. `text-transform: uppercase` სწორად გამოიყენება
  („London" → „LONDON").
- **Hero-ს H1 „Imperial War Museums" სწორად არის გამოტოვებული** — ის `span.sr-text`-ია: 1×1px,
  `clip: rect(0,0,0,0)`, მხოლოდ screen reader-ისთვის. ვიზუალური ტექსტი = SVG ლოგო (იხ. #4).
- **What's On / Support us-ის 6 ბარათის სურათი** — რეალური `IMAGE` fill ✅ (მათი URL viewport-ზე
  დამოუკიდებელია: `responsive_w320`).
- **სექციის დონის გეომეტრია პიქსელამდე ემთხვევა:** `header` 1440×675, `main` 1440×3185,
  `footer` 1440×524, `div.hero-full-width` 1440×675, `div.paragraph` 1440×545 — **Δ = 0**.
- **Frame-ის სრული სიმაღლე:** payload 4383.86 → Figma 4384 ✅

---

## 📋 დამატებითი მტკიცებულებები (ფაზა 2-ისთვის მზა)

### #1 ფონტები
```
payload.fonts = 3 face, ყველა fontFamily="Interface", platformFontFamily="Interface"
  400 normal  → .../interface_standard_regular/if_std_rg-webfont.woff2 format("woff2")
  700 normal  → .../interface_standard_bold/if_std_bd-webfont.woff2   format("woff2")
  400 italic  → .../interface_hinted_italic/hinted-InterFace-Italic.woff2 format("woff2")
```
ე.ი. **extraction სწორია** — სამივე cut, სწორი სახელით, სწორი URL-ით. პრობლემა ქვემოთაა:
- მოდალში ჩანს **ცარიელი ფონტის სახელი** („Interface, **.**") → სიაში ცარიელი სტრიქონი ხვდება
- „2 font files could not be packaged (skipped)" — მაგრამ faces = **3**, zip-ში = **0**

### #2 / #5 assets
```
captureStats: { skippedImageCount: 8, resourceMapMisses: 8, unsupportedFormats: {}, payloadTruncated: false }
```
**8 უნიკალური მისამართი დაიკარგა = 6 ფოტო + 2 SVG.** კრიტიკული დეტალი:

| assets map-ში არის | node-ები ითხოვენ |
|---|---|
| `…/branch_showcase_**tablet_1x**/…` (5 ცალი) | `…/branch_showcase_**desktop_1x**/…` |
| `…/branch_showcase_**mobile_1x**/…` (5 ცალი) | ↑ იგივე |
| `…/feature_hero_**tablet_1x**/…`, `…_**mobile_1x**/…` | `…/feature_hero_**desktop_1x**/…` |

ე.ი. **desktop ვარიანტები საერთოდ არ მოხვდა assets map-ში**, tablet/mobile კი მოხვდა →
multi-viewport capture-ის asset harvest-ის რიგითობის პრობლემაზე მიუთითებს (1440-ის pass-ის
რესურსები არ აიღება; 1024/768/375-ის კი აიღება). **ჰიპოთეზაა — ფაზა 2.3/2.4-ში დასამტკიცებელი.**

### #3 row-reverse — ზუსტი კოორდინატები

| ბარათი | ცოცხალი x (ul-შიგნით) | Figma x | სიგანე live → Figma |
|---|---|---|---|
| IWM London | 720 (მარჯვნივ) | 101 (მარცხნივ) | 637 → 637 ✅ |
| Churchill War Rooms | 296 (მარცხნივ) | 738 (მარჯვნივ) | 424 → 424 ✅ |
| IWM North | 826 (მარჯვნივ) | 101 (მარცხნივ) | 531 → 531 ✅ |
| HMS Belfast | 189 (მარცხნივ) | 632 (მარჯვნივ) | 637 → 637 ✅ |
| IWM Duxford | 826 (მარჯვნივ) | 101 (მარცხნივ) | **424 → 531** ❌ |

payload-ში `flexDirection: "row-reverse"` **სწორად არის ჩაწერილი**;
Figma-ში `layoutMode: HORIZONTAL`, `layoutWrap: WRAP` — reverse დაკარგულია. → **render bug.**

---

---

## ფაზა 2 — შესრულებული სამუშაო (2026-08-05)

ყველა fix `packages/figma-plugin`-შია (დაშვებული ზონა), TDD-ით: ჯერ ტესტი წითლად,
მერე იმპლემენტაცია. **სულ +39 ახალი ტესტი; მთელი suite 2278 ✅, `tsc` სუფთა.**

| # | Root cause (file:line) | Fix | ტესტები |
|---|---|---|---|
| 3 | `getLayoutMode` `row-reverse`-ს `HORIZONTAL`-ად კეცავს, ბავშვების რიგი კი არსად არ იბრუნება | `reverseFlexChildren()` — **თითო wrap-ხაზში ცალკე** ბრუნავს (გლობალური reverse ხაზებს არევდა, რადგან CSS main-ღერძის რიგით ჭრის ხაზებს); + `cssJustifyToFigma(justify, reversed)` MIN↔MAX | 15 |
| 3b | `css-converter` `alignSelf`-ს **საერთოდ არ გადმოსცემდა** → `cssAlignSelfToFigma` ყოველთვის `INHERIT` | converter წერს `alignSelf`-ს; ახალი `resolveChildLayoutAlign()` MIN/MAX-საც იყენებს | 8 |
| 1 | **CDP-ის sentinel**: `CSS.getPlatformFontsForNode` → `familyName: "."+DEL`, `postScriptName: "_"` — 444-დან **434 TEXT node-ზე** (`font-display: swap` ჯერ არ ჩატვირთულა). `parseFontString`-ს გაჰქონდა და `Interface`-ს ცვლიდა | `isUsableMeasuredFamily()` (ცარიელი / control char / ასოს გარეშე / hidden-OS) + `measuredFamily()` ყველა 6 წაკითხვის წერტილში | 10 |
| 4 | `url()`-ის regex `/url\(["']?([^"')]+)["']?\)/` **null-ს აბრუნებს** SVG data URI-ზე (შიგნით `'` აქვს) → `imageUrl: undefined`; + `svgDataUriToString` მხოლოდ base64-ს იცნობდა, URI კი `charset=utf-8,%3Csvg…`-ია | ბრჭყალების-მცოდნე `extractCssUrl()` + `decodeSvgDataUri()` percent-encoded გზით | 10 |
| 7 | `<source>` DOM ელემენტია და inline ყუთი აქვს → 4 junk frame თითო `<picture>`-ზე | `NON_RENDERING_TAGS` (`source`/`track`/`param`) `shouldSkipInvisibleFrame`-ში | 3 |
| 6 | უარყოფითი bleed margin-ის დროს ელემენტი FILL-ს იღებდა და მშობლის სიგანეზე იკუმშებოდა | `getSizing`: უარყოფითი `margin-left/right` **და** `ownWidth > parentWidth` → `FIXED` | 4 |

### ვერიფიკაცია რეალურ payload-ზე (არა mock)

`.w2w`-ის 1440 frame გატარებულია რეალურ converter-ში:

```
#3 mosaic order : Churchill War Rooms | IWM London | HMS Belfast | IWM North | IWM Duxford
#3 primaryAxis  : MAX          (ბრაუზერივით მარჯვნივ მიწყობილი)
#6 ul sizing    : FIXED 1273   (იყო FILL 1261)
#1 font demand  : "Interface", "Arial"   (იყო + "."+DEL)
#7 <source>     : 0 nodes      (იყო 24)
#4 hero logo url: data:image/svg+xml;charset=utf-8,%3Csvg … len 5296   (იყო undefined)
```

### რაც შეგნებულად დარჩა

- **#2 / #5 — assets.** Root cause: multi-viewport capture-ის asset harvest desktop
  ვარიანტებს ვერ იჭერს (assets map-ში მხოლოდ `tablet_1x`/`mobile_1x` არის). Fix
  `packages/browser-extension`-ს მოითხოვს → 🔴 LIVE, **ნებართვის გარეშე არ შევეხე.**
- **#1-ის ZIP-ის ნაწილი.** ორი დამოუკიდებელი ბლოკერი:
  1. `.w2w`-ის `assets` map-ში **ფონტის binary საერთოდ არ არის** (იგივე harvest ბაგი) →
     `enrichFontsFromAssets`-ს გასამდიდრებელი არაფერი აქვს;
  2. plugin-ის `networkAccess.allowedDomains` = **მხოლოდ** `api.web2wireframe.design` →
     `fetch("https://www.iwm.org.uk/…woff2")` Figma-ს მიერ იბლოკება, ე.ი. ყველა entry
     „skipped" ხდება. ZIP მხოლოდ **წინასწარ ამოღებული binary-ით** თუ იმუშავებს.
  არჩევანი (შენი გადასაწყვეტია): extension იჭერს binary-ს · API `/api/import-w2w`-ზე
  server-side იღებს (როგორც `w2w-extraction.ts` აკეთებს URL-იმპორტისთვის) · plugin
  API-ს proxy-ს იყენებს · manifest-ში `allowedDomains: ["*"]`.
- **#4-ის სიგანე** (625 → 833, `sizingH=FILL`) და **#8** (OneTrust ღილაკი) — P1/P2 polish.
- **მოდალის „." სიმბოლო** უკვე გასწორებული იყო `dev`-ზე (`46d3f2b`, `/^\./` guard),
  უბრალოდ **გამოქვეყნებულ build-ში ჯერ არ არის** — main-ზე ეს commit არ არის.

---

## შემოთავაზებული რიგითობა ფაზა 2-ისთვის (საწყისი)

1. **#3 row-reverse** — სუფთა render bug, plugin-ის ზონაშია (✅ დაშვებული), ვიზუალურად ყველაზე
   თვალშისაცემი, payload უკვე მტკიცებულებაა. **აქედან დავიწყოთ.**
2. **#1 ფონტები** — მთელ გვერდზე მოქმედებს; extraction სუფთაა, ე.ი. plugin/api-ის მხარეა.
   ჯერ plugin-ის მხარე გამოვიკვლიოთ (ცარიელი სახელი + zip-ის აწყობა).
3. **#4 hero ლოგო** — render, ორი ქვე-პრობლემა (fill + FILL sizing).
4. **#6 უარყოფითი margin** — render.
5. **#2 / #5 assets** — 🔴 **extraction = LIVE `packages/browser-extension`**. root fix მის შეხებას
   მოითხოვს → **ჯერ ვიკვლევთ, შემდეგ გიორგის ვეკითხებით ნებართვას.**
6. **#7 / #8** — P2 polish.

> ⚠️ #2/#5-ის გამოკვლევა შესაძლებელია extension-ის შეცვლის გარეშე (Puppeteer repro harness).
> კოდის შეცვლაზე ნებართვას ცალკე ვიკითხავ.

---

# ციკლი 2 — ახალი იმპორტის 3 პრობლემა (2026-08-06)

**Figma:** ახალი იმპორტი `4637:3866` · პრობლემები: `4637:4135`, `4637:3908`
**მეთოდი:** იგივე `.w2w` payload → **რეალურ `convertW2WToWireframe`-ში გატარებული**
(`tsx` harness, არა mock). ⚠️ Figma REST `/v1/files` **429 rate-limited** — layer tree
ვერ ჩამოვწერე, ამიტომ დიაგნოზი payload + converter output-ზეა დაფუძნებული.

| # | პრობლემა | Root cause | სად | სტატუსი |
|---|---|---|---|---|
| A | ვერტიკალური ტექსტი (1 ასო ხაზზე) | sr-only 1×1 ყუთები არ იფილტრება | render | ✅ დამტკიცებული |
| B | ჰედერი არ ჩანს | z-index → paint order არ გადმოდის | render | ✅ დამტკიცებული |
| C | აიკონის ნაცვლად ნაცრისფერი ოთხკუთხედი | SVG markup მოდის, მაგრამ ვექტორად არ ირენდერება | render | ⚠️ მექანიზმი ბოლომდე დასამტკიცებელი |

## A — ვერტიკალური ტექსტი („1 × 122")

**რა არის:** screen-reader-only სათაურები:

| ელემენტი | ტექსტი | Figma-ში |
|---|---|---|
| `h2.visually-hidden#block-mainnavigation-menu` | „Main navigation" | `1 × 122` |
| `h2.visually-hidden#block-secondarynavigation-menu` | „Secondary navigation" | `1 × 122` ← screenshot-ზე ესაა |
| `h2.visually-hidden#block-footer-menu` | „Footer menu" | `1 × 66` |
| `a.skip-main` | „Skip to main content" | `1 × 1` |

**payload-ის styles (სამივე h2):**
`position: absolute · width: 1px · height: 1px · overflow: hidden`
(`clip`/`clipPath` extraction-ს **არ** გამოაქვს → clip-ზე დაყრდნობა შეუძლებელია)

**მექანიზმი:** ბრაუზერი ყუთს 1×1-ზე ჭრის → არაფერი ჩანს. ჩვენ ვინახავთ; მერე
`css-converter.ts:730-735` (inline baseline overhang correction) ყუთს **ink box-ზე
ჭიმავს** — `inkTop=94.95`, `inkBottom=216.95` → `height = 122`, სიგანე კი `1`-ად რჩება.
Figma-ში 1px-სიგანის TEXT node = **თითო სიმბოლო ცალკე ხაზზე** → ვერტიკალური სვეტი.

**დამტკიცება (converter output):**
```
text "h2#block-secondarynavigation-menu"  1x122   text="Secondary navigation"
text "h2#block-mainnavigation-menu"       1x122
text "h2#block-footer-menu"               1x66
text "a.skip-main"                        1x1
```

**Root fix:** `shouldSkipInvisibleFrame` (`css-converter.ts:3031`) — sr-only ყუთი
(`width ≤ 1 && height ≤ 1 && overflow: hidden`) სრულად გამოვტოვოთ.
`overflow: hidden` სავალდებულო პირობაა — 0/1px wrapper-ს **overflow: visible**-ით
შეიძლება ჰქონდეს რეალურად ხილული absolute შვილები (tooltip/badge).

## B — ჰედერი არ ჩანს (z-index)

**Figma-ში z-index არ არსებობს** — layer order-ია paint order. ე.ი. ჩვენ უნდა
გადმოვთარგმნოთ, სხვა გზა არ არის.

**`div.hero`-ს შვილები (DOM რიგით):**

| # | ელემენტი | position | z-index | ზომა |
|---|---|---|---|---|
| 0 | `div.hero__nav` (მთელი მენიუ) | absolute | **20** | 1440×138.4 |
| 1 | `div.hero__media` (hero ფოტო) | relative | **−1** | 1440×675 |

ბრაუზერში: nav ზემოთ, media ქვემოთ. Figma-ში: ბოლო შვილი ზემოთ იხატება →
**ფოტო ფარავს მთელ ჰედერს**.

**დამტკიცება:** `sortChildrenForStacking` რეალურ ხეზე აბრუნებს
`div.hero__nav | div.hero__media` — ე.ი. **არაფერს არ ცვლის**.
მიზეზი: `nodes.ts:2139 isBehindSiblings` მოითხოვს `absolute|fixed` **და** `z < 0`.
`hero__media` = `relative` (არ ჯდება), `hero__nav` = `z > 0` (არ ჯდება).

**Root fix (სიმეტრიული არსებულ წესთან):** auto-layout მშობელში out-of-flow
(`absolute`/`fixed`) შვილი **explicit `z-index > 0`**-ით ბოლოში გადავიდეს
(`[...behind, ...rest, ...front]`). უსაფრთხოა, რადგან ასეთ შვილს
`layoutPositioning = "ABSOLUTE"` აქვს (`nodes.ts:1137-1145`) → რიგი მხოლოდ
paint order-ზე მოქმედებს, layout-ზე არა.

## C — აიკონის ნაცვლად ნაცრისფერი ოთხკუთხედი

**ელემენტი:** „Search" ღილაკის `::after` pseudo —
`span.__w2w-pseudo-after` 24×24, `background-image: url(…/menu_main/magnify.svg)`.

**extraction სუფთაა:** payload-ში არის **სრული inline SVG markup** (`$svgMarkup`, 341 ბაიტი).
converter-იც სწორად ატარებს:
```
frame  "button…search-open" 110x42
  text "span…search-open-text" "Search"
  frame "span.__w2w-pseudo-after" 24x24
    placeholder "SVG" 24x24   computedStyles.svgMarkup = "<svg …>" ✅
```

**იგივე ბაგი კიდევ 7 ადგილას (ერთი root cause):**
6 × `div.teaser__media-wrap` logo.svg (404×233, ფოტოს **ზემოდან**) + footer-ის
`img` logo-title.svg (297×43). ⚠️ ეს **აბათილებს ციკლი 1-ის #5-ს** („extraction-ის
ბრალია, extension-ზე დაბლოკილი") — markup payload-შია, ე.ი. **render-ის მხარეა**.

**რჩება დასამტკიცებელი (2 ვარიანტი):**
1. `nodes.ts:330-334` — svgMarkup მხოლოდ `assetMode === "realAssets"`-ზე ირენდერება;
   სხვა შემთხვევაში `createPlaceholder` → ნაცრისფერი.
2. `realImages.ts:275-283` — `figma.createNodeFromSvg` throw-ზე catch-ი აბრუნებს
   **სუფთა ნაცრისფერ frame-ს** (`surface @0.6`, აიკონის გარეშე).

განსხვავება ვიზუალურად: (1)-ს აქვს „Image Icon" ლოგო შიგნით, (2)-ს — არა.
**საჭირო მტკიცებულება:** dev-log bridge შემდეგ იმპორტზე (`Failed to create real image`
warning) ან Figma node-ის fill.

**განახლება (owner-ის დაკვირვება):** ნაცრისფერ ოთხკუთხედს **შიგნით „Image Icon" აქვს**
→ ე.ი. `createPlaceholder` გაეშვა, `createRealImage` — არა. ვარიანტი 2 (createNodeFromSvg
throw) **გამოირიცხა**. რჩება: `nodes.ts:332`-ის პირობა არ დაკმაყოფილდა —
ან `context.assetMode !== "realAssets"`, ან `node.computedStyles.svgMarkup` render-ის
მომენტისთვის დაკარგულია (converter→render გზაზე). შემდეგი ნაბიჯი #1-ზე გადასვლისას:
ჯერ ეს ორი ალტერნატივა გავმიჯნოთ.
