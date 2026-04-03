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
import { optionalAuth } from "./middleware/auth.js";

// License routes (MongoDB-backed, formerly License_Backend)
import licenseRoutes from "./routes/license/index.js";

// Website route modules (formerly Website_Backend)
import websiteSupportRoutes from "./routes/website/support.js";
import websiteFigmaAuthRoutes from "./routes/website/figmaAuth.js";
import websiteSessionRoutes from "./routes/website/session.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

// ============================================================================
// Global middleware
// ============================================================================

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.set("trust proxy", 1);

// ============================================================================
// MongoDB Connection (optional — wireframe generation works without it)
// ============================================================================

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/web2wireframe")
  .then(() => {
    setMongoConnected(true);
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

// ============================================================================
// Plugin Router (CORS: figma.com + null origin for Figma plugin iframe)
// ============================================================================

const pluginRouter = express.Router();
const corsOrigin = process.env.CORS_ORIGIN;
pluginRouter.use(
  cors({
    origin: (origin, callback) => {
      // Allow: null (Figma plugin), figma.com, localhost, or wildcard
      if (
        !origin ||
        !corsOrigin ||
        corsOrigin === "*" ||
        corsOrigin.split(",").some((o) => origin.includes(o.trim()))
      ) {
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

// License routes (direct MongoDB — no more proxy)
pluginRouter.use("/api/license", licenseRoutes);

// Functional plugin routes (optional auth)
pluginRouter.use("/api", optionalAuth, pluginImportRoutes);
pluginRouter.use("/api", optionalAuth, pluginCdpRoutes);
pluginRouter.use("/api", optionalAuth, pluginAiRoutes);
pluginRouter.use("/api", optionalAuth, pluginWireframeRoutes);
pluginRouter.use("/api", optionalAuth, pluginSettingsRoutes);

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

websiteRouter.use(
  session({
    name: "w2w_session",
    secret: process.env.SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
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
