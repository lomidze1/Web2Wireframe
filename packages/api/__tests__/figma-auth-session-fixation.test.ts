import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ============================================================================
// M-7 — OAuth callback must regenerate session id before binding figmaUserId
//
// A full integration test would require spinning up express-session + a real
// Figma OAuth round-trip mock. That's high-overhead for what is effectively
// a one-line contract: "before persisting the verified identity to the
// session, call req.session.regenerate()". A source-level contract assertion
// catches regression cheaply — if anyone removes the regenerate() call in
// a future refactor, this test fails and forces a deliberate decision.
// ============================================================================

const here = dirname(fileURLToPath(import.meta.url));
const FIGMA_AUTH_PATH = join(
  here,
  "..",
  "src",
  "routes",
  "website",
  "figmaAuth.ts",
);
const src = readFileSync(FIGMA_AUTH_PATH, "utf8");

describe("figmaAuth.ts contract — session fixation defense (M-7)", () => {
  it("calls req.session.regenerate before setting figmaUserId", () => {
    const regenerateIdx = src.indexOf("req.session.regenerate");
    const figmaUserIdAssignIdx = src.indexOf("req.session.figmaUserId =");

    expect(regenerateIdx).toBeGreaterThan(-1);
    expect(figmaUserIdAssignIdx).toBeGreaterThan(-1);
    // Regenerate MUST come before the identity assignment in the file
    // (and there is only one assignment site outside the plugin branch).
    expect(regenerateIdx).toBeLessThan(figmaUserIdAssignIdx);
  });

  it("calls req.session.save after writing identity (to avoid redirect race)", () => {
    const figmaUserIdAssignIdx = src.indexOf("req.session.figmaUserId =");
    // Look for the save that follows the identity write specifically — the
    // /auth/figma/login handler also calls req.session.save (to persist
    // oauthState before redirecting to Figma), which appears earlier in the
    // file, so a plain indexOf would match the wrong one.
    const saveIdx = src.indexOf("req.session.save", figmaUserIdAssignIdx);
    expect(figmaUserIdAssignIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(figmaUserIdAssignIdx);
  });

  it("does NOT regenerate session in the plugin nonce branch (no session writes there)", () => {
    // Plugin branch parks the token in pendingPluginAuth Map and returns the
    // result page — it does NOT touch req.session at all. Regenerating
    // there would still be safe but pointless.
    // We check by counting regenerate() calls: exactly one (the website
    // branch). If a future change adds another it should be reviewed.
    const matches = src.match(/req\.session\.regenerate/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("P2-#6: regenerate/save is wrapped in its own try/catch with renderResultPage", () => {
    // The session-store failure path must render an actionable error page
    // (with a link back to /auth/figma/login) rather than letting the outer
    // catch return generic JSON. Source-grep checks the wiring so a future
    // refactor cannot silently regress to the original opaque-500 behavior.
    expect(src).toMatch(/Sign-in interrupted/);
    expect(src).toMatch(/Please sign in again/);
    expect(src).toMatch(/session_store_failures_total/);
    // The error page text must be inside a renderResultPage call.
    const errorPageRendered = /renderResultPage\([\s\S]*?Sign-in interrupted/;
    expect(src).toMatch(errorPageRendered);
  });
});
