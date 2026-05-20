# Runbook — Flitt Secret Key Rotation

> როდის გამოიყენო: `FLITT_SECRET_KEY` ექსპონირდა (git push, .env leak, security incident), ან რეგულარული rotation (recommended: 1×/12 თვე).

⚠️ **კრიტიკული:** Flitt-ის secret key-ის ჩამოგდება იწვევს webhook signature verification failure-ს ყველა in-flight order-ისთვის. Rotation-ი მაქსიმუმ 5 წუთიან downtime-ში უნდა ჩაეტიოს.

---

## Pre-flight checklist

- [ ] შენ ხარ ერთადერთი ვინც deploy-ს აკეთებს (rotation-ის დროს race არ მოხდეს)
- [ ] შენ გაქვს access Flitt merchant portal-ში (https://merchant.flitt.com)
- [ ] შენ გაქვს access production `.env` deploy-ში
- [ ] არ მიმდინარეობს promotion/launch event რომელიც გაზრდის traffic-ს

---

## Procedure

### 1. Flitt-ში key regeneration

⚠️ **მნიშვნელოვანი:** Flitt portal-ში self-service "Regenerate key" ღილაკი **ხშირად არ არსებობს** — Flitt support-ის arousal სჭირდება.

**Email Flitt support-ს** (support@flitt.com), template:

> Subject: Payment key rotation request — merchant_id <YOUR_ID>
>
> Hi,
>
> Please regenerate the Payment Secret Key for merchant_id <YOUR_ID>.
> Reason: scheduled rotation / security incident.
>
> Please confirm:
> 1. The exact UTC timestamp at which the new key will become active.
> 2. The grace period (if any) during which both old and new keys are accepted.
> 3. Whether the regeneration requires re-registering our webhook URL.
>
> Thanks,
> <Founder name>

**მოლოდინი:** 1-2 business days (Flitt rotation manual მუშაკი ხელით ცვლის).

### 2. New key მიღება

Flitt support უპასუხებს ან:
- portal-ში "Settings → Payment Keys" ცხრილში
- ან PGP-encrypted email-ში

⚠️ **არასოდეს გადააგზავნო unencrypted Slack/Telegram-ით.**

### 3. Production env update

```bash
# 1. Connect to production
ssh production

# 2. Backup current .env (just in case)
cp /opt/web2wireframe/.env /opt/web2wireframe/.env.backup-$(date +%Y%m%d-%H%M)

# 3. Edit .env — replace ONLY FLITT_SECRET_KEY
nano /opt/web2wireframe/.env

# 4. Restart API container (force config reload)
docker compose -f /opt/web2wireframe/docker-compose.yml up -d --force-recreate api

# 5. Wait for healthy
docker compose ps api  # status should be "running"
```

### 4. Verification

```bash
# Confirm new key is loaded (returns booleans only — no value leaks)
curl https://api.web2wireframe.design/api/health/flitt \
  -H "X-Admin-Token: $ADMIN_TOKEN"

# Expected:
# {"flittEnabled":true,"merchantIdSet":true,"secretKeySet":true,...}
```

### 5. Live smoke test

⚠️ **სვით ნამდვილი ბარათით:**

1. ან გადახდის flow plugin-დან → checkout → $16 charge → wait for webhook
2. ან Flitt dashboard-ში არსებული order-ი manual refund → wait for reversed webhook

Both უნდა მუშაობდეს. თუ webhook signature failure-ი ჩანს logs-ში:
```bash
docker compose logs api --tail=100 | grep 'signature verification failed'
```
→ key არასწორად ჩაიდო. ROLLBACK.

### 6. Rollback (თუ ცუდად წავიდა)

```bash
# Restore old .env
cp /opt/web2wireframe/.env.backup-<timestamp> /opt/web2wireframe/.env
docker compose up -d --force-recreate api
```
შემდეგ email Flitt support-ს: "rollback to previous key — new key did not work".

---

## Post-rotation

- [ ] წაშალე .env.backup-* ფაილი (read it once, then `shred -u`)
- [ ] Update password manager / 1Password vault (Flitt entry)
- [ ] Log incident: `docs/incidents/<date>-flitt-key-rotation.md` (1-line: when, why, outcome)
- [ ] შემოწმე chargeback rate next 7 days (key change-ი არ უნდა გავლენილებდეს)

---

## When rotation must be IMMEDIATE

თუ key-ი მართლა გაჟონა (git push, log leak), don't wait for Flitt support normal SLA:

1. **Block all webhook delivery** (firewall rule on Flitt's outbound IPs `54.154.216.60` და `3.75.125.89`)
   ```
   iptables -A INPUT -s 54.154.216.60 -j DROP
   iptables -A INPUT -s 3.75.125.89 -j DROP
   ```
   (ეს უარყოფს legitimate webhooks-ს, მაგრამ ბლოკავს attacker-ის forged signed payload-ებსაც)
2. Email Flitt support **URGENT** flag-ით
3. Pause checkout creation: comment out `pluginRouter.use("/api/checkout", ...)` line in `index.ts` და deploy
4. Wait for new key, then rotate
5. Un-pause checkout, restore firewall
