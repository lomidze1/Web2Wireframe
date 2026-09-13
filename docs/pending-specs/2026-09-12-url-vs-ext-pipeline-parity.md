# URL import vs extension `.w2w`: pipeline parity audit (2026-09-12)

Research only. No repo code was changed. Experiments ran in the session scratchpad
(`img-repro*.mjs`, `parity-analyze.mjs`) against live stripe.com, plus the owner's
extension capture `~/Downloads/stripe_com_1440_wireframe.w2w` (20:37, built from the
20:34 extension `dist/` that contains the reduced-motion and WebGL changes), decoded with
`scripts/w2w-decode.mjs`. API evidence comes from `docker compose logs api` (container
`web2wireframe-api-1`, created 09:53 today).

## Verdict

The two paths run the **same content-script extractor** and the **same plugin renderer**,
so they do not differ in kind. But everything between "page loaded" and "W2W tree
handed to the plugin" is **two hand-maintained copies**: `w2w.ts` for the extension,
`w2w-extraction.ts` + `htmlExtractor.ts` for the API. Several of those copies have
drifted: platform-font numbering, `font` override, hover freeze, font-face filtering,
image-URL collection and lookup, and auto-scroll. On top of that, the two page states
differ by design: a live headed tab vs a fresh headless `--disable-gpu` boot. On the
plugin side the paths converge at one handler (`main.ts:332`) with the same options. The
only plugin-side differences are pre-render font-name enrichment (two functions, same
result) and a few harmless payload fields.

## Step table

`ext` = `packages/browser-extension/src/background/capture/w2w.ts` unless noted.
`api` = `packages/api/src/lib/cdp/w2w-extraction.ts` unless noted.
`hx` = `packages/api/src/lib/htmlExtractor.ts`.

### Capture side

| # | Step | Path A (URL / API) | Path B (extension) | Status | Note |
|---|------|--------------------|--------------------|--------|------|
| 1 | Entry | `routes/plugin/import.ts:40` → `hx:551` `createWireframeDataW2W` → `hx:442` `renderWebsiteW2W` | `ext:116` `handleCapturePageW2W`; content script ensured `ext:136` | EQUIVALENT | |
| 2 | Browser | Fresh headless Chromium, `--disable-gpu` (`hx:452-456`), no cookies unless forwarded (`hx:466-500`) | User's live headed tab with GPU, their cookies, consent, A/B bucket and scroll state | DIVERGENT (inherent) | Changes WebGL fallbacks, experiments (`wpp_curator_h2`) and lazy-load state |
| 3 | Multi-viewport | New browser + full page load **per viewport** (`hx:560-562`). Fonts/CSS vars taken from the first viewport only (`hx:571-577`) | One tab, live reflow via `Emulation.setDeviceMetricsOverride`, no reload (`ext:201-220`) | DIVERGENT | JS that reads `matchMedia` once at boot keeps its first-width state on the extension |
| 4 | Viewport metrics | `setViewport` before `goto` (`hx:514`), then override `deviceScaleFactor: 1/browserDpr` (`api:193-210`); `screenOrientation` always landscape | `w2wViewportMetrics` `deviceScaleFactor: 0` = native DPR, zoom-corrected, portrait for ≤768 (`ext:1124-1160`) | DIVERGENT | Retina ext resolves `srcset` at 2x, API at 1x: different image variants and sizes |
| 5 | Navigation / settle | `goto domcontentloaded` + `waitForNetworkSettled` (`hx:517-519`); reload skipped via `prefetchedFonts` (`api:227-237`) | None (page already loaded); fixed 500ms after each override (`ext:220`) | DIVERGENT (inherent) | |
| 6 | Reduced motion | `page.emulateMediaFeatures` **before navigation** (`hx:462`, impl `api:920-932`) | `Emulation.setEmulatedMedia` mid-session, once, after finishing running animations (`ext:176-177`, impl `ext:1064-1074`); cleared in `finally` (`ext:903`) | EQUIVALENT intent, DIVERGENT mechanism | Boot-time vs late switch; see the prior spec `2026-09-12-ext-vs-url-animation-state.md` |
| 7 | Finish Web Animations | — | Before the switch (`ext:176`) and before every `EXTRACT_DOM` (`ext:264`); expression `ext:1018-1034` | DIVERGENT (ext-only) | API relies on the boot-time `reduce` |
| 8 | Hydration wait | `waitForHydration` (`api:243`, impl `api:865-880`) | `w2wWaitForHydration` (`ext:225`, impl `ext:933-946`) | SAME | Both use `W2W_HYDRATION_EXPRESSION` (`shared/src/w2w-hydration.ts:21,47`) |
| 9 | Auto-scroll | Own copy `api:935-980`: step `max(200, innerHeight-100)` = 800px | Own copy `browser-extension/.../capture/legacy.ts:62-107`: fixed **400px** | DIVERGENT (drifted copies) | Only the API copy was tuned (speed). The step does **not** explain the stripe image misses (experiment below) |
| 10 | Font force-load | `document.fonts.forEach(f => f.load())` (`api:257-270`) | — | DIVERGENT | API fetches every declared face; the ext only has faces the page used |
| 11 | Scrollbar | Measure the deprecated `layoutViewport` (device px) → compensate → inject `html`-only hide style (`api:273-305`) | Hide `html, body` scrollbars **before** measuring (`ext:168`, `ext:971-989`); measure `cssLayoutViewport` (`ext:231-245`, `ext:1097-1108`); restore in `finally` | EQUIVALENT in practice | Headless has no scrollbar and DPR 1, so the API's unit bug is dormant |
| 12 | Content-script injection | `getContentScriptBundle()` → `page.evaluate` in the **main world** (`api:310-323`; `shared/src/content-script-bundle.ts:26`) | Manifest content script, **isolated world**, `EXTRACT_DOM` (`ext:276`; `content/index.ts:39-52`) | SAME code, DIVERGENT context | Bundle = esbuild of `browser-extension/src/content/extractor.ts` (`scripts/bundle-content-script.mjs:30`). Main-world effects are unverified |
| 13 | `extractPage()` internals | fonts/images wait (`extractor.ts:219`), `rasterizeCanvases` (`:141`), pre-capture CSS (`:144`), `$url = currentSrc \|\| src \|\| data-src` (`:487`) | Same | SAME | But **bundle freshness** differs: the container bundle md5 `78b68f98…` ≠ local `dist` `fc1f7bb1…`; local `extractor.ts` has an uncommitted diff (dev-log `skipStats` only, behaviour-neutral in prod) |
| 14 | Platform-font lookup | `CSS.getPlatformFontsForNode`, 16-way concurrent (`api:334-392`) | Sequential (`ext:305-366`) | EQUIVALENT | Both key by `data-w2w-idx`, pick the max-glyph font |
| 15 | Platform-font → TEXT assignment | `enrichAllTextNodes` (`api:997-1044`): **pre-order**, counts synthetic `__w2w-*` wrappers, no live-text guard; overwrites `font` **only when `isCustomFont`** (`api:1029`) | `w2wEnrichAllTextNodes` (`ext:1349-1420`): post-order, skips synthetic frames, live-text guard (`ext:1402-1406`, `w2wReadHostText` `ext:1458-1488`); overwrites `font` **always** (`ext:1415`) | **DIVERGENT (drifted copies)** | API: shifted measurements (80 of 831 hosts on stripe are wrappers). Ext: system fonts' localized names reach `font` (this is the `蘋方-簡` source) |
| 16 | Hover capture | Stylesheet selectors + `w2wFindHoverCandidates`; `forcePseudoState` → 30ms → `__w2w_extractSubtree`; **5s total budget**; **no pre-capture freeze** (`api:404-486`) | Same candidates; 16ms; no budget; re-injects transition-disable CSS around the loop (`ext:396-491`, `content/index.ts:93-103`) | DIVERGENT (drifted copies) | API hover values can be mid-transition and get truncated at 5s (36 captured on stripe per logs) |
| 17 | Tainted `<canvas>` | `captureTaintedCanvases` (`api:502`) | Same (`ext:506`) | SAME | `shared/src/w2w-canvas-shots.ts:116` |
| 18 | WebGL `<canvas>` | — | `captureWebglCanvases` isolated compositor shots (`ext:510`; `webgl-canvas-shots.ts:202`) | DIVERGENT (deliberate) | No GPU on the API; Stripe serves static fallbacks there |
| 19 | Image URL collection | `collectImageUrlsFromW2W`: `$url` **plus every `url()` in `styles.backgroundImage`** (`shared/src/resource-graph.ts:381-409`) | `w2wCollectImageUrls`: `$url` only (`ext:1182-1190`) | DIVERGENT | Renderer looks background fills up by URL (`figma-plugin/src/rendering/fills.ts:254`), so extra background layers are never harvested on the ext path (unmeasured) |
| 20 | Image lookup | Once, after hover: exact → query-stripped → same-pathname fuzzy → `Page.getResourceContent(mainFrame)` with `guessMimeFromUrl` (defaults `image/png`) (`api:510-582`, `api:1098-1108`) | **Per viewport** while the variant is live (`ext:516-521`, `ext:1202-1238`) + final pass + page-context `fetch` with magic-byte MIME sniff (`ext:539-608`, `ext:1246-1264`) | DIVERGENT | Neither recovers a URL the browser never requested. The ext fetch is CORS-bound (fails on `images.stripeassets.com`, measured) |
| 21 | Image conversion/downscale | None server-side | None in the W2W path (`convertToFigmaFormat`/`downscaleToFit` in `cdp/assets.ts` serve only the legacy flow) | EQUIVALENT | Both convert AVIF/WebP in the plugin UI (`main.ts:579-649`, `ui/App.tsx:340`) |
| 22 | @font-face discovery | CSS-domain sheets + resource-graph sheets → shared `parseFontFaceRules` (`api:584-640`) | `extractFonts`: CSS-domain sheets + Google Fonts `<link>` parse (`cdp/fonts.ts:17-84`) | EQUIVALENT (different code) | |
| 23 | Font face filtering | **None**: all faces, deduped by family+weight+style (`api:829`, `api:1047-1055`) | Only faces used by measured or CSS-requested families (`ext:773-839`, `ext:1288-1323`) | DIVERGENT | Feeds `fontDeclaredCuts` / `fontFaceStyles` / `fontVariableFamilies` and the font ZIP |
| 24 | Font binaries + real names | Server binds `fontBase64` (network capture → cache → CDP → server fetch), decompresses WOFF2, stamps `realFamily` (`api:659-805`) | Binaries stay in the URL-keyed `assets`; plugin re-binds and reads SFNT names (`figma-plugin/src/utils/fontDownload.ts:769-804`, WOFF2 via `woff2ToSfnt`) | EQUIVALENT (different code) | The comment at `ext:1335` ("no Brotli for WOFF2") is stale |
| 25 | CSS variables | Shared `extractCSSVariables` (`shared/src/css.ts:657`) + **local** `categorizeCSSVariable` (`api:1058-1079`, also matches values `rgb/hsl/#`) | Same extractor + `background/utils/misc.ts:59` (name-only rules) | DIVERGENT (minor, drifted copies) | Category label only |
| 26 | Serialization | `res.json` over HTTP (`routes/plugin/import.ts:174-188`); frames carry per-viewport `assets` | msgpack → gzip → AES-GCM → scramble `.w2w` (`shared/src/w2w-codec.ts:268-291`, `background/utils/download.ts:88-96`); one shared `assets` map | EQUIVALENT | Lossless for JSON values |

### Plugin side

| # | Step | Path A | Path B | Status | Note |
|---|------|--------|--------|--------|------|
| P1 | UI entry | `ui/pages/import/web/Web.tsx:214-423` | `browserExtension/BrowserExtension.tsx` is instructions only; the file goes through `areaSelection/AreaSelection.tsx:566-692` (decode `:585-607`, `toUnifiedFormat` `:121-220`) | EQUIVALENT | |
| P2 | Quota | Server gate on `/api/import-url` | `POST /api/import-w2w-file` after decode (`AreaSelection.tsx:624-644`; `import.ts:391-425`) | EQUIVALENT | |
| P3 | Block-page check | `looksLikeBlockPage` (`Web.tsx:325-335`) | — | DIVERGENT (deliberate) | |
| P4 | Font-name enrichment | `enrichFontsWithSfntNames` (`fontDownload.ts:859-870`) | `enrichFontsFromAssets` (`fontDownload.ts:769-804`) | EQUIVALENT | Both end in `attachRealNames` |
| P5 | Text mode | `transformW2WTreeText` (`Web.tsx:352-354`) | `transformFramesData` (result unused for W2W frames, `AreaSelection.tsx:442-449`) + `transformW2WTreeText` (`:462-464`) | EQUIVALENT | Wasted work on B |
| P6 | `render-wireframe` payload | `Web.tsx:161-196`: `kind:"url"`, `localStyles`, `pluginColors` from the API (defaults merged) | `AreaSelection.tsx:500-534`: `kind:"extension"`, `config.pluginColors`, no `localStyles` | EQUIVALENT | `localStyles` is not read in `main.ts`; `kind` feeds only the loader history (`main.ts:1495`) and report metadata (`main.ts:1167`) |
| P7 | Tree conversion | `prePassConvertFrames` (`main.ts:403-410`, `utils/preprocessFrames.ts:67-90`) → `convertW2WToWireframe` | Same | SAME | |
| P8 | Assets | Per-frame `capturedData.assets` merged into one `assetsMap` (`main.ts:578-662`) | Same, but every frame points at the same shared map, so a multi-viewport `.w2w` queues each AVIF/WebP N times | SAME (perf nit on B) | |
| P9 | Render + report | `createWireframeFrame`; `recordWarning` categories identical (`nodes.ts:902-909`, `text.ts:1333`, `main.ts:704-713`) | Same | SAME | Report differences come from the data only |

## Plugin-side comparison

A `.w2w` import and a URL import reach the **same** `render-wireframe` handler
(`main.ts:332`) with the same option set: layout, interaction, color, font and text
modes, asset mode, CSS-variable mode, html layer names, geometry rows, origin links, and
the four font maps. The `.w2w` path skips no step and adds none. There is no API image
fetch on either path. Both render from embedded base64 assets, and a miss becomes a
placeholder (`nodes.ts:853-910`). There is no server-side font download on either path
at render time. Placeholder replacement and import-report categories are identical code.

What differs is only what arrives:
- The four font maps are built from different font lists: all faces (A) vs used faces
  (B), with real names read by two different functions.
- `pluginColors` comes from the API response (A) vs the local config (B). This is
  equivalent unless the config lacks a key.
- A multi-viewport `.w2w` does redundant image conversion.

**Conclusion:** every quality difference between the two imports originates on the
capture side. None comes from the plugin.

## Import-report differences explained

### URL import: "Image couldn't be loaded — replaced with a placeholder (7 layers)"

Evidence:
- `docker compose logs api` shows **10** `[W2W] Asset not found: https://images.stripeassets.com/...` per stripe.com import (`api:577`).
- A headless run of the same timing reproduced the same 10 (`img-repro2.mjs`).

1. All 10 are `loading="lazy"` `<img>`s inside `<picture>` at y≈5,900–8,600, including
   `customer-stories__customer-image`, `case-study-card__image` and `testimonial-card__headshot`.
   At extraction time they are `complete:false, naturalWidth:0`.
2. With no `currentSrc`, the extractor records the `<img src>` fallback
   (`extractor.ts:487`). The browser **never requests** that URL: 0 network requests,
   while all 37 Stripe image requests it did make returned 200. Once it loads, it picks
   the `<source>` variant, so after `scrollIntoView` + 1.5s, 7 of 10 loaded and all 10
   had a `currentSrc` different from the recorded `$url`.
3. The API lookup (`api:510-582`) therefore finds nothing: exact, query-stripped,
   pathname-fuzzy and direct CDP all fail. A page-context `fetch` would fail too: CORS,
   measured `Failed to fetch` on all 10.
4. 3 of the 10 sit under `div.customer-stories__customer-content` with
   `visibility:hidden`, which the converter drops (`css-converter.ts:5262-5302`).
   **10 − 3 = 7 placeholders**, exactly the reported count.
5. The auto-scroll step is not the cause. A run with the extension's 400px step
   (`img-repro3.mjs`) misses the same 10.
6. The extension capture has all 10 in `assets`, under their loaded `currentSrc`
   variants (`...payments-hoodie.jpg?w=80&q=90`, `...decagon.png?w=432&q=90`, and so on):
   32 image `$url`s, 0 missing, `resourceMapMisses: 0`. In the owner's live tab these
   images had already been loaded. Presumably the user had scrolled the page; that part is
   unverified.

### Extension: `Typography: Font "蘋方-簡" not available — rendered with "Inter" (8 layers)`

Evidence: in the decoded `.w2w`, 9 TEXT nodes have `font` and `platformFont.familyName`
= `蘋方-簡`, with postScript `PingFangSC-Regular` / `PingFangSC-Light`. They are the
Japanese labels of Stripe's payment mockup: 合計, 続行, 支払い方法, 有効期限, 注文概要,
小計, 消費税. The other 11 CJK nodes measure `Hiragino Sans`, which Figma has, so they
produce no warning.

1. On macOS, `CSS.getPlatformFontsForNode` returns PingFang under a **localized** family
   name, `蘋方-簡`. *Why that locale (zh-Hant) and not "PingFang SC" is unverified.* It
   likely comes from CoreText's localized-name lookup following the OS language list.
   The postScript name is locale-independent.
2. The extension copies it into the TEXT node unconditionally: `child.font =
   font.familyName` (`ext:1415`). The API copy would not have done so, because PingFang
   is a system font (`isCustomFont:false`, gate at `api:1029`).
3. In the plugin, `measuredFamily(platformFamily)` accepts it
   (`css-converter.ts:2311`, `:1258`). `isUsableMeasuredFamily` allows non-ASCII and
   `蘋方-簡` is not a server-fallback pattern (`utils/fontUtils.ts:131-162, 223-233`).
   So the family requested from Figma is `蘋方-簡`.
4. Figma lists the family as "PingFang SC". Name matching normalizes to
   ASCII-alphanumerics, and a pure-CJK name normalizes to `""`, which is deliberately
   never a match (`rendering/fontIndex.ts:146-162`). The run falls back to Inter and
   `text.ts:1333` records the warning. 9 nodes produced 8 layers; presumably two runs
   coalesced into one text layer (unverified).
5. On the URL path the Linux container measures `Noto Sans CJK`. The API keeps the
   CSS-declared `font` (not a custom font), and the plugin discards Noto as a server
   fallback. So no typography warning is raised; the labels render in the CSS family
   instead. *Whether Figma then draws CJK glyphs correctly there is unverified.*

### Layout: "Hidden at capture time (opacity: 0) — skipped": 10 (ext) vs 9 (URL)

Approximating `reportSkippedContent` (`css-converter.ts:5114-5124`: opacity 0, at least
40×24px, carries text/SVG/image, outermost only) over both frames gives 17 vs 16, with
one difference only:

- **`div.hero-wave-animation__static` 1392×975** is at opacity 0 **only in the extension
  capture**. In headed Chrome the WebGL hero wave runs and Stripe fades its static
  fallback out. Headless `--disable-gpu` never starts the wave and leaves the static
  layer visible. This is a GPU difference (the prior spec's H5), not timing. The wave
  itself reaches Figma through `captureWebglCanvases`.

The shared 16 are payments-graphic items, connect-platform success screens, the replay
button, and 7 `squeezy-carousel__item-details`. The report counts 10/9, not 17/16, which
matches the 7 carousel slides being kept by the crossfade exemption
(`css-converter.ts:5278-5287`). That exemption was inferred, not run.

## Ranked divergences

### 1. Lazy `<picture>` images are recorded under a URL the browser never fetched (A: 7 placeholders on stripe)
- **Impact:** high on the URL path. Every lazy image below the fold that hasn't loaded at
  extraction time becomes a grey box. The extension is only immune when the user has
  already scrolled.
- **Evidence:** `extractor.ts:487`; `api:510-582`; logs + `img-repro2/3.mjs`, explained above.
- **Recommendation: unify.** Fix it once in the extractor, which is the shared bundle
  (`browser-extension/src/content/extractor.ts`, shipped to both paths):
  1. Before traversal, promote `loading="lazy"` images in the document to eager and await
     their `decode()`, bounded, like the existing image wait (`extractor.ts:214-238`).
  2. Or resolve the `<source>` candidate the browser would pick instead of the `src`
     fallback.

  Also move one asset-harvest function (resource map + fallbacks) into `@w2w/shared`. On
  the API, a server-side fetch for misses is possible (no CORS in Node), which the
  extension can't do. 🔴 LIVE zone (ext + api + shared).

### 2. Platform-font assignment: two drifted copies
- **Impact:** high for typography.
  - **Path A:** pre-order numbering plus counted synthetic wrappers shift
    `platformFont` across hosts. The converter prefers `platformFamily` for `fontFamily`
    and uses `platformPostScript` for variable-font weight and stretch
    (`css-converter.ts:2311-2315`), so wrong family or weight is possible. Magnitude on
    stripe was not measured.
  - **Path B:** no `isCustomFont` gate, so localized system names (`蘋方-簡`) and OS
    families reach `font`.
- **Evidence:** `api:997-1044` vs `ext:1349-1420`; memory `project_ext-vs-url-divergence-2026-09-08`.
- **Recommendation: unify** into one `@w2w/shared` function: post-order, synthetic skip,
  optional live-text guard, one explicit override policy. Separately, and in the
  plugin's permitted zone: resolve a measured family through `platformPostScript` when
  the family name doesn't match. `PingFangSC-Regular` identifies "PingFang SC", and the
  same approach would fix the Hiragino W-weight mismatch.

### 3. Page state: live headed tab vs fresh headless boot
- **Impact:** medium to high, site-dependent. Evidence:
  - The hero-wave static fallback (+1 hidden layer).
  - WebGL graphics exist only on B.
  - Experiment sections (`wpp_curator_h2`).
  - Lazy-load state (item 1).
  - Reduced motion at boot vs late (+ finish).
- **Recommendation: keep deliberately different**, because GPU, cookies and user state
  are the extension's reason to exist. Share the pieces that are portable:
  - Move `W2W_FINISH_RUNNING_ANIMATIONS_EXPRESSION` (`ext:1018`) into `@w2w/shared`, so
    the API can run the same pre-extraction finish cheaply.
  - Keep `captureWebglCanvases` extension-only.

### 4. Hover capture loop: two drifted copies
- **Impact:** medium. On A there is no transition-disable CSS around the loop (the
  extractor removes its pre-capture CSS at the end of `extractPage`), a 30ms wait, and
  a 5s budget, so hover variants can be mid-transition or missing. On B: freeze CSS,
  16ms, no budget.
- **Evidence:** `api:404-486` vs `ext:396-491` + `content/index.ts:93-103`.
- **Recommendation: unify** the loop in `@w2w/shared`, with an injected "extract
  subtree" callback and "inject/remove freeze" callbacks. The API gets the freeze via
  `page.evaluate` of the bundle's `injectPreCaptureStyles`, which is not exported today.

### 5. Font list sent to the plugin: all faces (A) vs used faces (B)
- **Impact:** medium.
  - It changes the font modal and ZIP content.
  - It changes the `fontDeclaredCuts` / `fontFaceStyles` / `fontVariableFamilies`
    inputs, and with them cut-level markers and weight matching.
  - A also force-loads every face (`api:257-270`).
- **Evidence:** `api:829,1047-1055` vs `ext:773-839`.
- **Recommendation: unify** by moving `w2wCollectCssFontFamilies` / `w2wFilterUsedFonts`
  / `w2wPickFontUrlsToKeep` (`ext:1288-1347`) into `@w2w/shared` and applying them on
  the API.

### 6. Image URL collection and lookup rules
- **Impact:** medium-low.
  - B never harvests second and later `background-image` layers; the renderer looks them
    up by URL (`fills.ts:254`).
  - A's fuzzy pathname match can bind a different `?w=` variant.
  - A's direct CDP fallback labels unknown bytes `image/png` (`api:1098-1108`), while B
    sniffs magic bytes.
  - A harvests once after all layout-touching steps; B harvests per viewport.
- **Evidence:** `resource-graph.ts:381-409` vs `ext:1182-1190`; `api:510-582` vs `ext:1202-1264`.
- **Recommendation: unify** into one shared harvest (see item 1).

### 7. Viewport density and orientation
- **Impact:** medium-low. Image resolution differs: native DPR on B vs 1x on A. The
  mobile orientation flag also differs.
- **Evidence:** `api:193-210,281-291` vs `ext:1124-1160`.
- **Recommendation: unify** the metrics builder in `@w2w/shared`
  (`w2wViewportMetrics`). Whether A should render at 2x is a payload-size decision; keep
  1x deliberately if so.

### 8. Auto-scroll: two drifted copies
- **Impact:** low on stripe (the step change made no difference, per the experiment).
  Risk grows with every future tweak made to one copy only.
- **Evidence:** `api:935-980` vs `legacy.ts:62-107`.
- **Recommendation: unify** as a shared expression in `@w2w/shared`, like the hydration
  wait.

### 9. Multi-viewport strategy
- **Impact:** low to medium on responsive JS sites. A boots fresh per width; B reflows
  one live document. A also takes fonts and CSS variables from the first viewport only.
- **Evidence:** `hx:560-577` vs `ext:201-220`.
- **Recommendation: keep.** A reload closes the extension popup. Document it.

### 10. Content-script bundle freshness and execution world
- **Impact:** latent. The API runs whatever bundle was baked into its image: the
  container md5 differs from local `dist`, and the local extractor has an uncommitted
  diff. `page.evaluate` runs in the page's main world; the extension runs in an isolated
  world.
- **Recommendation:** stamp a bundle hash into `doc` on both paths so a parity diff can
  prove they ran the same extractor. Main-world risk: unverified, monitor.

### 11. Minor copies
- Scrollbar measurement: equivalent today.
- `categorizeCSSVariable`: two rule sets.
- Plugin: `transformFramesData` wasted on B; duplicate AVIF/WebP conversion per viewport
  on B.
- Stale comment `ext:1335`.

Recommendation: fold the scrollbar and CSS-variable helpers into shared when convenient.
The plugin items are safe plugin-zone cleanups.

## Open questions

1. Why does CDP on this Mac report PingFang as zh-Hant `蘋方-簡`? Does it depend on the
   macOS language list? If so, other users will see other localized names (e.g.
   `苹方-简`), which is one more reason to key on `postScriptName`.
2. What does the URL path render for the CJK mockup labels (CSS family, Noto measured)?
   Correct glyphs or tofu in Figma? Not verified.
3. Were the lazy Stripe images loaded in the owner's tab because the user scrolled, or
   does the extension's own flow load them? Test: capture from a fresh tab without
   touching the page.
4. Container bundle md5 `78b68f98…` vs local `fc1f7bb1…`: is this a real content
   difference or build nondeterminism? Both are dated Sep 11 ~18:40 UTC.
5. `cssVariables: 0` in the extension capture: does the API also get 0 on stripe
   (cross-origin sheets make `cssRules` throw in both)? Not logged by the API.
6. How large is the API's platform-font shift (item 2) on stripe in practice: wrong
   weights, or harmless because all Latin text is one family?
7. The crossfade exemption was inferred as the reason the report says 10/9 while the
   approximation says 17/16. Confirm with the dev-log bridge.
