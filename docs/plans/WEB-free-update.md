# Website update: Web2Wireframe is free

Status: **PROPOSED, awaiting owner approval** · 2026-11-09
Scope: `packages/web` (marketing site on Vercel). It adds no new feature: the change removes code and copy.
Owner decisions (2026-11-09): every price becomes **"Free"**. **No donate.** The free product carries no plans, no Pro and no
checkout. Screenshot import is gone (2026-11-07), so it comes out of the copy too.

Inventory source: subagent sweep 2026-11-09 (file:line below). The server's 1000/month fair-use cap is
**never advertised**: copy says "free", with no number.

## 1. Pages and machinery to delete

| Remove | Why | Replaced by |
|---|---|---|
| `/checkout`, `/checkout/success`, `/checkout/cancel` (`pages/Checkout/*`, `AppRoutes.tsx:67-69`) | Nothing left to buy | 301 → `/pricing` |
| `/renew` (`pages/Renew/Renew.tsx`, `:72`) | Old reminder emails link here (`reminderService.ts:56`) | 301 → `/pricing` |
| `/account` (`pages/Account/*` + `accountLogic.ts` + its test, `:70`) | Showed plan, usage and orders | 301 → `/pricing` |
| `/signin` (`pages/Signin/Signin.tsx`, `:71`) | It only existed for account and checkout | 301 → `/` |
| `contexts/AuthContext.tsx` + its providers in `App.tsx` and `entry-server.tsx` | Website login was only for paying. It also stops a `/web/me` call on every page load | — |
| `components/PricingModal.tsx` | Checkout modal | — |
| Header "Sign in" link + account chip (`Header.tsx:72-105` + their SCSS) | — | Header without auth |
| `utils/currency.ts`, `data/links.ts` (checkoutLinks), `derivePrice`/`BillingMode` in `consoleLogic.ts:17, :264-286` | Price helpers | — |
| SEO entries `/signin`, `/checkout` (`seo/config.ts:276-291`) | Pages gone | `sitemap.test.ts:43` gets other noindex fixtures |

Redirects go in **`vercel.json` → `"redirects"`** (permanent 301; it has none today). They run before rewrites.
`robots.txt` disallow lines for these paths go away.

**Kept:** the `/web/*` rewrite (`Support.tsx:113` POSTs `/web/support`). The Support form stays.
The "Detected plan" display on Support (`:30-31, :173-174, :295-297`) is removed.

## 2. `/pricing` stays (URL kept), rewritten as "Free"

The plugin's Help (`figma-plugin/.../Help.tsx:48`) and the live extension's Help ("Compare plans") link here,
and the URL has SEO weight (sitemap priority 0.9). So the page stays and becomes **"Free"**:
- h1 along the lines of "Web2Wireframe is free". It explains that every feature is included, there is no account,
  no card, no limits to manage, and the plugin and extension are both free.
- One "Everything included" list (URL import, HTML import, Area/.w2w, browser extension, viewports,
  fidelity/wireframe styles, hover variants, CSS variables, auto layout).
- A short FAQ: "Is it really free?", "Do I need an account?", "Will it stay free?" (honest answer: free today,
  no plans to charge for these features).
- CTAs: "Install the Figma plugin" and "Get the Chrome extension".
- Delete: tier toggle, Pro card, compare table, Flitt and VAT notes, `PRO_*_CENTS`.

## 3. Copy across the site

| Where | Change |
|---|---|
| Home (`Home.tsx:149-196` plan section, `:4/:36` derivePrice) | Replace the plan section with a single "Free" block. Remove "Ten imports free / Pro removes the count". |
| Home screenshot (`:9`, `screenshotItems :16-33`, section `:109-125`, `.screenshot*` SCSS) | Delete. The step text becomes "A URL or HTML…" |
| HowItWorks (`:10` screenshots, `:70-71` "font binary is Pro") | Remove screenshot. Font binary download is **not** gated in code today, so the "Pro" claim is stale. Say it's included. |
| Landing pages (`LandingPage.tsx:130, :141`; `landingData.ts` :71, :160, :194, :286-288, :322, :413, :530-537, :672) | Make every price, "N imports a month" and "Compare plans" mention say free. |
| **`/screenshot-to-figma` landing** (`landingData.ts:315-440`, `:702`, footer row `Footer.tsx:79`, cross-links :170, :298, :547, :682) | **Delete the page** and 301 → `/website-to-figma`. Promising a feature that's gone would mislead visitors. |
| ImportConsole (`consoleLogic.ts:9, :199-200`; `ImportConsole.tsx:27`) | Remove the "Screenshot" source mode. |
| Support (`supportPlans :5-16`, "Priority for Pro", placeholder "billing" :372) | One support tier. Remove billing wording. |
| Docs: **"Pricing & plans" topic** (`docsStructure.ts:129-155`, `docsArticlesLegacy.ts:537-702`) | Delete the topic's 3 pages. 301 `/docs/pricing/*` → `/pricing`. |
| Docs: **screenshot-import** page (`docsStructure.ts:81, :89-94`; `docsArticles.ts:114-203`; legacy mentions) | Delete. 301 → `/docs` (or the URL import doc). Remove the "Continue to screenshot import" links and the search placeholder `Try "screenshot"` (`DocsSidebar.tsx:78`). |
| Docs `docsArticles.ts:86-88` "font binary is Pro-gated" | Remove the Pro claim. |
| Screenshot assets (`assets/how-it-work/...screenshot*`) | Delete only those that nothing references. `docsArticles.ts:30` reuses one, so check first. |

## 4. SEO (important: Google keeps showing old prices otherwise)

- `seo/schemas.ts:26-48` `softwareApplicationSchema.offers` → **one** Offer: price `"0"`, USD, name "Free".
  Delete `productSchema` (`:83-110`, "Web2Wireframe Pro" $16/$144). `/pricing` uses the SoftwareApplication schema instead.
- `seo/config.ts`: `/pricing` title/description (`:207-209`) say "Free". Home (`:185`) changes "Free tier available"
  to "Free". Docs (`:223`), support (`:236`) and privacy (`:263`) drop pricing/billing/Pro/Flitt. Rewrite `SUPPORT_FAQ`
  (`:157-178`) with no "3 imports", $16/$144, Flitt or "cancel subscription". Remove the screenshot docs SEO (`:59-63`)
  and the pricing docs SEO (`:84-98`).
- The sitemap regenerates from `staticRoutes`, so removed pages drop out by themselves.

## 5. Legal (Terms + Privacy): rewrite, don't just delete

- **Terms:** §3 "Plan" definition (`:61`). §7 Free tier limits (`:136-155`) becomes "The Service is free"
  with an honest fair-use clause and no number. §8 Payment (`:156-179`) and §9 Refunds (`:180-200`) go; add one line
  saying past purchases were honored or refunded per the terms in force when they were made. §13 Screenshot AI
  (`:243-256`) goes. §17 liability "amounts you paid" (`:311`) gets free-service wording.
  Bump the effective date (`:434`) and renumber the sections.
- **Privacy:** §3 Flitt email (`:61-63`), §4 payments (`:88-93`), §5 screenshot AI (`:113-128`), §7 "process payments"
  (`:149`), §8 Payment Data (`:158-184`), §9 Tax (`:186-196`), §10 receipts (`:204-205`), §16 Flitt (`:328-329`):
  remove or rewrite. **Keep** §11 payment-metadata retention as one line for *past* transactions (accounting
  law). Bump the effective date (`:418`).
- ⚠️ This is legal text. I write it plainly, and the owner reviews it before publishing.

## 6. Tests (TDD: update first, then code)

- `consoleLogic.test.ts`: delete the `price` describe (`:239-270+`). Screenshot source-hint test (`:114-125`) → assert
  there is no screenshot mode.
- `accountLogic.test.ts`: delete it with the module.
- `seo/schemas.test.ts`: assert the offers are exactly one Free "0" offer, and nothing says "Pro", "16" or "144". Remove the
  productSchema tests.
- `seo/config.test.ts:23-26`: `/pricing` → SoftwareApplication schema.
- `seo/routes.test.ts`: drop `/screenshot-to-figma` (`:70-76, :99-101`).
- `seo/sitemap.test.ts:43`: new noindex fixtures.
- `docsData.test.ts`: topic and page counts (`:11-13`), the last page (`:84`), and the screenshot search (`:105-111`) → new values.
- **New guard test:** render every prerendered route, then assert no `$16`, `$144`, "Pro", "Get Pro", "checkout",
  "screenshot import" or "imports a month" text. This catches anything the sweep missed.
- Gate: `pnpm --filter web test`, `lint`, `build` (the build also prerenders every page, so a broken route fails it).

## 7. Verify before deploy

1. `vite` dev (the preview tool) shows Home, /pricing, the landings, Docs, Support, Terms and Privacy. Read the pages: no price, no Pro,
   no screenshot. Screenshots for the owner.
2. Redirects: `vercel.json` covers them. Check after deploy with `curl -I` on `/checkout`, `/renew?uid=x`, `/account`,
   `/signin`, `/screenshot-to-figma` and `/docs/pricing/overview`, expecting 301/308 to the right target.
3. Owner reads the page texts, the legal ones especially.

## 8. Release

- Commit on `dev` (`USE_PRODUCTION = false` check). **With owner confirmation:** push → `dev` → `main`.
  Vercel deploys the site and Render redeploys the API. The API code is unchanged since `d0af8e2`, and `main` also gets
  the plugin commit `2cec409`, which has no server effect.
- After deploy: curl the redirects, check `/pricing` in Google's Rich Results test (no $16 offer).

## 9. Out of scope (mentioned only)

- **API** still serves `/api/checkout/*`, `/api/license/by-token` and the renewal emails (cron disabled by env).
  Removing them is a separate API cleanup. The web redirects make their links land safely.
- **Live extension** Help says "Compare plans" → `/pricing`. The label is wrong, but the page it opens now says Free.
  Fix it in the next extension release.
- `packages/web/CLAUDE.md` "Payment Flow (Flitt)" section → update in the same commit (docs only).
- Flitt merchant deactivation and the env cleanup on Render: owner, later.

## 10. Execution

One session, sequentially. Pages, SEO, docs and legal share `seo/config.ts`, `AppRoutes.tsx` and tests, so parallel
sessions would collide on the same files. Estimated diff: about 40 files, mostly deletions.
