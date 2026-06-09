# Infra Upgrade Runbook — Launch Prep

**თარიღი:** 2026-06-09 · **მიზანი:** Render Free→Standard + Atlas Free→Flex (launch-ისთვის).
**ჯამი:** $33/mo. **ვინ:** owner (dashboard actions). **Downtime:** მცირე (pre-launch, traffic ცოტაა — ახლა ჯობია).

> ⚠️ ორივე dashboard-ში კეთდება, კოდი არ იცვლება. ნაბიჯ-ნაბიჯ მიჰყევი.

---

## STEP 1 — MongoDB Atlas: Free (M0) → Flex ($8/mo)

**რატომ:** backups (License data = ვინ გადაიხადა). Free M0-ს backup არ აქვს.

1. შედი [cloud.mongodb.com](https://cloud.mongodb.com) → project → cluster **`Web2Wireframe`** (Frankfurt).
2. cluster-ის **"..."** მენიუ → **Edit Configuration** (ან "Edit Cluster").
3. **Cluster Tier:** M0 (Free) → აირჩიე **Flex**.
4. Region დარჩეს **Frankfurt** (eu-central-1) — Render-თან aligned.
5. **Apply Changes** / **Review Changes** → დაადასტურე.
6. დაელოდე tier change-ს (რამდენიმე წუთი).

**⚠️ კრიტიკული — connection string:**
- თუ Atlas **in-place** განაახლა (იგივე cluster host) → `MONGODB_URI` **არ იცვლება**, არაფერი არ გჭირდება.
- თუ Atlas **ახალ cluster-ს** მოითხოვს → დააკოპირე **ახალი** connection string (Connect → Drivers) და **STEP 2-ში Render-ის `MONGODB_URI`-ში ჩასვი** (თორემ prod ბაზას ვერ უკავშირდება).

**Verify:** Atlas-ში cluster აჩვენებს **Flex** tier-ს. (backups ავტომატურად ჩაირთვება.)

---

## STEP 2 — Render: Free → Standard ($25/mo) + NODE_ENV

**რატომ:** Chromium-ს RAM სჭირდება (URL/HTML import). Free=512MB → OOM crash. Standard=2GB.

1. შედი [dashboard.render.com](https://dashboard.render.com) → service **`web2wireframe-api`** (Frankfurt, Docker).
2. **Settings** → იპოვე **Instance Type** → Free → აირჩიე **Standard** ($25/mo, 2GB RAM, 1 CPU).
3. იქვე **Environment** tab → დარწმუნდი/დაამატე:
   - **`NODE_ENV` = `production`** (checklist §1 — ჯერ unchecked იყო)
   - თუ STEP 1-მა URI შეცვალა → **`MONGODB_URI`** განაახლე ახალი string-ით
4. **Save** → Render ავტომატურად **redeploy**-ს გააკეთებს (1–3 წთ downtime).

**⚠️ NODE_ENV=production-ის შემდეგ:** API boot guard მოითხოვს რეალურ secrets-ს
(`AUTH_SECRET`/`SESSION_SECRET`/`ADMIN_TOKEN`). ესენი უკვე დაყენებულია (go-live memory),
მაგრამ deploy-ის შემდეგ **აუცილებლად შეამოწმე health** (ქვემოთ).

---

## STEP 3 — Verification (deploy-ის შემდეგ)

```bash
# 1. Basic health (public)
curl https://api.web2wireframe.design/api/health
# → {"status":"ok",...}  200

# 2. Deep health (admin) — Flitt + Mongo
curl https://api.web2wireframe.design/api/health/flitt -H "X-Admin-Token: $ADMIN_TOKEN"
# → flittEnabled:true, merchantIdSet:true, secretKeySet:true, mongoConnected:true

# 3. Mongo sessions collection (TTL index) — connect-mongo
#    (Atlas-ში ან mongosh-ით) db.sessions.getIndexes() → expires_1 TTL
```

**Manual smoke:**
- Plugin Web tab-ით URL import (მაგ. example.com) → **არ უნდა დაიკრაშოს** (Chromium RAM ახლა საკმარისია). ეს Render Standard-ის მთავარი ტესტია.

---

## ✅ Done definition

- [ ] Atlas cluster = **Flex** tier
- [ ] Render service = **Standard** instance
- [ ] `NODE_ENV=production` set on Render
- [ ] `MONGODB_URI` სწორია (თუ შეიცვალა, განახლდა)
- [ ] `/api/health` 200 + `/api/health/flitt` ყველა true
- [ ] URL import live-ზე მუშაობს (Chromium not crashing)

ამის შემდეგ → **Plugin publish** (USE_PRODUCTION→true, OAuth→Public, Community submit).
