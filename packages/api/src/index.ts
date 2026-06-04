import "dotenv/config";
import { webcrypto } from "node:crypto";
import { gateConsoleInProduction } from "./utils/consoleGating.js";

// Node 18 ships webcrypto under `node:crypto` but doesn't expose it on
// `globalThis.crypto` by default (that's a Node 19+ default). The mongodb
// driver (transitive dep of connect-mongo) calls `crypto.getRandomValues`
// on TTL-index creation in newer versions and crashes the process on
// boot if it isn't there. One-liner polyfill is safer than upgrading the
// Docker base image right before launch.
if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto: typeof webcrypto }).crypto = webcrypto;
}

// Run BEFORE any other imports execute logging code. Once Node has resolved
// the rest of the module graph, debug `console.log` calls from libraries
// are no-ops in production.
gateConsoleInProduction();

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import {
  pendingCDPImports,
  pruneExpiredPairingFailures,
  setMongoConnected,
} from "./state.js";
import { websiteAllowedOrigins } from "./config/origins.js";
import { isAllowedExtensionOrigin } from "./config/extensionOrigin.js";

// Plugin route modules
import pluginAuthRoutes from "./routes/plugin/auth.js";
import pluginDefaultsRoutes from "./routes/plugin/defaults.js";
import pluginImportRoutes from "./routes/plugin/import.js";
import pluginCdpRoutes from "./routes/plugin/cdp.js";
import pluginAiRoutes from "./routes/plugin/ai.js";
import pluginWireframeRoutes from "./routes/plugin/wireframe.js";
import pluginSettingsRoutes from "./routes/plugin/settings.js";
import pluginNewsletterRoutes from "./routes/plugin/newsletter.js";

// License routes (MongoDB-backed, formerly License_Backend)
import licenseRoutes from "./routes/license/index.js";

// Browser-extension session routes (pairing-code → bearer token)
import extensionSessionRoutes from "./routes/extension/session.js";

// Checkout / webhook routes (Flitt payment integration). The historical
// `cancelRouter` (POST /api/subscription/cancel) was removed in P2-#11 —
// one-time payments have nothing to cancel.
import checkoutRoutes, {
  webhookRouter,
} from "./routes/checkout/index.js";
import authTokenRoutes from "./routes/plugin/auth-token.js";
import adminLicenseRoutes from "./routes/admin/license.js";
import adminStatsRoutes from "./routes/admin/stats.js";
import adminPanelRoutes from "./routes/admin/panel.js";
import adminCancellationsRoutes from "./routes/admin/cancellations.js";
import {
  authRateLimiter,
  checkoutRateLimiter,
  checkoutByUserRateLimiter,
  webhookRateLimiter,
} from "./middleware/rateLimit.js";
import { flittIpAllowlist } from "./middleware/flittIpAllowlist.js";
import { runExpiryReminders } from "./services/reminderService.js";
import { incrementCounter } from "./services/metrics.js";
import { config } from "./config/env.js";

// Website route modules (formerly Website_Backend)
import websiteSupportRoutes from "./routes/website/support.js";
import websiteFigmaAuthRoutes from "./routes/website/figmaAuth.js";
import websiteSessionRoutes from "./routes/website/session.js";
import {
  assertProductionSecrets,
  assertProductionUrls,
} from "./config/startupChecks.js";

const app = express();

// Fail fast at boot if critical secrets are missing or weak in production.
assertProductionSecrets(process.env);
assertProductionUrls(process.env);

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

// `trust proxy` controls how many `X-Forwarded-For` hops Express trusts when
// computing `req.ip`. Wrong values break the Flitt IP allowlist (real client
// IP is masked by the last trusted proxy) AND rate-limiter keying (every
// request looks like it came from the same proxy IP). Default 1 covers a
// single nginx / Vercel-style hop; Cloudflare → Render is TWO. (H-5)
//
// Set `TRUST_PROXY_HOPS=N` in env to match actual reverse-proxy hop count.
// See `docs/runbooks/deployment-security.md` for per-deploy guidance.
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS ?? "1", 10);
if (
  !Number.isFinite(trustProxyHops) ||
  trustProxyHops < 0 ||
  trustProxyHops > 5
) {
  throw new Error(
    `TRUST_PROXY_HOPS invalid: ${process.env.TRUST_PROXY_HOPS} (expected integer 0-5)`,
  );
}
app.set("trust proxy", trustProxyHops);
console.log(`[boot] trust proxy hops: ${trustProxyHops}`);

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

// H-6: keep `mongoConnected` honest across the lifetime of the process.
// The initial connect promise flips the flag once; without these listeners
// a runtime disconnect (network blip, Atlas failover) leaves the flag
// stuck at `true`, so `requireMongo()` passes while subsequent reads time
// out inside Mongoose's buffer and surface as opaque 5xx.
mongoose.connection.on("disconnected", () => {
  console.warn("[mongo] disconnected");
  setMongoConnected(false);
});
mongoose.connection.on("reconnected", () => {
  console.log("[mongo] reconnected");
  setMongoConnected(true);
});
mongoose.connection.on("error", (err: Error) => {
  console.error("[mongo] connection error:", err.message);
  // P2-#7: emit the metric on EVERY error event for alerting on rate spikes.
  incrementCounter(
    "mongo_connection_errors_total",
    "Mongoose connection error events (any severity).",
  );
  // Flip the flag when the topology is no longer connected. `error` can
  // fire for transient driver issues (Atlas IAM/cert rotation, command
  // timeouts) without an accompanying `disconnected` — leaving the flag
  // stuck at `true` would let `requireMongo()` pass while subsequent reads
  // hang inside Mongoose's buffer.
  //
  // readyState values: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting.
  if (mongoose.connection.readyState !== 1) {
    setMongoConnected(false);
  }
});

// Cleanup expired imports every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pendingCDPImports.entries()) {
    if (now > entry.expires) {
      pendingCDPImports.delete(id);
    }
  }
  // P2-#8: also prune expired pairing-failure entries so bot-redeem traffic
  // can't grow the Map unbounded between hits to `isPairingCodeLocked`.
  pruneExpiredPairingFailures(now);
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
// Our own browser extension's id (chrome-extension://<id>). Optional — when
// unset, no extension origin is allowed (current behaviour preserved).
const allowedExtensionId = (process.env.EXTENSION_ID ?? "").trim();

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

/**
 * Subdomains we trust for each whitelisted parent host. Used to bound the
 * "endsWith" match so e.g. an attacker-controlled `evil.figma.com` user-content
 * subdomain can't pivot through CORS with credentials. Add new subdomains here
 * explicitly when Figma legitimately ships them.
 */
const ALLOWED_SUBDOMAINS: Record<string, ReadonlySet<string>> = {
  "figma.com": new Set(["www", "static", "app"]),
  "web2wireframe.design": new Set(["www", "api"]),
};

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
      // Browser-extension popup/options pages send Origin: chrome-extension://<id>.
      // (Background service-worker requests send no Origin → handled above.)
      if (origin.startsWith("chrome-extension://")) {
        if (isAllowedExtensionOrigin(origin, allowedExtensionId)) {
          callback(null, true);
        } else {
          // Not our published id: emit no CORS headers, but don't 500 the
          // request (that surfaces to the extension as "Internal server
          // error"). Our extension reads the response via host_permissions —
          // Chrome bypasses CORS — while a 3rd-party extension without those
          // permissions still can't read a credentialed response.
          callback(null, false);
        }
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
        if (hostname === a) return true;
        // Subdomain match must come from a small known list (see
        // ALLOWED_SUBDOMAINS). Open-ended `endsWith(.figma.com)` previously
        // accepted any subdomain — including user-content sandboxes that
        // can host attacker JS, which could pivot via credentialed CORS.
        if (!hostname.endsWith("." + a)) return false;
        const subdomain = hostname.slice(0, -("." + a).length);
        // Reject deeply nested subdomains entirely (no `foo.bar.figma.com`).
        if (subdomain.includes(".")) return false;
        const allowList = ALLOWED_SUBDOMAINS[a];
        return allowList?.has(subdomain) ?? false;
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
pluginRouter.use("/api/auth", authRateLimiter, authTokenRoutes);

// License routes (direct MongoDB — no more proxy)
pluginRouter.use("/api/license", licenseRoutes);

// Browser-extension session routes (redeem/refresh/revoke)
pluginRouter.use("/api/extension-session", extensionSessionRoutes);

// Flitt payment routes — unique prefixes, so mount-level rate limiting is safe.
pluginRouter.use(
  "/api/checkout",
  checkoutRateLimiter,
  checkoutByUserRateLimiter,
  checkoutRoutes,
);
pluginRouter.use(
  "/api/webhooks",
  webhookRateLimiter,
  flittIpAllowlist,
  webhookRouter,
);
// P2-#11: `pluginRouter.use("/api/subscription", ..., cancelRouter)` removed —
// the cancel router was dead code under our one-time payment model.

// Admin endpoints (curl-driven, ADMIN_TOKEN-protected)
pluginRouter.use("/api/admin/license", adminLicenseRoutes);
pluginRouter.use("/api/admin/stats", adminStatsRoutes);
pluginRouter.use("/api/admin/panel", adminPanelRoutes);
pluginRouter.use("/api/admin/cancellations", adminCancellationsRoutes);

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
pluginRouter.use("/api", pluginNewsletterRoutes);

app.use(pluginRouter);

// ============================================================================
// Website Router (CORS: web2wireframe.design + localhost:5173)
// Session-based auth for Figma OAuth
// ============================================================================

const websiteRouter = express.Router();

websiteRouter.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || websiteAllowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (origin.startsWith("chrome-extension://")) {
        // Browser-extension callers (e.g. the support-report POST to
        // /web/support). Emit no CORS headers, but don't 500 — the extension
        // reads the response via host_permissions (Chrome bypasses CORS).
        callback(null, false);
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

// MongoStore for express-session — replaces the in-memory MemoryStore
// default. Why this matters:
//   - MemoryStore loses every session on container restart (every deploy =
//     mass logout of paying users + lost OAuth `state` values mid-flow).
//   - MemoryStore never evicts entries → memory grows unbounded.
//   - MemoryStore can't shard across multiple API instances.
// We give the store a 24-hour TTL (`autoRemove: "native"` uses Mongo's
// built-in TTL index, no polling interval needed). Combined with the
// session-only cookie below, the effective session lifetime is:
//   - Browser close OR 24h server-side, whichever comes first.
// `touchAfter: 5 * 60` batches session.save() calls — without it every
// /web/me poll would write to Mongo, which is wasteful for an unchanging
// session payload.
//
// Falls back to MemoryStore in test/CI where MONGODB_URI is absent — keeps
// existing test infrastructure working without spinning up Mongo.
const websiteSessionStore = process.env.MONGODB_URI
  ? MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60,
      autoRemove: "native",
      touchAfter: 5 * 60,
    })
  : undefined;

websiteRouter.use(
  session({
    // Renamed from "w2w_session" to break a duplicate-cookie bug: a previous
    // build set a parent-domain cookie (Domain=.web2wireframe.design) which
    // coexisted with the older host-only "w2w_session" of the same name. The
    // browser sent BOTH on every request and express-session read whichever
    // it parsed first — often the stale one with no current oauthState → the
    // Figma callback failed with "Invalid state". A fresh name guarantees a
    // single cookie; the orphaned "w2w_session" pair is ignored and expires
    // on browser close. We no longer set a Domain at all: every consumer
    // (website, extension, plugin) talks to api.web2wireframe.design directly,
    // so a plain host-only cookie is sufficient and can't be shadowed by a
    // domain-scoped twin.
    name: "w2w_sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: websiteSessionStore,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      // No `maxAge` → session cookie. Browser deletes when the user closes
      // the browser (Firefox/Safari respect this immediately; Chrome's
      // "continue where you left off" preserves session cookies, but the
      // 24-hour server-side TTL above catches those eventually). This
      // matches the marketing site's mental model: "I logged in once to
      // buy Pro, I don't need to stay logged in."
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
  // One-time startup signal — must survive production console gating.
  console.warn(`[W2W API] Running on port ${PORT}`);
});

// For Vercel
export default app;
