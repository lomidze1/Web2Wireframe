# docs/ — რუკა

მხოლოდ markdown. ვიდეო, ხმა და მესამე-მხარის კოდი აქ არ ინახება.

## რას ვეძებ? →

| მინდა… | სად |
|--------|-----|
| **გავიგო რატომ გადაწყდა ასე** (ფასი, ფორმატი, სტრატეგია) | [`decisions/`](./decisions/) |
| **დავიწყო ან გავაგრძელო დაგეგმილი სამუშაო** | [`plans/`](./plans/) |
| **გავაკეთო გამეორებადი ოპერაცია** (deploy, refund, store upload) | [`runbooks/`](./runbooks/) |
| **მივყვე სამუშაო პროცესს** (იმპორტის ხარისხის გაუმჯობესება) | [`guides/`](./guides/) |
| **ვნახო ბიზნესის მდგომარეობა** (ციფრები, კონკურენტები, გეგმა) | [`growth/`](./growth/) |
| **ჩავწერო ან წავიკითხო ინციდენტი** | [`incidents/`](./incidents/) |
| **ვნახო რაც აღარ მოქმედებს, მაგრამ ისტორიაა** | [`archive/`](./archive/) |

## საქაღალდეები

### [`decisions/`](./decisions/) — დახურული გადაწყვეტილებები
რატომ არის ასე. ერთხელ იწერება, იშვიათად იცვლება.

- [`LAUNCH-STRATEGY-2026.md`](./decisions/LAUNCH-STRATEGY-2026.md) — single-tier სტრატეგია, Free + $16 Pro
- [`LAUNCH-COSTS-2026.md`](./decisions/LAUNCH-COSTS-2026.md) — $33/თვე ინფრასტრუქტურა, რატომ ეს tier-ები
- [`W2W-FILE-FORMAT.md`](./decisions/W2W-FILE-FORMAT.md) — `.w2w` კონტეინერის ფორმატი

### [`plans/`](./plans/) — აქტიური და დაგეგმილი სამუშაო

- [`FIGMA-CAPTURE-ADOPTION.md`](./plans/FIGMA-CAPTURE-ADOPTION.md) — 🟡 proposal: რა ავიღოთ Figma-ს (შეძენილი h2d) ძრავიდან
- [`PAYMENT-SYSTEM.md`](./plans/PAYMENT-SYSTEM.md) — ✅ დანერგილი: Flitt, License მოდელი, webhook
- [`SERVER-SIDE-DECODE.md`](./plans/SERVER-SIDE-DECODE.md) — 📋 PLANNED: `.w2w` დეკოდი სერვერზე

### [`runbooks/`](./runbooks/) — ნაბიჯ-ნაბიჯ პროცედურები
ინციდენტი, refund, key rotation, backup, Chrome Store, Render/Atlas tier, `.w2w` დეკოდი.
→ [`runbooks/README.md`](./runbooks/README.md)

### [`guides/`](./guides/) — სამუშაო პროცესები

- [`import-improve.md`](./guides/import-improve.md) — იმპორტის ხარისხის გაუმჯობესების ერთადერთი სწორი პროცესი

### [`growth/`](./growth/) — ბიზნესი (კოდი არ ერევა)

- [`METRICS.md`](./growth/METRICS.md) — ⭐ ცოცხალი ტრეკერი, კვირაში ერთხელ ივსება
- [`COMPETITORS.md`](./growth/COMPETITORS.md) — divRIOTS-ის ~25 პლაგინის რუკა
- [`head-to-head.md`](./growth/head-to-head.md) — Figma capture vs h2d vs W2W
- [`DEFECTS.md`](./growth/DEFECTS.md) — head-to-head-ში აღმოჩენილი დეფექტები
- [`copy/`](./growth/copy/) — Store listing-ის ტექსტები

აქტიური გეგმა: [`.claude/skills/growth/references/plan-3-months.md`](../.claude/skills/growth/references/plan-3-months.md)
(ვადა 2026-11-24, კრიტერიუმი = 3 ფასიანი მომხმარებელი). გაშვება: `/growth`.

### [`incidents/`](./incidents/) — ინციდენტების ჟურნალი
ჯერ ცარიელია. ახალი: გადაწერე [`TEMPLATE.md`](./incidents/TEMPLATE.md) → `YYYY-MM-DD-<slug>.md`.

### [`archive/`](./archive/) — ⛔ აღარ მოქმედებს
ისტორიული ღირებულებისთვის შენახული. **ნუ იმოქმედებ მათი მიხედვით** —
ყოველ ფაილს თავში აქვს ბანერი, რომელიც ხსნის რამ ჩაანაცვლა.

## რაც `docs/`-ში **არ** დევს

| რა | სად |
|----|-----|
| სოც-ქსელების გეგმა, სცენარები, ვიდეო, ხმა | [`social-agent/`](../social-agent/) |
| ვიდეოს ძრავა (`w2wkit.py`, `make_vo.py`) | `scripts/video/` |
| მესამე-მხარის ამოღებული კოდი (Figma / h2d გაფართოებები) | `_research/` (gitignored) |
| იმპორტის ხარისხის სამუშაო სესიები | `import-improve/NN - <host>/` |
| არქიტექტურა, ბრძანებები, სამუშაო წესები | [`../CLAUDE.md`](../CLAUDE.md) |
| Docker / deploy | [`../DEPLOYMENT.md`](../DEPLOYMENT.md) |
| პრომპტის წერის სახელმძღვანელო | `~/.claude/Prompter.md` (გლობალური) |
