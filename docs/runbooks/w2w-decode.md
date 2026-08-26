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
