# 🔑 w2w → JSON კონვერტორი (admin-ის მახსენებელი)

> repo private-ია; ეს tool იუზერამდე **არასდროს მიდის** (extension/plugin
> bundle-ში არ ხვდება) — მხოლოდ აქ, კოდში ცხოვრობს.

## რას აკეთებს
`.w2w` (binary, დაშიფრული) capture-ს გადააქცევს წაკითხვად JSON-ად, რომ შიგნით
დავათვალიერო / მოვძებნო რამე. **მხოლოდ მე შემიძლია** — script repo-შია, არასდროს
იგზავნება extension/plugin-ში.

## წინაპირობა (მხოლოდ ერთხელ, ან codec-ის შეცვლის შემდეგ)
```bash
cd /Users/giorgi/Desktop/Web2Wireframe
pnpm --filter @w2w/shared build
```

## ბრძანების ფორმატი
```bash
node scripts/w2w-decode.mjs  <გადმოწერილი-ფაილის-სახელი-ზუსტად.w2w>  <კონვერტაციის-მერე-რა-დაერქვას.json>
```

## მაგალითი
```bash
cd /Users/giorgi/Desktop/Web2Wireframe
node scripts/w2w-decode.mjs ~/Downloads/apple_com_1440_wireframe.w2w ~/Downloads/apple.json
```

## სხვა ვარიანტები
```bash
# პირდაპირ ეკრანზე (ფაილში არ წერს):
node scripts/w2w-decode.mjs ~/Downloads/apple_com_1440_wireframe.w2w

# ძებნა/ფილტრი jq-ით:
node scripts/w2w-decode.mjs ~/Downloads/apple_com_1440_wireframe.w2w | jq '.frames[0].viewport'
```

## შენიშვნები
- ყოველთვის repo-ს ფესვიდან ვუშვებ: `cd /Users/giorgi/Desktop/Web2Wireframe`
- მუშაობს ნებისმიერ `.w2w`-ზე — მათ შორის prod-build-ით გადაღებულზე.
- script: `scripts/w2w-decode.mjs` · codec: `packages/shared/src/w2w-codec.ts`

---

# ⚙️ w2w → Figma-ხე (კონვერტერის ოფლაინ გაშვება)

`w2w-decode.mjs` decode-ზე ჩერდება. `w2w-convert.mjs` აგრძელებს და **რეალურ
კონვერტერს უშვებს** (`convertW2WToWireframe` → css-converter + treeSimplify +
textRunMerge) — ანუ capture-ის A/B ~0.8 წამში, Figma-ში იმპორტის გარეშე.

## რას ფარავს
✅ გეომეტრია, auto-layout, padding/gap, ტექსტის შიგთავსი და სეგმენტები,
fill-ები, სურათები, ფენების სახელები, skip-რეპორტები.

❌ `rendering/nodes.ts` და `text.ts` — მათ ცოცხალი `figma` და Figma-ს შრიფტის
ძრავა სჭირდებათ (ხაზების გადატანა, auto-resize, ტექსტის fit). შრიფტის
საკითხებზე კვლავ საჭიროა იმპორტი + tree-dump.

## ბრძანება
```bash
node scripts/w2w-convert.mjs <ფაილი>
node scripts/w2w-convert.mjs <ფაილი> --tree out.json     # WireframeNode ხე
node scripts/w2w-convert.mjs <ფაილი> --decode cap.json   # გაშიფრული capture
node scripts/w2w-convert.mjs <ფაილი> --mode plain        # layoutMode
```

## ფორმატები
| გაფართოება | როგორ იშიფრება |
|---|---|
| `.w2w` | `@w2w/shared/w2w-codec` (ჯერ `pnpm --filter @w2w/shared build`) |
| `.h2d` | XOR 57 + raw inflate |
| `.json` | უკვე გაშიფრული capture |

⚠️ **`.h2d`-ზეც მუშაობს** — ჩანაწერის ფორმა თითქმის იდენტურია, ანუ მათი
capture-ი ჩვენს რენდერერში გაივლის და შედარებადი ხდება. ოღონდ მათ ფოთოლ-frame-ს
`children` გასაღები არ აქვს, ამიტომ tool ავსებს ცარიელი მასივით და ამას
ბეჭდავს კიდეც — შედეგი **საორიენტაციოა**, არა ზუსტი.

## მაგალითი — chroniclehq.com ერთსა და იმავე რენდერერში
```
chroniclehq_com_1440w_default.h2d   410 ფენა (text 82,  frame 328, image 39)  2688 სიმბოლო
chroniclehq_com_1440_wireframe.w2w  514 ფენა (text 109, frame 405, image 58)  4284 სიმბოლო
```
