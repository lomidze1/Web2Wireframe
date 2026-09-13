# Launch Costs & Infrastructure Decisions

**ბოლო განახლება:** 2026-06-06 · **სტატუსი:** გადაწყვეტილებები დამტკიცებულია owner-ის მიერ.

ეს დოკუმენტი აჯამებს launch-ის ფასიან სერვისებსა და ხარჯებს, რომ ხელახლა აღარ გავარკვიოთ.

---

## 🎯 გადაწყვეტილება: Full-feature launch

ყველა plugin tab ცხ19დება launch-ზე (URL import, HTML paste, Screenshot, Browser Extension).
ეს განსაზღვრავს ფასიან სერვისებს.

---

## 💰 ხარჯების სრული სია

### Fixed ყოველთვიური — **$33/თვე (mandatory, ორივე გასაკეთებელია)**

| სერვისი | tier | $/თვე | რატომ აუცილებელი | სტატუსი |
|---|---|---|---|---|
| **Render Standard** | Standard (2GB) | **$25** | Chromium-ს RAM სჭირდება (იხ. ქვემოთ) | ⬜ TODO — dashboard-დან Free→Standard |
| **MongoDB Atlas Flex** | Flex | **$8** | backups (License data = ვინ გადაიხადა) | ⬜ TODO — dashboard-დან Free→Flex |

**ჯამი: $33/თვე.**

### ერთჯერადი ხარჯი

| ხარჯი | თანხა | შენიშვნა |
|---|---|---|
| Chrome Web Store developer registration | **$5 (ერთხელ)** | extension-ის გამოსაქვეყნებლად |
| დომენი `web2wireframe.design` | ~$10–30/წ | სავარაუდოდ უკვე გადახდილი |

### უფასო / usage / commission (fixed ხარჯი არ არის)

| სერვისი | მოდელი | შენიშვნა |
|---|---|---|
| **Figma plugin publish** | **$0** | ❗საკომისიო არ აქვს, შემოსავლიდან წილს არ იღებს |
| Anthropic API | usage (pay-per-call) | მხოლოდ Screenshot AI; ჯერ-ჯერობით უგულებელყოფილია |
| Flitt | 4% თითო გადახდაზე | fixed ხარჯი არ აქვს |
| Resend | free tier (3000 email/თვე) | launch-ისთვის კმარა |
| Vercel | Hobby free | web frontend |
| Cloudflare | free | DNS + Email Routing |

---

## 🔍 რატომ ვერ ავუვლით გვერდს — დეტალები

### Render Standard ($25) — RAM, არა cold-start

- URL import (`POST /api/import-url`) და HTML paste (`POST /api/import-html`) ნამდვილ **Chromium browser**-ს უშვებენ სერვერზე (`packages/api/src/lib/htmlExtractor.ts:440, :555` — `puppeteer.launch()`).
- Chromium-ს ~1GB+ RAM სჭირდება.
- Render **Free = 512MB RAM** → Chromium **OOM crash**.
- Render **Standard = 2GB RAM** → მუშაობს. ✅
- ⚠️ **1-წუთიანი ping (UptimeRobot) ვერ გვშველის** — ის მხოლოდ **cold-start**-ს ხსნის (სერვერი ძილში არ ჩავარდეს), RAM-ს არა. ამიტომ ping-ით სერვერი ფხიზლად იქნება, მაგრამ URL import-ზე მაინც დაიკრაშება.

### Atlas Flex ($8) — backups

- ფუნქციურად Atlas **Free (M0) მუშაობს** launch-ისთვის.
- Flex მხოლოდ **backup-ებისთვის** გვინდა: Free tier-ს ავტომატური backup არ აქვს.
- Atlas-ში ვინახავთ **License** (ვინ გადაიხადა). მონაცემის დაკარგვა = გადამხდელი user-ის დაკარგვა.
- ⚠️ Flex სავალდებულო ხდება **ნამდვილი ფული რომ შემოვა** — owner-მა გადაწყვიტა ორივე ერთად გაკეთება.

---

## 🔌 Plugin feature → infra dependency map

| Feature (tab) | API endpoint | ფასიანი რესურსი | Render Free-ზე მუშაობს? |
|---|---|---|---|
| Web URL import | `POST /api/import-url` | 🔴 Chromium | ❌ |
| HTML paste | `POST /api/import-html` | 🔴 Chromium | ❌ |
| Auth capture | `POST /api/capture-with-auth` | 🔴 Chromium | ❌ |
| Screenshot AI | `POST /api/import-screenshot` | 🟡 Anthropic | ✅ |
| Browser Extension capture | `POST /api/import-w2w` | 🟢 არაფერი მძიმე | ✅ |
| License/quota gate | (ყველა import) | 🟢 MongoDB | ✅ |

**კოდის citations:**
- Chromium: `packages/api/src/lib/htmlExtractor.ts:246` (auth), `:440` (URL), `:555` (HTML) — `puppeteer.launch()`
- Anthropic: `packages/api/src/routes/plugin/ai.ts:95` → `packages/api/src/lib/aiGenerator.ts:136`

---

## ✅ Action items (ხარჯებთან დაკავშირებული)

- [ ] Render: Free → **Standard $25/mo** (dashboard) — Chromium URL/HTML import-ისთვის
- [ ] Atlas: Free → **Flex $8/mo** (dashboard) — backups
- [ ] Chrome Web Store: developer registration **$5** (თუ ჯერ არ ხარ რეგისტრირებული)
