# ADR-001: Launch Strategy — Path A+ (Import-First, AI Deferred to Q3)

**Status:** Accepted
**Date:** 2026-05-03
**Deciders:** Giorgi Lomidze (sole founder)
**Supersedes:** None
**Related:** [docs/plans/PAYMENT-SYSTEM.md](../plans/PAYMENT-SYSTEM.md)

---

## Context

Web2Wireframe (W2W) is a Figma plugin built by a solo founder, currently pre-launch with a hard deadline of **June 16, 2026** (~6 weeks). The product has two feature surfaces:

1. **Import** — URL/Screenshot/HTML/Browser-extension → Figma wireframe extraction. Quality is **production-ready and competitive with html.to.design (h2d)**.
2. **AI Generation** — Text prompt → Figma wireframe via Claude Sonnet 4.6. Quality is **demonstrably inferior** to competitor Mureal Wireframe Designer ($5/mo, 555K Figma installs).

### Forces at Play

- **Brand:** Plugin name `web2wireframe` is a function signature (`web → wireframe`). AI generation violates this contract.
- **Architecture gap:** Mureal uses **Component Library Composition** (LLM picks `{componentId, props}` from 850+ pre-built Figma components). W2W uses pure LLM generation from primitives. This is a structural quality gap, not a prompt-engineering gap. Founder Chenmu Wu confirmed Mureal's architecture publicly on LinkedIn.
- **Solo founder constraints:**
  - Risk tolerance: safe-slow with logical risk (NOT all-or-nothing)
  - Goal: sustainable income (not VC scale)
  - Plans to build OTHER plugins later
  - 1–2 months runway without revenue tolerable
- **Market reality:**
  - h2d (3M users, $12-18/mo) blocks Indian/Russian cards via Figma billing — geographic moat for W2W via Flitt
  - Mureal stagnant since May 2025 (1 year no updates)
  - Anima ($20-40/seat) is the only direct 2-in-1 competitor
- **Technical reality:**
  - Figma Community plugin review: 5-10 business days
  - Chrome Web Store review: 1-3 weeks
  - Replicating Mureal-quality AI: 15-24 days realistic (not 7-10 as initially estimated)
- **Pricing already decided:** Free (10/10) / Plus $12 (∞ imports + 30 AI) / Pro $20 (∞ imports + 200 AI + Credit Packs)

### Multi-Perspective Analysis Conducted

Three independent expert agents analyzed the decision:

| Perspective | Verdict | Core Logic |
|-------------|---------|------------|
| Senior Engineering Lead (15y exp) | **Path A** | 15-24 day realistic estimate, double codepath risk, solo-dev sustainability, Figma library publishing UX wall |
| SaaS CEO (5+ launches) | **Path B** with Day-7 fallback | Revenue ceiling $300 vs $1500 MRR, Pro $20 unjustifiable without AI, 2-in-1 differentiation |
| Senior Product Designer (Figma/Notion bg) | **Path A** | Brand contract, halo effect (bad AI tanks all reviews), poisoned-well risk for future AI plugin, scalpel beats Swiss Army knife |

**Vote: 2 × Path A, 1 × Path B (with conditional fallback to A)**
**Universal rejection: Path C (Beta in paid product) — all 3 agents agree**

---

## Decision

**Adopt Path A+ — Ship Import-only on June 16, 2026, with AI Generation advertised as "Q3 2026" on the pricing page. Build proper component-library-based AI in months 4-6 funded by post-launch revenue.**

### What This Means Concretely

- Plugin tabs at launch: **Import only** (AI Generation tab removed from production build)
- AI Generation code preserved on `ai-generation-future` branch (not deleted)
- Pricing tiers unchanged: Free / Plus $12 / Pro $20
- Pro tier value at launch: unlimited imports + multi-viewport + hover capture + premium features
- Pro tier value Q3: + AI Generation (advertised on pricing page with date)
- Tagline: **"Wireframes from any URL — pixel-perfect, instantly"**
- Pricing page disclosure: **"AI Generation feature included in Pro plan — launching Q3 2026"**

---

## Options Considered

### Option A (Pure): Drop AI Generation Entirely

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Engineering effort | 2-3 days (strip code, update docs) |
| Time-to-launch | June 16 (on schedule) |
| Codebase impact | -2000 LOC, simpler architecture |
| Brand alignment | Perfect ("web2wireframe" = web → wireframe) |
| Competitive positioning | h2d competitor only |
| Pro $20 pricing power | WEAK — no AI to justify |

**Pros:**
- Cleanest brand (name = product)
- Lowest engineering risk
- Frees solo founder capacity for next plugin
- Halo effect protected (no mediocre feature dragging reviews)

**Cons:**
- Lost upgrade story (Plus → Pro weak without AI)
- $20 Pro tier under-justified (mostly downgrades to Plus)
- Lose comparison vs Anima 2-in-1 positioning
- ARPU ceiling lower (~$13-14 mid-case)

### Option B: Polish AI to Mureal-Quality, Ship Both Features

| Dimension | Assessment |
|-----------|------------|
| Complexity | High |
| Engineering effort | 15-24 days realistic (not 7-10) |
| Time-to-launch | June 23 to July 7 (1-3 week slip) |
| Codebase impact | +3000 LOC, 2 codepaths in renderer |
| Brand alignment | Violates name contract |
| Competitive positioning | h2d + Mureal + Anima competitor |
| Pro $20 pricing power | STRONG (AI + URL bundle) |

**Pros:**
- Category-of-one 2-in-1 positioning
- Geographic moat doubles in value (CIS users get both features)
- Pro $20 fully justifiable
- Higher MRR ceiling ($600-1500 month 1)

**Cons:**
- Solo dev maintenance unsustainable long-term (6 API surfaces)
- Component library publishing requires paid Figma org + user accept-into-workspace UX wall
- AI quality risk: may still feel inferior to Mureal even after 15-24 days (they have 3 years catalog refinement)
- Mureal-tier means catalog of 50-100 hand-crafted components (or import + audit Variants library)
- Figma Community + Chrome Web Store reviews push effective launch into July-August
- Sunk cost trap: Day-7 checkpoint hedge psychologically hard to honor
- Halo risk: if AI ships sub-Mureal, Import reviews suffer too

### Option C: Ship Import + AI Generation as "Beta"

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Engineering effort | 1-2 days (add Beta label) |
| Time-to-launch | June 16 (on schedule) |
| Codebase impact | Status quo (1130-line aiGenerator.ts maintained) |
| Brand alignment | Mixed |
| Pro $20 pricing power | BROKEN ("paying for Beta") |

**Pros:**
- Ships on time
- No engineering risk
- Maintains 2-in-1 marketing pitch

**Cons:**
- ALL 3 agents reject this option
- Figma Community ratings are per-plugin, not per-feature → 1 bad AI review tanks plugin rating for 6 months
- "Beta" in paid product = trust tax, not trust shield
- Beta features in Plus/Pro tiers = customer complaints
- Path of maximum brand damage

### Option A+ (Selected): Drop AI Tab, Advertise as Roadmap Q3

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Engineering effort | 2-3 days (strip + roadmap copy) |
| Time-to-launch | June 16 (on schedule) |
| Codebase impact | -1500 LOC (code preserved on branch) |
| Brand alignment | Perfect at launch, transparent roadmap |
| Pro $20 pricing power | MEDIUM (premium features today + AI Q3) |

**Pros:**
- Inherits all Path A pros (focus, simplicity, halo, sustainability)
- Recovers MOST of Path B's pricing power via Q3 promise
- Real user data informs eventual AI catalog (better than guessing)
- Revenue funds AI development (not founder savings)
- Clean future plugin path (AI Designer can launch independently)
- Industry standard practice (Cursor, Linear, Notion all do "coming soon")

**Cons:**
- "Coming soon" promise = some customer expectation risk
- Some buyers wait for AI before subscribing Pro
- Lost initial 2-in-1 positioning at launch (recovered in Q3)
- Requires Q3 follow-through (commit to date)

---

## Trade-off Analysis

### The Core Tension

**Path A + Designer optimize for risk-mitigation and brand purity.**
**Path B (CEO) optimizes for revenue ceiling and competitive positioning.**

Path A+ resolves this tension by **deferring rather than eliminating** the AI feature: brand stays clean at launch, pricing power preserved via promise, AI built right with revenue + user data.

### Why Path A+ Over Path B

The CEO's "Day 7 checkpoint" was the strongest argument for B, but has 3 weaknesses:

1. **Sunk cost trap** — after 7 days of work, "throw it away" is psychologically near-impossible for solo founder
2. **Estimate gap** — 7-10 days is fantasy; real estimate 15-24 days means checkpoint comes at day 14, not day 7
3. **Quality bar fuzzy** — "is it Mureal-tier?" is subjective; easy to rationalize "good enough"

The CEO's revenue ceiling argument ($300 vs $1500 MRR) is real but assumes Path A's $300 ceiling is fixed. In practice, Path A+ with Q3 AI promise can reach $800-1200 MRR by month 6 as users buy Pro early-bird for upcoming AI.

### Why Path A+ Over Pure Path A

Pure Path A leaves Pro $20 tier weak. Path A+ recovers 60-70% of Path B's pricing power with 0% of B's engineering risk.

### What Path A+ Sacrifices

- 2-in-1 launch positioning (recovered Q3)
- Daily-use AI stickiness (recovered Q3)
- Maximum theoretical MRR ceiling

### What Path A+ Gains

- Realistic 6-week timeline
- Clean brand at launch
- Sustainable solo-dev maintenance
- AI built RIGHT with real user data
- Future "AI Designer" plugin path uncontaminated

---

## Consequences

### What Becomes Easier

- ✅ Hitting June 16 deadline (no quality compromise needed)
- ✅ Marketing message ("URL → Figma, period")
- ✅ Solo dev maintenance (4 API surfaces vs 6)
- ✅ Figma Community discovery (specialist plugins rank better)
- ✅ Pricing page narrative ("Pro = unlimited + AI Q3")
- ✅ Future AI Designer plugin (no brand baggage)

### What Becomes Harder

- ❌ Justifying Pro $20 to users who only need imports
- ❌ Competing on feature breadth vs Anima
- ❌ Q3 commitment becomes binding (founder must deliver)
- ❌ Telling users "AI coming Q3" repeatedly during support

### What We'll Need to Revisit

- **End of Month 1:** Review Plus/Pro conversion rates. If Pro <10% of paid → reassess pricing or accelerate AI
- **End of Month 2:** Review user feedback. If AI demand strong → start AI build sooner
- **End of Month 3:** Hard checkpoint on AI build start. If not started → Q3 promise at risk
- **Mureal monitoring (weekly):** if Chenmu Wu signals URL ingestion roadmap, accelerate Path B-equivalent build immediately

---

## Trigger Conditions for Revisiting This Decision

Reopen this ADR if ANY occur:

1. **Mureal launches URL ingestion feature** — gap closes; AI = our only differentiator → fast-track AI
2. **Chrome Web Store rejects extension** — Browser extension = primary moat → AI generation needs to compensate
3. **3+ pre-launch Pro signups explicitly cite "I want AI now"** — demand validated → consider 2-week launch slip
4. **Anima drops price below $15/mo** — competitive pressure on 2-in-1 segment → Path B becomes more viable
5. **Solo founder capacity issue** — health/time/burnout → Path A pure (drop Q3 promise to reduce stress)

---

## Action Items

### Phase 0: Immediate (Week 1, May 3-9)

1. [ ] Remove AI Generation tab from plugin UI production build
2. [ ] Create branch `ai-generation-future` to preserve code
3. [ ] Update plugin description / Figma Community copy: remove AI mentions, focus URL→Figma
4. [ ] Update website pricing page: add "AI Generation included in Pro — launching Q3 2026"
5. [ ] Update tagline: "Wireframes from any URL — pixel-perfect, instantly"
6. [ ] Begin Payment System Phase 0 — `figma.currentUser.id` plumbing (see [docs/plans/PAYMENT-SYSTEM.md](../plans/PAYMENT-SYSTEM.md))

### Phase 1-7: Payment System (Weeks 2-4)

Follow phase-by-phase plan in [docs/plans/PAYMENT-SYSTEM.md](../plans/PAYMENT-SYSTEM.md). Adjust limit gates: imports only at launch, no AI gating logic needed.

### Phase 8-13: Plugin + Web Launch (Week 5)

- Plugin Purchase modal (skip AI generation cards)
- Web Checkout/Account/Credits pages
- Privacy/T&C copy update (no AI section yet)
- Final QA

### Phase 14: Submission (Week 6)

- Submit Figma Community (5-10 day review)
- Submit Chrome Web Store (1-3 week review)
- Marketing landing page polish
- Demo video (URL → Figma, 60 seconds)

### Launch (June 16)

- Soft launch on Figma if approved
- Announcement on Twitter, ProductHunt, Reddit (r/figma, r/webdesign), IndieHackers
- Track install + conversion daily
- Support inbox monitoring

### Post-Launch (Months 1-3)

- Daily install/conversion tracking
- Weekly Mureal/h2d monitoring
- Monthly revenue review
- User feedback aggregation

### AI Build (Months 4-6, Q3 2026)

- Spike: validate Anthropic Tool Use schema with component library (1-2 days)
- Component library: import + audit Variants Figma library, publish as W2W team library
- Refactor `aiGenerator.ts` to component-selection mode
- Refactor plugin renderer to `figma.importComponentByKeyAsync()` flow
- Beta test with 10-20 paying Pro users
- Public AI launch on Q3 2026 deadline

---

## Notes

- This decision was reached after 3 parallel expert-perspective analyses (Engineering, Business, Designer) and synthesis by AI advisor.
- The decision favors safe-slow execution per the founder's stated risk tolerance.
- The Q3 2026 AI promise is binding and must be honored — failure to deliver erodes the trust this decision relies on.
- Pricing remains as decided in [docs/plans/PAYMENT-SYSTEM.md](../plans/PAYMENT-SYSTEM.md): Free 10/10, Plus $12, Pro $20, Credit Packs $5/$10/$20.
