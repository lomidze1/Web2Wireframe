import "dotenv/config";

const requiredEnvVars = [
  "RESEND_API_KEY",
  "SUPPORT_TO_EMAIL",
  "NOREPLY_EMAIL",
  "ALLOWED_ORIGIN",
  "SESSION_SECRET",
  "FIGMA_CLIENT_ID",
  "FIGMA_CLIENT_SECRET",
  "LICENSE_SERVICE_URL",
  "LICENSE_SERVICE_TOKEN",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const config = {
  server: {
    port: parseInt(process.env.PORT || "3001", 10),
    nodeEnv: (process.env.NODE_ENV || "development") as
      | "development"
      | "production",
  },
  cors: {
    allowedOrigins: Array.from(
      new Set(
        (process.env.ALLOWED_ORIGIN || "")
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
          .concat([
            "http://localhost:5173",
            "https://www.web2wireframe.design",
          ])
      )
    ),
  },
  session: {
    secret: process.env.SESSION_SECRET!,
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY!,
    supportToEmail: process.env.SUPPORT_TO_EMAIL!,
    noreplyEmail: process.env.NOREPLY_EMAIL!,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "600000", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "5", 10),
  },
  lemonSqueezy: {
    apiKey: process.env.LEMON_SQUEEZY_API_KEY,
    storeId: process.env.LEMON_SQUEEZY_STORE_ID,
  },
  figma: {
    clientId: process.env.FIGMA_CLIENT_ID,
    clientSecret: process.env.FIGMA_CLIENT_SECRET,
    redirectUri: process.env.FIGMA_REDIRECT_URI || "",
  },
  licenseService: {
    url: process.env.LICENSE_SERVICE_URL || "",
    token: process.env.LICENSE_SERVICE_TOKEN || "",
  },
};
