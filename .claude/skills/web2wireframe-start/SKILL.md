---
name: web2wireframe-start
description: Session-start briefing for Web2Wireframe — dev services, watch ownership, parallel-session safety, uncommitted work, USE_PRODUCTION gate, and the weekend release reminder.
disable-model-invocation: true
---

# W2W Start — სამუშაო სესიის დასაწყისი

ერთი ბრძანება, რომელიც პასუხობს კითხვას *„ჩართულია თუ არა ყველაფერი და
რა მდგომარეობაშია repo?"*.

`scripts/devcheck.sh` ისედაც ავტომატურად ეშვება SessionStart hook-ით
(`.claude/settings.json`) — ეს skill მის **გაფართოებული ვერსიაა**: სერვისებს
ემატება watch-ის მფლობელობა, პარალელური სესიების რისკი, uncommitted სამუშაო,
`USE_PRODUCTION` gate და კვირის რელიზის შეხსენება.

---

## ნაბიჯი 1 — dev სერვისები

```bash
bash scripts/devcheck.sh
```

ოთხივე შემოწმება idempotent-ია: dev-log receiver `:3999` · tree-dump receiver
`:3998` · plugin watch · build freshness. რაც გამორთულია — ეშვება.

ლოგები: `/tmp/w2w-devlog.log` · `/tmp/w2w-treedump.log` · `/tmp/w2w-watch.log`

## ნაბიჯი 2 — ვისია watch? (🔴 პარალელური სესიების მთავარი რისკი)

```bash
W=$(pgrep -f 'packages/figma-plugin/node_modules/.*cli\.js.*--watch' | head -1); \
  [ -n "$W" ] && ps -o lstart=,etime= -p "$W" || echo "watch not running"
```

**წაკითხვა:**
- uptime **წუთებია** → სავარაუდოდ ამ სესიამ გაუშვა. სუფთა.
- uptime **საათებია** → watch მემკვიდრეობითაა. **უცნობია ვისი კოდი ააგო ბოლოს.**
  → გადადი „პარალელური სესიის პროტოკოლზე" ქვემოთ.

## ნაბიჯი 3 — uncommitted სამუშაო პაკეტების მიხედვით

```bash
git status --porcelain | cut -c4- | tr -d '"' \
  | awk -F/ '{print ($1=="packages" ? $1"/"$2 : $1)}' | sort | uniq -c | sort -rn
```

```bash
git status --porcelain -- packages/api packages/shared packages/browser-extension
```

მეორე ბრძანება **🔒 LIVE ზონაა**. თუ იქ რამე ჩანს და ამ სესიას არ შეუცვლია —
ეს სხვისი (ან წინა სესიის) სამუშაოა: **ნუ დააკომიტებ და ნუ დააბრუნებ უკან.**

## ნაბიჯი 4 — `USE_PRODUCTION` gate

```bash
grep -nE "^const USE_PRODUCTION *=" packages/figma-plugin/src/ui/shared/apiConfig.ts
```

`false`-ის გარდა ნებისმიერი მნიშვნელობა = **commit/push აკრძალულია** სანამ არ
დაბრუნდება `false`-ზე (იხ. CLAUDE.md → „USE_PRODUCTION = false").

## ნაბიჯი 5 — კვირის რელიზის შეხსენება

```bash
date '+%u'   # 6 = შაბათი, 7 = კვირა
```

თუ `6` ან `7` — ერთი ხაზით შეახსენე owner-ს:

> 🔔 შეხსენება: ვერსიის გამოქვეყნების დრო იწურება (კვირა დღეა deadline) —
> Figma plugin + extension განახლება საჭიროა.
> 📊 ჩაგაბარო growth სტატისტიკა? (`/go` ლინკების დაწკაპუნებები თითო არხზე vs
> ახალი მომხმარებლები, `/growth`)

სხვა დღეს — ჩუმად გამოტოვე.

---

## 🔴 პარალელური სესიის პროტოკოლი

`build/` დირექტორია, ports 3998/3999, git working tree და
`tools/figma-tree-dump/dumps/latest.json` — **ყველა გაზიარებულია**. ერთი watch
ემსახურება ყველა სესიას და **ნებისმიერი** `src/**` ცვლილებაზე აგებს.

**რა შეიძლება მოხდეს, თუ rebuild მოხდა სხვა სესიის მუშაობისას:**

| # | რა ხდება | რატომ საშიში |
|---|---|---|
| 1 | **შერეული bundle** — `build/`-ში ორივე სესიის დაუმთავრებელი კოდია | Figma-ში ვერიფიკაცია აზრს კარგავს: ვერ იტყვი, შენი fix-ი მუშაობს თუ სხვისი ცვლილება ნიღბავს. პირდაპირ ეწინააღმდეგება `verify-before-commit` წესს |
| 2 | **გატეხილი შუალედური მდგომარეობა** — სხვა სესიამ ფაილი შუა რედაქტირებისას შეინახა | `/tmp/w2w-watch.log`-ში წითელი typecheck errors ფაილებზე, რომლებსაც შენ არ შეხებიხარ. დროის კარგვა, ან უარესი — „ასწორებ" სხვის მიმდინარე სამუშაოს |
| 3 | **main.js / ui.js version skew** — esbuild ორ ფაილს ცალ-ცალკე წერს | Figma-მ შეიძლება ახალი `main.js` + ძველი `ui.js` ჩატვირთოს → sandbox↔UI message contract არ ემთხვევა → გაუგებარი runtime შეცდომები |
| 4 | **prod build-ის განადგურება** — სხვა სესიის `npm run build` ფლიპავს `USE_PRODUCTION`-ს `true`-ზე | შენი watch ხედავს `apiConfig.ts`-ის ცვლილებას და prod bundle-ს dev-ით გადააწერს. + არსებობს წამების ფანჯარა, როცა დისკზე `true` წერია — ამ დროს `git add` = აკრძალული მნიშვნელობის დაკომიტება |
| 5 | **`dumps/latest.json` გადაწერილი** | `diff.mjs`-ს სხვისი dump-ი შეყავს ანალიზში — შედეგი მშვიდად არასწორია |

**თავად rebuild იაფია (~1.5 წმ) და უსაფრთხო. საშიში ისაა, თუ *ვისი* კოდია
bundle-ში.**

**წესები, როცა ორი და მეტი სესია მუშაობს:**

1. `packages/figma-plugin/src`-ს **ერთდროულად მხოლოდ ერთი სესია ეხება.**
2. დანარჩენებმა **არ დაეყრდნონ Figma-ვერიფიკაციას** — bundle არ არის მხოლოდ მათი.
3. **არ დააკომიტოთ** — `git add`-ის ერთეული = პაკეტი, და working tree საერთოა.
4. `npm run build` (prod) — ჯერ watch მოკალი, **მერე** დაადასტურე, რომ სხვა
   სესია `src`-ში არ წერს. სხვაგვარად შენ ხარ #4-ის მიზეზი.
5. tree dump-ის შემდეგ მაშინვე იმუშავე `latest.json`-ზე, ან გადაარქვი სახელი.

---

## საბოლოო რეპორტი

```
W2W სესია მზადაა
─────────────────
სერვისები:  devcheck.sh-ის output
watch:      გაშვებული Xსთ Yწთ (ამ სესიის / მემკვიდრეობითი)
build:      fresh / stale
uncommitted: packages/figma-plugin N · packages/shared M · …
LIVE ზონა:  სუფთა / ⚠️ N ფაილი შეცვლილი (სხვისი სამუშაო)
USE_PRODUCTION: false ✅ / ⚠️ true — commit აკრძალულია
რელიზი:     [მხოლოდ შაბ/კვ]
```

შემდეგ დაუსვი ერთი კითხვა: **რაზე ვმუშაობთ დღეს?**

## დაკავშირებული

- `scripts/devcheck.sh` — ავტომატური ნაწილი (SessionStart hook)
- CLAUDE.md → „Dev-Log Bridge", „USE_PRODUCTION = false", „Release Cadence", „🔒 LIVE ზონა"
- auto-memory: `watch-clobbers-prod-build`, `parallel-claude-sessions`, `verify-before-commit`
