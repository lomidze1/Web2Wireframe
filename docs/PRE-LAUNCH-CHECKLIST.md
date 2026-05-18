# Pre-Launch Checklist — One-Time Payment

გადახდის (ერთჯერადი $16 → 30 დღე Pro) production-ზე ატვირთვამდე შესასრულებელი ნაბიჯები.
სტატუსი: `[ ]` = დარჩა, `[x]` = გაკეთდა.
ბოლო განახლება: 2026-05-18.

---

## 1. Backend `.env` (root `/.env`)

| ცვლადი | მნიშვნელობა | სტატუსი |
|--------|-------------|---------|
| `FLITT_MERCHANT_ID` | Flitt Merchant ID | [x] |
| `FLITT_SECRET_KEY` | Flitt Payment key (ხელს აწერს request-ს + ამოწმებს webhook-ს) | [x] |
| `FLITT_BASE_URL` | `https://pay.flitt.com` | [x] |
| `API_PUBLIC_URL` | `https://api.web2wireframe.design` (webhook callback URL აქედან იგება) | [x] |
| `WEBSITE_BASE_URL` | `https://www.web2wireframe.design` (`response_url` + reminder email-ის `/renew` ლინკი) | [x] |
| `RESEND_API_KEY` | Resend key (Glinc account, `web2wireframe-production`) — გატესტილია ✓ | [x] |
| `SUPPORT_TO_EMAIL` | `support@web2wireframe.design` — ⚠️ უნდა იყოს რეალური inbox რომელსაც კითხულობ | [x] |
| `NOREPLY_EMAIL` | `noreply@web2wireframe.design` (დომენი Resend-ში verified ✓) | [x] |
| `EXPIRY_REMINDERS_ENABLED` | `true` (Resend მზადაა — გატესტილია) | [x] |
| `NODE_ENV` | `production` | [ ] |

- [x] `flittEnabled=true` ხაზი წაშლილია.
- Resend: დომენი `web2wireframe.design` verified (Glinc account, us-east-1); test email გაიგზავნა 2026-05-18.
- შენიშვნა: "Credit private key" checkout-ს **არ სჭირდება** (payout-only) — არსად ჩასვა.

## 2. Plugin API URL (`packages/figma-plugin`)

- [ ] `src/ui/shared/apiConfig.ts` → `USE_PRODUCTION` toggle `false` → `true`
      (გადართვა 1 ხაზად; `npm run build`-ის წინ, **sandbox ტესტის შემდეგ**.
      build-ის შემდეგ ისევ `false`-ზე დააბრუნე ლოკალური dev-ისთვის)
- [x] 4 დუბლირებული `API_URL` კონსტანტა (`Screenshot.tsx`, `Web.tsx`,
      `HTML.tsx`, `BrowserExtension.tsx`) უკვე `apiConfig.ts`-ის `API_BASE_URL`-ს
      იყენებს — გადართვა ერთ `USE_PRODUCTION` toggle-ზე დაყვანილია.

## 3. Web API URL (`packages/web`)

- [ ] production deploy-ზე `VITE_API_URL=https://api.web2wireframe.design`
      (`.env.local` dev-ისთვისაა; production build-ი deploy-ის env-ს იყენებს)

## 4. Flitt Merchant Portal (user action)

- [ ] `server_callback_url` დააregistrირე: `https://api.web2wireframe.design/api/webhooks/flitt`
- [ ] დაადასტურე USD გადახდები ჩართულია
- [ ] production `.env`-ში Live (და არა sandbox) credentials

## 5. Infrastructure

- [ ] Flitt callback IP-ები allowlist-ში (თუ firewall/proxy არის):
      `54.154.216.60`, `3.75.125.89`
- [ ] `/api/webhooks/flitt` საჯაროდ მისაწვდომია

## 6. Sandbox ტესტი (production-მდე)

- [ ] პირველი შესყიდვა → webhook → Pro 30 დღით
- [ ] Renew (ადრეული — დღეები ემატება, არ იკარგება)
- [ ] ვადაგასული renew → `now + 30დ`
- [ ] Declined ბარათი → Pro არ ეძლევა
- [ ] Idempotency (იგივე webhook 2-ჯერ → 1 აქტივაცია)
- [ ] Lazy-downgrade (ვადაგასული Pro → Free)
- [ ] `/renew?uid=` ლინკი → Flitt checkout იხსნება

## 7. Flitt support-თან დასაზუსტებელი

- [ ] "Credit private key" payout-only-ა? (checkout-ს არ სჭირდება)
- [ ] checkout request-ში `version` ველი (`"1.0.1"`) საჭიროა?
- [ ] USD charge-ები ანგარიშზე ჩართულია?

## 8. Figma OAuth App (plugin-ის "Connect Figma")

Plugin-ის auth იყენებს Figma OAuth app-ს `Web2Wireframe`
(figma.com/developers/apps). backend ვერ ენდობა plugin-ის გაგზავნილ
figmaUserId-ს — OAuth ვერიფიცირებულად ადასტურებს ვინ არის (security fix C-2).

- [ ] **OAuth app გამოაქვეყნე "Public"-ად** — figma.com/developers/apps →
      Web2Wireframe → Publish → Audience: **Public: Anyone using Figma**.
      Draft/Private-ში მხოლოდ owner+team-ს შეუძლია OAuth-ის გავლა; Public
      საჭიროა რომ ნებისმიერმა მომხმარებელმა შეძლოს.
      ⚠️ audience publish-ის შემდეგ აღარ იცვლება.
- [ ] production `.env`: `FIGMA_CLIENT_ID`, `FIGMA_CLIENT_SECRET`,
      `FIGMA_REDIRECT_URI=https://api.web2wireframe.design/auth/figma/callback`
- redirect URL `https://api.web2wireframe.design/auth/figma/callback`
      OAuth app-ში უკვე დარეგისტრირებულია ✓
- OAuth scope: მხოლოდ `current_user:read` ✓

## 9. Production secrets (security boot guard)

API **არ ჩაირთვება** production-ში თუ ეს placeholder-ებად დარჩა (security fix L-1):

- [ ] `AUTH_SECRET` — უნიკალური, `openssl rand -hex 32`
- [ ] `SESSION_SECRET` — უნიკალური, `openssl rand -hex 32`
- [ ] `ADMIN_TOKEN` — უნიკალური, `openssl rand -hex 32`

---

## კონტექსტი

- მოდელი: ერთჯერადი გადახდა, $16 = 30 დღე Pro, **auto-renew/subscription არ არის**, cancel არ არსებობს.
- Subscription კოდი პარკირებულია (Flitt subscription-ს რამდენიმე თვეში ჩართავს).
- სრული გეგმა: `~/.claude/plans/effervescent-weaving-balloon.md`
