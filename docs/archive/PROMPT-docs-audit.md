<role>
შენ ხარ ტექნიკური დოკუმენტაციის არქიტექტორი Web2Wireframe-ის monorepo-ში.
შენი პრიორიტეტია სტრუქტურის სიცხადე და ნავიგაციის სიმარტივე — არა ფაილების
რაოდენობის შემცირება თავისთავად.
</role>

<task>
გააუდიტე და ხელახლა დაალაგე Web2Wireframe-ის მთელი დოკუმენტაცია: `docs/`,
ყველა `.md`, ყველა `README`, და მათი განლაგება ხეში.
</task>

<context>
პროექტი: /Users/giorgi/Desktop/Web2Wireframe (pnpm + Turborepo monorepo)
ყველა პროდუქტი LIVE-ია: Figma plugin, Chrome extension, website, API.

**რატომ ახლა:** ბოლო თვეებში დოკუმენტაცია ორგანულად გაიზარდა — დაემატა
ბიზნეს/growth მასალა, ვიდეოს გეგმები, კონკურენტების კვლევა, სოც-ქსელების
სამუშაო ფაილები. აღარაფერი იძებნება და ზოგი ფაილი ერთმანეთს ეწინააღმდეგება.

**ვინ წაიკითხავს:** მხოლოდ owner-ი (Giorgi) და Claude-ის სესიები.
გარე კონტრიბუტორები არ არიან. ე.ი. ოპტიმიზაცია სჭირდება **აგენტის
ნავიგაციისთვის**, არა open-source-ის წესიერებისთვის.

**მიმდინარე მასშტაბი:** 89 `.md` ფაილი (node_modules-ის გარეშე).
`docs/research/` დამატებით ~180 არა-markdown ფაილს შეიცავს.
</context>

<current_state>
docs/
  CHROME-WEB-STORE-SUBMISSION.md · FLITT-CHECKOUT-BRANDING.md
  INFRA-UPGRADE-RUNBOOK.md · LAUNCH-COSTS-AND-DECISIONS.md
  LAUNCH-POLISH-AUDIT.md · PRE-LAUNCH-CHECKLIST.md · Prompter.md
  import-improve-instructions.md · w2w-convertor.md
  archive/     (4 ფაილი)
  decisions/   (2)
  growth/      COMPETITORS.md · CONTENT.md · DEFECTS.md · METRICS.md
               head-to-head.md · copy/2026-09-launch-copy.md
               video/  CONTENT-PLAN.md · FEEDBACK.md
                       scripts/01-redesign-workflow/SCRIPT.md + vo/*.m4a
                       scripts/02-shorts/SCRIPT.md
                       shorts/00-pipeline-test/*.mp4 + *.py
                       shorts/01-apple-import/*.mp4 + *.py
  incidents/   (2) · plans/ (4) · runbooks/ (6)
  research/    figma-extension/ და h2d-extension/ — ~180 ფაილი
               (ამოღებული მესამე მხარის კოდი: .ts .tsx .js .json .png)

ფესვში:   AGENTS.md · CLAUDE.md · DEPLOYMENT.md · README.md
packages/: browser-extension, figma-plugin, web — თითოს CLAUDE.md + README.md
.claude/:  agents/ (10) · commands/ (3) · skills/ (code-review, deploy-check,
           fix-issue, growth[+5 reference], h2d-quality-diff, interview-me,
           new-feature, social[+2], youtube-short)
scripts/video/: w2wkit.py · make_vo.py
social-agent/
  README.md · QUEUE.md
  development/  images/ used/ videos/ (4 .mp4 + Camtasia პროექტი)
  production/   (ცარიელი)
</current_state>

<requirements>
## სავალდებულო სამიზნე სტრუქტურა

**1 · `docs/`-ში ვიდეო და ხმა არ რჩება.**
ყველა `.mp4`, `.m4a`, `.wav`, ვიდეოს გეგმა, სცენარი და build-სკრიპტი
გადადის `social-agent/`-ში.

**2 · `social-agent/` = Buffer-ის სამუშაო ადგილი.** გეგმაც იქ იწერება და
შესრულებაც იქ ხდება. ორი ძირითადი მიმართულება:

```
social-agent/
├── README.md
├── QUEUE.md
├── 01) video/
│   ├── development/     ← სცენარები, ნედლი ჩანაწერები, ხმები, ვერსიები, build-სკრიპტები
│   └── production/      ← მხოლოდ ასატვირთი: <name>.mp4 + <name>.md (title + description)
└── 02) articles/
    ├── development/     ← LinkedIn/X-ის გეგმა, დრაფტები, კალენდარი
    └── production/      ← დასაპოსტად დამტკიცებული ტექსტები
```

**3 · ნუმერაცია `01) 02) 03)`** — ზუსტად ამ ფორმატით, ფრჩხილით.
⚠️ ფრჩხილიანი გზები shell-ში ბრჭყალებში ჩასვი: `"social-agent/01) video/"`.

**4 · `development` / `production` სახელები** ყველგან, სადაც მუშა და მზა
მასალა უნდა გაიმიჯნოს.

**5 · `production/`-ის ხისტი წესი:** ყოველ `.mp4`-ს ან სტატიას თან უნდა
ახლდეს იმავე სახელის `.md` სათაურითა და აღწერით. ფაილი `production/`-ში
ხვდება **მხოლოდ owner-ის დადასტურების შემდეგ**.
</requirements>

<known_issues>
ესენი უკვე დადგენილია — გადაამოწმე და გაითვალისწინე:

1. **`social-agent/README.md` მოძველებულია** — ის აღწერს `materials/`
   საქაღალდეს, რომელიც აღარ არსებობს (გადაერქვა `development/`-ად).
2. **`.claude/skills/growth/references/plan-8-weeks.md` გადალახულია** —
   ფაილის თავში ეს წერია; აქტიურია `plan-3-months.md`. კანდიდატია
   არქივისთვის.
3. **`docs/research/` დოკუმენტაცია არ არის** — ეს ორი მესამე მხარის
   Chrome გაფართოების ამოღებული საწყისი კოდია (~180 ფაილი).
   `docs/`-ში მისი ადგილი საეჭვოა. **გადაწყვეტილება owner-ს ჰკითხე.**
4. **`docs/Prompter.md` დუბლიკატია** — იდენტური ასლი დევს
   `~/.claude/Prompter.md`-ში (13016 ბაიტი ორივე).
5. `docs/growth/CONTENT.md` და `docs/growth/video/CONTENT-PLAN.md` —
   შესაძლო გადაფარვა, შეამოწმე.
</known_issues>

<instructions>
1. **წაიკითხე** ყველა `.md` ფაილი `docs/`-ში, ფესვში, `packages/*/`-ში და
   `.claude/`-ში. `docs/research/`-ის არა-markdown ფაილები **ნუ წაიკითხავ** —
   მხოლოდ დათვალე და მოცულობა გაზომე.

2. **დააკატეგორიზე** თითოეული ფაილი ერთ-ერთში:
   - `KEEP` — აქტუალურია, ადგილზეა
   - `MOVE` — აქტუალურია, არასწორ ადგილასაა (მიუთითე საიდან → სად)
   - `MERGE` — სხვა ფაილს ფარავს (მიუთითე რომელს)
   - `ARCHIVE` — ისტორიული ღირებულება აქვს, აქტიური არაა
   - `DELETE` — მოძველებულია და ღირებულება არ აქვს
   თითოეულს **ერთი წინადადება დასაბუთება**.

3. **ჩაატარე ჯვარედინი შემოწმება:**
   - რომელი ორი ფაილი ეწინააღმდეგება ერთმანეთს?
   - რომელ `.md`-ში წერია ისეთი გზა/ფაილი, რომელიც აღარ არსებობს?
   - რომელი `CLAUDE.md` / `SKILL.md` მიუთითებს გადატანილ ფაილზე?
     (გადატანის შემდეგ **ყველა ბმული უნდა გასწორდეს** — ეს გამორჩენა
     ყველაზე ხშირი შეცდომაა ასეთ სამუშაოში)

4. **წარადგინე გეგმა და დაელოდე დადასტურებას.**
   არაფერი წაშალო და არაფერი გადაიტანო, სანამ owner-ი გეგმას არ დაამტკიცებს.

5. დადასტურების შემდეგ შეასრულე — **`git mv`-ით**, არა `rm`+`create`-ით,
   რომ ისტორია შენარჩუნდეს. ბოლოს გაუშვი `pnpm build && pnpm test`
   და დაადასტურე, რომ არაფერი დაზიანდა.
</instructions>

<constraints>
- 🔒 **კოდს არ ეხები.** `packages/api/`, `packages/shared/`,
  `packages/browser-extension/` — LIVE-ია. `.md` ფაილების გარდა იქ
  არაფერს შეცვლი.
- **არაფერი წაიშლება დადასტურების გარეშე.** ეჭვის შემთხვევაში `ARCHIVE`,
  არა `DELETE`.
- **`.claude/skills/` და `.claude/agents/` არ გადაალაგო** — Claude Code
  მათ ფიქსირებული გზებით კითხულობს. მხოლოდ შიგთავსის მოძველება აღნიშნე.
- **`CLAUDE.md` ფაილები ადგილზე რჩება** (ფესვში და თითო პაკეტში) —
  ესეც ფიქსირებული კონვენციაა.
- ქართული ტექსტი ქართულად დატოვე; ნუ თარგმნი.
- `git mv` გამოიყენე; commit **ნუ** გააკეთებ — owner-ი თვითონ გადაწყვეტს.
</constraints>

<output_format>
## ნაბიჯი 1 — ინვენტარი (ცხრილი)

| ფაილი | კატეგორია | სად გადადის | დასაბუთება (1 წინადადება) |
|-------|-----------|-------------|---------------------------|

## ნაბიჯი 2 — წინააღმდეგობები და გატეხილი ბმულები

| ფაილი | პრობლემა | გასწორება |
|-------|----------|-----------|

## ნაბიჯი 3 — სამიზნე ხე

```
(სრული, საბოლოო სტრუქტურა ხის სახით)
```

## ნაბიჯი 4 — გასაწმენდი გადაწყვეტილებები owner-ისთვის

დანომრილი კითხვები, სადაც ჩემი გადაწყვეტილება არ მეყოფა
(მაგ. `docs/research/`-ის ბედი).

## ნაბიჯი 5 — შესრულების ბრძანებები

```bash
(ზუსტი git mv ბრძანებები, თანმიმდევრობით)
```
</output_format>

<deliverable>
ჯერ მხოლოდ გეგმა (ნაბიჯები 1–5) — ფაილების შეხების გარეშე.
დადასტურების შემდეგ: შესრულება + ბმულების გასწორება + `pnpm build && pnpm test`.
</deliverable>
