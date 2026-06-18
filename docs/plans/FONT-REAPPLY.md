# Font Re-apply (Website Fonts) — Working Spec

> **სტატუსი:** 🚧 WIP — local dev only. **არ ავტვირთოთ / არ ვაფუშოთ / არ გამოვაქვეყნოთ**
> სანამ ფუნქცია ყველა case-ზე გამართულად არ იმუშავებს (owner sign-off).
> **თარიღი:** 2026-06-15

---

## 1. /Goal — საბოლოო მიზანი

ფუნქცია უნდა გამოიძახებოდეს **მხოლოდ მაშინ**, როცა ვებ-გვერდზე გამოყენებულია
ისეთი ფონტი, რომელიც მომხმარებელს **ფიგმაში არ აქვს დაინსტალირებული**.

ამ შემთხვევაში:
1. მომხმარებელს უნდა შეეძლოს **მხოლოდ აკლია-ფონტების** ZIP-ად ჩამოტვირთვა
   (არა ყველა ფონტის — **მხოლოდ ის, რაც ფიგმაში არ არის**).
2. ჩამოტვირთვისა და **ფიგმაში დაინსტალირების** შემდეგ, მომხმარებელმა უნდა
   შეძლოს ამ ფონტების უკან **Re-apply** ღილაკით დაბრუნება ტექსტებზე.
3. სანამ ფონტები დაინსტალირდება, ტექსტი ფიგმაში უნდა იყოს რაიმე **დროებითი
   დასახელებით / placeholder-ით** (font variable ან სხვა — *გადასაწყვეტია*).
4. Re-apply ღილაკმა უნდა იმუშავოს მას შემდეგ, რაც user **მონიშნავს**
   ჩამოტვირთულ frame-ს ან მთლიან section-ს (ან მთელ გვერდს, თუ არაფერია
   მონიშნული).
5. ეს ცალკე ფუნქციაა — **კარგად უნდა აიხსნას Settings → Configuration-ში
   და Terminology-ში.**

---

## 2. რა არის ეს ფუნქცია

ცალკე, კონტექსტური ფუნქცია, რომელიც ეხება **მხოლოდ** `fontMode = "website"`-ს
(„Website Fonts"). მისი დანიშნულებაა, რომ მომხმარებელმა მიიღოს 1:1 ფონტური
სიზუსტე მაშინაც, როცა საიტის ფონტი ფიგმაში დაინსტალირებული არ არის.

---

## 3. როგორ მუშაობს ახლა (current architecture)

### 3.1 ნაკადი (flow)

```
იმპორტი (fontMode = "website")
  → sandbox: collectAllFonts(frames)               // აგროვებს ფრეიმებში ნახმარ ფონტებს
  → sandbox: checkFontsAvailability(allFonts)        // → { missing[] }
  → თუ missing.length > 0:
      → buildFontsNotAvailableMessage(missing, ...)
      → postMessage "fonts-not-available"            // UI-ს მისდის
  → UI: FontFallbackModal იხსნება
      → "Download & install fonts later" → ZIP
      → render fallback-ით (Inter), თითო TEXT node-ს ედება
        pluginData marker: w2w_original_font = <original family>
  → user აინსტალირებს ფონტებს (ფიგმის გარეთ)
  → user აჭერს "Re-apply fonts" (footer center / Settings → Fonts)
      → postMessage "rebind-original-fonts"
      → sandbox: rebindOriginalFonts(scope)          // selection ან მთელი გვერდი
          → ყველა TEXT, რომელსაც აქვს w2w_original_font marker
          → ცდილობს original ფონტის უკან დადებას
      → toast: "Re-applied N / M …" / "still missing: …"
  → footer-ის "Re-apply fonts" ღილაკი = კონდიციური (rebindableCount > 0)
```

### 3.2 მთავარი ფაილები

| ფაილი | როლი |
|-------|------|
| `packages/figma-plugin/src/main.ts` | `collectAllFonts`, `checkFontsAvailability`, `buildFontsNotAvailableMessage`, `count-rebindable-fonts` handler (~75-97), `rebind-original-fonts` handler (~855-934), `postRebindableCount` (~75) |
| `packages/figma-plugin/src/rendering/rebindFonts.ts` | `rebindOriginalFonts`, `collectTextNodesIn`, `ORIGINAL_FONT_PLUGIN_KEY = "w2w_original_font"`, `REBOUND_DONE_PLUGIN_KEY = "w2w_rebound_done"` |
| `packages/figma-plugin/src/utils/fontDownload.ts` | `buildFontDownloadEntries`, `createFontsZipBlob` (ZIP-ის აწყობა) |
| `packages/figma-plugin/src/ui/components/modalPopup/FontFallbackModal.tsx` | modal UI, download, `fontDownloads`, `extractedFonts` props |
| `packages/figma-plugin/src/ui/pages/import/{web,html,areaSelection}/*.tsx` | `buildFontDownloads(missingFonts, extractedFonts)`, FontFallbackModal-ის render |
| `packages/figma-plugin/src/ui/App.tsx` | `rebindableCount` state + `rebindable-count` listener + `showRebindFonts` prop |
| `packages/figma-plugin/src/ui/components/footer/Footer.tsx` | კონდიციური "Re-apply fonts" ღილაკი (center) |
| `packages/figma-plugin/src/ui/components/modalPopup/Settings.tsx` | "Re-apply original fonts" ღილაკი (Fonts section) |

### 3.3 ფონტის-სახელების სამი წყარო (⚠️ აქ არის პრობლემის ფესვი)

ამჟამად სამი **განსხვავებული** წყაროა და ერთმანეთს არ ერგება:

1. **„გამოყენებული" ფონტები** — `collectAllFonts(frames)` → რას ედება TEXT node-ებს.
2. **„Missing" სია** — `checkFontsAvailability` → მომხმარებელს რას ვაჩვენებთ modal-ში.
3. **`extractedFonts` (@font-face)** — საიტის CSS-ში დეკლარირებული, **ჩამოსატვირთი**
   რეალური ფონტები (URL-ებით).

ZIP იწყობა `buildFontDownloads(missingFonts, extractedFonts)`-ით — ანუ **missing**
სახელებს ადარებს **extractedFonts** @font-face-ებს. თუ სახელები არ ემთხვევა →
ჩამოიტვირთება არასწორი (ან არცერთი) ფონტი.

---

## 4. 🐛 აღმოჩენილი ბაგი (ტესტი 2026-06-15)

ტესტმა აჩვენა **სრული mismatch** სამ წყაროს შორის:

- **გადმოიწერა სრულიად სხვა ფონტები:** ZIP-ში იყო
  `Inter-{Regular,Medium,SemiBold}` და `Space-Grotesk-Light-{...}` — ანუ
  `extractedFonts`-დან (@font-face).
- **Missing-ში სხვა ფონტები ჩანდა:** toast — *„Re-applied 0 / 4 — still missing:
  **Liberation Sans, Noto Sans CJK JP**"*.
- **Frame-ზე არცერთი ტექსტი არ იყო** იმ ფონტებით, რომლებიც missing-ში ეწერა.

### 4.1 Root-cause ჰიპოთეზები (გამოსაკვლევი)

> ⚠️ ჯერ დაუდასტურებელი — fix-ის წინ უნდა გადამოწმდეს.

- **H1 — server-side Linux fallback:** URL იმპორტი API-ს მხარეს Puppeteer-ით
  (Linux/Render) ხდება. headless Chromium-ში computed font resolve-დება
  **Linux fallback**-ებად (`Liberation Sans` = Arial-ის Linux ანალოგი,
  `Noto Sans CJK JP` = CJK fallback). ანუ `collectAllFonts` იღებს **სერვერის
  fallback-ებს**, არა საიტის რეალურ ფონტებს. ⇒ missing სია "მცდარია".
- **H2 — ორი წყაროს გაუთანაბრებლობა:** `missing` (computed family names) ≠
  `extractedFonts` (@font-face family names). `buildFontDownloads` ვერ აკავშირებს.
- **H3 — marker mismatch:** TEXT node-ებს `w2w_original_font` marker-ად ედება
  computed family (Liberation Sans), მაგრამ ჩამოტვირთული ფონტი Inter-ია →
  re-apply ვერ პოულობს დამთხვევას → „still missing".

### 4.2 რას ნიშნავს ეს

ძირითადი დეფექტი: **ფონტის იდენტობის ერთიანი, სანდო წყარო არ გვაქვს.**
ნაცვლად სამი გაუთანაბრებელი სიისა, გვჭირდება **ერთი reconcile-ებული რუკა**:
„გვერდზე რეალურად ნახმარი ფონტი → მისი @font-face download → Figma availability".

---

## 5. სასურველი ქცევა (target behavior)

1. **Trigger:** მხოლოდ მაშინ, როცა *რეალურად ნახმარი* საიტის ფონტი ფიგმაში არ არის.
   (server-side fallback-ები არ უნდა ჩაითვალოს „ნახმარ" ფონტებად.)
2. **Download:** ZIP-ში მხოლოდ **ის** ფონტები, რომლებიც (ა) რეალურად ნახმარია და
   (ბ) ფიგმაში არ არის — და რომელთა @font-face download **არსებობს**.
3. **Marker:** TEXT node-ს ედება იმ ფონტის სახელი, რომელიც **ემთხვევა**
   ჩამოსატვირთ/დასაინსტალირებელ ფონტს (და არა server fallback-ს).
4. **Placeholder (გადასაწყვეტი):** სანამ ფონტი დაინსტალირდება, ტექსტი ჩანს
   დროებითი ფონტით/variable-ით; დასახელება ცხადად მიანიშნებს რომ ეს დროებითია.
5. **Re-apply:** მუშაობს მონიშნულ frame/section-ზე (ან მთელ გვერდზე, თუ არაფერია
   მონიშნული); re-apply-ის შემდეგ ღილაკი ქრება (count → 0).
6. **დოკუმენტაცია:** Settings → Configuration **და** Terminology-ში ცალკე,
   კარგად ახსნილი ბლოკი ამ ფუნქციაზე.

---

## 6. ღია კითხვები / გადასაწყვეტი

- [ ] **Placeholder სახელი:** Figma variable? prefix-იანი ფონტის სახელი
      (მაგ. `[W2W] Inter`)? თუ უბრალოდ fallback + marker? — UX-ის მიხედვით.
- [ ] **server-side fonts:** როგორ გავფილტროთ Linux fallback-ები
      (`Liberation Sans`, `Noto Sans CJK JP`, `DejaVu *`…)? black-list თუ
      „მხოლოდ @font-face-ით დადასტურებული ფონტები ითვლება"?
- [ ] **წყაროების reconcile:** `collectAllFonts` ↔ `extractedFonts` ↔
      `checkFontsAvailability` — ერთ რუკაში გაერთიანება. სად (sandbox vs UI)?
- [ ] **URL vs Extension/HTML იმპორტი:** ბაგი მხოლოდ URL (server-side) გზაზეა,
      თუ ყველა გზაზე? (Extension content-script computed-ფონტებს client-side
      იღებს — შესაძლოა იქ სხვა ქცევაა.) — გადასამოწმებელია თითო case.
- [ ] **Google Fonts vs self-hosted:** `isGoogleFont` შემთხვევაში download
      წყარო სხვაა — ცალკე გზა გვჭირდება თუ ერთიანი?

---

## 7. შეზღუდვები / scope

- ცვლილებები **მხოლოდ** `packages/figma-plugin`-ში (LIVE zone — `api`,
  `shared`, `browser-extension` — **არ ვეხებით**).
- **არ ვაქვეყნებთ** სანამ owner არ დაადასტურებს რომ ფუნქცია ყველა case-ზე
  მუშაობს.
- `USE_PRODUCTION = false` ნებისმიერი git ოპერაციის წინ.

---

## 8. გასატესტი case-ები (acceptance)

- [ ] URL იმპორტი, self-hosted @font-face (მაგ. Inter, Space-Grotesk)
- [ ] URL იმპორტი, Google Fonts
- [ ] საიტი, რომელსაც **ყველა** ფონტი ფიგმაში **აქვს** → modal **არ** გამოდის
- [ ] საიტი CJK/non-Latin ფონტებით
- [ ] Extension (.w2w) იმპორტი — client-side computed fonts
- [ ] HTML იმპორტი
- [ ] Re-apply მონიშნულ frame-ზე vs მთელ გვერდზე
- [ ] Re-apply-ის შემდეგ ღილაკი ქრება; count განახლდება page-switch-ზე
