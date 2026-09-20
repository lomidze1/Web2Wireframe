# Figma Community — მოთხოვნის კვლევა (2026-09-20)

წყარო: Figma Community-ის საძიებო API (`/api/search/resources`, logged-out, relevancy).
**Figma ძიების მოცულობას არ აქვეყნებს** → proxy-ები: `hits` = შედეგების რაოდენობა
(კონკურენცია), `top10` = ტოპ-10-ის users-ის ჯამი (ისტორიული მოთხოვნა),
„new" = 2025-06-ის შემდეგ შექმნილი რესურსი ტოპ-60-ში (შეუძლია თუ არა ახალს გაჩენა).
⚠️ logged-out relevancy შეიძლება ოდნავ განსხვავდებოდეს Figma-ს შიდა ძიებისგან.

## W2W-ის ადგილი (plugins)

| query | hits | top10 users | W2W (08-18) | W2W (09-20) |
|---|---|---|---|---|
| website to figma | 755 | 3.12m | #93 | **#40** |
| html to figma | 711 | 9.77m | — | #85 |
| url to figma | 415 | 107k | — | #38 |
| import website | 193 | 2.71m | — | **#12** |
| screenshot to figma | 485 | 565k | top-100-ს გარეთ | **#8** |
| image to figma | 2,501 | 254k | — | >90 |
| wireframe | 324 | 2.23m | — | >90 |

## ფაილები (files) — ჩვენი ნიში

| query | hits | top10 users | ტოპ-1 | შენიშვნა |
|---|---|---|---|---|
| website to figma | 2,901 | 271k | 24k | კონკურენტის საკუთარი „billboard" ფაილი #2-ზეა (23k users) → ტაქტიკა მუშაობს |
| html to figma | 2,380 | 196k | 140k | |
| wireframe | 1,202 | 1.18m | 288k | დიდი მოთხოვნა, ნაკლები კონკურენცია ვიდრე landing page-ზე |
| landing page | 4,194 | 1.21m | 217k | ძალიან გადატვირთული |
| saas landing page | 2,764 | 380k | 123k | |
| website template | 2,471 | 302k | 113k | |
| portfolio website | 652 | 414k | 104k | |
| homepage | 679 | 64k | 13k | |
| website redesign | 1,392 | 46k | 14k | დაბალი მოთხოვნა |

## ზოგადი მოთხოვნა (plugins) — სად იგებს ახალი შემოსული

| query | top10 users | ახლის საუკეთესო (≥2025-06) |
|---|---|---|
| animation | 4.65m | **74k** (AI animation) |
| mockup | 4.74m | **43k** |
| presentation | 515k | **31k** (Figma → PPTX) |
| image generator | 171k | 28k |
| icons | 7.32m | 28k |
| remove background | 3.20m | 26k |
| svg | 975k | 25k (AI vectorizer) |
| ai design | 993k | 20k |
| prototype | 228k | 18k (MP4/GIF export) |
| charts | 1.42m | 15k |
| 3d | 4.28m | 12k |
| figma to code | 7.27m | 11k |
| gradient / illustration | 0.7–4.9m | 9k |
| variables / export | ~0.5m | 7k |
| translate | 261k | 5k |
| design system, color palette, font, accessibility, auto layout, rename layers, localization, qr code, spell check | — | **≤3k** — ახალი ვერ იზრდება |
