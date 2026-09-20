# `_archive/` — მძიმე სამუშაო მასალა

**git-ში არ არის** (`.gitignore`). დისკზე რჩება, რადგან reference screenshot-ები
და dump-ები ხელახლა გადაღებას მოითხოვს, მაგრამ 42 MB-ს repo-ში ადგილი არ აქვს.

| საქაღალდე | რა არის | სტატუსი |
|---|---|---|
| `import-improve/` | iwm.org.uk-ის იმპორტის reference: screenshot, `fonts.zip`, `.w2w`, Figma tree dump (2026-08-05) | 27 MB. ადრე git-ში იყო → `.git` 155 MB-მდე გაიბერა. პროცესი: [`docs/guides/import-improve.md`](../docs/guides/import-improve.md) |
| `განსხვავებები/` | h2d vs W2W ვიზუალური დიფის jpg-ები | 15 MB. ციტირებულია `ხარისხის_გაუმჯობესება/`-ის ანგარიშებში |
| `Plugin_Frontend/` | მიგრაციამდელი plugin build (`manifest.json` + `build/`) | ⛔ მკვდარი 2026-04-03-დან. ცოცხალი plugin: `packages/figma-plugin` (Figma id `1646327864971730293`) |
| `shared-extraction/` | მიგრაციამდელი `dist/` type declarations | ⛔ მკვდარი. ცოცხალი: `packages/shared` (`@w2w/shared`) |

ბოლო ორს **არაფერი არ იყენებს** — გადამოწმებულია `grep`-ით 2026-09-20-ს.
თუ ადგილი დაგჭირდა, ისინი უსაფრთხოდ წასაშლელია.

`ხარისხის_გაუმჯობესება/` (h2d reverse-engineering, 443 KB) **root-ში დარჩა** —
აქტიური საცნობარო მასალაა, auto-memory-ის 6 ფაილი მასზე მიუთითებს.
