import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";

// ============================================================================
// Round-2 hardening — POST /auth/figma/logout Origin check (H-3)
//
// Defense-in-depth against cross-origin CSRF logout. CORS already rejects
// untrusted origins from XHR, but a top-level form POST or a text/plain
// fetch from evil.com would skip preflight. The handler now refuses with
// 403 when the Origin header is missing or not in the allowlist.
// ============================================================================

// We need the test to control WEBSITE_ALLOWED_ORIGINS BEFORE the route
// module imports `../config/origins.js` (the allowlist is evaluated at
// module-load time). Vitest's vi.mock + dynamic import below would also
// work, but a process.env.before-require setup is simpler here.
process.env.WEBSITE_ALLOWED_ORIGINS =
  "http://localhost:5173,https://www.web2wireframe.design";
process.env.AUTH_SECRET = "test-auth-secret-32-bytes-or-more-XYZ";
process.env.FIGMA_CLIENT_ID = "test-client-id";

// Dynamically import the route AFTER env is primed.
const { default: figmaAuthRoutes } = await import(
  "../src/routes/website/figmaAuth.js"
);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      name: "w2w_sid",
      secret: "test-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: "lax", secure: false },
    }),
  );
  app.use(figmaAuthRoutes);
  return app;
}

let app: express.Express;

beforeEach(() => {
  app = buildApp();
});

describe("POST /auth/figma/logout — Origin check (H-3)", () => {
  it("returns 200 {ok:true} when Origin is in the allowlist (localhost dev)", async () => {
    const res = await request(app)
      .post("/auth/figma/logout")
      .set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 200 {ok:true} when Origin is the production website", async () => {
    const res = await request(app)
      .post("/auth/figma/logout")
      .set("Origin", "https://www.web2wireframe.design");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns 403 when Origin is missing (defense-in-depth on bare requests)", async () => {
    const res = await request(app).post("/auth/figma/logout");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ ok: false, error: "Origin not allowed" });
  });

  it("returns 403 when Origin is a hostile cross-site value", async () => {
    const res = await request(app)
      .post("/auth/figma/logout")
      .set("Origin", "https://evil.com");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ ok: false, error: "Origin not allowed" });
  });

  it("returns 403 for near-matches that aren't in the allowlist", async () => {
    // Trailing slash, different port, different subdomain — none should
    // pass an exact-match allowlist check.
    const variants = [
      "http://localhost:5173/", // trailing slash
      "http://localhost:5174", // different port
      "https://web2wireframe.design", // missing www
      "https://api.web2wireframe.design", // wrong subdomain
    ];
    for (const origin of variants) {
      const res = await request(app)
        .post("/auth/figma/logout")
        .set("Origin", origin);
      expect(res.status).toBe(403);
    }
  });

  it("clears the w2w_sid cookie when logout succeeds", async () => {
    const res = await request(app)
      .post("/auth/figma/logout")
      .set("Origin", "http://localhost:5173");
    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"];
    // Should contain a Set-Cookie that expires the session cookie.
    expect(cookies).toBeDefined();
    const cookieList = Array.isArray(cookies) ? cookies : [cookies];
    const cleared = cookieList.find((c) => c.startsWith("w2w_sid="));
    expect(cleared).toBeDefined();
    // Either Max-Age=0 or Expires in the past — express's clearCookie
    // produces one of these.
    expect(cleared).toMatch(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/);
  });
});
