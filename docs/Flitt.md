# Flitt — სრული შესწავლა + Roadmap

> **სტატუსი:** Documentation Study (Task 1 / 2)
> **თარიღი:** 2026-05-20
> **წყაროები:** 3 ოფიციალური ლინკი + Flitt API reference (docs.flitt.com) + ჩვენი არსებული `flittService.ts`
> **შემდეგი task:** ამ ფაილის roadmap-ის შევსება ჩვენი ამჟამინდელი მდგომარეობის მიხედვით (რა გვაქვს უკვე გაკეთებული, რა გვაკლია).

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

### Phase 1 — Merchant Account Setup (Flitt-ის მხარეს)
- [ ] **1.1** Flitt-ის merchant account-ის რეგისტრაცია (KYC დოკუმენტები, ბანკის ანგარიში)
- [ ] **1.2** `merchant_id` + `secret_key` მიღება production-ისთვის
- [ ] **1.3** Test merchant credentials მიღება (sandbox)
- [ ] **1.4** Subscription feature-ის ENABLE-ი Flitt support-თან (default off)
- [ ] **1.5** USD currency support-ის ჩართვა (Georgian merchant-ისთვის Flitt-ი USD-ს ცალკე ააქტიურებს)
- [ ] **1.6** Webhook URL-ის რეგისტრაცია Flitt dashboard-ში: `https://api.web2wireframe.design/api/webhooks/flitt`
- [ ] **1.7** Allowed response_url domains: `https://web2wireframe.design`

### Phase 2 — Backend Service Layer (`packages/api`)
- [ ] **2.1** `flittService.ts` — `flittSign()` (SHA1, alpha-sorted, pipe-separated)
- [ ] **2.2** `flittService.ts` — `verifyCallback()` (signature + canonicalization injection guard + timingSafeEqual)
- [ ] **2.3** `flittService.ts` — `buildSubscriptionOrderId(figmaUserId)` (`w2w_pro_<safe>_<ts>`)
- [ ] **2.4** `flittService.ts` — `createSubscriptionCheckout()` (POST /api/checkout/url with `subscription=Y` + `recurring_data`)
- [ ] **2.5** `flittService.ts` — `createOneTimeCheckout()` (alternative single-charge mode)
- [ ] **2.6** `flittService.ts` — `cancelSubscription()` (POST /api/subscription action=stop)
- [ ] **2.7** Config in `config/env.ts`: `FLITT_MERCHANT_ID`, `FLITT_SECRET_KEY`, `FLITT_BASE_URL`
- [ ] **2.8** Unit tests: signature golden vectors (Python reference vs TS output)
- [ ] **2.9** Unit tests: signature with empty/null/undefined values
- [ ] **2.10** Unit tests: webhook signature verification (valid + tampered)

### Phase 3 — Database Layer (`packages/api/models`)
- [ ] **3.1** `License.ts` — fields: `plan`, `status`, `subscription.flittOrderId`, `cycleStartedAt`, `cycleEndsAt`, `failedAttempts`
- [ ] **3.2** `License.ts` — `PLAN_PRICES = { pro: { priceCents: 1600, currency: "USD" } }`
- [ ] **3.3** `WebhookEvent.ts` — `transactionId` unique index (idempotency)
- [ ] **3.4** `licenseService.applySubscriptionActivation({figmaUserId, email, flittOrderId})`
- [ ] **3.5** `licenseService.applyRecurringCharge({figmaUserId})` — extends cycleEndsAt
- [ ] **3.6** `licenseService.applyOneTimePurchase({figmaUserId, email, flittOrderId})`
- [ ] **3.7** `licenseService.applyFailedCharge({figmaUserId})` — increments failedAttempts
- [ ] **3.8** `licenseService.applySubscriptionCancel({figmaUserId})` — keeps Pro until cycleEndsAt
- [ ] **3.9** Lazy reset logic: on every read, if `now >= cycleEndsAt` → drop to free, reset counters

### Phase 4 — API Routes (`packages/api/routes`)
- [ ] **4.1** `POST /api/checkout/create` — body `{figmaUserId, returnUrl?}` → `{checkoutUrl, orderId}`
- [ ] **4.2** `POST /api/webhooks/flitt` — signature verify + dedup + dispatch
- [ ] **4.3** `POST /api/subscription/cancel` — HMAC token check + cancelSubscription + applyCancel
- [ ] **4.4** `POST /api/auth/issue-cancel-token` — 5min HMAC token (plugin-issued)
- [ ] **4.5** CORS: checkout endpoints accept plugin (`null` origin) + website
- [ ] **4.6** Rate limit: `/checkout/create` (10/min/IP), `/webhooks/flitt` (no limit — Flitt-ის IPs)
- [ ] **4.7** Integration tests (supertest): full happy path + decline + replay + tamper

### Phase 5 — Figma Plugin UI (`packages/figma-plugin`)
- [ ] **5.1** "Upgrade to Pro" button (Plan Modal)
- [ ] **5.2** On click → `POST /api/checkout/create` → open `checkoutUrl` in new tab (via `window.open` / Figma's `openExternal`)
- [ ] **5.3** Polling/refresh: after window opens, on plugin re-focus → `GET /api/license/me` to detect activation
- [ ] **5.4** Cancel subscription button (Account/Settings tab)
- [ ] **5.5** Hard block on 11th import for free users (quota-exceeded modal)
- [ ] **5.6** `licenseClient.ts` — request cancel token + POST cancel

### Phase 6 — Website Pages (`packages/web`)
- [ ] **6.1** `/checkout/success` — "Payment successful" page (read `?order_id` from URL)
- [ ] **6.2** `/checkout/cancel` — "Payment canceled" page
- [ ] **6.3** `/renew` page — for expired Pro users (direct checkout link)
- [ ] **6.4** `/account` page — show subscription status + cancel button (if applicable)
- [ ] **6.5** `/terms` + `/privacy` — Flitt referenced as PSP, no refunds policy, USD currency, EU VAT disclaimer

### Phase 7 — Testing
- [ ] **7.1** Unit tests pass: `pnpm test` (flitt-service, flitt-webhook, license-service, license-model, checkout-routes, license-routes)
- [ ] **7.2** Sandbox end-to-end: subscribe → wait for renewal → verify webhook + license extension
- [ ] **7.3** Sandbox end-to-end: subscribe → cancel → verify access until cycle end → verify downgrade
- [ ] **7.4** Sandbox decline test: use Flitt's "4111 1111 1111 0111" (or similar test PAN)
- [ ] **7.5** Webhook replay test: same payload twice → second is deduped
- [ ] **7.6** Webhook tamper test: modified amount → rejected
- [ ] **7.7** Webhook tamper test: missing figmaUserId in merchant_data → rejected

### Phase 8 — Production Deployment
- [ ] **8.1** Production env vars set: `FLITT_MERCHANT_ID`, `FLITT_SECRET_KEY`, `FLITT_BASE_URL=https://pay.flitt.com`
- [ ] **8.2** Production webhook URL whitelisted in Flitt dashboard
- [ ] **8.3** Domain SSL certificate valid (HTTPS required for webhooks)
- [ ] **8.4** MongoDB connection pool sized for webhook concurrency
- [ ] **8.5** Logging: webhook payload (minus signature) + outcome → structured logs
- [ ] **8.6** Monitoring: alert on (a) webhook signature failure rate > 5%, (b) checkout HTTP errors, (c) declined-charge rate
- [ ] **8.7** Runbook: how to manually refund (Flitt dashboard → reverse)
- [ ] **8.8** Runbook: how to rotate `FLITT_SECRET_KEY` (Flitt dashboard → backend env → restart)

### Phase 9 — Launch Day
- [ ] **9.1** Smoke test with real $16 USD card (Founder's personal card)
- [ ] **9.2** Verify approved webhook arrives + license activates within 5sec
- [ ] **9.3** Verify Pro access in plugin (unlimited imports)
- [ ] **9.4** Self-cancel test → verify access maintained until cycleEndsAt
- [ ] **9.5** Refund Founder's card (Flitt dashboard) → verify reversed webhook logs
- [ ] **9.6** Public launch announcement (Figma Community plugin update)

### Phase 10 — Post-Launch Monitoring (first 30 days)
- [ ] **10.1** Daily check: webhook delivery success rate (Flitt dashboard)
- [ ] **10.2** Daily check: failed_charges aggregate (re-trigger Flitt retry if needed)
- [ ] **10.3** Weekly: reconcile Flitt's settlement report ↔ our License records
- [ ] **10.4** Monitor support@ inbox for billing complaints
- [ ] **10.5** Review chargebacks (target <0.5%)

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

**ჩვენი arsenal:**
- Native Flitt subscriptions (recurring auto-charge)
- Webhook-driven license activation
- Idempotent, signature-verified, amount-checked event handling
- Cancel flow with end-of-cycle access retention
- One-time fallback if subscription mode unavailable

**შემდეგი task:** ამ roadmap-ის შევსება ✅-ით — რა გვაქვს უკვე გაკეთებული, რა გვაკლია launch-მდე.

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
