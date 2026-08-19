# Issue #1 — „Download fonts (.zip)" ცარიელ არქივს აბრუნებს

**სიმპტომი:** მოდალი ჩნდება, `Download fonts (.zip)` მუშაობს, მაგრამ `fonts.zip` = **22 ბაიტი**
(0 ჩანაწერი), + ბანერი „2 font files could not be packaged (skipped)".

**სტატუსი:** root cause **100%-ით დადგენილია ექსპერიმენტებით**. Fix **არ გამიკეთებია** —
`packages/shared` / `packages/browser-extension`-ია (🔒 კითხვა საჭიროა).

---

## რას ეყრდნობა დასკვნა (3 ექსპერიმენტი, არა ვარაუდი)

### E1 — capture-ში ფონტის ბაიტები საერთოდ არ არის
```
fonts[] ველები: fontDisplay fontFamily fontStretch fontStyle fontVariant
                fontVariationAxes fontWeight platformFontFamily source src unicodeRange
   → fontBase64: არა · fontMimeType: არა · realFamily: არა
assets map: 20 ჩანაწერი, აქედან ფონტი — 0
3 @font-face URL → სამივე MISS
```

### E2 — CORS: plugin-ს პირდაპირ ჩამოწერა **პრინციპში** არ შეუძლია
```
curl -H "Origin: null" …/if_std_rg-webfont.woff2
  HTTP/2 200 · content-type: font/woff2 · content-length: 40976 · server: cloudflare
  access-control-allow-origin: — (თავსართი საერთოდ არ არის)
```
ორი დამოუკიდებელი კედელი: (1) plugin manifest `networkAccess.allowedDomains` =
**მხოლოდ** `api.web2wireframe.design`; (2) სერვერი CORS თავსართს არ აგზავნის.
ე.ი. `createFontsZipBlob`-ის `fetch()` fallback **ვერასდროს** იმუშავებს →
`skippedEntries` → ცარიელი ZIP. **ZIP მხოლოდ წინასწარ ამოღებული ბაიტებით მუშაობს.**

### E3 — CDP repro (Puppeteer + system Chrome, ნამდვილი iwm.org.uk)
extension-ის სამივე სტრატეგიის ზუსტი გამეორება:
```
resource tree: 1 resource, 0 font-ish            ← სტრატეგია 1/2-ს საკვები არ აქვს
Page.getResourceContent × 3  → FAIL "No resource with given URL"
page-context fetch × 3       → OK 40976 / 42064 / 32020 ბაიტი   ✅
```
**ერთადერთი მომუშავე გზა = content-script-ის `FETCH_FONT_DATA` (page context, same-origin).**

---

## Root cause — ერთი regex, ორ ადგილას კლავს

`w2w.ts`-ი `font.src`-ს **განზრახ ხსნის `url()`-ისგან** (ორივე ბრანჩზე):
```
// Clean src: strip url() wrapper for clean URL storage
const cleanSrc = f.src.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, '$1').trim();
```
→ შენახული src: `https://…/if_std_rg-webfont.woff2 format("woff2")` — **`url()` აღარ არის.**

`packages/shared/src/font-binary-extraction.ts` კი `url()`-ს **მოითხოვს**:
```
const regex = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/g;   // → [] cleaned src-ზე
```

დამოწმებული:
```
extractUrlsFromSrc(cleaned src) → 0 URL
w2w.ts-ის ძველი inline regex    → 1 URL
```

**ეს ორ ადგილას კლავს ფონტს (ორივე ლოკალურ, uncommitted `w2w.ts`-შია):**

| # | ადგილი | შედეგი |
|---|---|---|
| A | `w2w.ts:571` — `missingFontUrls` აგება | სია ცარიელია → **`FETCH_FONT_DATA` არასდროს იგზავნება** → ერთადერთი მომუშავე სტრატეგია არ ეშვება |
| B | `w2w.ts:854` — `w2wPickFontUrlsToKeep` | `ranked = []` → `keep = []` → `fontUrlsToKeep` ცარიელი → ქვემოთ **ყველა ფონტის asset იშლება** `assets`-იდან (თუნდაც წარმატებით ჩამოტვირთული) |

## რომელი build-ია დამნაშავე

| | `main` (გამოქვეყნებული 1.0.3) | ლოკალური uncommitted |
|---|---|---|
| `extractUrlsFromSrc`-ის გამოყენება | **0-ჯერ** | 2-ჯერ |
| `w2wPickFontUrlsToKeep` | **არ არსებობს** | არსებობს |
| `missingFontUrls` როგორ იგება | loose inline regex → **მუშაობს** | strict → ცარიელი |

⇒ **ეს არის ლოკალური, ჯერ გამოუქვეყნებელი რეგრესია.** Web Store-ის 1.0.3 ამ ბაგს არ შეიცავს.
ე.ი. `.w2w` გადაღებულია **ლოკალურად ჩატვირთული (unpacked) extension-ით**.

---

## შემოთავაზებული root fix — 1 regex `packages/shared`-ში

`packages/shared/src/font-binary-extraction.ts`, `extractUrlsFromSrc`:

```
- const regex = /url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/g;
+ // `url(...)`-იანიც და შიშველიც: w2w capture src-ს ასუფთავებს url()-ისგან
+ const regex = /url\(\s*['"]?(https?:\/\/[^'")\s]+)['"]?\s*\)|(https?:\/\/[^\s'")\],]+)/g;
    …
-   urls.push(match[1]);
+   urls.push(match[1] || match[2]);
```

**რატომ ეს და არა `w2w.ts`-ის ჰაკი:** მიზეზი კონტრაქტის შეუთანხმებლობაა (მწარმოებელი
ასუფთავებს, მომხმარებელი wrapper-ს ითხოვს). ერთ ადგილას გასწორება ორივე kill point-ს
ხურავს და ყველა მომავალ consumer-საც (`extractFontBinaries` → `packages/api`-ს CDP გზა).

**Regression-ის შემოწმება (უკვე გავტესტე offline, ფაილი არ შემიცვლია):**

| src-ის ფორმა | ახლანდელი | შემოთავაზებული |
|---|---|---|
| cleaned, 1 URL (iwm) | 0 | **1** ✅ |
| `url(…)` 1 URL | 1 | 1 ✅ |
| `url("…")` ბრჭყალებით | 1 | 1 ✅ |
| bulletproof 4 ფორმატი, cleaned | 0 | **4** ✅ |
| bulletproof, `url(…)`-იანი | 2 | 2 ✅ |

მკაცრი superset-ია — არსებულ ქცევას არ ცვლის, მხოლოდ ამატებს.

## ⚠️ დამოუკიდებელი ღია საკითხი (ამ fix-ით არ იხურება)

მაშინაც კი, როცა ბაიტები capture-ში მოხვდება, `Re-apply` ვერ იმუშავებს **სანამ
მომხმარებელი ფონტს ლოკალურად არ დააინსტალირებს** — ეს დიზაინით ასეა (ZIP → install →
Re-apply). ამ იმპორტში „Re-applied 0 / 84 — still missing: Interface" ზუსტად ამას ნიშნავს.

---

## ✅ გაკეთდა (2026-08-06) — owner-ის ნებართვით

`packages/shared/src/font-binary-extraction.ts` → `extractUrlsFromSrc` ახლა ორივე ფორმას კითხულობს.
+8 ტესტი (`font-src-url-shapes.test.ts`). `packages/shared`: **1026 ტესტი ✅**, build ✅.
`packages/browser-extension` თავიდან აეწყო გასწორებულ `@w2w/shared`-ზე.

დამოწმებული აწყობილ `dist`-ზე:
```
extractUrlsFromSrc("https://…/if_std_rg-webfont.woff2 format(\"woff2\")")
  → ["https://…/if_std_rg-webfont.woff2"]      (იყო [])
extractUrlsFromSrc('url("https://a.io/f.woff2") …')
  → ["https://a.io/f.woff2"]                    (უცვლელი)
```

## 🔴 შემდეგი ბლოკერი — ZIP აღარ იქნება ცარიელი, მაგრამ **დასაინსტალირებელი არ იქნება**

iwm.org.uk სამივე face-ს **მხოლოდ `.woff2`-ად** გასცემს. ნამდვილი ბაიტების შემოწმება:
```
ხელმოწერა: b'wOF2'  (hex 774f4632)  → WOFF2 / Brotli
```

plugin-ის `repackageForInstall` (`src/utils/fontDownload.ts`) აკონვერტებს:
`WOFF v1 → SFNT` ✅ · `EOT → SFNT` ✅ · **`WOFF2` → უცვლელად რჩება** ❌
(კომენტარიც ამას ამბობს: „Anything else (WOFF2/Brotli, unparseable) ships unchanged";
`woffToSfnt.ts` `isWoff` მხოლოდ `wOFF`-ს ცნობს).

⇒ ZIP-ში მოხვდება 3 × `.woff2` (~115 KB), რომელსაც **macOS Font Book ვერ დააინსტალირებს**
(და Figma ვერ ჩატვირთავს). ე.ი. „ფონტი მაინც ვერ მივიღე" ნაწილობრივ დარჩება.

**კარგი ამბავი:** repo-ში **უკვე დევს** სუფთა-JS WOFF2 კოდეკი — `wawoff2@2.0.1`
(`packages/api/src/lib/fonts/decompressFont.ts` მას იყენებს `normalizeFontPayload`-ში,
სწორედ ამიტომ **URL/CDP იმპორტის გზა** დასაინსტალირებელ ფაილებს იძლევა).
`decompress_binding.js` = 315 KB, Emscripten-ით აწყობილი, დამოკიდებულების გარეშე.

**სამი ვარიანტი (owner-ის გადასაწყვეტი):**
1. **plugin-ში (დაშვებული ზონა):** `wawoff2`-ის decompress bundle-ი UI-ში და `repackageForInstall`-ში
   WOFF2 → TTF. +315 KB UI bundle-ზე (ახლა 2.1 MB). Emscripten shim-ები დასატესტია.
2. **API-ს გავლით:** ახალი endpoint, plugin უგზავნის base64-ს, უკან იღებს TTF-ს.
   `allowedDomains` უკვე უშვებს `api.web2wireframe.design`-ს. 🔴 `packages/api`.
3. **extension-ში:** capture-ის დროსვე გადაიყვანოს (extension-ს ქსელი და bundle თავისუფალი აქვს).
   🔴 `packages/browser-extension`.

---

## ✅ WOFF2 ბლოკერიც მოიხსნა (2026-08-06) — plugin-ის ზონაში

### ფართო ტესტი (იმპლემენტაციამდე)

**326 ნამდვილი ფონტი**: Google Fonts (317 — მათ შორის 23 variable `fvar`+`gvar`,
CJK, არაბული, დევანაგარი, icon, monospace, italic) + 9 CFF/OTTO (macOS system `.otf`,
`wawoff2.compress`-ით woff2-ად ქცეული) + iwm-ის 3.

`woff-lib` (pure JS) vs `wawoff2` (Google-ის WASM reference):

| | |
|---|---|
| ჩავარდნა (ორივე მხარეს) | **0** |
| ბაიტ-იდენტური | **42** (მათ შორის **CFF/OTTO 9/9**) |
| ბაიტობრივად განსხვავებული | 284 — **ყველა სემანტიკურად იდენტური**: numGlyphs, unitsPerEm, advanceWidth და glyph outline (SVG path) **ემთხვევა 284/284** (fontkit-ით შემოწმებული) |
| `name` ცხრილის შიგთავსი | **იდენტური 40/40** (განსხვავება მხოლოდ ჩანაწერების წყობაშია) |
| სიჩქარე | 1.4× ნელი WASM-ზე — ~1 ms/ფონტი |

განსხვავებები `glyf`/`loca`-შია — ეს WOFF2 სპეციფიკაციით **დაშვებულია**: glyf-ის
რეკონსტრუქცია encoding-ის დონეზე არ არის ერთმნიშვნელოვანი, ფორმა კი იდენტურია.

### ბრაუზერის ვერიფიკაცია (Figma-ს გარემოს იმიტაცია)

esbuild-ით `--platform=browser` bundle → **ნამდვილ Chrome-ში** გაშვებული, `node:zlib`-ისა
და WebAssembly-ის გარეშე:
```
{ len: 112060, flavor: '00010000', sum: 87956504, ms: 18 }
Node reference (wawoff2/WASM): len 112060  sum 87956504
✅ ბაიტ-ბაიტ ემთხვევა · კონსოლის შეცდომა 0
```
(Figma plugin-ში WASM არ მუშაობს, ამიტომ `wawoff2` გამორიცხული იყო.)

### იმპლემენტაცია — მხოლოდ `packages/figma-plugin`

| ფაილი | ცვლილება |
|---|---|
| `package.json` | `woff-lib: 0.0.3` (ზუსტად მიმაგრებული) |
| `src/utils/woff2ToSfnt.ts` **(ახალი)** | `isWoff2()` + `convertWoff2ToSfnt()` → `{bytes, extension}` ან **`null`** (არასდროს throw) |
| `src/utils/fontDownload.ts` | `enrichFontsFromAssets` → async, WOFF2-ს ხსნის **ერთხელ** (მერე ZIP-იც და `readSfntNames`-იც SFNT-ს ხედავს); `repackageForInstall` → async + WOFF2 ტოტი |
| `AreaSelection.tsx` | `processAndRender` → async (ერთი `await` მისამართზე) |

**Fail-safe:** ვერ გაშიფრა → ორიგინალი ბაიტები რჩება, ე.ი. **ვერასდროს გახდება უარესი
ვიდრე დღეს იყო.**

**+9 ახალი ტესტი** (რეალურ 940-ბაიტიან woff2 fixture-ზე). სულ: **2303 ✅**, `tsc` სუფთა.

### სრული ჯაჭვის ვერიფიკაცია ნამდვილ iwm ფონტებზე

```
realFamily: InterFace / Regular (font/ttf) · InterFace / Bold (font/ttf)
ZIP: InterFace-Regular-400-100.ttf  112060 ბაიტი  flavor 0x10000
     InterFace-Bold-700-100.ttf     146020 ბაიტი  flavor 0x10000
skipped: 0
```

⇒ `.ttf`, დასაინსტალირებელი, **და** ნამდვილი ოჯახის სახელით — ე.ი. ინსტალაციის შემდეგ
`Re-apply original fonts` შეძლებს `Interface` → `InterFace` მიბმას.
