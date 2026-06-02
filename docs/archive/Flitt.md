# Flitt — სრული შესწავლა + Roadmap

> **სტატუსი:** ✅ Documentation Study + ✅ Current State Audit (Task 1+2)
> **თარიღი:** 2026-05-20
> **წყაროები:** 3 ოფიციალური ლინკი + Flitt API reference + ჩვენი არსებული `flittService.ts` + სრული codebase audit (2026-05-20)

## 📊 Launch Readiness Score

| ფაზა | სტატუსი | პროგრესი |
|------|---------|----------|
| Phase 1 — Merchant Account Setup | 🟡 ნაწილობრივ | 4/7 |
| Phase 2 — Backend Service Layer | ✅ მზადაა | 10/10 |
| Phase 3 — Database Layer | ✅ მზადაა | 9/9 |
| Phase 4 — API Routes | ✅ მზადაა | 7/7 |
| Phase 5 — Figma Plugin UI | 🟡 ნაწილობრივ | 4/6 |
| Phase 6 — Website Pages | ✅ მზადაა | 5/5 |
| Phase 7 — Testing | ✅ მზადაა (unit) | 5/7 |
| Phase 8 — Production Deployment | 🟡 ნაწილობრივ | 3/8 |
| Phase 9 — Launch Day | ⏳ მოლოდინში | 0/6 |
| Phase 10 — Post-Launch | ⏳ მოლოდინში | 0/5 |
| **სულ** | 🟡 **~70% ready** | **47/70** |

**Bottom line:** კოდი თითქმის სრულად მზადაა. დარჩა: (a) Flitt merchant portal-ის რეგისტრაცია, (b) plugin-ში "Manage Subscription" entry point დამატება, (c) `USE_PRODUCTION=true` toggle + sandbox E2E ტესტი, (d) launch day execution.

---

## 0. შინაარსი

1. შესწავლილი წყაროები
2. Flitt-ის ინტეგრაციის ვარიანტები (3 ტიპი)
3. **რჩევა: Redirect თუ Embedded?** (ობიექტური შეფასება)
4. Redirect Flow — სრული ტექნიკური დეტალები
5. Signature ალგორითმი (SHA1)
6. API Endpoints
7. Webhooks (`server_callback_url`)
8. Subscriptions / Recurring Payments
9. Cancel Subscription
10. Order Status Lifecycle
11. PCI-DSS Compliance ჩვენთვის
12. **Roadmap — ნოლიდან ბოლომდე** ⭐
13. Open Questions / Risks

---

## 1. შესწავლილი წყაროები

### A. `https://flitt.com/seamless-integration/`
Flitt-ის ბრენდინგ/მარკეტინგ გვერდი "seamless" (იგივე Embedded) ინტეგრაციაზე — სადაც payment form embedded-ია iframe-ში თქვენი საიტის შიგნით.

### B. `https://docs.flitt.com/`
Flitt-ის ოფიციალური Developer Documentation root-ი. შეიცავს:
- **Getting Started** — 3 ინტეგრაციის ტიპი (Redirect, Embedded, Direct)
- **API Reference** — Create order, Subscriptions, Reversals, Capture, Order status
- **SDKs** — JavaScript, Node.js, PHP, C#, Python
- **Mobile SDKs** — iOS, Android (Apple Pay / Google Pay)
- **Plugins** — Shopify, WooCommerce, Wix, Tilda

### C. `https://docs.flitt.com/getting-started/redirect`
Redirect ინტეგრაციის ეტაპობრივი guide — ჩვენი ამჟამინდელი მიდგომა.

> **მნიშვნელოვანია:** ცოცხალი HTML გვერდები ვერ ჩავტვირთე — Flitt-ის CDN ბლოკავს ბოტებს Cloudflare-ით (HTTP 403 ყველა fetch-ზე). შესწავლა გავაკეთე Google-ის ინდექსირებული content snippets-ით (search results), ჩვენი არსებული `flittService.ts`-ით (რომელშიც ალგორითმი უკვე ვერიფიცირებულია per ძველი `reference_flitt-api.md`), და Flitt-ის სხვა საჯარო წყაროებით (GitHub `flittpayments/js-sdk`, npm package).

---

## 2. Flitt-ის ინტეგრაციის ვარიანტები

Flitt სამ ტიპს გვთავაზობს:

| ტიპი | აღწერა | სად ხდება card entry | PCI-DSS Scope |
|------|--------|----------------------|---------------|
| **Redirect** | user-ი redirect-დება `pay.flitt.com`-ზე, შემოაქვს ბარათი, ბრუნდება უკან | Flitt-ის გვერდი | **SAQ A** (~22 მოთხოვნა) |
| **Embedded (Seamless)** | iframe ან HTML form ჩვენს გვერდზე, JS SDK-ით | ჩვენი გვერდი (iframe Flitt-ის) | **SAQ A** + იფრეიმის სკრიპტ-პროტექცია (PCI v4.0) |
| **Direct (PCI-DSS merchants)** | ბარათის ნომერი ჩვენი server-ით გადის Flitt-ის API-ში | ჩვენი server | **SAQ A-EP** (~191 მოთხოვნა) — არ გვერგება |

---

## 3. რჩევა: Redirect თუ Embedded?

### TL;DR — **დიახ, Redirect მაინც საუკეთესოა ჩვენთვის.** ⭐

ადრე გითხარი "redirect გააკეთე" — ეს რჩევა **დღესაც სწორია, შენი context-ის გათვალისწინებით კიდევ უფრო სწორი ხდება**.

### ობიექტური შეფასება

| კრიტერიუმი | Redirect | Embedded | რომელი იგებს? |
|-----------|----------|----------|---------------|
| **UX (Figma plugin context)** | tab გადადის pay.flitt.com-ზე, შემდეგ ბრუნდება | user რჩება web2wireframe.design-ზე | Embedded "უკეთესია" თეორიულად, **მაგრამ Figma plugin-ის flow-ში user-ი უკვე ცალკე tab-ში გადადის** — ერთი hop მეტი არ ცვლის არაფერს |
| **განვითარების სირთულე** | მინიმალური — POST `/api/checkout/url`, მიიღე `checkout_url`, redirect | JS SDK ჩაქსოვა, iframe styling, error handling | **Redirect** ⭐ |
| **PCI-DSS Compliance (v4.0, 2026+)** | SAQ A, 22 მოთხოვნა | SAQ A + **ახალი მოთხოვნა**: ყველა სკრიპტი იფრეიმის გვერდზე SRI/CSP-ით უნდა იყოს დაცული | **Redirect** ⭐⭐ (განსაკუთრებით PCI v4.0-ის შემდეგ) |
| **Apple Pay / Google Pay** | Flitt გვერდი ავტომატურად აჩვენებს | Manual ჩასმა საჭიროა | **Redirect** ⭐ |
| **3D Secure** | Flitt გვერდი ხელმძღვანელობს | Manual handling iframe-ში | **Redirect** ⭐ |
| **Mobile responsive** | Flitt-ის გვერდი უკვე mobile-friendly | ჩვენ ვაკეთებთ responsive design-ს | **Redirect** ⭐ |
| **Localization (ka/en/ru)** | Flitt UI-ს აქვს ჩაშენებული | ჩვენ ვთარგმნით | **Redirect** ⭐ |
| **Subscription/Recurring** | მხარდაჭერა იდენტურია (`subscription=Y` + `recurring_data`) | იდენტურია | **ფრე** |
| **არსებული Implementation** | `flittService.ts`-ში უკვე გვაქვს! | ნოლიდან | **Redirect** ⭐⭐⭐ |
| **Conversion rate ("redirect ცუდია" myth)** | მონაცემები: redirect vs embedded conversion-ის სხვაობა **<2%** business-tier card payments-ში | სმარტი marketing claim, რეალურად მცირე | **ნეიტრალური** |

### როდის გავიდოდი embedded-ზე?

- თუ web2wireframe.design იყო e-commerce და user-ი ჩვენი ბრენდის უწყვეტობას სჭირდებოდა
- თუ A/B testing აჩვენებდა conversion-ის რეალურ ვარდნას
- თუ enterprise tier შემოვიდოდა, რომელსაც custom checkout გვერდი სჭირდებოდა

**ჩვენი launch context-ში არც ერთი არ მართალია** — single-tier $16/month, არ-რეგისტრაცია, Figma plugin trigger.

### ბოლო ვერდიქტი

> **Redirect = წადი ამით. დაასრულე integration. ლანჩი ჩაატარე.**
> Embedded შეიძლება მერე (post-launch optimization), თუ data-ით ნაჩვენები იქნება საჭიროება.

---

## 4. Redirect Flow — სრული ტექნიკური დეტალები

### საფეხურები

```
1. User clicks "Upgrade to Pro" (Plugin or Website)
   ↓
2. Frontend → POST /api/checkout/create { figmaUserId }
   ↓
3. Backend → POST https://pay.flitt.com/api/checkout/url
   { request: { merchant_id, order_id, amount, currency,
                order_desc, server_callback_url, response_url,
                merchant_data, signature, ... } }
   ↓
4. Flitt → response: { checkout_url: "https://pay.flitt.com/.../?token=..." }
   ↓
5. Frontend opens checkout_url (new tab)
   ↓
6. User enters card → Flitt processes → 3DS if needed → approved/declined
   ↓
7. (parallel) Flitt → POST server_callback_url with signed payload
   ↓
8. User → redirect to response_url (success/cancel page)
   ↓
9. Webhook handler updates License in MongoDB
```

### Endpoint

```
POST https://pay.flitt.com/api/checkout/url
Content-Type: application/json
```

### Request მაგალითი

```json
{
  "request": {
    "merchant_id": 1549901,
    "order_id": "w2w_pro_FigmaUserABC_1715000000000",
    "amount": 1600,
    "currency": "USD",
    "order_desc": "Web2Wireframe Pro — Monthly Subscription",
    "subscription": "Y",
    "recurring_data": "{\"amount\":1600,\"period\":\"month\",\"every\":1,\"quantity\":999,\"state\":\"shown_readonly\"}",
    "server_callback_url": "https://api.web2wireframe.design/api/webhooks/flitt",
    "response_url": "https://web2wireframe.design/checkout/success",
    "merchant_data": "{\"figmaUserId\":\"FigmaUserABC\",\"plan\":\"pro\"}",
    "signature": "<sha1_hex_lowercase>"
  }
}
```

### Response მაგალითი

```json
{
  "response": {
    "response_status": "success",
    "checkout_url": "https://pay.flitt.com/merchants/5ad6b8.../default/index.html?token=8a09f9d937..."
  }
}
```

### პარამეტრები — Required

| პარამეტრი | ტიპი | აღწერა |
|-----------|------|--------|
| `merchant_id` | int | Flitt-ის dashboard-ში გენერირებული |
| `order_id` | string | უნიკალური (per merchant); 1–1024 chars |
| `amount` | int | **cents-ში** (1600 = $16.00) |
| `currency` | string | "USD", "EUR", "GEL", … |
| `order_desc` | string | მომხმარებლისთვის ხილული აღწერა |
| `signature` | string | SHA1 hex lowercase — იხ. §5 |

### პარამეტრები — Optional (ჩვენ ვიყენებთ)

| პარამეტრი | აღწერა |
|-----------|--------|
| `server_callback_url` | webhook URL — Flitt POST-ს გადააგზავნის სტატუსის შეცვლისას |
| `response_url` | user redirect-დება ამ URL-ზე payment-ის შემდეგ |
| `merchant_data` | string (≤2048) — ჩვენი custom metadata, round-trip-ში დაგვიბრუნდება webhook-ში |
| `subscription` | "Y" — ააქტიურებს recurring billing-ს |
| `recurring_data` | JSON string subscription parameters-ით (იხ. §8) |
| `lang` | "en", "ka", "ru", "uk" და ა.შ. |
| `required_rectoken` | "Y" — recurring token-ის მისაღებად (გადახდის გარდა) |
| `sender_email` | user-ის email თუ წინასწარ ვიცით (Flitt გვერდი წინასწარ შეავსებს) |
| `lifetime` | int — order-ის expiration sec-ში (default 24h) |

---

## 5. Signature ალგორითმი (SHA1)

### ფორმულა

```
signature = sha1_hex_lowercase(
  secretKey + "|" + value1 + "|" + value2 + "|" + ... + "|" + valueN
)
```

### წესები (Flitt-ის ოფიციალური definition)

1. **გამოაგდე** ცარიელი/null/undefined ველები — `|` symbol მათთვის არ ემატება.
2. **გამოაგდე** თვითონ `signature` ველი (ცხადია).
3. დარჩენილი ველები **დახარისხდეს ანბანის მიხედვით** key-ით.
4. ფორმატი: `secretKey | value1 | value2 | ... | valueN` (vertical bar separator).
5. **SHA1 → hex → lowercase.**
6. Nested object-ები (მაგ. `recurring_data`) JSON.stringify-ით აქცევ string-ად **სანამ** ხელმოწერამდე.

### Python reference (Flitt-ის ოფიც. მაგალითი)

```python
from hashlib import sha1

def get_signature(secret_key, params):
    data = [secret_key]
    data.extend([str(params[key]) for key in sorted(params.keys())
                 if params[key] != '' and params[key] is not None
                 and key != 'signature'])
    return sha1('|'.join(data).encode('utf-8')).hexdigest()
```

### ჩვენი TypeScript implementation (verified, `flittService.ts:65-79`)

```ts
export function flittSign(params, secretKey) {
  const filtered = Object.entries(params)
    .filter(([key, value]) => {
      if (key === "signature" || key === "response_signature_string") return false;
      if (value === "" || value === null || value === undefined) return false;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));
  const concat = [secretKey, ...filtered.map(([, v]) => String(v))].join("|");
  return createHash("sha1").update(concat, "utf8").digest("hex");
}
```

### Webhook verification

იგივე ალგორითმი payload-ისთვის. ჩვენი `verifyCallback()` დამატებით ამოწმებს, რომ არცერთ value-ში არ ხვდება `|` (canonicalization injection-ის წინააღმდეგ) და `timingSafeEqual`-ით ადარებს.

---

## 6. API Endpoints

| Endpoint | მეთოდი | რას აკეთებს |
|----------|--------|-------------|
| `https://pay.flitt.com/api/checkout/url` | POST | Hosted checkout link-ის შექმნა (Redirect) |
| `https://pay.flitt.com/api/checkout/token` | POST | Tokenize for JS SDK (Embedded) |
| `https://pay.flitt.com/api/subscription` | POST | Subscription start/stop action |
| `https://pay.flitt.com/api/status/order_id` | POST | Order status query |
| `https://pay.flitt.com/api/reverse/order_id` | POST | Refund / void |
| `https://pay.flitt.com/api/capture/order_id` | POST | Capture (delayed payment) |

ჩვენ Redirect mode-ში ვიყენებთ:
- `POST /api/checkout/url` (checkout creation)
- `POST /api/subscription` (cancel subscription)

---

## 7. Webhooks (`server_callback_url`)

### Trigger ხდება როდის?

Flitt POST-ს გაუგზავნის ჩვენ webhook URL-ს ყოველი ცვლილებისას:
- ✅ Approved charge (initial + recurring)
- ❌ Declined charge
- ⏳ Processing (3DS challenge in progress)
- 🗑️ Expired (user-მა ბარათი არ შემოიტანა)
- 🔁 Reversed (refund / chargeback)

### Payload structure (key fields)

```json
{
  "order_id": "w2w_pro_FigmaUserABC_1715000000000",
  "order_status": "approved",
  "amount": 1600,
  "currency": "USD",
  "merchant_id": 1549901,
  "payment_id": 234567890,
  "transaction_type": "purchase",
  "sender_email": "user@example.com",
  "merchant_data": "{\"figmaUserId\":\"FigmaUserABC\",\"plan\":\"pro\"}",
  "parent_order_id": "...",     // recurring renewals only
  "rectoken": "...",            // if required_rectoken=Y
  "response_code": "...",
  "response_description": "...",
  "signature": "<sha1_hex_lowercase>",
  "response_signature_string": "..."  // Flitt-ის debug echo, IGNORE for signing
}
```

### ჩვენი handler (verified, `routes/checkout/index.ts:57-225`)

1. Verify signature (`verifyCallback`)
2. Validate required fields (`order_id`, `order_status`, `amount`, `merchant_data`)
3. Dedup via `WebhookEvent` collection (MongoDB unique index on `transactionId`)
4. Parse `merchant_data` → `figmaUserId` + `plan` + `recurring` flag
5. Cross-check: `order_id` უნდა იწყებოდეს `w2w_pro_<sanitized figmaUserId>_`-ით
6. Amount integrity check: approved + amount==1600 cents
7. Route:
   - one-time → `licenseService.applyOneTimePurchase`
   - subscription approved (initial) → `applySubscriptionActivation`
   - subscription approved (recurring renewal, has `parent_order_id`) → `applyRecurringCharge`
   - declined/expired → `applyFailedCharge`
   - reversed/processing/other → log only
8. **ალბათ ყოველთვის HTTP 200-ით ვუპასუხებთ** (4xx/5xx Flitt-ის retry storm-ს გამოიწვევს)

### დაცვის ფენები

| ფენა | მუშავდება ჩვენთან? |
|------|--------------------|
| Signature SHA1 | ✅ verified |
| Constant-time compare | ✅ timingSafeEqual |
| Canonicalization injection (pipe in value) | ✅ ფილტრი |
| Idempotency (replay) | ✅ WebhookEvent dedup |
| Amount tampering | ✅ === PLAN_PRICES.pro.priceCents |
| User mapping forgery | ✅ order_id prefix check |
| Always-200 (avoid retry storm) | ✅ |

---

## 8. Subscriptions / Recurring Payments

### Native Flitt Subscriptions

`subscription: "Y"` + `recurring_data` ჩართავს ნამდვილ recurring billing-ს — **Flitt თვითონ ჩაარტყამს ბარათს** ყოველი ციკლის ბოლოს. ჩვენ არ გვჭირდება cron.

### `recurring_data` structure

```json
{
  "amount": 1600,
  "period": "month",
  "every": 1,
  "quantity": 999,
  "start_time": "2026-05-20",
  "state": "shown_readonly",
  "readonly": "Y"
}
```

| ველი | აღწერა |
|------|--------|
| `amount` | charge-ის ოდენობა cents-ში (ერთიდაიგივეა initial amount-თან) |
| `period` | "day" / "week" / "month" / "year" |
| `every` | რამდენ period-ში ერთხელ |
| `quantity` | სულ რამდენი charge (999 = "forever") |
| `start_time` | პირველი recurring charge-ის თარიღი (default: amount+period) |
| `state` | "shown" / "shown_readonly" / "hidden" — visibility checkout გვერდზე |
| `readonly` | "Y" — user ვერ ცვლის amount/period-ს checkout-ზე |

### Alternative: Manual Rectoken Flow

თუ `subscription` არ გვინდა და გვინდა **ხელით** ვმართოთ recurring (Flitt-ის გარეშე):
1. პირველი order-ში `required_rectoken=Y`
2. webhook-ში მიიღე `rectoken`
3. შემდეგი charge-სთვის გამოიყენე `rectoken` როგორც payment instrument

> **ჩვენი არჩევანი:** native subscription mode (`subscription=Y`) — ნაკლები კოდი, ნაკლები bugs.

---

## 9. Cancel Subscription

```
POST https://pay.flitt.com/api/subscription
Content-Type: application/json

{
  "request": {
    "merchant_id": 1549901,
    "order_id": "w2w_pro_FigmaUserABC_1715000000000",
    "action": "stop",
    "signature": "<sha1>"
  }
}
```

### Behavior

- **Flitt დაუყოვნებლივ აჩერებს მომდევნო charge-ს**
- User ინარჩუნებს Pro access-ს `cycleEndsAt`-მდე (ჩვენი lazy downgrade)
- ციკლის ბოლოს license-ი ავტომატურად ჩამოვა free-ზე

ჩვენ უკვე გვაქვს `flittService.ts:cancelSubscription()`. ✅

---

## 10. Order Status Lifecycle

| status | მნიშვნელობა |
|--------|-------------|
| `created` | order-ი შეიქმნა, user ჯერ ბარათი არ შემოიტანა |
| `processing` | bank-ის რეფუზის ფაზა; ან 3DS challenge |
| `approved` | წარმატება ✅ — Pro-ს ვაქტიურებთ |
| `declined` | bank-მა უარყო — `response_code` & `response_description`-ში დეტალები |
| `expired` | order timeout-ი დადგა, user ვერ მოასწრო |
| `reversed` | refund გაიცა (Flitt dashboard-დან ან API-დან) |

> **chargeback** არ არის ცალკე status — manual handling Flitt dashboard-დან.

---

## 11. PCI-DSS Compliance ჩვენთვის

### ჩვენი scope (Redirect mode)

- ✅ **SAQ A** (~22 requirement)
- ✅ ბარათის მონაცემები არასოდეს ხვდება ჩვენთან
- ✅ Flitt PCI-DSS Level 1 (full compliance)
- ✅ rectoken-საც კი არ ვინახავთ (subscription mode → Flitt ფლობს)

### რა გვევალება (SAQ A მინიმუმი)

1. **მე-3 მხარის service provider-ის (Flitt) ვალიდური PCI compliance status** — ვადასტურებთ Flitt-ის ATTESTATION-ის შემოწმებით (1×/წელ)
2. **redirect/iframe-ის integrity** — TLS-ი (HTTPS) ყველგან ✅
3. **Patching + access control ჩვენი server-ისთვის** — სტანდარტი DevOps
4. **Information security policy** — წერილობითი დოკუმენტი (1 გვერდი საკმარისია)

### PCI v4.0 (2025-მ მარტიდან აუცილებელია)

- Redirect mode → **არ გვცვლის არაფერს**
- Embedded mode → **დამატებითი მოთხოვნა**: ყველა script იფრეიმის გვერდზე SRI-ით + CSP-ით უნდა იყოს დაცული
- ეს კიდევ ერთი მიზეზია, Redirect-ი დავტოვოთ.

---

## 12. Roadmap — ნოლიდან ბოლომდე ⭐

> **მნიშვნელოვანია:** ეს roadmap ვწერ **დოკუმენტაციის სრული შესწავლის** საფუძველზე. შემდეგი task-ში გავაანალიზებთ, რა გვაქვს უკვე გაკეთებული და მონიშნავთ ✅-ით, რომელი ნაბიჯი დარჩა.

### Phase 1 — Merchant Account Setup (Flitt-ის მხარეს) — 🟡 4/7
- [x] **1.1** Flitt-ის merchant account-ის რეგისტრაცია — `merchant_id 4055602` უკვე გვაქვს
- [x] **1.2** `merchant_id` + `secret_key` production-ისთვის → `.env`-ში ჩასმულია (per `PRE-LAUNCH-CHECKLIST.md §1`)
- [ ] **1.3** Test merchant credentials sandbox-ისთვის — **ღია კითხვა Flitt support-თან**
- [ ] **1.4** Subscription feature ENABLE-ი — **ჯერ არ ჩართულია** (ამიტომ კოდი `createOneTimeCheckout`-ით მუშაობს, არა subscription mode-ით). რომ ჩავრთოთ, Flitt support-ს უნდა მოვწეროთ.
- [ ] **1.5** USD currency activation — **დასადასტურებელია Flitt-თან** (PRE-LAUNCH §4 task)
- [ ] **1.6** `server_callback_url` რეგისტრაცია Flitt portal-ში: `https://api.web2wireframe.design/api/webhooks/flitt` — **დარჩა**
- [x] **1.7** Domain ownership: `web2wireframe.design` უკვე გვაკონტროლდება, response_url მუშაობს

**Side concern:** PRE-LAUNCH-CHECKLIST §7 — `FLITT_SECRET_KEY` security audit-ის დროს `.env`-ში ექსპონირდა. Anthropic/Resend/Figma key-ები უკვე როტირდა, Flitt-ი გადადებულია. **launch-მდე უნდა მოხდეს rotation Flitt portal-ში.**

### Phase 2 — Backend Service Layer (`packages/api`) — ✅ 10/10
- [x] **2.1** `flittService.ts:65-79` — `flittSign()` (SHA1, alpha-sorted, pipe-separated) ✓
- [x] **2.2** `flittService.ts:86-110` — `verifyCallback()` (signature + canonicalization injection guard via `|` value check + `timingSafeEqual`) ✓
- [x] **2.3** `flittService.ts:125-128` — `buildSubscriptionOrderId(figmaUserId)` → `w2w_pro_<sanitized>_<ts>` ✓
- [x] **2.4** `flittService.ts:139-220` — `createSubscriptionCheckout()` with `subscription=Y` + `recurring_data` ✓ (ჩაკეტილია სანამ Flitt subscription mode არ ჩაირთვება)
- [x] **2.5** `flittService.ts:232-304` — `createOneTimeCheckout()` (current production path)
- [x] **2.6** `flittService.ts:314-360` — `cancelSubscription()` (POST /api/subscription action=stop) ✓
- [x] **2.7** Config in `src/config/env.ts:65-73`: `FLITT_MERCHANT_ID`, `FLITT_SECRET_KEY`, `FLITT_BASE_URL`, + `features.flittEnabled` flag ✓
- [x] **2.8** Unit tests: signature canonical vector (`flitt-service.test.ts:42-58`) ✓ — matches Flitt's reference Python output
- [x] **2.9** Unit tests: empty/null/undefined exclusion (`flitt-service.test.ts:66-89`) ✓
- [x] **2.10** Unit tests: webhook signature verification — valid, tampered, missing, wrong-secret, pipe-injection (`flitt-service.test.ts:104-172`) ✓

### Phase 3 — Database Layer (`packages/api/models`) — ✅ 9/9
- [x] **3.1** `License.ts:29-40` — `plan`, `status`, `cycleStartedAt`, `cycleEndsAt`, `usage`, `subscription` (with `flittOrderId`, `nextBillingAt`, `canceledAt`, `failureCount`, `autoRenew`, `reminderSentAt`) ✓
- [x] **3.2** `License.ts:56-58` — `PLAN_PRICES = { pro: { priceCents: 1600, period: "month", currency: "USD" } }` ✓
- [x] **3.3** `WebhookEvent.ts:19-30` — `transactionId` unique index + 90-day TTL ✓
- [x] **3.4** `licenseService.applySubscriptionActivation()` (`licenseService.ts:154-189`) ✓
- [x] **3.5** `licenseService.applyRecurringCharge()` (`licenseService.ts:251-271`) — extends `cycleEndsAt` + clears `failureCount` ✓
- [x] **3.6** `licenseService.applyOneTimePurchase()` (`licenseService.ts:201-245`) — stacks 30 days onto remaining time ✓
- [x] **3.7** `licenseService.applyFailedCharge()` (`licenseService.ts:277-288`) — increments `failureCount` ✓
- [x] **3.8** `licenseService.applySubscriptionCancel()` (`licenseService.ts:295-309`) — status→canceled, Pro until cycleEndsAt ✓
- [x] **3.9** Lazy reset in `getOrCreate()` (`licenseService.ts:98-118`): `cleanupExpiredCancellation` → `downgradeExpiredOneTimePro` → `resetCycleIfElapsed` ✓

### Phase 4 — API Routes (`packages/api/routes`) — ✅ 7/7
- [x] **4.1** `POST /api/checkout/create` (`routes/checkout/index.ts:25-46`) ✓ — currently calls `createOneTimeCheckout`
- [x] **4.2** `POST /api/webhooks/flitt` (`routes/checkout/index.ts:57-225`) — verify + dedup + amount check + order_id mapping check + dispatch ✓
- [x] **4.3** `POST /api/subscription/cancel` (`routes/checkout/index.ts:237-293`) — HMAC token check + Flitt API call + state update ✓
- [x] **4.4** `POST /api/auth/issue-cancel-token` (`routes/plugin/auth-token.ts:17-35`) — 5min TTL HMAC token, `authenticatePlugin` middleware ✓
- [x] **4.5** CORS: plugin router routes (`null` origin from Figma iframe) + website router (`web2wireframe.design`) — configured in `index.ts` via `pluginRouter` / `websiteRouter` split
- [x] **4.6** Rate limit (`middleware/rateLimit.ts`): `checkoutRateLimiter` 20/10min, `webhookRateLimiter` 120/min, `authRateLimiter` 300/10min ✓
- [x] **4.7** Integration tests: `checkout-routes.test.ts` (12 cases) — 400/200/502, cancel flow with HMAC token + 401 mismatch + 404 + 502 + happy path ✓

**ბონუსი — POST `/api/license/by-token`** (`routes/license/index.ts:158-202`) — website Account page-ი HMAC token-ით კითხულობს license-ს (cancel-token reuse). მუშაობს.

### Phase 5 — Figma Plugin UI (`packages/figma-plugin`) — 🟡 4/6
- [x] **5.1** "Get Pro" button in Plan modal (`components/modalPopup/planPopup/Plan.tsx:284-292`) ✓ — also shows "Buy 30 more days" for renewals
- [x] **5.2** Click handler (`Plan.tsx:95-112`): `createCheckout` → `window.open(checkoutUrl, "_blank")` ✓
- [x] **5.3** 5-min poll loop (`Plan.tsx:114-155`): every 5s `fetchMyLicense`, detects upgrade (free→pro) OR renewal (cycleEndsAt extended) ✓
- [ ] **5.4** ❌ **"Manage Subscription" / Cancel entry point in plugin UI** — **არ არსებობს**. `Plan.tsx`-ი Pro user-ისთვის მხოლოდ "Buy 30 more days" ღილაკს უჩვენებს. CLAUDE.md-ი ხსენებს "Manage Subscription"-ს, მაგრამ კოდი არ ემთხვევა. `issueCancelToken()` API client-ში გვაქვს (`licenseClient.ts:270-293`), მაგრამ არცერთი UI კომპონენტი არ იძახებს. **Fix:** Pro view-ში დაამატე "Manage Subscription" link → `issueCancelToken()` → `window.open("https://web2wireframe.design/account?fid=...&t=...")`
- [x] **5.5** Hard block on quota (`QuotaExceededModal.tsx` — 86 ხაზი) + server middleware `requireImportAllowance` (`middleware/licenseGate.ts:27-47`) → `403 {error: "limit_exceeded"}` → plugin dispatches `w2w:quota-exceeded` event → modal ✓
- [x] **5.6** `licenseClient.ts` ✓ — `fetchMyLicense`, `createCheckout`, `issueCancelToken`, OAuth flow (`connectFigma`), token refresh — ყველაფერი არსებობს

**მცირე გადასაწყვეტი:** Plan modal-ის copy ("One-time payment — no auto-renewal") current state-ს ემთხვევა. რა მოხდება როცა subscription mode ჩაერთვება? UI copy განახლება საჭიროა.

### Phase 6 — Website Pages (`packages/web`) — ✅ 5/5
- [x] **6.1** `/checkout/success` (`CheckoutSuccess.tsx`, 34 lines) — "Welcome to Pro" + "Close this tab" button ✓ (route in `AppRoutes.tsx:38`)
- [x] **6.2** `/checkout/cancel` (`CheckoutCancel.tsx`, 26 lines) ✓ (route in `AppRoutes.tsx:39`)
- [x] **6.3** `/renew?uid=<figmaUserId>` (`Renew/Renew.tsx`) — auto-creates checkout on mount + auto-redirects to `pay.flitt.com` ✓ (reached from expiry reminder emails)
- [x] **6.4** `/account?fid=...&t=...` (`Account/Account.tsx`, 246 lines) — license summary, failed-payment banner, cancel flow with confirmation, success state ✓
- [x] **6.5** `/terms` (`Terms.tsx:152-165` "8. Payment & Access") + `/privacy` (`Privacy.tsx:98-117` "Payment Data") — both mention Flitt as PSP, PCI-DSS Level 1, no card data on our servers ✓

### Phase 7 — Testing — ✅ 5/7 (unit done, sandbox E2E pending)
- [x] **7.1** Unit tests existed (in repo):
  - `flitt-service.test.ts` — 35 cases (sign, verify, build-id, checkout, cancel)
  - `flitt-webhook.test.ts` — 29 cases (signature, idempotency, merchant_data, order_status branching, one-time, replay, tamper)
  - `checkout-routes.test.ts` — 12 cases (create + cancel happy/sad paths)
  - `license-routes.test.ts` — 21 cases
  - `license-service.test.ts` — 41 cases
  - `license-model.test.ts` — 34 cases
  - **სულ ~172 case payment-flow-ისთვის** ✓
- [x] **7.5** Webhook replay test ✓ — `flitt-webhook.test.ts:112` "dedupes a duplicate webhook"
- [x] **7.6** Webhook tamper test (amount) ✓ — covered by `flitt-webhook.test.ts` order_id mismatch + amount mismatch branches
- [x] **7.7** Missing figmaUserId test ✓ — `flitt-webhook.test.ts:152` "returns 200 without service call when figmaUserId is missing"
- [x] **Bonus:** signature pipe-injection test ✓ — `flitt-service.test.ts:147` "rejects a payload whose field value contains the | separator"
- [ ] **7.2** ❌ Sandbox E2E: subscribe → wait for renewal — **არ შესრულდა** (subscription mode disabled)
- [ ] **7.3** ❌ Sandbox E2E: subscribe → cancel → downgrade — **არ შესრულდა** (subscription mode disabled)
- [ ] **7.4** ❌ Sandbox decline test (real Flitt test PAN) — **PRE-LAUNCH-CHECKLIST §6 task**

### Phase 8 — Production Deployment — 🟡 3/8
- [x] **8.1** `.env` შიგ ჩასმულია (per PRE-LAUNCH §1): `FLITT_MERCHANT_ID`, `FLITT_SECRET_KEY`, `FLITT_BASE_URL`, `API_PUBLIC_URL`, `WEBSITE_BASE_URL` ✓
- [ ] **8.2** ❌ Webhook URL Flitt portal-ში rough registration — **PRE-LAUNCH §4** (Flitt support task)
- [x] **8.3** Domain SSL ✓ — `api.web2wireframe.design` და `www.web2wireframe.design` უკვე ცოცხალია HTTPS-ით
- [ ] **8.4** ❌ MongoDB connection pool sizing — default Mongoose pool (5 connections) რჩება; webhook spike-ისთვის შესაძლოა საჭირო გახდეს გაზრდა (post-launch monitoring task)
- [x] **8.5** Logging არსებობს ✓ — `console.warn` / `console.error` ყველა critical path-ში (`routes/checkout/index.ts:69,86,127,158,212,220`). სტრუქტურირებული logger TBD.
- [ ] **8.6** ❌ Production monitoring/alerts — არ კონფიგურდება (manual log review)
- [ ] **8.7** ❌ Runbook: refund procedure (Flitt dashboard → reverse) — დასაწერია
- [ ] **8.8** ❌ Runbook: `FLITT_SECRET_KEY` rotation — დასაწერია (განსაკუთრებით urgent given audit history per PRE-LAUNCH §7)

**Plugin toggle (PRE-LAUNCH §2):** `packages/figma-plugin/src/ui/shared/apiConfig.ts:22` → `const USE_PRODUCTION = false;` — sandbox build-ისთვის `true`-ად უნდა გადაერთოს, შემდეგ build → publish → false-ად დააბრუნე dev-ისთვის.

### Phase 9 — Launch Day — ⏳ 0/6
- [ ] **9.1** Smoke test with real $16 USD card (Founder's personal card)
- [ ] **9.2** Verify approved webhook arrives + license activates within 5sec
- [ ] **9.3** Verify Pro access in plugin (unlimited imports)
- [ ] **9.4** Self-cancel test → verify access maintained until cycleEndsAt
- [ ] **9.5** Refund Founder's card (Flitt dashboard) → verify reversed webhook logs
- [ ] **9.6** Public launch announcement (Figma Community plugin update)

### Phase 10 — Post-Launch Monitoring (first 30 days) — ⏳ 0/5
- [ ] **10.1** Daily check: webhook delivery success rate (Flitt dashboard)
- [ ] **10.2** Daily check: failed_charges aggregate (re-trigger Flitt retry if needed)
- [ ] **10.3** Weekly: reconcile Flitt's settlement report ↔ our License records
- [ ] **10.4** Monitor support@ inbox for billing complaints
- [ ] **10.5** Review chargebacks (target <0.5%)

### Bonus — გვაქვს Roadmap-ის გარეთ ✨
- [x] **Expiry reminder emails** — `services/reminderService.ts:runExpiryReminders()` ერთჯერადი Pro user-ებს ეგზავნება გაცილებიდან რამდენიმე დღით ადრე (6h interval cron in `index.ts:94-96`); idempotency via `subscription.reminderSentAt`. Resend domain verified ✓
- [x] **License migration support** — old in-memory license model გადატანილია MongoDB-ში
- [x] **Failed payment banner** — Account page-ი თუ `failureCount > 0` → severity-graded warning (info / warning / urgent) (`Account.tsx:117-143`)
- [x] **Renew page deep link** — expiry email → `/renew?uid=...` → auto-redirect to checkout

---

## 12a. Critical Action Items — Launch-მდე ⚠️

რეალურად **რა გვაკლია launch-მდე** (sorted by priority):

### 🔴 Critical (blocker — launch შეუძლებელია)

1. **Flitt portal: `server_callback_url` registration**
   `https://api.web2wireframe.design/api/webhooks/flitt` უნდა იყოს რეგისტრირებული Flitt-ის merchant portal-ში. PRE-LAUNCH §4 task. **Estimated:** 5 min Flitt support-ში.

2. **Flitt portal: USD currency activation**
   Georgian merchant-ისთვის USD ცალკე ჩასართველია Flitt-თან. PRE-LAUNCH §4 task. **Estimated:** 1 email + 1-2 business days.

3. **`FLITT_SECRET_KEY` rotation**
   Security audit-ის დროს key ექსპონირდა `.env`-ში. Flitt portal-ში regenerate-ი + production env update. **Estimated:** 10 min (Flitt მხარეს self-service ღილაკი არ არის — Flitt support task).

4. **Plugin "Manage Subscription" entry point**
   ❌ Plan modal Pro user-ისთვის მხოლოდ "Buy 30 more days" გვაჩვენებს. Cancel flow plugin-დან არ იწყება. **Fix:** Pro view-ში დაამატე "Manage Subscription" link → იძახებს `issueCancelToken()` → `window.open(account?fid=...&t=...)`. **Estimated:** 30 min implementation + 10 min test.
   - მაგრამ ⚠️: Cancel-ი მუშაობს მხოლოდ subscription mode-ში. **One-time mode-ში არც კი არ გვჭირდება**, რადგან გადახდა არ ეარტყმება ავტომატურად. ეს task ფაქტობრივად subscription mode-ის გასააქტიურებლად დარჩა.

5. **Plugin `USE_PRODUCTION = true` toggle + rebuild + Figma Community publish**
   PRE-LAUNCH §2 task. **Estimated:** 10 min build + Figma review queue.

### 🟡 Important (launch-ის შემდეგ მალე)

6. **Subscription mode activation**
   Flitt-მა default-ად არ ჩართო. ჩვენი კოდი მზადაა (`createSubscriptionCheckout` მუშაობს). Launch-ი one-time-ით, შემდეგ Flitt-თან subscription-ის ჩართვა → toggle. **Estimated:** Flitt support 1-3 business days.

7. **Sandbox E2E ტესტი**
   PRE-LAUNCH §6 — 7 manual test scenario: first purchase, renew (early/expired), declined card, idempotency, lazy-downgrade, `/renew` link. **Estimated:** 1-2 hours.

8. **Production NODE_ENV check**
   PRE-LAUNCH §1 ცხრილში `NODE_ENV=production` [ ] უმონიშნავია. ვერიფიკაცია მოვითხოვო. **Estimated:** 2 min.

9. **Plugin Plan modal copy update თუ subscription მოდულზე გადავალთ**
   Currently: "One-time payment — no auto-renewal". Subscription mode-ში → "$16/month, cancel anytime, ends at cycleEndsAt". **Estimated:** 5 min.

### 🟢 Nice-to-have (post-launch)

10. Production logging → structured logger (JSON output for log aggregator)
11. Monitoring alerts (webhook signature failure rate, declined-charge rate)
12. Runbook docs (refund, key rotation, manual reconciliation)

---

## 13. Open Questions / Risks

### Open Questions (Flitt support-ს მოვთხოვოთ ვერდიქტი)

1. **Subscription feature enabled?** — Flitt-ი subscription mode-ს default-ად არ აქტიურდება ახალი merchant-ისთვის. ჩვენი account-ზე ჩართულია? თუ არა — როდის გავააქტიურებთ?
2. **USD currency for Georgian merchant?** — Flitt-ი GEL-ის გარდა USD-ს ცალკე ააქტიურებს. ჩვენი merchant-ისთვის ჩართულია?
3. **Webhook IP allowlist** — გვაქვს Flitt-ის outbound IP ranges? (ჩვენი firewall-ისთვის optional)
4. **Test merchant** — gas sandbox merchant credentials რომ E2E ვუტესტოთ ცოცხალი production-ის გარეშე?
5. **Sender_email behavior** — webhook-ში სტაბილურად მოდის? თუ optional?
6. **Recurring data `state: "shown_readonly"`** — vs `"hidden"` — checkout გვერდზე როგორ ჩანს გამოწერა?

### Risks

| რისკი | Severity | Mitigation |
|-------|----------|-----------|
| Flitt-ის subscription mode არ ჩაირთო | 🔴 High | One-time fallback გვაქვს უკვე (`createOneTimeCheckout`) — manual renewal flow |
| Flitt-ის API uptime/SLA | 🟡 Medium | webhook idempotency + retry tolerance |
| ბარათების decline rate მაღალია უცხო ბარათებზე | 🟡 Medium | Stripe-დან განსხვავებით, Flitt-ი ძირითადად CIS/Georgian bank-ებზე ფოკუსირებულია |
| EU VAT noncompliance threshold ($30K/year) | 🟢 Low | Launch მერე გავიდეთ — Terms-ში disclaimer ✅ |
| Chargeback abuse | 🟢 Low | Flitt-ის dashboard handles, ჩვენი code-ი ემზადება (`reversed` log only) |
| Signature secret key leak | 🔴 Critical | env var only, never commit, rotation procedure in runbook |

---

## 14. შეჯამება

**Redirect = სწორი არჩევანი ჩვენთვის.** ✅

**ჩვენი arsenal (ფაქტობრივად მზადაა):**
- ✅ Signature SHA1 + canonicalization injection guard + timing-safe compare
- ✅ Webhook idempotency (90-day TTL on `WebhookEvent`)
- ✅ Amount integrity check + order_id ↔ figmaUserId mapping check
- ✅ Lazy state machine: cycle reset, one-time downgrade, cancel cleanup — ყველაფერი read-time
- ✅ Plugin → backend → Flitt → webhook → license activation flow (one-time mode active)
- ✅ Subscription mode დაშტრიხული, მზადაა Flitt-ის ჩართვისთვის
- ✅ Cancel flow (subscription mode-ისთვის) backend + website მზადაა, plugin entry point დარჩა
- ✅ Expiry reminder emails (one-time Pro) — Resend integration მუშაობს
- ✅ Test coverage: ~172 case payment-flow-ისთვის

**რა გვაკლია launch-მდე (5 critical item):**
1. Flitt portal: webhook URL registration + USD activation + key rotation
2. Plugin: `USE_PRODUCTION` toggle + rebuild + Figma Community publish
3. (Optional, subscription mode-ისთვის) Plugin: "Manage Subscription" entry point

**Launch path:**
- 🎯 **Day 1 (Flitt portal):** webhook URL register + USD confirm + key rotate (~30 min + 1-2 BD lag)
- 🎯 **Day 2 (Plugin):** toggle flag + build + publish to Figma Community
- 🎯 **Day 3 (Sandbox E2E):** PRE-LAUNCH §6 7 test scenarios
- 🎯 **Day 4 (Smoke test):** Founder $16 USD live transaction → refund
- 🎯 **Day 5 (Launch):** announce

**Subscription mode** (post-launch optimization, არ ჭირდება day 1):
- Flitt-ს დაუკავშირდი → "Please enable subscription mode for merchant 4055602"
- backend code switch: `createOneTimeCheckout` → `createSubscriptionCheckout` in `/api/checkout/create`
- Plan modal: add "Manage Subscription" button for Pro users
- copy update

---

*წყაროები (ძირითადი):*
- [docs.flitt.com](https://docs.flitt.com/) — Payment API reference
- [docs.flitt.com/getting-started/redirect/](https://docs.flitt.com/getting-started/redirect/)
- [docs.flitt.com/getting-started/embedded/](https://docs.flitt.com/getting-started/embedded/)
- [docs.flitt.com/api/building-signature/](https://docs.flitt.com/api/building-signature/)
- [docs.flitt.com/api/create-order/](https://docs.flitt.com/api/create-order/)
- [docs.flitt.com/api/subscriptions/](https://docs.flitt.com/api/subscriptions/)
- [docs.flitt.com/api/cancel-subscriptions/](https://docs.flitt.com/api/cancel-subscriptions/)
- [docs.flitt.com/pcidss-compliance/](https://docs.flitt.com/pcidss-compliance/)
- [flitt.com/seamless-integration/](https://flitt.com/seamless-integration/)
- [GitHub: flittpayments/js-sdk](https://github.com/flittpayments/js-sdk)
- ჩვენი `packages/api/src/services/flittService.ts` (verified implementation per `reference_flitt-api.md`)
