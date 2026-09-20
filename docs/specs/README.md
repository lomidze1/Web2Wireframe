# `specs/` — გამოკვლევები და fix-გეგმები

ერთი კონკრეტული ბაგის ან ქცევის სიღრმისეული ანალიზი: სიმპტომი → დადასტურებული
მიზეზი → გეგმა. ყველა მათგანი **რეალურ დამპზეა** აგებული, არა ვარაუდზე.

**რითი განსხვავდება მეზობლებისგან:**

| საქაღალდე | რა |
|---|---|
| `specs/` | ერთი ბაგი / ერთი ქცევა — ანალიზი და fix-გეგმა |
| [`plans/`](../plans/) | დიდი, მრავალეტაპიანი სამუშაო (payment system, capture adoption) |
| [`decisions/`](../decisions/) | დახურული გადაწყვეტილება — „რატომ ასე" |
| [`pending-specs/`](../pending-specs/) | **ტესტ-ფაილები**, რომლებიც იმპლემენტაციას ელოდება |

## სტატუსი — გადამოწმებულია კოდთან 2026-09-20

| სპეცი | სტატუსი | მტკიცებულება |
|---|---|---|
| [ext-reduced-motion-fix](./2026-09-12-ext-reduced-motion-fix-plan.md) | ✅ დანერგილი | `w2wEmulateReducedMotion()` — `packages/browser-extension/src/background/capture/w2w.ts:178` |
| [ext-webgl-canvas-shots](./2026-09-12-ext-webgl-canvas-shots-plan.md) | ✅ დანერგილი | canvas bitmap pre-pass — `content/extractor.ts:166` |
| [ext-video-frame](./2026-09-13-ext-video-frame-plan.md) | ✅ დანერგილი | `captureVideoFrames()` — `content/video-frame.ts` |
| [figma-image-limit](./2026-09-13-figma-image-limit-plan.md) | ✅ დანერგილი | 4096px downscale — `figma-plugin/src/rendering/fills.ts:80` |
| [lazy-image-promotion](./2026-09-13-lazy-image-promotion-plan.md) | ✅ დანერგილი | `promoteLazyImages()` — `content/extractor.ts:258` |
| [bleed-wrapper-maxwidth](./2026-09-13-bleed-wrapper-maxwidth-plan.md) | ✅ დანერგილი | `__tests__/render-bleed-wrapper-constraints.test.ts` |
| [**ext-data-url-asset-dedup**](./2026-09-12-ext-data-url-asset-dedup-plan.md) | 📋 **ღიაა** | `assets[url]` ისევ მთლიან `data:` URL-ს იყენებს key-ად (`background/cdp/assets.ts:478`). ~20 MB დუბლიკატი stripe-ის capture-ში |
| [opacity-zero-research](./2026-09-17-opacity-zero-research.md) | 🚧 მიმდინარე | reveal-scroll კოდი დაწერილია, **uncommitted** (🔒 LIVE ზონა) |
| [import-warnings-audit](./import-warnings-audit.md) | 🔬 აუდიტი | Batch A ჩაშვებულია; დანარჩენი გახსნილი რეესტრია |
| [url-vs-ext-pipeline-parity](./2026-09-12-url-vs-ext-pipeline-parity.md) | 🔬 კვლევა | ორი იმპორტის გზის სრული შედარება — მუდმივი საცნობარო |
| [ext-vs-url-animation-state](./2026-09-12-ext-vs-url-animation-state.md) | 🔬 კვლევა | reduced-motion-ის ფესვის ანალიზი; fix-ი ცალკე სპეცშია |

✅ = კოდში ჩაშვებულია. ისტორიისთვის რჩება — **აღარ არის სამოქმედო.**
📋 / 🚧 = აქ არის დარჩენილი სამუშაო.

## ახალი სპეცის დამატება

`YYYY-MM-DD-<slug>.md` — და **დაამატე ხაზი ზემოთ ცხრილში.**
ინდექსის გარეშე ფაილი იკარგება: სწორედ ამიტომ იწვა აქ 9 სპეცი 2026-09-13-დან
2026-09-20-მდე ისე, რომ არსად ბმული არ ჰქონდა.
