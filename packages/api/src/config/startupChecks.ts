// ============================================================================
// Production startup safety checks
// ----------------------------------------------------------------------------
// Fail fast at boot if critical secrets are missing or weak in production,
// instead of silently running with predictable defaults (which would allow
// session forgery, admin-token guessing, and HMAC token forgery).
//
// Extracted into a pure, exported function so it can be unit-tested without
// booting the server.
// ============================================================================

/** Variables that must be present for a production boot. */
const REQUIRED_VARS = [
  "AUTH_SECRET",
  "SESSION_SECRET",
  "ADMIN_TOKEN",
  "CORS_ORIGIN",
] as const;

/** Secrets held to the strength rules below. CORS_ORIGIN is a host list, not
 *  a secret, so it is only presence-checked. */
const SECRET_VARS = ["AUTH_SECRET", "SESSION_SECRET", "ADMIN_TOKEN"] as const;

/** Known placeholder values shipped in `.env.example` / dev `.env`. */
const PLACEHOLDER_SECRETS = new Set([
  "change-me",
  "change-me-in-production",
  "admin-token",
  "dev-token",
  "dev-secret",
  "dev-auth-secret",
  "dev-session-secret",
]);

/** A real secret should have meaningful entropy. */
const MIN_SECRET_LENGTH = 24;

/**
 * Throw if the production environment carries a missing, placeholder,
 * dev-prefixed, or too-short secret. No-op outside production.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;

  const missing = REQUIRED_VARS.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(", ")}`,
    );
  }

  // Presence is not enough — a deploy that copied the dev `.env` would boot
  // with a globally-known secret. Reject placeholders, dev-prefixed values,
  // and anything too short to have real entropy.
  const weak = SECRET_VARS.filter((k) => {
    const value = (env[k] ?? "").trim();
    return (
      PLACEHOLDER_SECRETS.has(value) ||
      /^dev-/i.test(value) ||
      value.length < MIN_SECRET_LENGTH
    );
  });
  if (weak.length > 0) {
    throw new Error(
      `Refusing to start: ${weak.join(", ")} set to a placeholder, ` +
        `dev-prefixed, or too-short value (min ${MIN_SECRET_LENGTH} chars)`,
    );
  }
}

/** Production-facing URL env vars: malformed values silently break Flitt. */
const PUBLIC_URL_VARS = ["API_PUBLIC_URL", "WEBSITE_BASE_URL"] as const;

/**
 * Throw if a production-facing URL env var is missing, unparseable, or
 * non-HTTPS. No-op outside production.
 *
 * Why HTTPS-only:
 *   - `API_PUBLIC_URL` is the parent of the webhook callback. Flitt POSTs
 *     payment events here; over HTTP a passive listener can read PII (email,
 *     amount, order_id) and an active attacker on the path can swap the
 *     signed payload before our handler verifies it.
 *   - `WEBSITE_BASE_URL` builds `response_url` (where Flitt sends the user
 *     after checkout) and the renew/account deep-links in emails. HTTP would
 *     downgrade an authenticated session to a network attacker.
 *
 * Failing fast at boot beats discovering the misconfig from a debug-log
 * trail of failed webhook deliveries hours later.
 */
export function assertProductionUrls(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;

  const problems: string[] = [];
  for (const key of PUBLIC_URL_VARS) {
    const raw = env[key];
    if (!raw || !raw.trim()) {
      problems.push(`${key} is missing`);
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(raw.trim());
    } catch {
      problems.push(`${key}="${raw}" is not a valid URL`);
      continue;
    }
    if (parsed.protocol !== "https:") {
      problems.push(`${key}="${raw}" must use https:// in production`);
      continue;
    }
    if (!parsed.hostname || parsed.hostname === "localhost") {
      problems.push(`${key}="${raw}" cannot point at localhost in production`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Refusing to start: ${problems.join("; ")}`);
  }
}
