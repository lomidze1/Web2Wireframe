/**
 * Allowed origins for the website router (CORS + manual Origin checks).
 *
 * Two consumers:
 *   1. `websiteRouter` CORS middleware in `src/index.ts` — controls which
 *      browser origins can make credentialed XHRs against `/web/*` and
 *      `/auth/*`.
 *   2. `POST /auth/figma/logout` in `routes/website/figmaAuth.ts` — does a
 *      defensive `Origin` header check to block cross-site CSRF-style
 *      logout from a hostile page (Lax cookies still get sent on top-level
 *      form POSTs).
 *
 * Single source of truth → `WEBSITE_ALLOWED_ORIGINS` env var, comma-separated.
 * Falls back to local dev + production website when unset (matches the
 * pattern used historically in `index.ts`).
 */
export const websiteAllowedOrigins: ReadonlyArray<string> = (
  process.env.WEBSITE_ALLOWED_ORIGINS ||
  // Both the apex and the www host are live on Vercel; the website now makes
  // credentialed /web and /auth calls straight to the api subdomain, so the
  // browsing origin (whichever Vercel treats as canonical) must be allowlisted.
  "http://localhost:5173,https://web2wireframe.design,https://www.web2wireframe.design"
)
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

/**
 * Predicate for the manual Origin check on state-mutating endpoints.
 * Returns true when the request's `Origin` header is present AND in our
 * allowlist. A missing/empty Origin returns false — same-origin requests
 * carry no Origin header on some old browser configs, but every modern
 * browser sends it for cross-origin and fetch() calls. Treating "missing"
 * as a reject is the safe default for state-changing routes; if a route
 * legitimately needs to accept same-origin Origin-less requests, the
 * caller can branch explicitly.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return websiteAllowedOrigins.includes(origin);
}
