# Content Log — სოც-არხების ჟურნალი

`social` skill-ის მეხსიერება. **ყოველი დაპოსტილი ერთეული აქ ჩაიწერება** —
ეს არის ერთადერთი დაცვა იმისგან, რომ ერთი და იგივე პოსტი გამეორდეს.

**წესები:**
- row ემატება **დაგეგმვისას**, არა იდეის დაბადებისას
- „7d შედეგი" ივსება ერთი კვირის შემდეგ (Buffer analytics)
- install-ის ზრდა იწერება `METRICS.md`-ში, არა აქ

---

## დაპოსტილი

| თარიღი | არხი | ტიპი | თემა | ლინკი | 7d შედეგი |
|--------|------|------|------|-------|-----------|
| 2026-08-26 | X + LinkedIn | Insight | `line-height: normal` ≠ 1.2 | — | — |
| 2026-08-28 | X + LinkedIn | Insight | margin collapsing vs Auto Layout | — | — |
| 2026-08-31 | X + LinkedIn | Insight | ფონტის ორი სახელი (CSS ≠ SFNT) | — | — |
| 2026-09-02 | X + LinkedIn | Insight | surrogate pair — ემოჯის გაჭრა ტექსტის მოჭრისას | — | — |
| 2026-09-03 | X + LinkedIn | Insight | computed fontFamily ≠ დარენდერებული ფონტი | — | — |
| 2026-09-04 | X + LinkedIn | Insight | icon font = Private Use Area-ს ასოები | — | — |
| 2026-09-05 | X + LinkedIn | Insight | DOM ≠ ეკრანი (carousel, overflow: hidden) | — | — |
| 2026-09-06 | X + LinkedIn | Insight | გაზომე ყუთი, ნუ თარგმნი CSS-ს | — | — |
| 2026-09-08 | X + LinkedIn | Insight | viewport ჯერ, ნავიგაცია მერე (srcset/media query ერთხელ წყდება) | — | — |
| 2026-09-09 | X + LinkedIn | Insight | lazy-load სქროლის 2 ხაფანგი (ნაბიჯი > viewport; ტოპში დაბრუნება) | — | — |
| 2026-09-10 | X + LinkedIn | Insight | tainted canvas — cross-origin სურათი სამუდამოდ ბლოკავს კითხვას | — | — |
| 2026-09-11 | X + LinkedIn | Insight | computed fill ბრჭყალებიანია, FuncIRI-ს ბრჭყალები არ აქვს | — | — |
| 2026-09-12 | X + LinkedIn | Insight | subgrid-ის computed მნიშვნელობაში track-ების ზომები არ არის | — | — |
| 2026-09-14 | X + LinkedIn | Insight | getAnimations() + finish() — ანიმაციების დასრულება capture-მდე; უსასრულო აგდებს InvalidStateError-ს | — | — |
| 2026-09-16 | X + LinkedIn | Insight | Figma plugin main thread-ზეა — სინქრონული findAll ყინავს UI-საც; chunk + await | — | — |
| 2026-09-17 | X + LinkedIn | Insight | :hover JS-იდან არ ირთვება; DevTools :hov | — | — |
| 2026-09-18 | X + LinkedIn | Insight | DOMContentLoaded / load / fonts.ready — არც ერთი ≠ „დასრულდა" | — | — |

---

## იდეების რიგი (გამოუყენებელი)

ჩაწერე აქ, რაც batch-ში ვერ მოხვდა. batch-ის შედგენისას ჯერ აქ ნახე.

- Silent demo: stripe.com → Figma (მთავარი „hello world" დემო) — ტექსტი მზადაა (2026-09-13 batch, სამ 09-15 სლოტი); ელოდება owner-ის ვიდეოს + „კი"-ს
- Before/After: linear.app hero section + layer panel გახსნილი
- Silent demo: multi-viewport — ერთი იმპორტი, mobile + tablet + desktop
- Changelog: italic text import (v1.0.4)
- Insight: Figma-ს API-ში layoutAlign და counter-axis sizing ერთი property-ია — layoutSizing*-ის ჩაწერა CENTER-ს შლის
- Changelog: Links toggle (ტექსტი მზადაა — მხოლოდ ახალი Figma ვერსიის გამოქვეყნების შემდეგ)
- Milestone: იმპორტი დაჩქარდა + ნებისმიერი საჯარო საიტი შემოდის (owner-ი 2026-09-08: ციფრის და მიზეზების გარეშე — მხოლოდ ის, რომ გავუმჯობესდით)

---

## გამორიცხული თემები

რაზეც **არ** ვწერთ, და რატომ:

- Screenshot import-ის AI ხარისხი — ჯერ არასტაბილურია, დაპირება ადრეა
- კონკურენტი ნებისმიერი ფორმით (სახელი, შედარება, ცხრილი, ფარული მინიშნება, დადებითი ხსენებაც) — owner-ის ხისტი წესი, 2026-09-08
- იმპორტის სიჩქარის ციფრები და ტექნიკური მიზეზები — გაუმჯობესებაზე ვწერთ, „რატომ იყო ნელა"-ზე არა
- მომხმარებელთა რაოდენობა — 82 არ არის სარეკლამო ციფრი
