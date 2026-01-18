# Support System Summary

This is a high-level summary of the support system. For setup, see `QUICKSTART_SUPPORT_SYSTEM.md`. For full details, see `COMPLETE_SUPPORT_SYSTEM.md`.

## What It Includes

- `Website_Frontend`: Support form UI (React + Vite).
- `Website_Backend`: Support API (Express + TypeScript).
- Email delivery via Resend.
- Server-side plan determination.

## How It Works (Short Flow)

```
Support form → POST /api/support → validation → plan tier lookup → Resend email → ticket ID response
```

## Source Documents

- Setup: `QUICKSTART_SUPPORT_SYSTEM.md`
- Reference: `COMPLETE_SUPPORT_SYSTEM.md`
- Deployment: `DEPLOYMENT.md`
