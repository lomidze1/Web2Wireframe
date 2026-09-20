# Import Improve — სამუშაო ინსტრუქცია Claude-სთვის

ეს დოკუმენტი აღწერს **ერთადერთ სწორ პროცესს** იმისთვის, რომ Web2Wireframe-ის
იმპორტის ხარისხი გავაუმჯობესოთ კონკრეტული ვებსაიტის მაგალითზე.

> **წაიკითხე ბოლომდე სანამ რამეს გააკეთებ.** პროცესს აქვს **2 დედა ფაზა** და მათი
> არევა აკრძალულია: ჯერ **სრულად** ისწავლი და ჩამოწერ ყველა პრობლემას, მერე იწყებ
> სათითაოდ გამოსწორებას.

---

## 0. შესავალი — რას მიიღებ და სად

### Input (რას გაძლევს გიორგი)

| # | რა | ფორმატი | სად |
|---|-----|---------|-----|
| 1 | **ვებსაიტის ლინკი** | `https://example.com/page` | chat-ში |
| 2 | **რეალური საიტის სურათი** | PNG/JPG screenshot | codebase-ის საქაღალდეში ან Figma-ში ატვირთული |
| 3 | **Figma frame-ის URL** | `https://www.figma.com/design/<fileKey>/...?node-id=1234-5678` | chat-ში — ეს არის **უკვე დაიმპორტებული** შედეგი |

### სამუშაო საქაღალდე

გიორგი ქმნის repo root-ში საქაღალდეს ვებსაიტის სახელით:

```
Web2Wireframe/
└── _archive/import-improve/        ← gitignored (მძიმე screenshot/dump)
    └── NN - <website-host>/          ← მაგ. `01 - www.iwm.org.uk`
    ├── screenshot.png          ← რეალური საიტის სურათი (მან ჩადო)
    └── ...                     ← შენ აქ წერ ყველა artifact-ს
```

**ყველა შენს მიერ შექმნილი ფაილი ამ საქაღალდეში იწერება** — არა repo root-ში,
არა `docs/`-ში, არა scratchpad-ში. კონკრეტულად:

- `findings.md` — ფაზა 1-ის შედეგი (განსხვავებების sheet)
- `figma-frame.png` — Figma REST API-დან გადმოწერილი რენდერი
- `figma-tree.json` — layer tree (თუ დაგჭირდა)
- `issue-NN-<slug>.md` — თითოეული პრობლემის კვლევის ჩანაწერი (ფაზა 2)

### თუ რომელიმე input აკლია

**ნუ დაიწყებ გამოცნობით.** ჰკითხე გიორგის და დაელოდე. კონკრეტულად:
- ლინკი არ არის → ვერ ისწავლი საიტს ღრმად → **გაჩერდი**
- სურათი არ არის → ჰკითხე; დროებით შეგიძლია Playwright-ით თვითონ გადაიღო, მაგრამ
  **აუცილებლად თქვი რომ შენი screenshot-ია** და არა მისი reference
- Figma URL არ არის → ვერ შეადარებ → **გაჩერდი**

---

## 🔴 ხისტი წესები (ვრცელდება ორივე ფაზაზე)

1. **LIVE ზონა.** `packages/api/`, `packages/shared/`, `packages/browser-extension/` —
   Edit/Write **აკრძალულია**. თუ root fix მათ შეხებას მოითხოვს → **გაჩერდი და ჰკითხე
   გიორგის**, ახსენი რატომ არის სხვა გზა შეუძლებელი. თავისით არ შეეხო.
   დაშვებული აქტიური ზონა = `packages/figma-plugin/`.
2. **კოდს არ ცვლი თანხმობის გარეშე.** ჯერ აჩვენე რას აპირებ → დაელოდე → მერე შეცვალე.
3. **Plan Mode სავალდებულოა** ყოველი fix-ისთვის (`EnterPlanMode` / `ExitPlanMode`,
   არა უბრალო ტექსტი).
4. **TDD** — ტესტი იწერება იმპლემენტაციამდე და ჯერ **წითლად** უნდა ჩავარდეს.
5. **Verify before commit** — commit/push მხოლოდ მას შემდეგ, რაც გიორგიმ **ხელით
   დაადასტურა Figma-ში** რომ მუშაობს.
6. **`USE_PRODUCTION = false`** (`packages/figma-plugin/src/ui/shared/apiConfig.ts`) —
   ნებისმიერი `git add`/`commit`/`push`-ის წინ.
7. **არასოდეს** `Read`/`cat`/`grep` `.env` ფაილებზე და `~/.figma_token`-ზე.

---

# ფაზა 1 — შესწავლა და პრობლემების ჩამოწერა

> **მიზანი:** სრული, ობიექტური სია იმისა, თუ რა განსხვავდება რეალურ საიტსა და
> დაიმპორტებულ Figma frame-ს შორის.
> **ამ ფაზაში კოდს არ ეხები. საერთოდ. არც ერთ ფაილს.**

## 1.1 — შეისწავლე ვებსაიტი

ეს არის **ჭეშმარიტების წყარო** (source of truth). სურათი და Figma frame მხოლოდ
წარმოებულებია.

გახსენი საიტი ბრაუზერით (Playwright MCP ან in-app Browser pane) და ჩაიწერე:

- **გვერდის სტრუქტურა zoom-out-ით:** რამდენი სექციაა, რა თანმიმდევრობით
- **Layout მოდელი თითო სექციაზე:** grid / flex-row / flex-column / float / absolute / sticky
- **ტიპოგრაფია:** font-family (რეალურად დარენდერებული, არა მხოლოდ CSS request),
  size, weight, line-height, letter-spacing
- **ფერები და fill-ები:** solid / gradient / background-image / backdrop-filter
- **მედია:** `<img>`, `<svg>` (inline თუ sprite), `<video>` + poster, icon fonts, GIF
- **სპეციალური ქცევები:** carousel, accordion, tabs, sticky header, lazy-load,
  `overflow: hidden` clipping, `position: fixed`
- **Viewport:** რომელ სიგანეზეა გადაღებული reference სურათი — იგივე სიგანეზე ნახე საიტი

დაფიქსირე კონკრეტული რიცხვები, არა შთაბეჭდილება. მაგ. `getComputedStyle`-ით:

```js
// Playwright: browser_evaluate
const el = document.querySelector('SELECTOR');
const cs = getComputedStyle(el);
({ display: cs.display, gap: cs.gap, font: cs.font, rect: el.getBoundingClientRect() })
```

## 1.2 — შეისწავლე reference სურათი

`Read` tool-ით გახსენი `_archive/import-improve/NN - <website-host>/`-ში მდებარე screenshot.

- ეს არის **ვიზუალური ეტალონი** — როგორ *უნდა* გამოიყურებოდეს შედეგი
- გადაამოწმე: ემთხვევა თუ არა ის, რაც ბრაუზერში ნახე? (საიტი შეიძლება შეცვლილიყო,
  ან სურათი სხვა viewport-ზე/სხვა A-B ვარიანტზეა)
- **თუ სურათი და ცოცხალი საიტი არ ემთხვევა — მიუთითე ეს გიორგის და ჰკითხე რომელია
  ეტალონი.** ნუ გადაწყვეტ თვითონ.

## 1.3 — შეისწავლე დაიმპორტებული Figma frame

**გამოიყენე Figma REST API, არა Figma MCP tool-ები** (MCP-ის კვოტა ამოწურულია —
View seat = 6 call/თვე). დეტალები: auto-memory `reference_figma-rest-access`.

URL-იდან ამოიღე `fileKey` და `node-id`; `node-id=4524-3747` → API-სთვის `4524:3747`.

```bash
# PNG რენდერი — ორნაბიჯიანი
curl -s -H "X-Figma-Token: $(cat ~/.figma_token)" \
  "https://api.figma.com/v1/images/<FILE_KEY>?ids=<NODE_ID>&format=png&scale=2"
# → პასუხიდან აიღე signed URL → curl -o "<site folder>/figma-frame.png" "<URL>"
```

```bash
# Layer tree — depth-ით შეზღუდე, სრული ხე 300KB+ არის
curl -s -H "X-Figma-Token: $(cat ~/.figma_token)" \
  "https://api.figma.com/v1/files/<FILE_KEY>/nodes?ids=<NODE_ID>&depth=4" \
  -o "<site folder>/figma-tree.json"
```

- **PNG** → `Read` tool-ით ნახე და ვიზუალურად შეადარე reference-ს
- **JSON** → დაამუშავე `jq`/`python3 -c`-ით; ის შეიცავს `name`, `type`, `children`,
  `absoluteBoundingBox`, `fills`/`strokes`/`effects`, `layoutMode` + padding/spacing,
  ტექსტისთვის `characters` + `style` (font/size/weight/line-height)
- JSON გიჩვენებს იმას, რასაც PNG ვერ: layer-ების იერარქიას, auto-layout რეჟიმს,
  ფონტის რეალურ სახელს, დაკარგულ/ცარიელ frame-ებს

⚠️ `/v1/files/...` → **401/403** ნიშნავს რომ **ტოკენს ვადა გაუვიდა**. ნუ ეძებ სხვა
მიზეზს, ნუ გადახვალ MCP-ზე — უთხარი გიორგის რომ ტოკენი უნდა განაახლოს.

## 1.4 — შეადგინე განსხვავებების sheet

ჩაწერე `_archive/import-improve/NN - <website-host>/findings.md`-ში. ფორმატი:

```markdown
# <website> — Import Findings
Reference: <URL> · viewport <W>px · Figma node <node-id> · <date>

| # | სექცია / ელემენტი | რეალურ საიტზე | Figma-ში დაიმპორტდა | Severity | ვარაუდი: სად |
|---|-------------------|----------------|---------------------|----------|--------------|
| 1 | Hero heading | Inter Bold 56px, 1 ხაზი | Inter Regular 56px, 2 ხაზად გადატანილი | 🔴 P0 | render (text) |
| 2 | Pricing cards | 3-სვეტიანი grid, gap 24 | ერთმანეთზე დაწყობილი, gap 0 | 🔴 P0 | render (layout) |
| 3 | Footer icons | 6 SVG icon | ცარიელი frame-ები | 🟡 P1 | extraction (svg) |
```

წესები:

- **ერთი მწკრივი = ერთი დამოუკიდებელი პრობლემა.** თუ ერთი root cause-ია, გააერთიანე
  და ასე დაწერე („ერთი მიზეზი, 4 ადგილას ჩანს").
- **Severity:** 🔴 P0 = სტრუქტურა/კონტენტი იკარგება ან სრულიად არასწორია ·
  🟡 P1 = შესამჩნევი ვიზუალური სხვაობა · 🔵 P2 = წვრილმანი polish
- **„ვარაუდი: სად"** = ჰიპოთეზა (`extraction` / `render` / `api-transport`), არა დასკვნა.
  ფაზა 2-ში დაამტკიცებ ან უარყოფ.
- დაალაგე severity-ის მიხედვით, ზემოდან ქვემოთ.
- **არაფერს არ ასწორებ ამ ეტაპზე.**

## 1.5 — Gate: აჩვენე გიორგის

წარუდგინე `findings.md` და ჰკითხე:
- ყველა პრობლემა დაიჭირე? რამე გამომრჩა?
- პრიორიტეტი სწორია? რომლით დავიწყოთ?

**მისი დადასტურების გარეშე ფაზა 2-ში არ გადახვიდე.**

---

# ფაზა 2 — სიღრმისეული კვლევა და გამოსწორება, სათითაოდ

> **მიზანი:** `findings.md`-ის თითოეული მწკრივი ცალკე, ბოლომდე გავიდეს ციკლს.
> **ერთდროულად მხოლოდ ერთი პრობლემა.** N პრობლემა = N-ჯერ გამეორებული ეს ციკლი.

ყოველი პრობლემისთვის შექმენი `_archive/import-improve/NN - <website-host>/issue-NN-<slug>.md`
და იქ აწარმოე ჩანაწერი ნაბიჯების მიხედვით.

## 2.1 — ღრმად შეისწავლე ეს ადგილი ვებსაიტზე

დაუბრუნდი საიტს და **მხოლოდ ამ ერთ ადგილს** დააკვირდი.

- იპოვე ზუსტი DOM კვანძი; ჩაიწერე selector-ი
- `getComputedStyle` სრულად — არა 2-3 property, არამედ ყველაფერი, რაც ამ ქცევაზე მოქმედებს
- `getBoundingClientRect()` მშობელზე და თითოეულ შვილზე
- გამორჩეული ეჭვის საგნები: pseudo-elements, `::before/::after` spacer-ები,
  negative margin, `transform`, `position: absolute` მშობლის მიღმა, `overflow: hidden`,
  CSS custom properties, media queries, `@font-face` src-ის რიგი, lazy-load placeholder
- **დაწერე ერთი წინადადებით:** „ბრაუზერი ამას ასე რენდერავს, იმიტომ რომ ___"

## 2.2 — იპოვე კოდში, სად ვამუშავებთ ამ ნაწილს

ორი მხარეა და **ორივე უნდა შეამოწმო**:

| მხარე | სად | რას აკეთებს |
|-------|-----|-------------|
| **Extraction** | `packages/browser-extension/src/content/extractor.ts` (`extractPage()`) | DOM traversal, 70+ CSS property, geometry, pseudo-elements, SVG inlining |
| | `packages/browser-extension/src/background/cdp/` | ფონტები, assets, CSS variables, hover state |
| **Transport** | `packages/shared/src/` | ტიპები + გაზიარებული parsing (მაგ. font-css-parser) |
| | `packages/api/src/` | `/api/import-w2w`, ფონტების მოძიება, screenshot AI |
| **Render** | `packages/figma-plugin/src/rendering/css-converter.ts` | CSS → Figma properties |
| | `packages/figma-plugin/src/rendering/nodes.ts` | recursive node builder |
| | `layout.ts` · `text.ts` · `fills.ts` · `gradients.ts` · `styles.ts` · `realImages.ts` · `placeholders.ts` | თემატური კონვერტორები |

**ჯერ `memory/file-map.md` წაიკითხე** — შეიძლება უკვე იპოვო ზუსტი ფაილი/ფუნქცია.
თუ არა — `/find` სკილი ან `Grep`.

## 2.3 — დაადგინე: extraction-ის ბრალია თუ render-ის?

ეს არის **ფაზა 2-ის ყველაზე მნიშვნელოვანი ნაბიჯი**. სწორად პასუხის გარეშე fix
არასწორ ფენაში მოხვდება.

მეთოდი — **ნახე რა მონაცემი მოვიდა API-დან plugin-ში**:

1. გაუშვი dev-log bridge (background):
   ```bash
   node packages/figma-plugin/scripts/devlog-server.mjs
   ```
2. `npm run watch` გაშვებული უნდა იყოს + dev plugin reload-ული Figma-ში
3. გააკეთე იმპორტი → ლოგები ჩამოვა server-ის stdout-ში
4. იპოვე ამ კონკრეტული ელემენტის მონაცემი შემოსულ payload-ში

**დიაგნოზი:**

| სიმპტომი payload-ში | დიაგნოზი | სად არის fix |
|---------------------|----------|--------------|
| მონაცემი **სწორია**, Figma-ში არასწორად ჩანს | 🎨 **render bug** | `packages/figma-plugin/` ✅ დაშვებული |
| მონაცემი **არასწორია/აკლია** | 🔍 **extraction bug** | `packages/browser-extension/` 🔴 LIVE — **ჰკითხე გიორგის** |
| მონაცემი გზაში დაიკარგა/დამახინჯდა | 🚚 **transport bug** | `packages/api/` ან `packages/shared/` 🔴 LIVE — **ჰკითხე** |

⚠️ **ხშირი ხაფანგი:** არსებობს პრობლემები, სადაც extraction ტექნიკურად „სწორია",
მაგრამ render-ს არასაკმარისი ინფორმაცია აქვს. ესეც **render-ის მხარეს გვარდება**, თუ
შესაძლებელია — LIVE პაკეტების შეხება ბოლო საშუალებაა.

💡 თუ extraction-ის რეპროდუცირება გჭირდება LIVE extension-ის შეხების გარეშე —
გამოიყენე Puppeteer repro harness (იხ. auto-memory
`project_carousel-culling-and-float-rows`): იგივე extractor კოდი, ლოკალურ ბრაუზერზე.

## 2.4 — გამოიძიე პრობლემის არსი 100%-ით

**🛑 ეს არის gate. სანამ ქვემოთ ჩამოთვლილ 4-ვე კითხვაზე დარწმუნებით ვერ პასუხობ —
fix-ზე გადასვლა აკრძალულია.**

1. **რომელი ხაზი?** კონკრეტული `file.ts:NN` — არა „სადღაც layout-ში"
2. **რატომ?** ახსენი მექანიზმი: „ეს პირობა `X`-ს ელოდება, საიტი `Y`-ს აბრუნებს, ამიტომ
   ბლოკი გამოტოვდება"
3. **რითი დაამტკიცე?** ლოგი, ტესტი, ან payload-ის ამონარიდი — არა ვარაუდი კოდის კითხვით
4. **რატომ არ ჩანს სხვაგან?** თუ ეს ბაგი ზოგადია, რატომ მუშაობს სხვა საიტები? (თუ ვერ
   პასუხობ — შენი ჰიპოთეზა სავარაუდოდ არასრულია)

თუ ვერსია არ დადასტურდა — **დაუბრუნდი 2.1-ს**, ნუ დაიწყებ „ვცადოთ ეს, იქნებ გაასწოროს".

## 2.5 — Root fix, არა plaster

გიორგის სჭირდება **root fix** — ისეთი, რომელიც:

- ✅ **მიზეზს ასწორებს, არა სიმპტომს** — თუ ვერ ხსნი „რატომ" ერთი წინადადებით, ეს plaster-ია
- ✅ **ზოგადია** — ასწორებს ყველა საიტს იმავე პატერნით, არა მხოლოდ ამ ერთს
- ❌ **არასოდეს** hostname/URL-ზე დამოკიდებული hack
- ❌ **არასოდეს** magic number კომენტარის გარეშე
- ✅ **არაფერს არღვევს** — არსებული ტესტები მწვანედ რჩება

**Regression-ის შემოწმება fix-ის შემდეგ, სავალდებულოდ:**
```bash
pnpm test && pnpm type-check
```
პლუს **მინიმუმ 2 სხვა საიტის იმპორტი** Figma-ში, რომ დარწმუნდე რომ არაფერი გაფუჭდა.

⚠️ **Config-ის ხაფანგი:** თუ `DEFAULT_CONFIG`-ს ცვლი — ეს **არსებულ მომხმარებლებამდე
ვერ აღწევს** (clientStorage-ში snapshot-ია). საჭიროა `CONFIG_VERSION` bump +
migration `deepMergeConfig`-ში. იხ. auto-memory `project_config-defaults-need-migration`.

## 2.6 — დაწერე დეტალური Plan (Plan Mode-ით)

`EnterPlanMode` → გეგმა უნდა შეიცავდეს:

```markdown
## Goal
<ერთი წინადადება: რა ქცევა შეიცვლება, გაზომვადად>

## Root cause
<file.ts:NN> — <მექანიზმი 1-2 წინადადებით>

## Tests (იწერება იმპლემენტაციამდე, ჯერ წითლად ვარდება)
1. <test name> — <რას ამოწმებს> — expected: <...>
2. <regression test> — <რომ არსებული ქცევა არ გაფუჭდეს>

## Steps
1. <ნაბიჯი> → verify: <შემოწმება>
2. <ნაბიჯი> → verify: <შემოწმება>

## Blast radius
- შეხებული ფაილები: <...>
- რაზე შეიძლება იმოქმედოს: <...>
- როგორ გამოვრიცხე: <...>

## Verification
- [ ] pnpm test && pnpm type-check
- [ ] იმპორტი <ამ საიტზე> → პრობლემა გამქრალია
- [ ] იმპორტი 2 სხვა საიტზე → regression არ არის
- [ ] გიორგიმ ხელით ნახა Figma-ში
```

`ExitPlanMode` → **დაელოდე დადასტურებას** → მერე კოდი.

## 2.7 — იმპლემენტაცია და ვერიფიკაცია

1. ჯერ ტესტები → გაუშვი → **დარწმუნდი რომ წითლად ვარდება**
2. მინიმალური, surgical ცვლილება, რომ გამწვანდეს
3. `pnpm test && pnpm type-check`
4. `npm run watch` → plugin **სრულად** გადატვირთე Figma-ში (მხოლოდ reload არ კმარა)
5. იმპორტი ამ საიტზე → შეადარე reference სურათს
6. იმპორტი 2 სხვა საიტზე → regression check
7. **აჩვენე გიორგის** → დაელოდე „მუშაობს"-ს

⚠️ `pnpm build` და `rebuild-start` **prod** plugin-ს აწყობს — ლოკალური ტესტისთვის
`npm run watch` გამოიყენე. და პირიქით: გაშვებული `watch` ჩუმად აფუჭებს prod bundle-ს.

## 2.8 — დახურე პრობლემა და გადადი შემდეგზე

- `findings.md`-ში მონიშნე მწკრივი ✅-ით + მიაწერე root cause ერთ ხაზად
- `issue-NN-<slug>.md` დაასრულე: root cause, fix, ტესტები, ვერიფიკაცია
- commit **მხოლოდ** გიორგის დადასტურების შემდეგ, `USE_PRODUCTION = false` შემოწმებით
- **ახლა და მხოლოდ ახლა** გადადი `findings.md`-ის შემდეგ მწკრივზე → დაუბრუნდი 2.1-ს

---

## ციკლის მოკლე მეხსიერება

```
ფაზა 1 (ერთხელ)
  1.1 საიტი → 1.2 სურათი → 1.3 Figma frame → 1.4 findings.md → 1.5 gate: გიორგი

ფაზა 2 (findings.md-ის ყოველი მწკრივისთვის, სათითაოდ)
  2.1 ღრმად საიტზე
  2.2 იპოვე კოდში
  2.3 extraction? render? transport?
  2.4 🛑 100% დამტკიცება
  2.5 root fix-ის დიზაინი
  2.6 Plan Mode → gate: გიორგი
  2.7 TDD → იმპლემენტაცია → ვერიფიკაცია → gate: გიორგი
  2.8 დახურე → შემდეგი მწკრივი
```

## ანტი-პატერნები (ამას არ აკეთებ)

- ❌ ფაზა 1-ის დასრულებამდე კოდის შეცვლა
- ❌ რამდენიმე პრობლემაზე ერთდროულად მუშაობა
- ❌ „ვცადოთ ეს და ვნახოთ" — მიზეზის დამტკიცების გარეშე
- ❌ hostname-ზე ან კონკრეტულ selector-ზე მიბმული fix
- ❌ LIVE პაკეტის შეცვლა კითხვის გარეშე
- ❌ commit მანამ, სანამ გიორგი Figma-ში არ ნახავს
- ❌ „სავარაუდოდ გასწორდა" — ვერიფიკაციის გარეშე დახურვა
