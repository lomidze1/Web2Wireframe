# Launch Polish Audit — Website + Checkout (Task "D")

**თარიღი:** 2026-06-06 · **სტატუსი:** ✅ კოდის fix-ები გაკეთებულია + verified (build/test green). owner manual-verify + commit დარჩა.

**გაკეთებული:** Part A (HowItWorks placeholders), Part B1 (Home comparison table), Part B2 (Settings copy), Part C (Flitt `lang:"en"` + order_desc bug). Part D — ცვლილება არ სჭირდებოდა.
**TODO (owner):** how-it-works რეალური screenshots; Flitt portal logo/branding.

ეს დოკუმენტი აჯამებს საბოლოო polish-ის აუდიტს — Flitt checkout, plan modal-ები,
how-it-works სურათები, docs templates. რომ ხელახლა აღარ გავარკვიოთ.

---

## 1. Flitt checkout გვერდის დიზაინი

**მიგნება:** checkout გვერდი **Flitt-ის hosted გვერდია** (`pay.flitt.com`). ვაგზავნით
redirect-ით (`packages/api/src/services/flittService.ts:243` → `/api/checkout/url`
აბრუნებს `checkout_url`-ს, browser ხსნის ახალ tab-ში).

**კოდიდან ვაკონტროლებთ:**
- `order_desc` — პროდუქტის სახელი გვერდზე ("Web2Wireframe Pro — 1 Month/1 Year",
  `packages/api/src/models/License.ts:119`)
- ⚠️ `lang` პარამეტრს **არ ვაგზავნით** — Flitt მხარს უჭერს `en/ka/ru/uk`-ს
  (`docs/archive/Flitt.md:198`). გასწორებადია კოდიდან → `lang: "en"`.

**🔴 portal-only (კოდით ვერ შეიცვლება):** logo, ფერები, თემა, layout =
**Flitt merchant portal**-ის კონფიგი. checkout-ის გარეგნობის შესაცვლელად owner-მა
Flitt portal-ში უნდა ატვირთოს logo/branding.

**Latent bug:** subscription-path `order_desc` ("Monthly Subscription") yearly-ზეც
hardcoded-ია (`flittService.ts:230`). მაგრამ launch one-time path-ს იყენებს
(`flittService.ts:339` → `getProOrderDescription(duration)` სწორია). დაბალი პრიორიტეტი.

---

## 2. Plan modal-ები + feature consistency

**წესი (owner-confirmed):** Free-ს აქვს **ყველაფერი** (ყველა viewport, color, font,
hover, styles, font-download) — ერთადერთი ლიმიტი = **10 import/თვე**. ერთიანი ლოგიკა
Web + Browser Extension + Plugin-ში.

**ქცევა კოდში — უკვე სწორია:**
- სერვერი მხოლოდ import count-ს ზღუდავს (`packages/api/src/middleware/licenseGate.ts`),
  feature gating არსად
- Plugin — feature gating არ აქვს
- Browser Extension — feature gating არ აქვს

**ფასები — ყველგან თანმიმდევრულია** ($16/30d, $144/365d, 10/mo, unlimited): web
`PricingModal.tsx`/`Pricing.tsx`/`Renew.tsx`/`Terms.tsx`/Docs Pricing*/`seo/config.ts`+
`schemas.ts`; plugin `Plan.tsx`/`QuotaExceededModal.tsx`/`ExpiringSoonModal.tsx`. ✓

**❌ არასწორი COPY (fix საჭიროა):**
1. `packages/web/src/pages/Home/Home.tsx:74-82` — comparison table free სვეტი
   მთლიანად არასწორია: Colors "Plugin only", Fonts "Plugin only",
   Viewports "Only: 1920, 1440", Text "Placeholders only", Styles "No",
   Hover "No", Font download "No". **ეწინააღმდეგება წესს და `Pricing.tsx`-ს.**
   → free უნდა იყოს "Yes"/"Full access" ყველგან; მხოლოდ Imports (10 vs Unlimited)
   და Support (Community vs Priority) განსხვავდება.
2. `packages/figma-plugin/src/ui/components/modalPopup/Settings.tsx:257` —
   "sizes may be locked depending on your plan" — locking არ არსებობს, შეცდომაში
   შემყვანია. → წავშალოთ/გავასწოროთ.

**✓ უკვე სწორი:** `Pricing.tsx` `FREE_FEATURES` ("Full features — same fidelity
as Pro", "All colors, fonts & viewports").

ℹ️ წვრილი (არა blocker): ფასები ~12 ადგილას hardcoded-ია, single source არ არის.

---

## 3. How it works — ძველი სურათები → Template placeholders

**ფაილი:** `packages/web/src/pages/HowItWorks/HowItWorks.tsx`

რეალური PNG-ები 2 ადგილას:
- **Card cover** (`cardImage`, line 284–292) — 7 ცალი (`card-cover/*.png`)
- **Expand panel screenshots** (`details.screenshots`, line 336–355) — 14 ცალი
  (`card-details/*.png`)
- card-icons (line 262–272) — პატარა generic icon-ები, **რჩება**

**გეგმა:** cover + detail screenshots → Docs-ის placeholder pattern
(`packages/web/src/pages/Docs/Docs.module.scss:314` `.imagePlaceholder` — ნაცრისფერი
dashed box). PNG ფაილები assets-ში რჩება (owner დღეს/ხვალ გადაიღებს და დააბრუნებს).

**⏳ TODO (owner, დღეს ან მაქს. ხვალ):** how-it-works-ის რეალური screenshots
გადაღება + ატვირთვა (placeholders-ის ჩანაცვლება).

---

## 4. Docs templates — ✅ ცვლილება არ სჭირდება

`packages/web/src/pages/Docs/pages/*` უკვე იყენებს `.imagePlaceholder` pattern-ს —
ეს არის #3-ის reference. შესაცვლელი არაფერია.
