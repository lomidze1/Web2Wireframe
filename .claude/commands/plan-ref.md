# Plan Reference — Plan Mode სახელმძღვანელო

აჩვენე Plan Mode-ის სრული reference ამ პროექტისთვის:

## 1. როდის გამოვიყენო Plan Mode?

- 3+ ფაილი ჩართულია ამოცანაში
- ახალი feature-ის დამატება
- რეფაქტორინგი
- მიგრაცია
- Cross-service ცვლილება (მაგ: shared-extraction + Browser_Extension + Plugin_Backend)

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
1. წავიკითხო Plugin_Frontend/src/rendering/nodes.ts — გავიგო createNodeFromData() სტრუქტურა
2. დავამატო gradient parsing ლოგიკა createFillFromCSS() ფუნქციაში (ხაზი ~120)
3. შევცვალო shared-extraction/src/types.ts — GradientStop ტიპის დამატება
4. დავწერო ტესტი Plugin_Frontend/src/__tests__/gradient.test.ts
5. გავუშვა: cd Plugin_Frontend && npx vitest run
6. type-check: npm run type-check
```

## 4. Web2Wireframe-ის Quick Tips

- **Cross-service ცვლილება?** → ჯერ shared-extraction, შემდეგ consumers (Browser_Extension, Plugin_Backend)
- **Rendering ცვლილება?** → Plugin_Frontend/src/rendering/nodes.ts → ტესტი → rebuild
- **API ცვლილება?** → Plugin_Backend/api/index.js (CommonJS!) → შესაბამისი frontend
- **CDP ცვლილება?** → shared-extraction/src/index.ts → Browser_Extension/src/background/cdp/
- ყოველთვის: `npm run type-check && npm run lint` ცვლილების შემდეგ
