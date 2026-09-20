---
name: deploy-check
description: Pre-deployment checklist validation
disable-model-invocation: true
---

# Deploy Check Skill

რელიზამდე გასაშვები ჩეკლისტი. სრული runbook: `CLAUDE.md` → „Release Cadence".

## Usage

```
/deploy-check              # სრული შემოწმება
/deploy-check plugin       # მხოლოდ Figma plugin
/deploy-check extension    # მხოლოდ Chrome extension
/deploy-check api          # მხოლოდ API (🔴 LIVE)
```

## 0. 🛑 Gate — ამის გარეშე არ გრძელდება

```bash
grep -nE "^const USE_PRODUCTION *=" packages/figma-plugin/src/ui/shared/apiConfig.ts
```
`false`-ის გარდა ნებისმიერი მნიშვნელობა = **commit/push აკრძალულია** ყველა
ბრანჩზე. გამონაკლისი მხოლოდ იმ ერთ prod build-ზე, რომელსაც თავად აქვეყნებ.

```bash
git status --porcelain -- packages/api packages/shared packages/browser-extension
```
თუ LIVE ზონაში uncommitted ცვლილებაა და ამ სესიას არ შეუცვლია — **ნუ
დააკომიტებ და ნუ დააბრუნებ უკან.** სხვისი სამუშაოა.

⚠️ **ვერიფიკაცია ყოველთვის წინ უსწრებს კადენსს.** ვაქვეყნებთ მხოლოდ იმას, რაც
Figma-ში ხელით დამოწმდა. უვერიფიცირებელი კოდი deadline-ის გამო live-ზე
**არ გადის** — სჯობს კვირა გამოვტოვოთ.

## 1. Build + tests

```bash
pnpm build        # turbo build — ^build რიგით, @w2w/shared ჯერ
pnpm test         # shared + api + plugin
pnpm type-check
```

⚠️ **ჯერ watch მოკალი** — `pgrep -fl "create-figma-plugin/build"` → `kill <pid>`.
SessionStart hook ავტომატურად უშვებს, და watch-ი prod bundle-ს dev-ით გადააწერს.

## 2. Environment

- [ ] `.env.example` სრულია, ახალი ცვლადიც შიგაა
- [ ] კოდში secret არ არის
- [ ] production URL = `api.web2wireframe.design` (სხვა დომენი აღარ არსებობს)

## 3. Security

- [ ] CORS: `/api/*` → figma.com + `null`; `/web/*` → web2wireframe.design
- [ ] rate limiting ჩართულია public endpoint-ებზე
- [ ] `/api/webhooks/flitt` SHA1 signature-ს ამოწმებს
- [ ] production-ში debug ლოგი არ რჩება (`__W2W_DEV_LOG__` compile-time DCE)
- [ ] MongoDB index-ები `userId` ველებზე

## 4. რიგი — ⚠️ თანმიმდევრობა მნიშვნელოვანია

თუ რელიზი `api`/`shared`-ზეა დამოკიდებული:

```
1. dev → main merge          → Render auto-deploy (API) + Vercel (web)
2. დაელოდე და დაადასტურე     → API-ს build marker არ აქვს: ან Render
                                dashboard, ან რეალური იმპორტი
3. მხოლოდ მერე → plugin publish → extension upload
```

პირიქით რომ გააკეთო, გამოქვეყნებული client ძველ API-ს მოხვდება.

## 5. პაკეტების მიხედვით

#### packages/figma-plugin
- [ ] watch მოკლულია, `npm run build` prod bundle-ს აწყობს
- [ ] bundle-ის ზომა ელოდება prod-ს (watch-ის dev build უფრო პატარაა)
- [ ] Figma desktop → Manage plugins in development → Publish
- [ ] id `1646327864971730293`

#### packages/browser-extension — 🔴 LIVE
- [ ] `manifest.json` `version` bump
- [ ] manifest V3, `key` ველი ადგილზეა (unpacked-load CORS-ისთვის)
- [ ] permissions მინიმალური, `chrome.debugger` დეკლარირებული
- [ ] icons 16/48/128
- [ ] **plain rebuild** — არა `W2W_DEV_LOG=1`
- [ ] zip = `dist/`-ის **შიგთავსი**, არა თავად საქაღალდე
- [ ] Web Store id `fcmicolldgpmpdkcdljkaaimmjmboipl`

#### packages/api — 🔴 LIVE
- [ ] MongoDB კავშირი მუშაობს
- [ ] Chromium/Puppeteer dependency-ები Docker image-შია
- [ ] ⚠️ extractor-ის import graph `src/content`-ში რჩება, თორემ Render build ტყდება
- [ ] request/response ფორმატი **გამოქვეყნებულ** plugin-თან თავსებადია

#### packages/shared — 🔴 LIVE კონტრაქტი
- [ ] `CDPClientInterface` არ შეცვლილა
- [ ] import data format უკან-თავსებადია (extension live-ია)
- [ ] `pnpm --filter @w2w/shared test`

#### packages/web
- [ ] SSG 7 გვერდს prerender-ს აკეთებს
- [ ] route-ები მუშაობს, asset-ები იტვირთება

## Output

```markdown
## Deploy Check Results

### 🛑 Gate
- USE_PRODUCTION = false ✅
- LIVE ზონა: N ფაილი uncommitted

### ✅ Passed
- build / test / type-check

### ⚠️ Warnings
- ...

### ❌ Failed
- ...
```
