# Plan Reference — Plan Mode სახელმძღვანელო

აჩვენე Plan Mode-ის სრული reference ამ პროექტისთვის:

## 1. როდის გამოვიყენო Plan Mode?

- 3+ ფაილი ჩართულია ამოცანაში
- ახალი feature-ის დამატება
- რეფაქტორინგი
- მიგრაცია
- Cross-package ცვლილება (მაგ: `packages/shared` + `packages/browser-extension` + `packages/api`)

**არ გჭირდება Plan Mode:** one-liner fix, typo, ერთი ფაილის მცირე ცვლილება

## 2. 4-ფაზიანი Workflow

```
ფაზა 1: Read — მოძებნე და წაიკითხე შესაბამისი ფაილები
ფაზა 2: Plan — დაწერე დეტალური გეგმა (რა ფაილები, რა ცვლილებები, რა თანმიმდევრობით)
ფაზა 3: Review — მომხმარებელთან განხილვა და დამტკიცება
ფაზა 4: Implement — კოდის წერა გეგმის მიხედვით
```

## 3. კარგი vs ცუდი Plan-ის მაგალითი

**ცუდი:**
```
1. შევცვალო nodes.ts
2. დავამატო ფუნქცია
3. დავტესტო
```

**კარგი:**
```
1. წავიკითხო packages/figma-plugin/src/rendering/nodes.ts — გავიგო createNodeFromData() სტრუქტურა
2. დავამატო gradient parsing ლოგიკა createFillFromCSS() ფუნქციაში (ხაზი ~120)
3. დავწერო ტესტი packages/figma-plugin/src/__tests__/gradient.test.ts (TDD — იმპლემენტაციამდე)
4. გავუშვა: pnpm --filter plugin-frontend test
5. type-check: pnpm type-check
```

## 4. Web2Wireframe-ის Quick Tips

- 🔒 **`api` / `shared` / `browser-extension` = LIVE** → ჯერ გაჩერდი და ჰკითხე owner-ს
- **Rendering ცვლილება?** → `packages/figma-plugin/src/rendering/nodes.ts` → ტესტი → rebuild
- **API ცვლილება?** → `packages/api/src/routes/` (TS/ESM) → 🔴 LIVE, დადასტურება საჭიროა
- **CDP ცვლილება?** → `packages/shared/src/index.ts` → `packages/browser-extension/src/background/cdp/`
- **Cross-package?** → ჯერ `packages/shared`, შემდეგ consumers
- ყოველთვის: `pnpm type-check && pnpm lint` ცვლილების შემდეგ
