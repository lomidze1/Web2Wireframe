import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import mongoose from "mongoose";
import { pendingCDPImports, setMongoConnected } from "./state.js";

// Plugin route modules
import pluginAuthRoutes from "./routes/plugin/auth.js";
import pluginDefaultsRoutes from "./routes/plugin/defaults.js";
import pluginImportRoutes from "./routes/plugin/import.js";
import pluginCdpRoutes from "./routes/plugin/cdp.js";
import pluginAiRoutes from "./routes/plugin/ai.js";
import pluginWireframeRoutes from "./routes/plugin/wireframe.js";
import pluginSettingsRoutes from "./routes/plugin/settings.js";

// License routes (MongoDB-backed, formerly License_Backend)
import licenseRoutes from "./routes/license/index.js";

// Checkout / webhook / cancel routes (Flitt payment integration)
import checkoutRoutes, {
  webhookRouter,
  cancelRouter,
} from "./routes/checkout/index.js";
import authTokenRoutes from "./routes/plugin/auth-token.js";
import adminLicenseRoutes from "./routes/admin/license.js";
import {
  checkoutRateLimiter,
  webhookRateLimiter,
} from "./middleware/rateLimit.js";
import { runExpiryReminders } from "./services/reminderService.js";
import { config } from "./config/env.js";

// Website route modules (formerly Website_Backend)
import websiteSupportRoutes from "./routes/website/support.js";
import websiteFigmaAuthRoutes from "./routes/website/figmaAuth.js";
import websiteSessionRoutes from "./routes/website/session.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { assertProductionSecrets } from "./config/startupChecks.js";

const app = express();

// Fail fast at boot if critical secrets are missing or weak in production.
assertProductionSecrets(process.env);

// ============================================================================
// Global middleware
// ============================================================================

// Flitt webhook payloads are tiny (~1-2 KB). Cap the body size on the
// webhook path BEFORE the global 50mb parser fires so an attacker cannot
// pin Express's JSON parser with a huge body. Express skips a second
// `express.json()` call once the body is already parsed, so a path-scoped
// parser mounted first effectively overrides the global limit for that path.
app.use("/api/webhooks", express.json({ limit: "16kb" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.set("trust proxy", 1);

// ============================================================================
// MongoDB Connection (optional — wireframe generation works without it)
// ============================================================================

// Expiry reminder emails for one-time Pro purchases. No native cron — a
// long-running interval is enough (the container restarts only on failure).
// `applyOneTimePurchase` clears `reminderSentAt`, so a re-run never resends.
const REMINDERS_ENABLED = process.env.EXPIRY_REMINDERS_ENABLED !== "false";
const remindersActive = REMINDERS_ENABLED && config.features.flittEnabled;

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/web2wireframe")
  .then(() => {
    setMongoConnected(true);
    // Startup run, once the DB is connected — a fresh deploy shouldn't wait
    // hours for the first interval tick.
    if (remindersActive) {
      runExpiryReminders().catch((err: Error) => {
        console.error("[Reminders] startup run failed:", err);
      });
    }
  })
  .catch((err: Error) => {
    console.warn(
      "MongoDB connection failed (wireframe generation will still work):",
      err.message
    );
    setMongoConnected(false);
  });

// Cleanup expired imports every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingCDPImports.entries()) {
    if (now > entry.expires) {
      pendingCDPImports.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Expiry reminders every 6 hours. The `reminderSentAt` claim dedupes, so an
// extra tick (e.g. after a restart) is harmless.
if (remindersActive) {
  setInterval(
    () => {
      runExpiryReminders().catch((err: Error) => {
        console.error("[Reminders] interval run failed:", err);
      });
    },
    6 * 60 * 60 * 1000,
  );
}

// ============================================================================
// Plugin Router (CORS: figma.com + null origin for Figma plugin iframe)
// ============================================================================

const pluginRouter = express.Router();
const isProduction = process.env.NODE_ENV === "production";
const corsOrigin = process.env.CORS_ORIGIN;

// Production safety: refuse to boot with wildcard/credentialed CORS.
// Browsers reject `Access-Control-Allow-Origin: *` + `credentials: true`,
// and accepting unknown origins with credentialed cookies is a CSRF vector.
if (isProduction && (!corsOrigin || corsOrigin === "*")) {
  throw new Error(
    "CORS_ORIGIN must be set to an explicit comma-separated host list in production " +
      "(wildcard '*' is incompatible with credentials: true)."
  );
}

const allowedOriginHosts = (corsOrigin ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0 && o !== "*");

// Dev-only wildcard. Production paths can never reach this branch because
// of the guard above.
const allowAllOrigins = !isProduction && (!corsOrigin || corsOrigin === "*");

pluginRouter.use(
  cors({
    origin: (origin, callback) => {
      // Null origin (Figma plugin iframe, data: URLs, sandboxed iframes).
      // Browsers send missing Origin header as undefined, or literal "null" string.
      if (!origin || origin === "null") {
        callback(null, true);
        return;
      }
      if (allowAllOrigins) {
        callback(null, true);
        return;
      }
      let hostname: string;
      try {
        hostname = new URL(origin).hostname.toLowerCase();
      } catch {
        callback(new Error("Not allowed by CORS"));
        return;
      }
      const ok = allowedOriginHosts.some((allowed) => {
        const a = allowed.toLowerCase();
        // Exact match, or subdomain match (e.g. "figma.com" matches "www.figma.com")
        return hostname === a || hostname.endsWith("." + a);
      });
      if (ok) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Public plugin routes (no auth)
pluginRouter.use("/api", pluginAuthRoutes);
pluginRouter.use("/api", pluginDefaultsRoutes);
pluginRouter.use("/api/auth", authTokenRoutes);

// License routes (direct MongoDB — no more proxy)
pluginRouter.use("/api/license", licenseRoutes);

// Flitt payment routes — unique prefixes, so mount-level rate limiting is safe.
pluginRouter.use("/api/checkout", checkoutRateLimiter, checkoutRoutes);
pluginRouter.use("/api/webhooks", webhookRateLimiter, webhookRouter);
pluginRouter.use("/api/subscription", checkoutRateLimiter, cancelRouter);

// Admin endpoints (curl-driven, ADMIN_TOKEN-protected)
pluginRouter.use("/api/admin/license", adminLicenseRoutes);

// Functional plugin routes (optional auth)
// Every functional route applies its own auth per-route: import/ai/wireframe/
// settings routes use `authenticatePlugin`; the extension capture-queue
// writers in cdp routes (/import-w2w etc.) stay public and are scoped by a
// pairing code instead. Mount-level middleware is avoided here because all
// these routers share the `/api` prefix — a mount-level guard would leak
// onto sibling routers' public routes.
pluginRouter.use("/api", pluginImportRoutes);
pluginRouter.use("/api", pluginCdpRoutes);
pluginRouter.use("/api", pluginAiRoutes);
pluginRouter.use("/api", pluginWireframeRoutes);
pluginRouter.use("/api", pluginSettingsRoutes);

app.use(pluginRouter);

// ============================================================================
// Website Router (CORS: web2wireframe.design + localhost:5173)
// Session-based auth for Figma OAuth
// ============================================================================

const websiteRouter = express.Router();

const websiteAllowedOrigins = (
  process.env.WEBSITE_ALLOWED_ORIGINS ||
  "http://localhost:5173,https://www.web2wireframe.design"
)
  .split(",")
  .map((o) => o.trim());

websiteRouter.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || websiteAllowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Production safety: refuse to boot without a configured session secret.
// A predictable secret allows session-cookie forgery.
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}
const sessionSecret = process.env.SESSION_SECRET || "dev-session-secret";

websiteRouter.use(
  session({
    name: "w2w_session",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Website routes with /web prefix
websiteRouter.use("/web", websiteSupportRoutes);
websiteRouter.use("/web", websiteSessionRoutes);

// Figma OAuth (keep /auth prefix)
websiteRouter.use(websiteFigmaAuthRoutes);

app.use(websiteRouter);

// ============================================================================
// Error handling (must be last)
// ============================================================================

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// ============================================================================
// Start server
// ============================================================================

const PORT = process.env.API_PORT || 3002;
app.listen(PORT, () => {
  console.log(`[W2W API] Running on port ${PORT}`);
});

// For Vercel
export default app;
