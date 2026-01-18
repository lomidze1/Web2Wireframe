# Support System Quickstart

This guide sets up the support form UI in `Website_Frontend` and the support API in `Website_Backend`.

## Prerequisites

- Node.js and npm (see root `package.json` engines for minimum versions).

## 1) Configure `Website_Backend`

```bash
cd Website_Backend
cp .env.example .env
```

Required env vars (from `Website_Backend/src/config/env.ts`):

```env
RESEND_API_KEY=
SUPPORT_TO_EMAIL=
NOREPLY_EMAIL=
ALLOWED_ORIGIN=
```

Notes:

- `.env.example` currently does **not** include `NOREPLY_EMAIL` (needs verification).
- Default backend port is `3001` (see `Website_Backend/src/config/env.ts`).
- `setup-support-system.sh` sets `PORT=3002` and `ALLOWED_ORIGIN` accordingly (verified in the script).

Install and run:

```bash
npm install
npm run dev
```

Health check: `http://localhost:3001/api/health` (or `3002` if you used the setup script).

## 2) Configure `Website_Frontend`

```bash
cd Website_Frontend
cp .env.local.example .env.local
```

Set the API URL to match the backend port:

```env
VITE_API_URL=http://localhost:3001
```

Install and run:

```bash
npm install
npm run dev
```

Vite defaults to `http://localhost:5173` (it may choose another port if 5173 is busy).

## 3) Test the Support Form

1. Open `http://localhost:5173/support`.
2. Submit the form.
3. Check backend logs for the ticket ID.

## Running From the Repo Root

Use the explicit scripts:

```bash
npm run dev:backend
npm run dev:frontend
```

Note: `npm run dev` also runs `npm run dev` in `Plugin_Frontend`, but that script is not defined in `Plugin_Frontend/package.json` (current repo state).

## Next Steps

- Full reference: `COMPLETE_SUPPORT_SYSTEM.md`
- Deployment: `DEPLOYMENT.md`
4. Check backend logs for errors

### Rate limited?

In development, this shouldn't happen. If it does:

- Edit `.env`: `RATE_LIMIT_MAX_REQUESTS=10`
- Or set `NODE_ENV=development`

## 📚 Full Docs

- **Backend Setup**: [W2W-Website-Backend/README.md](./W2W-Website-Backend/README.md)
- **Full Reference**: [COMPLETE_SUPPORT_SYSTEM.md](./COMPLETE_SUPPORT_SYSTEM.md)
- **Deployment**: [DEPLOYMENT.md](./DEPLOYMENT.md)

## ✅ Checklist

- [ ] Got Resend API key
- [ ] Created `.env` in W2W-Website-Backend
- [ ] Created `.env.local` in W2W-Website
- [ ] Backend dependencies installed
- [ ] Frontend dependencies installed
- [ ] Backend running on 3001
- [ ] Frontend running on 5173
- [ ] Tested support form submission
- [ ] Received email at support address

## 🎉 Done!

Your support system is ready to use!

**Next Steps:**

1. Configure Lemon Squeezy webhooks (optional, for subscription lookup)
2. Deploy to production (see DEPLOYMENT.md)
3. Update your website to link to `/support`

---

**Questions?** Check the docs or create an issue on GitHub.

**Happy coding! 🚀**
