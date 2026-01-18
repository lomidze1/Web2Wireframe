import "dotenv/config";

const requiredEnvVars = [
  "RESEND_API_KEY",
  "SUPPORT_TO_EMAIL",
  "NOREPLY_EMAIL",
  "ALLOWED_ORIGIN",
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
    allowedOrigins: (process.env.ALLOWED_ORIGIN || "").split(","),
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
  },
};
