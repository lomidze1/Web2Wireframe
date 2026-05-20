# Incident — <SHORT TITLE>

> ფაილის სახელი: `YYYY-MM-DD-<slug>.md` — მაგ. `2026-05-20-flitt-webhook-signature-mismatch.md`
> ერთი incident = ერთი ფაილი. **შეადგინე ცხელ მდგომარეობაში; დახვეწე resolution-ის შემდეგ.**

---

## Summary
ერთი წინადადება — რა მოხდა, ვინ შეამჩნია, რა იყო blast radius.

> მაგ: "2026-05-20 18:42 UTC-ზე Flitt webhook signature verification დაიწყო failing-ი. 14 user-ის Pro აქტივაცია გადაიდო ~45 წუთით სანამ key-ი დავაბრუნე."

## Severity
- [ ] **SEV1** — production down, ან >10 user-ი მოგვწერა, ან card data exposure-ის რისკი
- [ ] **SEV2** — degraded UX (payment flow delayed/manual workaround), <10 user-ი
- [ ] **SEV3** — internal-only, customer-invisible

## Timeline (UTC)

| დრო | მოვლენა |
|-----|---------|
| HH:MM | Trigger event (e.g., key rotated, deploy went out, Flitt status page changed) |
| HH:MM | First signal (alert, customer email, monitoring) |
| HH:MM | Detection — შენ მიხვდი რომ პრობლემაა |
| HH:MM | Diagnosis — root cause found |
| HH:MM | Mitigation — temporary fix shipped |
| HH:MM | Resolution — permanent fix shipped |
| HH:MM | Verification — `/api/health/flitt` reports healthy, queue cleared |

## Root cause
რა მოხდა, რატომ. Technical detail-ი — ბრძანებები, commit hash-ები, log-ის ნაწყვეტები.

> მაგ: "Flitt-მა portal-ში secret key რეგენერი მოახდინო (manual support task), მაგრამ ჩვენი `.env`-ი არ განვაახლე deploy-ის შემდეგ. Webhook signature verification ყველა შემოსულ payload-ზე ჩავარდა; `flitt-webhook` logs `signature verification failed` warning-ი ხედავდა"

## Impact

- **მომხმარებლების რაოდენობა:** N
- **financial:** $X (lost / delayed activations)
- **data integrity:** რა მოხდა DB-ში? webhookevents collection? license rows?
- **customer-facing:** რომელი user-ი მიიღო შეცდომა?

## Mitigation (immediate)
რა გავაკეთე ცხელ მდგომარეობაში რომ ცეცხლი ჩამეცხო.

> მაგ:
> 1. Flitt-ის old secret key-ი დროებით დავაბრუნე `.env`-ში
> 2. `docker compose up -d --force-recreate api`
> 3. Webhook queue უკან დაუბრუნდა Flitt-ის retry schedule-ით — 60s-ში გავიდა

## Resolution (permanent fix)
რა commit/PR/config change-ი ცოცხალდება მუდმივად.

> მაგ: "Key rotation procedure-ში (runbooks/key-rotation.md §3) დაემატა checklist item: `cp .env .env.backup; nano .env; docker compose ... ; curl /api/health/flitt`. დანერგვის შემდეგ verify აუცილებელია."

## Lessons learned

- რა გვაჯობდა ცოდნოდა?
- რომელი მონიტორი იყო ეფექტური? რომელი არ იყო?
- რომელი runbook-ი დაგვეხმარა? რომელი იყო outdated?

## Action items

| # | Item | Owner | Due | Status |
|---|------|-------|-----|--------|
| 1 | მაგ: `key-rotation.md`-ში დააფიქსირე verify step | founder | YYYY-MM-DD | [ ] |
| 2 | მაგ: webhook signature failure rate > 5% → alert (Sentry/Datadog) | founder | YYYY-MM-DD | [ ] |

## References
- Logs: `kubectl logs ...` ან S3 link
- Related runbook: `docs/runbooks/<name>.md`
- Related commit: `<sha>`
- Customer tickets: `#12, #14`
- External: Flitt status page link, Resend status, etc.
