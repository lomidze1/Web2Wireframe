# Runbook — Customer Billing FAQ

> Internal reference for `billing@web2wireframe.design` inbox. Copy-paste these replies (customize names) for common billing questions.

---

## Q1. "My payment went through but my plugin still shows Free"

**Cause:** webhook delay (Flitt webhook arrives 0-30 sec after card auth), OR webhook signature failure, OR user-ი ცდილობს გადახდა ერთი figmaUserId-ით, plugin-ი მეორე account-ით.

**Reply template:**

> Hi <Name>,
>
> Sorry for the trouble. Your payment landed successfully on our end. The plugin polls for license updates every 5 seconds — could you:
> 1. Close the Plan modal in the plugin
> 2. Wait ~30 seconds
> 3. Reopen the Plan modal → should show "PRO"
>
> If that doesn't work, please send me your **Figma user ID** (the long string under "Account ID" in the Plan modal). I'll check our records.
>
> Thanks,
> <You>

**Investigation:**
```bash
# Confirm webhook arrived
mongosh "$MONGODB_URI" --eval 'db.webhookevents.find({orderId: /USER_ID/}).sort({processedAt: -1}).limit(5)'

# Check current license
mongosh "$MONGODB_URI" --eval 'db.licenses.findOne({figmaUserId: "USER_ID"})'
```

If webhook event exists but license is still Free → likely amount mismatch or order_id ↔ figmaUserId mismatch. Check logs:
```
docker compose logs api | grep '"component":"flitt-webhook"' | tail -20
```

---

## Q2. "I want a refund"

**Cause:** user-ი არ არის კმაყოფილი, ან ვერ მუშაობს.

**Reply template (Out-of-policy goodwill, first-time complaint):**

> Hi <Name>,
>
> Thanks for reaching out. Our standard policy is no refunds, but as this is your first purchase and you're within the first few days, I'll make an exception. I've issued a refund — it should land back on your card in 5-10 business days.
>
> Could you share what didn't work for you? We're a small team and your feedback genuinely shapes the roadmap.
>
> Thanks,
> <You>

**Reply template (Policy hold — feature works as advertised):**

> Hi <Name>,
>
> Thanks for the note. As mentioned in our Terms (Section 8), purchases are non-refundable — Pro is intentionally priced as a one-time 30-day pass so you can try it without committing.
>
> If something's specifically broken, please tell me what URL / website you were trying to import and I'll dig in directly. If the plugin just didn't fit your workflow, we'll see you next time.
>
> Thanks,
> <You>

**Issue-ი refund-ი:** see `refund.md` runbook.

---

## Q3. "Can I cancel? When does it stop charging me?"

**Important:** ჩვენი launch mode = **one-time purchase** (no auto-renewal). მომხმარებელი არ ეფანდება ხელახლა მანამდე, სანამ თვითონ არ ნახულობს $16-ს.

**Reply template:**

> Hi <Name>,
>
> Good news — there's nothing to cancel. Web2Wireframe Pro is a one-time $16 purchase that gives you 30 days of unlimited imports. Your card will NOT be charged again automatically. After 30 days you simply go back to the Free plan (10 imports/month) until you decide to buy another month.
>
> Thanks,
> <You>

**თუ რეცე subscription mode ჩაირთვება (post-launch):**
> Hi <Name>, you can cancel anytime — open the plugin Plan modal → "Manage Subscription" → opens the website → "Cancel". You'll keep Pro until the end of your current billing cycle (no refunds for the unused remainder, but no further charges).

---

## Q4. "Do you support Apple Pay / Google Pay?"

**Reply template:**

> Yes — when you click "Get Pro" in the plugin, you'll land on Flitt's secure checkout page which supports Apple Pay, Google Pay, Visa, Mastercard, and American Express. Apple/Google Pay buttons appear automatically on supported devices.
>
> Thanks,
> <You>

---

## Q5. "Where's my receipt / invoice?"

**Cause:** Flitt does NOT auto-send receipts unless configured. Currently we rely on the user's card statement.

**Reply template (no formal invoice yet):**

> Hi <Name>,
>
> Sorry — we don't auto-email invoices at the moment. Your card statement will show "FLITT*WEB2WIREFRAME" (or similar) for the $16 charge. If you need a formal invoice for accounting, reply with your business name + tax ID and I'll send one manually within 1-2 business days.
>
> Thanks,
> <You>

**TODO post-launch:** automate receipt email on `approved` webhook.

---

## Q6. "I'm in the EU — do you charge VAT?"

**Reply template:**

> Hi <Name>,
>
> No — Web2Wireframe is a non-EU seller and we don't currently collect EU VAT at the point of sale. Depending on your country, you may be responsible for self-declaration. We're below the threshold where MOSS/OSS registration is required.
>
> If you're a business and need a non-VAT-charged invoice, we can issue one. Reply with your business name + VAT ID.
>
> Thanks,
> <You>

---

## Q7. "My card was declined"

**Cause:** issuer-მა უარყო (bank fraud filter, insufficient funds, expired card, wrong country).

**Reply template:**

> Hi <Name>,
>
> Card declines are decided by your issuing bank — we don't see the specific reason. Common causes:
> - Bank's fraud filter flagged the $16 USD international charge (call your bank, ask them to approve a charge from "FLITT" or "web2wireframe.design")
> - Card expired or replaced
> - Insufficient funds
>
> Could you try one more time? If it declines again, please try another card if you have one, or contact your bank.
>
> Thanks,
> <You>

---

## Q8. "I bought Pro on a different Figma account — can you transfer it?"

**Cause:** user-ი შეცდა, ან გადააქცია account-ი.

**Reply template:**

> Hi <Name>,
>
> Yes I can transfer — please send me:
> 1. The **Figma user ID** of the account that **paid** (where Pro currently sits)
> 2. The **Figma user ID** of the account you **want it on**
>
> You'll find the user ID in the plugin → Plan modal → "Account ID" field.
>
> Thanks,
> <You>

**Manual MongoDB move:**
```bash
mongosh "$MONGODB_URI"
# Read the paid license
> const paid = db.licenses.findOne({figmaUserId: "SOURCE"})
# Transfer to target
> db.licenses.updateOne(
    {figmaUserId: "TARGET"},
    {$set: {
      plan: paid.plan,
      status: paid.status,
      cycleStartedAt: paid.cycleStartedAt,
      cycleEndsAt: paid.cycleEndsAt,
      subscription: paid.subscription,
      email: paid.email
    }},
    {upsert: true}
  )
# Downgrade source
> db.licenses.updateOne(
    {figmaUserId: "SOURCE"},
    {$set: {plan: "free", subscription: null, status: "active"}}
  )
```

---

## Escalation

**Contact tree:**
1. **billing@web2wireframe.design** — me (founder) — first touch, response within 24h
2. **Flitt support@flitt.com** — for payment provider issues only (webhook delivery, card processing errors, refund mechanics)
3. **Resend support** — if reminder/refund emails not delivering

**Severity thresholds:**
- 1 customer affected → reply within 24h
- 5+ customers same issue → investigate immediately, status post if needed
- Webhook signature failures > 5/hour → security incident, check `key-rotation.md`
