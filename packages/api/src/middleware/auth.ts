import { createHmac, timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import "express-session"; // Session type augmentation loaded from config/express-session.d.ts

// Extend Express Request with userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

interface TokenPayload {
  userId: string;
  iat: number;
  exp: number;
}

const DEFAULT_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Expiry for plugin tokens issued after a verified Figma OAuth login.
 * Long-lived so the user re-authenticates rarely; rotated by /api/auth/refresh
 * while still valid. A full expiry simply triggers another OAuth round-trip.
 */
export const PLUGIN_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Create an HMAC-SHA256 signed token for a Figma user.
 * Format: base64url(payload).base64url(hmac)
 */
export function signToken(
  userId: string,
  secret: string,
  expirySeconds: number = DEFAULT_EXPIRY_SECONDS
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    userId,
    iat: now,
    exp: now + expirySeconds,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Verify an HMAC-signed token and return the payload.
 * Throws on invalid signature, expired token, or malformed input.
 */
export function verifyToken(
  token: string,
  secret: string
): TokenPayload {
  if (!token || !token.includes(".")) {
    throw new Error("Invalid token format");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid token format");
  }

  const [payloadB64, providedSignature] = parts;

  // Verify HMAC signature
  const expectedSignature = createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  // Constant-time comparison — a plain `!==` leaks, via response timing, how
  // many leading bytes matched, enabling byte-by-byte signature forgery.
  const providedBuf = Buffer.from(providedSignature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new Error("Invalid signature");
  }

  // Decode payload
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    throw new Error("Invalid token payload");
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error("Token expired");
  }

  return payload;
}

/**
 * Express middleware: validates Bearer token from Authorization header.
 * Sets req.userId on success, returns 401 on failure.
 */
export function authenticatePlugin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "Unauthorized: missing token",
    });
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer "
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    console.error("[Auth] AUTH_SECRET env var is not set");
    res.status(500).json({
      success: false,
      error: "Server authentication not configured",
    });
    return;
  }

  try {
    const payload = verifyToken(token, secret);
    req.userId = payload.userId;
    next();
  } catch (err) {
    res.status(401).json({
      success: false,
      error: `Unauthorized: ${(err as Error).message}`,
    });
  }
}

/**
 * Optional auth middleware: sets req.userId if valid token present,
 * but allows request to proceed even without authentication.
 * Use this for routes that work for both authenticated and anonymous users.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const secret = process.env.AUTH_SECRET;

    if (secret) {
      try {
        const payload = verifyToken(token, secret);
        req.userId = payload.userId;
      } catch {
        // Invalid token — proceed without userId
      }
    }
  }

  next();
}

/**
 * Session-based auth for website routes (Figma OAuth).
 * Checks req.session.figmaUserId.
 */
export function requireSessionAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.session?.figmaUserId) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }
  next();
}
