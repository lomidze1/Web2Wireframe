# Flitt Checkout Page — Branding Guide (Portal Task)

**თარიღი:** 2026-06-07 · **ვისთვის:** owner (Flitt merchant portal-ში გასაკეთებელი)

Flitt-ის გადახდის გვერდი (`pay.flitt.com`) **hosted-ია** — მისი გარეგნობა
**კოდით ვერ იცვლება**, მხოლოდ **Flitt merchant portal-ის branding settings-ში**.
ეს დოკუმენტი გაძლევს ზუსტ ფერებსა და ნაბიჯებს, რომ სწრაფად დააკონფიგურირო.

> ⚠️ Flitt = Fondy-ის rebrand. Portal-ის მენიუს ზუსტი სახელები შეიძლება ოდნავ
> განსხვავდებოდეს. თუ ვერ პოულობ branding განყოფილებას — მისწერე Flitt support-ს
> ("how do I customize the hosted checkout page logo/colors for merchant 4055602").

---

## 🎨 Brand kit (ჩვენი საიტიდან — ჩასვი portal-ში)

| ელემენტი | მნიშვნელობა | სად გამოიყენე checkout-ზე |
|---|---|---|
| **Primary / button color** | `#3b82f6` | "Pay" ღილაკი, აქცენტები |
| **Button hover / strong** | `#246dff` | hover state (თუ აქვს) |
| **Logo accent color** | `#e94e1b` | logo-ს ფერი (თუ მონოქრომ ვარიანტი სჭირდება) |
| **Text color** | `#0c0d12` | მთავარი ტექსტი |
| **Muted text** | `#5a6072` | მეორეხარისხოვანი ტექსტი |
| **Page background** | `#f7f8fb` | გვერდის ფონი |
| **Surface / card** | `#ffffff` | ბარათის ფონი |
| **Border** | `#e5e7eb` | ხაზები/ბორდერები |
| **Corner radius** | `12–18px` | ღილაკები/ბარათები (თუ აქვს) |

**Logo ფაილი:** `packages/web/public/logo.svg` (raster PNG SVG-ში, 1608×1608 წყარო)
+ `packages/web/public/favicon.ico`.

---

## 📋 ნაბიჯები Flitt portal-ში

1. შედი **Flitt merchant portal**-ში (merchant `4055602`).
2. იპოვე **Settings → Checkout page / Payment page design** (ან "Branding" /
   "Appearance" / "Конструктор страницы").
3. **Logo:** ატვირთე PNG (გამჭვირვალე ფონით). რეკომენდებული: ~200×60px
   (ჰორიზონტალური) ან კვადრატული 256×256. SVG-დან ექსპორტი გააკეთე PNG-ში.
4. **Primary/button color:** `#3b82f6`.
5. **Background color:** `#f7f8fb` (ან თეთრი `#ffffff` თუ უფრო სუფთა გინდა).
6. **Merchant/brand name:** "Web2Wireframe".
7. შეინახე + გახსენი **test checkout** რომ ნახო შედეგი.

---

## ✅ უკვე გაკეთებული კოდში (Flitt request params)

ეს ჩვენი მხრიდან უკვე ჩაშენებულია (`packages/api/src/services/flittService.ts`,
commit 6c35702):

- **`order_desc`** — checkout-ზე ჩანს: "Web2Wireframe Pro — 1 Month" / "1 Year"
- **`lang: "en"`** — checkout გვერდი ინგლისურად გამოჩნდება

ეს param-ები **არ საჭიროებს portal-ში შეცვლას** — request-ში მიდის ავტომატურად.

---

## 🔒 რა ვერ შეიცვლება (Flitt-ის ფიქსირებული)

- გვერდის ზოგადი layout/სტრუქტურა (Flitt-ის template)
- ბარათის შეყვანის ფორმა, 3D Secure ნაბიჯი, Apple/Google Pay ღილაკები
- PCI-compliance ელემენტები

ღრმა custom checkout (სრულად ჩვენი დიზაინი) = embedded SDK, **launch-ისთვის
არ ვაკეთებთ** (PCI v4.0 სირთულე; იხ. docs/archive/Flitt.md — redirect მკაფიოდ
სჯობს ჩვენს context-ში).
