import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import session from "express-session";
import { config } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import supportRoutes from "./routes/support.js";
import figmaAuthRoutes from "./routes/figmaAuth.js";
import sessionApiRoutes from "./routes/sessionApi.js";

const app = express();

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.set("trust proxy", 1);

app.use(
  session({
    name: "w2w_session",
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.server.nodeEnv === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        // Allow requests with no origin (like mobile apps or curl requests)
        return callback(null, true);
      }

      if (config.cors.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // 24 hours
  }),
);

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
if (config.features.figmaOAuthEnabled) {
  app.use(figmaAuthRoutes);
} else if (config.server.nodeEnv !== "production") {
  console.warn(
    "[CONFIG] Figma OAuth routes disabled (missing FIGMA_CLIENT_ID/SECRET)"
  );
}
if (!config.features.licenseProxyEnabled && config.server.nodeEnv !== "production") {
  console.warn(
    "[CONFIG] License proxy disabled (missing LICENSE_SERVICE_URL/TOKEN)"
  );
}
app.use("/api", sessionApiRoutes);
app.use("/api", supportRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(
    `[${new Date().toISOString()}] Support API listening on port ${PORT}`,
  );
  console.log(`Environment: ${config.server.nodeEnv}`);
  console.log(`Allowed origins: ${config.cors.allowedOrigins.join(", ")}`);
});

export default app;
