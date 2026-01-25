import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors, { type CorsOptions } from "cors";
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

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS ?? "";
const allowedOrigins = rawAllowedOrigins
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: CorsOptions = {
  origin(origin: string | undefined, callback) {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
};

app.use(cors(corsOptions));

const DEV_TOKEN = process.env.DEV_TOKEN ?? "";
const DEV_USER_ID = process.env.DEV_USER_ID ?? "dev-user";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "";

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

const updateLicense = (
  license: License,
  updates: Partial<License>,
): License => {
  const updated = {
    ...license,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  licenseStore.set(updated.userId, updated);
  return updated;
};

const auth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token || token !== DEV_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = DEV_USER_ID;
  next();
};

const adminAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token || token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/me/license", auth, (req: Request, res: Response) => {
  const license = getOrCreateLicense(req.userId ?? DEV_USER_ID);
  res.json(license);
});

app.post("/license/activate", auth, (req: Request, res: Response) => {
  const body = req.body as { userId?: string; plan?: Plan };
  const targetUserId = body.userId ?? req.userId ?? DEV_USER_ID;
  const plan = body.plan;

  if (!plan || (plan !== "free" && plan !== "plus" && plan !== "pro")) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  const license = getOrCreateLicense(targetUserId);
  const updated = updateLicense(license, {
    plan,
    status: "active",
  });

  res.json(updated);
});

app.post("/admin/set-license", adminAuth, (req: Request, res: Response) => {
  const { userId, plan, status, expiresAt } = req.body as {
    userId?: string;
    plan?: Plan;
    status?: Status;
    expiresAt?: string;
  };

  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  if (!plan || (plan !== "free" && plan !== "plus" && plan !== "pro")) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  if (
    !status ||
    (status !== "trial" &&
      status !== "active" &&
      status !== "expired" &&
      status !== "canceled")
  ) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const license = getOrCreateLicense(userId);
  const updated = updateLicense(license, {
    plan,
    status,
    expiresAt,
  });

  res.json(updated);
});

const port = Number(process.env.PORT) || 4001;
const host = "0.0.0.0";

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : "Server error";
  res.status(500).json({ error: message });
});

app.listen(port, host, () => {
  console.log(`License backend listening on ${host}:${port}`);
});

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
