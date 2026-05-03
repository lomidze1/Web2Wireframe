# Web2Wireframe — Launch Strategy Decision

**Status:** ✅ FINAL — Single-Tier Strategy
**Date:** 2026-05-03
**Decider:** Giorgi Lomidze (sole founder)
**Session:** 2026-05-01 → 2026-05-03 (multi-day strategic session)
**Launch Target:** **June 16, 2026**

---

## 📋 TL;DR

**საბოლოო გადაწყვეტილება:** ბაზარზე გავდივართ **მხოლოდ Import ფუნქციით** (URL→Figma wireframe). **2 plan: Free + Paid $15/mo**. AI Generation **ამოღებულია launch-დან** — code-ი შენახულია ცალკე branch-ზე და მომავალში 3-4 თვეში გადაწყდება.

```
Free:  10 imports/თვე — $0
Paid:  Unlimited imports — $15/მო (შესაძლოა annual discount)
```

---

## 🎯 1. სესიის მიმოხილვა — როგორ მივიდით აქამდე

ეს სესია დაიწყო **payment system architecture**-ის გადაწყვეტისგან. სვლა იყო ასეთი:

1. **საწყისი გეგმა (3-tier with AI):** Free/Plus $12/Pro $20 + Credit Packs
2. **Flitt research:** ვიპოვე რომ Flitt-ს native subscriptions აქვს, signature SHA1, USD/GEL/EUR support
3. **Competitor research (8 competitors):** ვიპოვეთ რომ h2d $12-18, Anima $20-40, Mureal $5
4. **Quality discovery:** ვიპოვე რომ **Mureal-ის AI ხარისხი ბევრად უკეთესია ჩვენზე** არქიტექტურული მიზეზით (Component Library Composition vs Pure LLM)
5. **AI cost validation:** რეალური per-gen cost = $0.04 (Sonnet 4.6), ჩემი თეორიული $0.08 estimate ნახევარი
6. **3-Perspective Analysis:** Engineering A, CEO B, Designer A (2:1 ვერდიქტი Path A-ის სასარგებლოდ)
7. **Initial recommendation Path A+:** Drop AI tab, promise Q3 AI on pricing page
8. **Final pivot to Path A++ (current decision):** Drop AI entirely, single-tier $15, no Q3 promise, evaluate AI 3-4 months post-launch

---

## 🏛 2. ბაზრის კვლევა — Competitive Landscape

### 2.1 პირდაპირი კონკურენტები (URL→Figma)

| Plugin | Pricing | Features | Strength |
|--------|---------|----------|----------|
| **html.to.design (h2d)** | $18/mo monthly OR **$12/mo annual** | URL→Figma, browser ext, 3M users | DOMINANT, 4 years polished |
| **Anima** | $20-40/seat/mo | URL+AI both, code export | Closest 2-in-1 competitor |
| **W2W (us)** | TBD | URL→Figma, browser ext, multi-viewport, hover capture | Geographic moat (Flitt) |

### 2.2 AI Wireframe Generation კონკურენტები

| Plugin | Pricing | Architecture | Quality |
|--------|---------|--------------|---------|
| **Mureal Wireframe Designer** | **$5/mo monthly, ~$3.50 annual** | Component Library Composition | EXCELLENT |
| **Uizard** (Miro-acquired) | $12/mo annual | Custom AutoDesigner LLM | Mid-tier |
| **Visily** | $12/editor/mo annual | GPT-4 + computer vision | Strong screenshot→design |
| **Mockplus AI** | $10.95/user/mo annual | Wrapper LLM | Weakest of three |
| **Galileo AI** | DEAD | — | Acquired by Google → Stitch (sunset) |
| **Figma First Draft (built-in)** | Bundled in Figma seat | Figma's curated UI3 library | Text-prompt only, library-bounded |
| **v0.dev** | $20/mo + credits | Claude + shadcn/ui | React code, NOT Figma |

### 2.3 Mureal-ის Quality Secret — Architecture

**Founder Chenmu Wu-ის LinkedIn ციტატა:**
> "1. Provide ChatGPT the context, available UI components, and the attributes for each component;
> 2. Provide ChatGPT the design task;
> 3. Let ChatGPT describe the design using the UI components available and parse the answer into a machine-readable format;
> 4. Draw the design in Figma as described."

**ანუ:** LLM **არ ხატავს geometry-ს** — მხოლოდ ირჩევს `{componentId, props}` 850+ pre-built Figma component-დან. Plugin რენდერინგი **დეტერმინისტული** — pre-designed components-ის ინსტანცირება. **ხარისხი გარანტირებული by construction.**

**ჩვენი (W2W) მიდგომა:**
- LLM აგენერირებს raw JSON: `{element: "rectangle", x, y, width, height, color, ...}`
- Plugin ხატავს primitives-დან zero-ს
- Result: AI-y, generic, inconsistent

**Mureal/v0/Figma First Draft/Galileo — ყველა იყენებს Component Library Composition pattern-ს.** ეს ინდუსტრიის სტანდარტია AI design tools-ისთვის.

### 2.4 ჩვენი Geographic Moat

**Flitt (Georgian/CIS PCI Level 1 gateway):**
- ✅ ღებულობს რუსულ, ინდურ, ცენტრალური აზიური ბარათებს
- ✅ USD, GEL, EUR ვალუტები
- ✅ Apple Pay, Google Pay, Open Banking

**h2d-ი:** Figma billing-ი **ბლოკავს** Russian + Indian cards (h2d ოფიციალურ docs-ში წერია)
**Mureal/Anima:** იგივე Figma billing limitation
**W2W:** **ერთადერთი** option ამ regions-ისთვის → real moat

---

## 💰 3. რეალური Cost Data — Anthropic API

### 3.1 Live Generation Logs (Sonnet 4.6, ჩემი test)

```
[AI] fn=generateWireframe model=claude-sonnet-4-6 input=1264 cache_read=0 cache_write=0 output=2023  ← Gen 1 ✅
[AI] fn=generateWireframe model=claude-sonnet-4-6 input=1287 cache_read=0 cache_write=0 output=8000  ← Gen 2 ❌ (truncated)
```

### 3.2 Cost Breakdown

| Generation | Input | Output | Cost (Sonnet 4.6) |
|-----------|-------|--------|--------------------|
| Successful | 1,264 | 2,023 | **$0.034** |
| Failed (truncated) | 1,287 | 8,000 | $0.124 (wasted) |

**რეალური per-gen cost: ~$0.03-0.05** Sonnet 4.6-ით.
ჩემი თეორიული პროგნოზი ($0.08-0.16) ბევრად overestimated იყო.

### 3.3 Bug Found: max_tokens=8000 Truncation

```typescript
// packages/api/src/lib/aiGenerator.ts:417
const maxTokens = params.type === "page" ? 8000 : 4000;  // ← TOO LOW
```

**Fix applied:** 8000→16000 (page), 4000→6000 (block).

### 3.4 Caching Investigation

`cache_write=0` ლოგებში — caching არ ფუნქციონირდა (ან system prompt-ი 1024 tokens minimum-ს ვერ აღწევდა, ან my edit-ი არასრულად მუშაობდა). ეს არ არის blocker — Sonnet 4.6-ის რეალური cost ისედაც ბევრად დაბალია ვიდრე ვფიქრობდი.

### 3.5 Cost Implications by Plan (with original 200 AI/Pro plan)

| Plan | Gross | Net (Flitt 2.5%) | 200 gens cost | Profit |
|------|-------|-----------------|---------------|--------|
| Pro $20 | $20 | $19.50 | $8 (Sonnet) | $11.50 (60%) ✅ |
| Pro $20 | $20 | $19.50 | $4 (Haiku) | $15.50 (79%) ✅ |

**Conclusion:** AI economics **ფიქრულად** მუშაობდა. Real blocker = **quality** არა cost.

---

## 🔧 4. Quality Realization — The Mureal Comparison

**მომხმარებელმა Mureal-ი თვითონ სცადა და ნახა:**
- Desktop wireframe generation = **excellent quality**
- W2W generation = **poor quality**
- **არქიტექტურული გაპი** — არა prompt engineering issue

### 4.1 რა იქნებოდა საჭირო Mureal-quality მისაღწევად

**Engineering Lead-ის honest estimate (15 წელი exp):**
- 7-10 დღე — fantasy timeline
- **15-24 დღე** — realistic for solo dev
- Mureal-ი 3 წელი ხარჯავდა catalog refinement-ზე
- W2W-ს 6 კვირა აქვს total

### 4.2 Component Library Reality Check

- **Variants Library** (open-source 850 components) არსებობს Figma Community-ში
- License: არ ვერიფიცირებულია commercial republishing
- Figma team library publishing: **საჭირო Paid Figma org account** ($15/seat/mo)
- User UX wall: ყოველ paying user-მა უნდა "accept library into Figma workspace"
- Component key drift: library updates → existing wireframes შეიძლება გატეხდეს

### 4.3 Anthropic Tool Use Validation

- ჯერ არ ვერიფიცირებულია component selection-ისთვის
- 1-2 day spike საჭიროა commit-ამდე
- Risk: structured output may not be reliable for our schema

---

## 🎤 5. Multi-Perspective Analysis — 3 Expert Verdicts

### 5.1 🛠 Engineering Lead — Verdict: **Path A**

**Quote:** *"Path B is founder gold-plating dressed up as strategy. You watched Mureal, got intimidated, and now want to bolt on a feature you don't yet know how to build well."*

**Key arguments:**
1. Solo dev ვერ ფლობს 6 API surface-ს long-term
2. Variants library license unverified
3. 15-24 days is real (not 7-10)
4. Figma Community review = 5-10 business days
5. Chrome Web Store review = 1-3 weeks
6. Path C (Beta AI) = WORST — Figma ratings per-plugin
7. Tech debt: -1500 LOC if drop AI, +3000 LOC if polish AI

### 5.2 💼 CEO/Business — Verdict: **Path B (with Day-7 fallback)**

**Quote:** *"Path A leaves you defenseless on pricing power... you're just 'h2d but cheaper' forever."*

**Key arguments:**
1. Revenue ceiling: $300 vs $1500 MRR (5x difference)
2. Pro $20 needs AI to justify (now resolved by going single-tier)
3. AI = daily-use stickiness, Import = use-when-needed
4. 2-in-1 = unique positioning (h2d has no AI, Mureal has no URL)
5. Geographic moat doubles with AI
6. Mureal stagnant 1 year = window of opportunity

**Smart hedge:** Day-7 checkpoint to fallback if quality fails — but psychologically hard to honor (sunk cost trap).

### 5.3 🎨 Designer/UX — Verdict: **Path A**

**Quote:** *"Your name is a contract. web2wireframe = web→wireframe. AI generation violates that contract."*

**Key arguments:**
1. **Halo effect** — bad AI feature → users think "this PLUGIN is mediocre"
2. **Brand contract** — name = function signature
3. **Specialists win discovery** — Figma Community categorization
4. **Poisoned well** — bad AI now = future AI Designer plugin tainted
5. **11pm test** — tired designers want scalpel, not Swiss Army knife
6. **Onboarding doubles** — 2 tabs = 2 mental models

### 5.4 ვერდიქტ Summary

| Perspective | Vote | Core Logic |
|-------------|------|------------|
| Engineering | A | Risk-mitigation + solo-dev sustainability |
| CEO | B (with safety net) | Revenue ceiling + pricing power |
| Designer | A | Brand purity + halo effect |

**2 × A, 1 × B (conditional). All 3 reject Path C.**

---

## 🛤 6. Path Options Considered

### Path A: Drop AI Generation Entirely
- ✅ Simplest, fastest, safest
- ✅ Brand pure
- ❌ Pro $20 weak without AI

### Path B: Polish AI to Mureal-Quality
- ✅ Full feature parity with Anima
- ❌ 15-24 days work, deadline slips
- ❌ Solo dev maintenance unsustainable
- ❌ Quality may still feel sub-Mureal even after work

### Path C: Beta AI Disclaimer
- ❌ ALL 3 agents reject
- ❌ "Beta" in paid product = trust tax
- ❌ Bad reviews tank entire plugin rating
- ❌ Brand-suicide pact

### Path A+ (initial recommendation): Drop AI Tab + Q3 Promise
- ✅ Inherits Path A's pros
- ✅ Maintains Pro $20 pricing power via promise
- ⚠️ "Coming soon" promise creates expectation
- ⚠️ Q3 binding commitment

### **Path A++ (FINAL CHOICE): Single-Tier $15, No AI, No Promise**
- ✅ Maximum simplicity
- ✅ Solo founder friendly
- ✅ Honest brand (promise nothing)
- ✅ Higher conversion (no decision fatigue)
- ✅ Single funnel
- ✅ Easy pricing page
- ⚠️ Lower revenue ceiling vs 3-tier (but realistic for lifestyle goal)

---

## ✅ 7. ფინალური გადაწყვეტილება — Path A++

### 7.1 Pricing Structure

```
Free:  10 imports/თვე — $0
       basic features

Paid:  $15/მო monthly
       Annual discount option (TBD: $10-12/mo annual)
       ∞ imports
       Multi-viewport (1920/1440/1024/768/375)
       Hover state capture
       Font binary download (ZIP + auto-install)
       Browser extension premium
       Priority email support (24h response)
```

### 7.2 რატომ Single-Tier ჯობია 3-Tier-ს

| Aspect | 3-tier (Plus/Pro) | Single-tier (Paid) |
|--------|-------------------|---------------------|
| Decision fatigue | "Plus or Pro?" | Binary yes/no |
| Conversion rate | 1.5-2.5% | 2.5-4% (industry data) |
| Marketing complexity | 3 columns explained | One sentence |
| Pricing page design | Complex comparison | Clean simple |
| Solo dev support | 3 tier configurations | 1 tier |
| Promise debt | Pro = "Coming soon AI" | Promise nothing |
| Brand alignment | Mixed (AI mention) | Pure scalpel |

### 7.3 Competitive Position at $15

| Competitor | Price | W2W $15 vs |
|-----------|-------|------------|
| h2d annual | $12/mo | +$3 (no commitment) |
| h2d monthly | $18/mo | -$3 (cheaper monthly) |
| Anima starter | $20+/seat | -$5+ |
| Mureal | $5/mo | +$10 (different category) |

**Sweet spot:** competitive monthly, comparable to h2d annual without lock-in.

---

## 🤖 8. AI Generation — Backup Branch Strategy

### 8.1 ცვლილებების Workflow

```
1. Current dev branch ← contains AI Generation code (current state)
2. Push dev to remote
3. Merge dev → main (current state preserved)
4. From main → create branch `ai-generation-backup`
5. Push `ai-generation-backup` to remote (preservation)
6. Return to dev
7. NEXT SESSION: Clean dev of AI Generation code
   - Remove AI Generation tab from plugin UI
   - Remove AI routes from API
   - Remove aiGenerator.ts (or keep for screenshot import only?)
   - Update plugin description
   - Update pricing page
```

### 8.2 რა მერჩება dev-ზე AI cleanup-ის შემდეგ

**წარშლილი:**
- AI Generation tab UI (`packages/figma-plugin/src/ui/pages/aiGeneration/`)
- AI Generation routes
- AI Generation tests
- pricing page Pro tier (single-tier-ზე გადადის)

**შენარჩუნებული (კი, საჭიროა):**
- `aiGenerator.ts` Screenshot import-ისთვის (analyzeScreenshot, analyzeScreenshotAbsolute) — ეს Import feature-ის ნაწილია
- Anthropic SDK integration
- ANTHROPIC_API_KEY env var

⚠️ **Important:** Screenshot import იყენებს AI vision API-ს. ეს **NOT** AI Generation tab-ი — ეს Import-ის ნაწილია. **არ ამოიღება.**

### 8.3 Backup Branch Contents

`ai-generation-backup` branch ინახავს:
- Current `aiGenerator.ts` სრულად (1130 lines)
- AI Generation UI tab
- Page generation, Block generation routes
- Wireframe system prompt (~9.5K tokens)
- All AI-related tests
- max_tokens fix (16000) უკვე applied
- Caching + logging code

### 8.4 მომავალში როცა Re-evaluate

**Trigger conditions** (3-4 თვის შემდეგ):
1. Revenue >$500 MRR sustained
2. User feedback shows AI demand (5+ tickets)
3. Mureal launches URL feature (defensive trigger)

**Decision tree:**
- **GO:** Implement Component Library architecture → import Variants library → refactor to Mureal pattern → ship as Pro $20 tier
- **NO-GO:** Delete `ai-generation-backup` branch, focus on next plugin

---

## 📅 9. Action Plan — 6 Weeks to June 16

### Week 1 (May 3-9): Repo Cleanup + Foundation
- [ ] **Today:** Push current dev to remote
- [ ] Merge dev → main
- [ ] Create `ai-generation-backup` branch from main
- [ ] Push `ai-generation-backup` to remote
- [ ] Return to dev
- [ ] **Next session:** Clean dev of AI Generation tab code
- [ ] Begin Payment System Phase 0 (figma.currentUser.id plumbing)

### Week 2 (May 10-16): Payment System Core
- [ ] License model migration (single Paid tier, no Pro yet)
- [ ] License service refactor (monthly cycle, no AI counter)
- [ ] Flitt service (signature, checkout API)
- [ ] Flitt merchant account registration

### Week 3 (May 17-23): Checkout Flow
- [ ] Checkout & webhook routes
- [ ] Monthly counter cron (imports only)
- [ ] Limit gates (imports only)

### Week 4 (May 24-30): Plugin & Web UI
- [ ] Plugin Purchase modal (single Paid card)
- [ ] Plugin Manage Subscription button
- [ ] Web Checkout/Account pages
- [ ] .env.example + Privacy/T&C copy update

### Week 5 (May 31 - June 6): Polish + QA
- [ ] End-to-end testing (Flitt sandbox)
- [ ] Manual QA: Free → Paid upgrade flow
- [ ] Limit gate testing
- [ ] Marketing copy finalize, demo videos

### Week 6 (June 7-13): Submission + Launch Prep
- [ ] Submit to Figma Community (5-10 day review)
- [ ] Submit to Chrome Web Store (1-3 week review)
- [ ] Landing page polish
- [ ] Blog post draft

### June 16: SOFT LAUNCH
- [ ] Plugin live on Figma (if approved)
- [ ] Announcement: Twitter, ProductHunt, Reddit (r/figma, r/webdesign), IndieHackers
- [ ] Daily install + conversion tracking

### Post-Launch Months 1-3
- [ ] Daily metrics tracking
- [ ] Weekly Mureal/h2d monitoring
- [ ] Monthly revenue review
- [ ] User feedback aggregation

### Month 3-4: AI Re-evaluation Checkpoint
- [ ] Review revenue baseline
- [ ] Review user feedback
- [ ] Decision: build AI? or delete backup branch?

---

## 🚨 10. Trigger Conditions to Revisit Decision

ხელახლა გაიხსენე ეს გადაწყვეტილება თუ:

1. **Mureal launches URL ingestion** — gap closes; AI = our only differentiator → fast-track AI build
2. **Chrome Web Store rejects extension** — Browser extension = primary moat → recovery needed
3. **3+ early Paid signups explicitly request AI** — demand validated → consider accelerated AI build
4. **Anima drops price below $15/mo** — competitive pressure → might need 2-in-1
5. **Solo founder capacity issue** — health/time/burnout → reduce scope further or pause launch

---

## 📚 11. References & Sources

### Documentation Created This Session
- `docs/plans/PAYMENT-SYSTEM.md` — payment system implementation plan (will need update for single-tier)
- `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/project_payment-system.md` — cross-session context
- `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/reference_flitt-api.md` — Flitt API verified reference
- `~/.claude/plans/agile-mapping-thacker.md` — Plan Mode approved plan
- `docs/decisions/ADR-001-launch-strategy.md` — initial Path A+ decision (now superseded by this doc)
- **THIS DOCUMENT** — `docs/decisions/LAUNCH-STRATEGY-2026.md` — final source of truth

### Competitor Research Sources
- [Flitt Documentation](https://docs.flitt.com/)
- [html.to.design Plans](https://html.to.design/docs/pro-plan/)
- [Mureal Wireframe Designer](https://mureal.io/products/wireframe-designer/)
- [Chenmu Wu LinkedIn — architecture](https://www.linkedin.com/posts/chenmu-wu-99459268_figma-figmaplugins-chatgpt-activity-7053879810858631168-Pc1J)
- [Anima Pricing](https://www.animaapp.com/pricing)
- [Variants Wireframe Design System (open source)](https://www.figma.com/community/file/968089477160866500)
- [Anthropic Sonnet 4.6 announcement](https://www.anthropic.com/news/claude-sonnet-4-6)

### Code Changes Made This Session
- `packages/api/src/lib/aiGenerator.ts:417` — max_tokens 8000→16000 (page), 4000→6000 (block)
- `packages/api/src/lib/aiGenerator.ts` — Added prompt caching to 3 functions
- `packages/api/src/lib/aiGenerator.ts` — Added token usage logging (`[AI]` prefix)
- `CLAUDE.md` (root) — Added Flitt section, payment system overview
- `packages/web/CLAUDE.md` — Added payment flow section
- `packages/figma-plugin/CLAUDE.md` — Added license/payment integration section

---

## 🧠 12. Lessons Learned

### 12.1 Strategic Lessons

1. **Solo founder ≠ funded startup.** Mureal-ის pattern (3 years catalog refinement) impractical 1-month deadline solo dev-ისთვის.
2. **Brand contract matters.** "web2wireframe" = web→wireframe. Adding AI generation violates promise.
3. **Halo effect is brutal.** Bad AI feature drags WHOLE plugin rating in Figma Community.
4. **Single-tier > multi-tier for indie.** Decision fatigue eliminates conversions. Notion grew years on single tier.
5. **Promise nothing > promise everything.** Q3 AI promise creates expectation debt.
6. **Quality difference is architectural, not prompt-engineering.** Component Library > Pure LLM forever.

### 12.2 Technical Lessons

1. **Real cost ≠ theoretical cost.** Sonnet 4.6 actual = $0.03-0.05/gen, not $0.08-0.16.
2. **max_tokens matters.** 8000 truncated complex pages → JSON parse failures.
3. **Prompt caching needs verification.** `cache_write=0` means caching not active.
4. **Figma plugin ratings are per-plugin, not per-feature.**
5. **Industry pattern unanimously: Component Library Composition** (v0, Mureal, Galileo, Figma First Draft).

### 12.3 Process Lessons

1. **Multi-perspective analysis = better decisions.** 3 disagreeing experts > 1 echo chamber.
2. **CEO arguments need scrutiny.** Revenue maximization may conflict with sustainable goals.
3. **Day-N checkpoint hedges look smart, fail in practice.** Sunk cost is real.
4. **Live competitor research > training data.** Mureal pricing $5 surprised us; agents using only training data missed it.
5. **Document decisions immediately.** ADR-001 → this doc creates trail for future-self.

---

## 🎬 13. Decision Journey — How We Got Here

ეს სესია იყო **3-დღიანი strategic deep-dive**. ნაბიჯ-ნაბიჯ:

### Day 1 (May 1):
- Started: Payment system architecture planning
- Researched Flitt API thoroughly (verified signature algorithm, native subscriptions, webhook structure)
- 8 competitors researched in parallel agents
- ADR-style plan created (Path B with 3-tier pricing)

### Day 2 (May 2):
- AI generation cost analysis ($20 Pro = breakeven concern at $0.084/gen Sonnet 4)
- User raised PAYG variant idea
- Designer agreed Free/Plus/Pro with monthly billing

### Day 3 (May 3):
- **Switched AI_MODEL to Sonnet 4.6** in `.env`
- Added prompt caching + token usage logging to `aiGenerator.ts`
- **CRITICAL DISCOVERY:** Mureal Wireframe Designer at $5/mo generates excellent wireframes
- W2W AI Generation = poor quality (architectural reason discovered)
- Component Library Composition pattern documented (founder LinkedIn quotes)
- 3 parallel expert agents analyzed: Engineering A, CEO B (with checkpoint), Designer A
- ADR-001 written (Path A+: Drop AI tab, promise Q3 AI)
- **User pivot:** prefer single-tier $15, no Q3 promise → Path A++
- THIS DOCUMENT created as final source of truth

### Time Investment This Session
- ~12 hours of strategic conversation
- ~30 deep research queries (Flitt + 12 competitors)
- 3 expert perspective agents
- 1 ADR document
- 1 final strategy document (this)
- Multiple memory + CLAUDE.md updates

---

## ✅ 14. Sign-off

**Decision approved by:** Giorgi Lomidze (sole founder)
**Decision date:** 2026-05-03
**Effective immediately**

**Next concrete actions:**
1. Push this document to dev
2. Merge dev → main
3. Create `ai-generation-backup` branch from main
4. Push backup branch to remote
5. Return to dev for AI cleanup (next session)

**Long-term commitment:**
- Launch June 16 with single-tier $15
- 3-4 month re-evaluation checkpoint for AI
- Build next plugin in parallel for portfolio diversification

---

**END OF DOCUMENT**

---

*This document supersedes ADR-001-launch-strategy.md. The previous ADR (Path A+) is preserved for historical context.*
