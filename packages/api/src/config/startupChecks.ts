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
