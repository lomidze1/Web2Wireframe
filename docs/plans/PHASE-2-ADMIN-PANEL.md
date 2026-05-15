# Phase 2 — Admin Panel (Owner Dashboard)

**Status:** Planning complete, awaiting implementation.
**Last updated:** 2026-05-04
**Estimated effort:** ~1 working day (~6–8 hours)
**Prerequisites:** Phase 0–10 of payment system complete. Phase 1 (production trust) ideally complete first, but not strictly required.
**Branch strategy:** direct commits to `dev`, one commit per sub-phase (2.1, 2.2, 2.3, 2.4).

---

## How to resume work from this file

Open a fresh Claude Code session, then:

> წაიკითხე `docs/plans/PHASE-2-ADMIN-PANEL.md` და დაიწყე Phase 2.1-დან. მიყევი TDD-ს. ყოველი ფაზის შემდეგ commit-ი.

Implement in order: **2.1 (auth) → 2.2 (stats) → 2.3 (license CRUD) → 2.4 (refinement)**. The first three are independently shippable; 2.4 polishes 2.2.

---

## 1. Context

Currently all admin operations require `curl` from operator's machine via the existing endpoints in `packages/api/src/routes/admin/license.ts` (`GET /:figmaUserId`, `POST /override`, `GET /lookup-by-email`). While functional, this is:

- **Slow for daily ops** — checking subscriber count, applying manual fixes.
- **Error-prone** — JSON typos, copy-paste mistakes.
- **No trend visibility** — MRR, churn, growth require ad-hoc aggregations.
- **Hard to delegate** — only operator with terminal + tokens can do it.

Building a hidden, OAuth-protected `/admin` UI on the website provides:
- Single dashboard for all license operations.
- Live stats (MRR, churn, active Pro count).
- Quick search by email/figmaUserId.
- Manual override actions through forms instead of curl.
- Self-grant Pro for owner testing/demos.

The panel is **deliberately hidden** — no link from any public page. Only the owner knows the `/admin` URL exists. Plus the Figma OAuth + allowlist combo means even if someone discovers the URL, they cannot enter without being the actual owner Figma account.

---

## 2. Decisions locked (2026-05-04)

- **URL:** `/admin` on website (`packages/web`).
- **Visibility:** Hidden — no nav links, no SEO. Robots blocked via meta noindex.
- **Auth:** Figma OAuth login (existing infrastructure) + allowlist of admin Figma user IDs (`ADMIN_FIGMA_USER_IDS` env var, comma-separated).
- **Session-based** — uses existing express-session (`websiteRouter`). 7-day cookie. No HMAC tokens needed (different from Account page which uses HMAC).
- **Read-only fields:** email (Flitt manages it), createdAt, updatedAt.
- **Editable fields:** plan, status, cycleEndsAt, subscription.canceledAt (for manual edge cases).
- **No payment refunds via UI** — too risky for v1. Refunds done manually via Flitt dashboard.
- **Stats computed on-the-fly** — Mongoose aggregation pipelines on License + (future) Payment collections. No separate analytics DB.
- **No multi-admin features** — single owner for v1. Audit log deferred.

---

## 3. Existing patterns to reuse

| Need | Reuse from (file:line) | Notes |
|------|-------------------------|-------|
| Figma OAuth flow | `packages/api/src/routes/website/figmaAuth.ts` | Already issues session cookie with figmaUserId |
| Session middleware | `packages/api/src/index.ts:160-175` (`express-session`) | Mounted on websiteRouter |
| Existing admin API | `packages/api/src/routes/admin/license.ts` | Mirror handlers — change auth from ADMIN_TOKEN bearer to session-based |
| Account page session check | `packages/api/src/routes/website/session.ts` | Pattern for "check current user" endpoint |
| Page layout | `packages/web/src/pages/Account/Account.tsx` (card-based) | Style consistency |
| Form patterns | `packages/web/src/pages/Support/Support.tsx` (existing form) | Form input/button styling |
| Routing | `packages/web/src/AppRoutes.tsx` | Add `/admin/*` route |
| License model | `packages/api/src/models/License.ts` | Schema, indexes, aggregation targets |
| Test mock pattern | `packages/api/__tests__/admin-routes.test.ts` | Mock License model methods |

---

## 4. Phase 2.1 — Admin auth + dashboard scaffold

**Effort:** ~1.5 hours.

### 4.1 Backend

**MODIFY** `packages/api/src/config/env.ts`:

```ts
const adminFigmaUserIds = (process.env.ADMIN_FIGMA_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const config = {
  // ... existing
  admin: {
    figmaUserIds: adminFigmaUserIds,
  },
  features: {
    // ... existing
    adminPanelEnabled: adminFigmaUserIds.length > 0,
  },
};
```

**MODIFY** `.env.example`:

```bash
# === Admin Panel ===
# Comma-separated Figma user IDs allowed to access /admin.
# Get yours from the plugin: open Plan modal, check console log
# `[W2W] figma.currentUser.id = ...`
ADMIN_FIGMA_USER_IDS=1082972835952103170
```

**NEW** `packages/api/src/middleware/adminSessionAuth.ts`:

```ts
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/env.js";

/**
 * Session-based auth middleware for /admin routes.
 *
 * Checks two conditions:
 * 1. User has an active Figma OAuth session (req.session.figmaUserId set).
 * 2. The session figmaUserId is in the ADMIN_FIGMA_USER_IDS allowlist.
 *
 * 401 if not logged in, 403 if logged in but not admin.
 */
export function adminSessionAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const figmaUserId = req.session?.figmaUserId;
  if (!figmaUserId) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  if (!config.admin.figmaUserIds.includes(figmaUserId)) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
```

**NEW** `packages/api/src/routes/website/admin.ts` (mounted on websiteRouter):

```ts
import { Router, type Request, type Response } from "express";
import { License, type ILicense } from "../../models/License.js";
import { adminSessionAuth } from "../../middleware/adminSessionAuth.js";
import { mongoConnected } from "../../state.js";

const router = Router();

// All routes require admin session.
router.use(adminSessionAuth);

router.get("/me", (req, res) => {
  res.json({
    figmaUserId: req.session.figmaUserId,
    figmaUserName: req.session.figmaUserName ?? null,
    isAdmin: true,
  });
});

router.get("/licenses", async (req, res) => {
  if (!mongoConnected) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, parseInt(String(req.query.limit ?? "20"), 10));
  const search = typeof req.query.search === "string" ? req.query.search : "";

  const filter = search
    ? {
        $or: [
          { figmaUserId: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }
    : {};

  const [licenses, total] = await Promise.all([
    License.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    License.countDocuments(filter),
  ]);

  res.json({
    licenses: licenses.map(serializeLicenseAdmin),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

router.get("/licenses/:figmaUserId", async (req, res) => {
  if (!mongoConnected) { /* same as above */ }
  const license = await License.findOne({ figmaUserId: req.params.figmaUserId });
  if (!license) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeLicenseAdmin(license));
});

router.post("/licenses/:figmaUserId/override", async (req, res) => {
  if (!mongoConnected) { /* same */ }
  // Same body shape as POST /api/admin/license/override but session-auth
  // Same plan/status enums + cycleEndsAt parsing
  // Returns updated serialized license
});

router.get("/stats", async (req, res) => {
  if (!mongoConnected) { /* same */ }
  // See Phase 2.2 for full implementation
});

export default router;

function serializeLicenseAdmin(license: ILicense) {
  // Return ALL fields (including subscription details) — admin needs full visibility
  return {
    figmaUserId: license.figmaUserId,
    email: license.email,
    plan: license.plan,
    status: license.status,
    cycleStartedAt: license.cycleStartedAt.toISOString(),
    cycleEndsAt: license.cycleEndsAt.toISOString(),
    usage: license.usage,
    subscription: license.subscription,
    createdAt: license.createdAt.toISOString(),
    updatedAt: license.updatedAt.toISOString(),
  };
}
```

**MODIFY** `packages/api/src/index.ts`:

```ts
import websiteAdminRoutes from "./routes/website/admin.js";
// ...
websiteRouter.use("/web/admin", websiteAdminRoutes);
```

### 4.2 Frontend

**NEW** `packages/web/src/pages/Admin/AdminLayout.tsx`:

```tsx
import { type ReactElement, useEffect, useState } from "react";
import { Outlet, useNavigate, NavLink } from "react-router-dom";
import styles from "./AdminLayout.module.scss";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

export default function AdminLayout(): ReactElement {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    fetch(`${API_URL}/web/admin/me`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          // Not logged in — redirect to OAuth
          window.location.href =
            `${API_URL}/auth/figma/login?return=` +
            encodeURIComponent(window.location.pathname);
          return;
        }
        if (res.status === 403) {
          setAuthState("denied");
          return;
        }
        setAuthState("ok");
      })
      .catch(() => setAuthState("denied"));
  }, []);

  if (authState === "loading") return <div className={styles.loading}>…</div>;
  if (authState === "denied")
    return (
      <div className={styles.denied}>
        <h1>Access denied</h1>
        <p>Your Figma account is not authorized for the admin panel.</p>
      </div>
    );

  return (
    <div className={styles.layout}>
      <nav className={styles.sidebar}>
        <NavLink to="/admin">Dashboard</NavLink>
        <NavLink to="/admin/licenses">Licenses</NavLink>
      </nav>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
```

**NEW** `packages/web/src/pages/Admin/AdminLayout.module.scss` — sidebar layout, dark theme.

**MODIFY** `packages/web/src/AppRoutes.tsx`:

```tsx
import AdminLayout from "./pages/Admin/AdminLayout";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AdminLicenses from "./pages/Admin/AdminLicenses";
import AdminLicenseDetail from "./pages/Admin/AdminLicenseDetail";

// Inside Routes:
<Route path="/admin" element={<AdminLayout />}>
  <Route index element={<AdminDashboard />} />
  <Route path="licenses" element={<AdminLicenses />} />
  <Route path="licenses/:figmaUserId" element={<AdminLicenseDetail />} />
</Route>
```

### 4.3 Tests

**NEW** `packages/api/__tests__/admin-session-auth.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/config/env.js", () => ({
  config: { admin: { figmaUserIds: ["admin-fid-1"] } },
}));

const { adminSessionAuth } = await import("../src/middleware/adminSessionAuth.js");

function makeApp(sessionFigmaUserId?: string) {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).session = sessionFigmaUserId
      ? { figmaUserId: sessionFigmaUserId }
      : {};
    next();
  });
  app.get("/test", adminSessionAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("adminSessionAuth", () => {
  it("returns 401 when no session", async () => { ... });
  it("returns 403 when figmaUserId not in allowlist", async () => { ... });
  it("calls next() when admin", async () => { ... });
});
```

### 4.4 Verification

- Run `pnpm test` → green
- Manual:
  1. Set `ADMIN_FIGMA_USER_IDS=1082972835952103170` in `.env`
  2. Restart API container (`docker compose up -d --build api`)
  3. Visit `http://localhost:5173/admin` → redirects to Figma OAuth
  4. Complete OAuth → returns to `/admin` → dashboard visible (currently empty)
  5. Try with non-admin Figma account → "Access denied"

---

## 5. Phase 2.2 — Stats dashboard

**Effort:** ~1.5 hours.

### 5.1 Backend stats aggregation

**MODIFY** `packages/api/src/routes/website/admin.ts` — implement `GET /stats`:

```ts
router.get("/stats", async (_req, res) => {
  if (!mongoConnected) { /* 503 */ }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activePro,
    canceledPro,
    freeUsers,
    mrrAggregate,
    churnedLast30,
    activeLast30,
  ] = await Promise.all([
    License.countDocuments(),
    License.countDocuments({ plan: "pro", status: "active" }),
    License.countDocuments({ plan: "pro", status: "canceled" }),
    License.countDocuments({ plan: "free" }),
    License.aggregate([
      { $match: { plan: "pro", status: "active" } },
      { $count: "count" },
    ]),
    License.countDocuments({
      plan: "pro",
      status: "canceled",
      "subscription.canceledAt": { $gte: thirtyDaysAgo },
    }),
    License.countDocuments({
      plan: "pro",
      $or: [
        { "subscription.activatedAt": { $lte: thirtyDaysAgo } },
        { createdAt: { $lte: thirtyDaysAgo } },
      ],
    }),
  ]);

  // MRR = active Pro count × $16/mo (later: account for annual variants)
  const mrrCents = activePro * 1600;

  // 30d churn: canceled in last 30d ÷ active 30 days ago (approximation)
  const churnRate = activeLast30 > 0 ? churnedLast30 / activeLast30 : 0;

  res.json({
    totalUsers,
    activePro,
    canceledPro,
    freeUsers,
    mrr: { cents: mrrCents, formatted: `$${(mrrCents / 100).toFixed(2)}` },
    churn30d: { rate: churnRate, formatted: `${(churnRate * 100).toFixed(1)}%` },
  });
});
```

### 5.2 Frontend dashboard

**NEW** `packages/web/src/pages/Admin/AdminDashboard.tsx`:

```tsx
import { useEffect, useState } from "react";
import styles from "./AdminDashboard.module.scss";

interface Stats {
  totalUsers: number;
  activePro: number;
  canceledPro: number;
  freeUsers: number;
  mrr: { cents: number; formatted: string };
  churn30d: { rate: number; formatted: string };
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/web/admin/stats`, { credentials: "include" })
        .then((r) => r.json())
        .then(setStats);
    load();
    const interval = setInterval(load, 30_000); // auto-refresh
    return () => clearInterval(interval);
  }, []);

  if (!stats) return <div>Loading…</div>;

  return (
    <div className={styles.dashboard}>
      <h1>Dashboard</h1>
      <div className={styles.statsGrid}>
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Active Pro" value={stats.activePro} accent />
        <StatCard label="Canceled Pro" value={stats.canceledPro} muted />
        <StatCard label="MRR" value={stats.mrr.formatted} accent />
        <StatCard label="Free users" value={stats.freeUsers} />
        <StatCard label="30-day churn" value={stats.churn30d.formatted} />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, muted }: {
  label: string; value: string | number; accent?: boolean; muted?: boolean;
}) {
  return (
    <div className={`${styles.card} ${accent ? styles.accent : ""} ${muted ? styles.muted : ""}`}>
      <div className={styles.value}>{value}</div>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
```

**NEW** `packages/web/src/pages/Admin/AdminDashboard.module.scss` — 6-card grid, dark theme.

### 5.3 Tests

**NEW** `packages/api/__tests__/admin-routes-website.test.ts`:

- `GET /web/admin/stats` returns shape with all required fields
- MRR calculation: 5 active Pro → 8000 cents
- Churn: 2 canceled in last 30d / 10 active 30d ago = 20%

---

## 6. Phase 2.3 — License management UI

**Effort:** ~2 hours.

### 6.1 Frontend list page

**NEW** `packages/web/src/pages/Admin/AdminLicenses.tsx`:

- Search bar at top (debounced 300ms)
- Paginated table:
  | figmaUserId | email | plan | status | cycleEndsAt | actions |
- Plan/status badges (color-coded)
- Pagination: Prev / Next + page numbers
- Click row → navigate to `/admin/licenses/:figmaUserId`

**NEW** `packages/web/src/pages/Admin/AdminLicenses.module.scss` — table styles.

### 6.2 Frontend detail/edit page

**NEW** `packages/web/src/pages/Admin/AdminLicenseDetail.tsx`:

- Read-only header: figmaUserId, email, createdAt, updatedAt
- Editable form (controlled inputs):
  - `plan` (dropdown: free / pro)
  - `status` (dropdown: active / canceled / expired)
  - `cycleEndsAt` (date input, ISO)
  - `subscription.canceledAt` (date input, optional, allows clearing)
- "Save changes" button → POST `/web/admin/licenses/:figmaUserId/override`
- Read-only subscription details (flittOrderId, activatedAt, lastChargeAt, failureCount, etc.)
- Quick actions: "Self-grant Pro" button (if license.figmaUserId === current admin's figmaUserId)
- Audit info: shows updatedAt diff after save

**NEW** `packages/web/src/pages/Admin/AdminLicenseDetail.module.scss` — form styles.

### 6.3 Tests

**EXTEND** `packages/api/__tests__/admin-routes-website.test.ts`:
- Pagination works (page=2 returns next set)
- Search by email substring matches case-insensitive
- Search by figmaUserId substring matches
- POST override changes plan/status/cycleEndsAt
- POST override returns updated license

### 6.4 Verification

- Search "user@example.com" → filters table
- Click user → detail page → change status to "canceled" → save → list reflects update
- Self-grant Pro → owner's plan updates → reflects in plugin Plan modal

---

## 7. Phase 2.4 — Stats refinement (optional)

**Effort:** ~1 hour.

### 7.1 30-day MRR sparkline

Add small SVG chart (no library) showing MRR over last 30 days. Requires Payment collection (from Phase 3) to track historical revenue. **Defer this until Phase 3.3 ships.**

### 7.2 Recent activity feed

Last 10 license changes (filtered by `updatedAt` desc). Show on dashboard.

### 7.3 Health check

API status, MongoDB connected, Flitt configured indicators.

---

## 8. Critical files summary

### Phase 2.1 (auth + scaffold)
- MODIFY `packages/api/src/config/env.ts` — add `config.admin.figmaUserIds`
- MODIFY `.env.example` — add `ADMIN_FIGMA_USER_IDS`
- NEW `packages/api/src/middleware/adminSessionAuth.ts`
- NEW `packages/api/src/routes/website/admin.ts`
- MODIFY `packages/api/src/index.ts` — mount admin routes
- NEW `packages/web/src/pages/Admin/AdminLayout.tsx` + .module.scss
- MODIFY `packages/web/src/AppRoutes.tsx` — register admin routes
- NEW `packages/api/__tests__/admin-session-auth.test.ts`

### Phase 2.2 (dashboard)
- IMPLEMENT `GET /web/admin/stats` in admin.ts
- NEW `packages/web/src/pages/Admin/AdminDashboard.tsx` + .module.scss
- NEW `packages/api/__tests__/admin-routes-website.test.ts`

### Phase 2.3 (license CRUD)
- NEW `packages/web/src/pages/Admin/AdminLicenses.tsx` + .module.scss
- NEW `packages/web/src/pages/Admin/AdminLicenseDetail.tsx` + .module.scss
- EXTEND admin-routes-website tests

### Phase 2.4 (refinement, optional)
- Sparkline / activity feed / health check additions

---

## 9. Auth flow details

### 9.1 Returning to `/admin` after OAuth

The Figma OAuth callback (`packages/api/src/routes/website/figmaAuth.ts`) currently redirects to a default URL after login. Need to support a `?return=/admin` query param so post-login the user lands back on admin instead of homepage.

**MODIFY** `packages/api/src/routes/website/figmaAuth.ts`:
- Accept `return` query param at `/auth/figma/login`
- Pass through state parameter (already supported by Figma OAuth)
- Redirect to `return` value after successful callback

### 9.2 Session stores figmaUserName

Currently session probably stores only `figmaUserId`. Need to also store `figmaUserName` (from Figma `me` API response) for nicer admin UI greetings.

**MODIFY** OAuth callback to fetch user info from Figma's `/v1/me` endpoint and store in session.

---

## 10. Security considerations

1. **No CSRF protection on POST** — fix this. Use double-submit cookie or csurf middleware (if not already there). Critical because admin can change plan/status.
2. **Session hijacking** — session cookie should be `httpOnly` (already), `secure` in production, `sameSite: lax`. Verify current config.
3. **Audit logging** — defer for v1, but log every override mutation server-side (`console.log` is enough for now): `[Admin] ${figmaUserId} overrode ${targetUserId}: plan=${newPlan}`.
4. **Rate limiting** — add basic rate limiting to `/web/admin/*` routes (e.g. 60 req/min per session). Existing `express-rate-limit` may already be configured.
5. **No XSS** — React auto-escapes by default; ensure no `dangerouslySetInnerHTML`.

---

## 11. Rollout

1. Develop on `dev` branch.
2. Implement Phase 2.1 → tests + manual auth flow → commit.
3. Phase 2.2 → tests + dashboard renders → commit.
4. Phase 2.3 → tests + manual override → commit.
5. Phase 2.4 → optional polish.

**Commit messages:**
- `feat(admin): hidden /admin panel with Figma OAuth + allowlist`
- `feat(admin): stats dashboard (users, MRR, churn)`
- `feat(admin): license search + detail + override`
- `chore(admin): activity feed + health check`

---

## 12. References

- **Figma OAuth route:** `packages/api/src/routes/website/figmaAuth.ts`
- **Existing admin curl API:** `packages/api/src/routes/admin/license.ts` — handlers map almost 1:1 to UI endpoints.
- **Express session config:** `packages/api/src/index.ts:160-175`
- **Master plan:** [`docs/plans/PAYMENT-SYSTEM.md`](./PAYMENT-SYSTEM.md)
- **Phase 1:** [`docs/plans/PHASE-1-PRODUCTION-TRUST.md`](./PHASE-1-PRODUCTION-TRUST.md)
- **Phase 3:** [`docs/plans/PHASE-3-REVENUE-FEATURES.md`](./PHASE-3-REVENUE-FEATURES.md) — Phase 3.3 (Payment model) needed for accurate MRR + sparkline.
- **Project memory:** `~/.claude/projects/-Users-giorgi-Desktop-Web2Wireframe/memory/project_payment-system.md`
- **Figma OAuth docs:** https://www.figma.com/developers/api#oauth2

---

## 13. Open questions / risks

1. **Figma OAuth callback URL** — need to verify `/auth/figma/callback` already redirects properly after success. May need to add `?return=` param support.
2. **Session figmaUserName** — currently might store only id; need to also store name for UI.
3. **CSRF** — confirm whether csurf or equivalent is configured. If not, ADD before shipping admin POST endpoints.
4. **MRR includes annual subscriptions** — Phase 3 introduces annual; MRR aggregation must split monthly + annual/12 to avoid double-counting.
5. **Multi-instance scaling** — if API runs multiple instances, ensure session store is shared (Redis, MongoDB store) — not in-memory.
