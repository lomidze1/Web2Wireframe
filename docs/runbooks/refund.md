# Runbook — Customer Refund

> როდის გამოიყენო: მომხმარებელი ითხოვს refund-ს, ან chargeback შემოვიდა Flitt-დან.
> ჩვენი policy: **"No refunds, cancel anytime"** (Terms §8). მაგრამ exception-ები არსებობს — duplicate charge, technical issue, ან customer goodwill case.

---

## სიტუაცია A — Duplicate charge / Technical error (issue refund)

### წინაპირობა
მომხმარებელი წერს billing@web2wireframe.design-ზე: "ჩაიჯვერი ორჯერ", "გადახდა გავაკეთე მაგრამ Pro არ ჩაირთო", ანდმსგ.

### ნაბიჯები

1. **Flitt dashboard-ში გადადი:** https://merchant.flitt.com
2. **Orders** → ფილტრი: `merchant_data` შეიცავს მომხმარებლის figmaUserId-ს, ან `sender_email` ემთხვევა
3. **გადაამოწმე transaction**: amount, currency, timestamp, status="approved"
4. **Refund-ი დაიწყე**: Order details → "Reverse" ღილაკი → confirm
5. **Flitt გვიგზავნის webhook**: `order_status=reversed` → ჩვენი handler-ი ავტომატურად:
   - `applyRefund({figmaUserId, flittOrderId})` — Pro→Free downgrade თუ ეს ის order-ია, რომელიც ამჟამად აქტიურია
   - email user-ს `sendRefundNotification` (Pro purchase refunded)
6. **დასწამე reply** მომხმარებელს: "Refund issued. Funds will be back on your card in 5-10 business days."

### Sanity check
- Webhook event-ი არის `WebhookEvent` collection-ში MongoDB-ში? (idempotency dedup)
  ```
  db.webhookevents.findOne({ orderId: "w2w_pro_XYZ_..." })
  ```
- License downgrade-დაა შემოწმდა?
  ```
  db.licenses.findOne({ figmaUserId: "..." })
  // plan უნდა იყოს "free", subscription = null
  ```

---

## სიტუაცია B — Chargeback (bank-initiated)

### წინაპირობა
Flitt-ი გვიგზავნის webhook-ს `order_status=reversed`-ით თვითონ, **მომხმარებლის თხოვნის გარეშე** — ბანკმა chargeback-ი დააფიქსირა.

### ნაბიჯები

1. **ავტომატური handling უკვე მუშაობს** — handler აღმოაჩენს reversed-ს და downgrade-ს გააკეთებს
2. **Operator action: მონიტორი chargeback rate** — Flitt dashboard → Analytics → chargebacks. **Target <0.5%**. თუ მეტი, Flitt-მა შეიძლება account გვცე freeze.
3. **მომხმარებლის ბლოკი (optional)** — თუ ერთი user-ი ხშირად ანახორციელებს chargeback-ს fraud-ისთვის, License document-ში `status: "expired"` დაუყენე და დაამატე note. Manual MongoDB query:
   ```
   db.licenses.updateOne(
     { figmaUserId: "BAD_USER" },
     { $set: { status: "expired" } }
   )
   ```
   (ეს მათ Free-ის ხელახალი დაწერისგანაც დაიცავს, რადგან status=expired ბლოკავს)

---

## სიტუაცია C — Customer goodwill refund (out of policy)

### წინაპირობა
"Refund არ მაქვს უფლება, მაგრამ მინდა ვუპასუხო": user-ი უკმაყოფილოა და გადახდიდან 2-3 დღეა, ერთხელ მაინცაც, არ უსარგებლია.

### ნაბიჯები
იგივე როგორც Situation A. Note Internal-ში: "Out-of-policy refund — first complaint, goodwill, do not extend habit."

---

## Webhook signature failure

თუ Flitt-ის webhook-ი 200-ით პასუხობს მაგრამ ჩვენი license-ი არ იცვლება, შემოწმე logs:

```
kubectl logs -n production deploy/api | grep '"component":"flitt-webhook"' | grep '"level":"warn"'
```

თუ ხედავ `"signature verification failed"`:
- `FLITT_SECRET_KEY` env var არასწორი? (იხ. `key-rotation.md`)
- Flitt-მა secret key-ი dashboard-ში გვირარარა? (იხ. `key-rotation.md`)

---

## Verification commands

```bash
# 1. Check current license state
mongosh "$MONGODB_URI" --eval 'db.licenses.findOne({figmaUserId: "REPLACE"})'

# 2. Check webhook event history for this user
mongosh "$MONGODB_URI" --eval 'db.webhookevents.find({orderId: /REPLACE/}).sort({processedAt: -1})'

# 3. Test webhook handler is reachable (no payload — should 200)
curl -X POST https://api.web2wireframe.design/api/webhooks/flitt -H "Content-Type: application/json" -d '{}'
# expects: {"received":true}

# 4. Health check Flitt config
curl https://api.web2wireframe.design/api/health/flitt -H "X-Admin-Token: $ADMIN_TOKEN"
```

---

## Contact

- **Flitt support:** support@flitt.com
- **Internal:** billing@web2wireframe.design (forwards to founder)
