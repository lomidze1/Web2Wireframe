# Runbooks

გამეორებადი ოპერაციული პროცედურები — ინციდენტისთვის და რელიზისთვის.

## ინციდენტი / ექსპლუატაცია

| ფაილი | როდის ვიყენებ |
|------|---------------|
| [refund.md](./refund.md) | მომხმარებელი ითხოვს refund-ს; chargeback შემოვიდა |
| [key-rotation.md](./key-rotation.md) | `FLITT_SECRET_KEY` rotation (scheduled ან incident) |
| [billing-faq.md](./billing-faq.md) | Customer billing-related questions (template replies) |
| [backup-restore.md](./backup-restore.md) | Daily license + webhook backup; full / single-user restore |
| [deployment-security.md](./deployment-security.md) | Trust-proxy assumption, IP allowlist toggle, CORS scope, secret guards |

## რელიზი / ინფრასტრუქტურა

| ფაილი | როდის ვიყენებ |
|------|---------------|
| [chrome-web-store-submission.md](./chrome-web-store-submission.md) | Chrome extension-ის ატვირთვა/განახლება Web Store-ზე |
| [flitt-checkout-branding.md](./flitt-checkout-branding.md) | Flitt-ის hosted checkout გვერდის ლოგო/ფერები (portal-ში) |
| [infra-upgrade.md](./infra-upgrade.md) | Render / MongoDB Atlas tier-ის აწევა |
| [w2w-decode.md](./w2w-decode.md) | `.w2w` capture-ის წაკითხვად JSON-ად გადაქცევა (owner-only) |

> სრული რელიზის ნაბიჯები (plugin publish + extension bump + API deploy) →
> [`CLAUDE.md`](../../CLAUDE.md) → „Release Cadence".

## სხვა მნიშვნელოვანი დოკუმენტები

- [../plans/PAYMENT-SYSTEM.md](../plans/PAYMENT-SYSTEM.md) — გადახდის სისტემის სრული გეგმა
- [../archive/Flitt.md](../archive/Flitt.md) — Flitt-ის სრული integration study (ისტორიული)
- [../incidents/](../incidents/) — ინციდენტების ჟურნალი
