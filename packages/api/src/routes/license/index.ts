import { Router, type Request, type Response } from "express";
import { License, PLAN_LIMITS } from "../../models/License.js";

const router = Router();

// ============================================================================
// Auth middleware for license routes
// ============================================================================

const DEV_TOKEN = process.env.DEV_TOKEN ?? "dev-token";
const DEV_USER_ID = process.env.DEV_USER_ID ?? "dev-user";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "admin-token";

function licenseAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token || token !== DEV_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  (req as Request & { userId?: string }).userId = DEV_USER_ID;
  next();
}

function adminAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

// ============================================================================
// Helper: get or create license
// ============================================================================

async function getOrCreateLicense(userId: string) {
  let license = await License.findOne({ userId });
  if (!license) {
    license = await License.create({ userId });
  }

  // Reset daily usage if needed
  const today = new Date().toISOString().slice(0, 10);
  if (license.usage.lastResetDate !== today) {
    license.usage.importsToday = 0;
    license.usage.aiGenerationsToday = 0;
    license.usage.lastResetDate = today;
    await license.save();
  }

  return license;
}

// ============================================================================
// Routes
// ============================================================================

// GET /api/license/me — get or create license for user
router.get("/me", licenseAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId?: string }).userId ?? DEV_USER_ID;
    const license = await getOrCreateLicense(userId);
    res.json({
      userId: license.userId,
      plan: license.plan,
      status: license.status,
      expiresAt: license.expiresAt?.toISOString(),
      limits: license.limits,
      usage: {
        importsToday: license.usage.importsToday,
        aiGenerationsToday: license.usage.aiGenerationsToday,
        librarySavesTotal: license.usage.librarySavesTotal,
      },
      updatedAt: license.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: message });
  }
});

// POST /api/license/activate — set plan
router.post("/activate", licenseAuth, async (req: Request, res: Response) => {
  try {
    const { plan } = req.body as { plan?: string };

    if (!plan || !["free", "plus", "pro"].includes(plan)) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }

    const userId = (req as Request & { userId?: string }).userId ?? DEV_USER_ID;
    const license = await getOrCreateLicense(userId);
    const planKey = plan as keyof typeof PLAN_LIMITS;

    license.plan = planKey;
    license.status = "active";
    license.limits = { ...PLAN_LIMITS[planKey] };
    await license.save();

    res.json(license);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: message });
  }
});

// POST /api/license/use-import — increment import usage
router.post("/use-import", licenseAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId?: string }).userId ?? DEV_USER_ID;
    const license = await getOrCreateLicense(userId);

    if (license.usage.importsToday >= license.limits.importsPerDay) {
      res.status(429).json({ error: "Daily import limit reached" });
      return;
    }

    license.usage.importsToday += 1;
    await license.save();

    res.json({ remaining: license.limits.importsPerDay - license.usage.importsToday });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: message });
  }
});

// POST /api/license/use-ai — increment AI usage
router.post("/use-ai", licenseAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId?: string }).userId ?? DEV_USER_ID;
    const license = await getOrCreateLicense(userId);

    if (license.usage.aiGenerationsToday >= license.limits.aiGenerationsPerDay) {
      res.status(429).json({ error: "Daily AI generation limit reached" });
      return;
    }

    license.usage.aiGenerationsToday += 1;
    await license.save();

    res.json({ remaining: license.limits.aiGenerationsPerDay - license.usage.aiGenerationsToday });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: message });
  }
});

// POST /api/admin/set-license — admin override
router.post("/admin/set", adminAuth, async (req: Request, res: Response) => {
  try {
    const { userId, plan, status, expiresAt } = req.body as {
      userId?: string;
      plan?: string;
      status?: string;
      expiresAt?: string;
    };

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    if (!plan || !["free", "plus", "pro"].includes(plan)) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }

    if (!status || !["trial", "active", "expired", "canceled"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const license = await getOrCreateLicense(userId);
    const planKey = plan as keyof typeof PLAN_LIMITS;

    license.plan = planKey;
    license.status = status as "trial" | "active" | "expired" | "canceled";
    license.limits = { ...PLAN_LIMITS[planKey] };
    if (expiresAt) {
      license.expiresAt = new Date(expiresAt);
    }
    await license.save();

    res.json(license);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: message });
  }
});

export default router;
