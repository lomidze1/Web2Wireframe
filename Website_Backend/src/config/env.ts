import "dotenv/config";

const nodeEnv = (process.env.NODE_ENV || "development") as
  | "development"
  | "production";
const isProd = nodeEnv === "production";

const warnMissing = (envVar: string, note?: string): void => {
  const suffix = note ? ` ${note}` : "";
  console.warn(`[CONFIG] ${envVar} missing.${suffix}`);
};

const requireEnv = (envVar: string, note?: string): string => {
  const value = process.env[envVar];
  if (!value) {
    if (isProd) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
    warnMissing(envVar, note);
    return "";
  }
  return value;
};

const devDefault = (envVar: string, fallback: string): string => {
  const value = process.env[envVar];
  if (value) return value;
  if (!isProd) {
    warnMissing(envVar, `Using dev default: ${fallback}`);
    return fallback;
  }
  return "";
};

const sessionSecret =
  requireEnv(
    "SESSION_SECRET",
    "Session cookies will be insecure in development without it."
  ) || "dev-session-secret";

const resendApiKey = requireEnv("RESEND_API_KEY");
const supportToEmail = requireEnv("SUPPORT_TO_EMAIL");
const noreplyEmail = requireEnv("NOREPLY_EMAIL");

const figmaClientId = requireEnv(
  "FIGMA_CLIENT_ID",
  "Figma OAuth routes will be disabled in development."
);
const figmaClientSecret = requireEnv(
  "FIGMA_CLIENT_SECRET",
  "Figma OAuth routes will be disabled in development."
);
const figmaRedirectUri = process.env.FIGMA_REDIRECT_URI || "";

const licenseServiceUrl = isProd
  ? requireEnv("LICENSE_SERVICE_URL")
  : devDefault("LICENSE_SERVICE_URL", "https://web2wireframe.onrender.com");
const licenseServiceToken = requireEnv(
  "LICENSE_SERVICE_TOKEN",
  "License proxy routes will be disabled in development."
);

export const config = {
  server: {
    port: parseInt(process.env.PORT || "3001", 10),
    nodeEnv,
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
    secret: sessionSecret,
  },
  email: {
    resendApiKey,
    supportToEmail,
    noreplyEmail,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "600000", 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "5", 10),
  },
  figma: {
    clientId: figmaClientId,
    clientSecret: figmaClientSecret,
    redirectUri: figmaRedirectUri,
  },
  license: {
    serviceUrl: licenseServiceUrl,
    token: licenseServiceToken,
  },
  features: {
    figmaOAuthEnabled: Boolean(figmaClientId && figmaClientSecret),
    licenseProxyEnabled: Boolean(licenseServiceUrl && licenseServiceToken),
  },
};
