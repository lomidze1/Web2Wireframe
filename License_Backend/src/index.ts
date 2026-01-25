import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

type Plan = "free" | "plus" | "pro";

type Status = "trial" | "active" | "expired" | "canceled";

interface License {
  userId: string;
  plan: Plan;
  status: Status;
  expiresAt?: string;
  limits: {
    importsPerDay: number;
    aiGenerationsPerDay: number;
    librarySaves: number;
  };
  usage: {
    importsToday: number;
    aiGenerationsToday: number;
    librarySavesTotal: number;
  };
  updatedAt: string;
}

const app = express();
app.use(express.json());

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS || "";
const allowedOrigins = rawAllowedOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);

const DEV_TOKEN = process.env.DEV_TOKEN;
const DEV_USER_ID = process.env.DEV_USER_ID || "dev-user";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

const licenseStore = new Map<string, License>();

const buildDefaultLicense = (userId: string): License => {
  const now = new Date().toISOString();
  return {
    userId,
    plan: "free",
    status: "active",
    limits: {
      importsPerDay: 10,
      aiGenerationsPerDay: 5,
      librarySaves: 20,
    },
    usage: {
      importsToday: 0,
      aiGenerationsToday: 0,
      librarySavesTotal: 0,
    },
    updatedAt: now,
  };
};

const getOrCreateLicense = (userId: string): License => {
  const existing = licenseStore.get(userId);
  if (existing) return existing;
  const created = buildDefaultLicense(userId);
  licenseStore.set(userId, created);
  return created;
};

const updateLicense = (license: License, updates: Partial<License>): License => {
  const updated = {
    ...license,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  licenseStore.set(updated.userId, updated);
  return updated;
};

const auth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token || !DEV_TOKEN || token !== DEV_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.userId = DEV_USER_ID;
  return next();
};

const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token || !ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/me/license", auth, (req, res) => {
  const license = getOrCreateLicense(req.userId);
  res.json(license);
});

app.post("/license/activate", auth, (req, res) => {
  const { userId, plan } = req.body as { userId?: string; plan?: Plan };
  const targetUserId = userId || req.userId;

  if (!plan || (plan !== "free" && plan !== "plus" && plan !== "pro")) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  const license = getOrCreateLicense(targetUserId);
  const updated = updateLicense(license, {
    plan,
    status: "active",
  });

  return res.json(updated);
});

app.post("/admin/set-license", adminAuth, (req, res) => {
  const { userId, plan, status, expiresAt } = req.body as {
    userId?: string;
    plan?: Plan;
    status?: Status;
    expiresAt?: string;
  };

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  if (!plan || (plan !== "free" && plan !== "plus" && plan !== "pro")) {
    return res.status(400).json({ error: "Invalid plan" });
  }

  if (
    !status ||
    (status !== "trial" &&
      status !== "active" &&
      status !== "expired" &&
      status !== "canceled")
  ) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const license = getOrCreateLicense(userId);
  const updated = updateLicense(license, {
    plan,
    status,
    expiresAt,
  });

  return res.json(updated);
});

const port = Number(process.env.PORT || 4001);

app.listen(port, () => {
  console.log(`License backend listening on :${port}`);
});

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}
