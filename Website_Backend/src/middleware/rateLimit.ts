import rateLimit from "express-rate-limit";
import { config } from "../config/env.js";

export const supportRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs, // 10 minutes
  max: config.rateLimit.maxRequests, // 5 requests per windowMs
  message: "Too many support requests, please try again later",
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Use IP address as key (handles proxies better)
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ||
      req.ip ||
      "unknown"
    );
  },
  skip: (_req) => {
    // Skip rate limiting in development
    return config.server.nodeEnv === "development";
  },
});
