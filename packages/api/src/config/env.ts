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

// Legacy license-proxy config. The standalone License backend was merged
// into this unified API; the only remaining consumer is the /web/license/me
// proxy route, which returns 503 when these are unset (`licenseProxyEnabled`
// is derived from them below). Optional — not set in production.
const licenseServiceUrl = process.env.LICENSE_SERVICE_URL ?? "";
const licenseServiceToken = process.env.LICENSE_SERVICE_TOKEN ?? "";

// Flitt — payment processor (single-tier launch). All payment flows go
// through the Flitt-hosted checkout; we never see card data. Sandbox/live
// switch is implicit via the merchant_id + secret_key pair.
const flittMerchantId = requireEnv(
  "FLITT_MERCHANT_ID",
  "Checkout/webhook routes will be disabled in development without this."
);
const flittSecretKey = requireEnv(
  "FLITT_SECRET_KEY",
  "Checkout/webhook routes will be disabled in development without this."
);
const flittBaseUrl = devDefault("FLITT_BASE_URL", "https://pay.flitt.com");

const websiteBaseUrl = devDefault(
  "WEBSITE_BASE_URL",
  "http://localhost:5173",
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
  flitt: {
    merchantId: flittMerchantId,
    secretKey: flittSecretKey,
    baseUrl: flittBaseUrl,
  },
  website: {
    baseUrl: websiteBaseUrl,
  },
  features: {
    figmaOAuthEnabled: Boolean(figmaClientId && figmaClientSecret),
    licenseProxyEnabled: Boolean(licenseServiceUrl && licenseServiceToken),
    flittEnabled: Boolean(flittMerchantId && flittSecretKey),
  },
};
