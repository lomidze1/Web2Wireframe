import express, { type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { config } from "../../config/env.js";
import { signToken, PLUGIN_TOKEN_EXPIRY_SECONDS } from "../../middleware/auth.js";
import { pendingPluginAuth, PLUGIN_AUTH_NONCE_TTL_MS } from "../../state.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";
import { licenseService } from "../../services/licenseService.js";
import { isAllowedOrigin } from "../../config/origins.js";
import { incrementCounter } from "../../services/metrics.js";

const router = express.Router();

const LOCAL_REDIRECT_URI = "http://localhost:3002/auth/figma/callback";
const PROD_REDIRECT_URI =
  "https://api.web2wireframe.design/auth/figma/callback";

const getRedirectUri = (): string => {
  if (config.figma.redirectUri) {
    return config.figma.redirectUri;
  }
  return config.server.nodeEnv === "production"
    ? PROD_REDIRECT_URI
    : LOCAL_REDIRECT_URI;
};

const generateState = (): string => randomBytes(16).toString("hex");

/**
 * A plugin-supplied nonce is a high-entropy token; reject anything else.
 *
 * M-1: minimum length is 32 characters. Plugin and Browser Extension both
 * generate 64-char hex nonces from `crypto.getRandomValues(32 bytes)`
 * (see licenseClient.ts in each package), so this floor is safe and
 * forces future clients to maintain similar entropy. The audit flagged
 * the previous 16-char floor as allowing Math.random()-quality nonces
 * that a botnet could brute-force inside the 5-minute TTL.
 */
export const isValidPluginNonce = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{32,128}$/.test(value);

/**
 * Validate the `return_to` query parameter for the website OAuth flow.
 *
 * Open-redirect guard: the OAuth callback 302-redirects the browser to this
 * value at the end of the flow. An attacker who controls the value can land
 * the victim on `evil.com/login` immediately after a verified Figma login,
 * harvesting credentials with the trust of a fresh-auth handoff.
 *
 * Rules:
 *   - Only same-origin relative paths starting with a single `/`.
 *   - Reject protocol-relative URLs (`//evil.com`) and anything with `:`
 *     (catches `javascript:`, `data:`, `https://`).
 *   - Reject backslashes — Chrome/Safari normalise `\` to `/` after the
 *     redirect, so `/\evil.com` ≈ `//evil.com` post-normalisation and
 *     would route the user off-site if we allowed it.
 *   - Length-capped to bound query handling.
 */
const isValidReturnTo = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > 256) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.includes(":")) return false;
  return true;
};

/**
 * Minimal HTML shown in the OAuth browser tab once the plugin flow finishes.
 *
 * `autoClose` (success page only): attempt `window.close()`, then reveal a
 * "you can close this tab" hint if we're still here a moment later.
 *
 * `window.close()` only succeeds when the tab was opened by a script
 * (`window.open()` from the plugin UI) — true for Figma in the browser, where
 * the tab self-closes and the hint never renders. In the Figma desktop app the
 * URL is handed to the system browser, and the browser extension opens the tab
 * via `chrome.tabs.create`; both refuse script-driven close, so the call is a
 * silent no-op and the hint is what the user sees. Hence the ordering: we only
 * promise once the promise has already been kept. (The extension doesn't rely
 * on this at all — it closes its own tab via `chrome.tabs.remove`.)
 *
 * Never set on error pages, so the user can read the failure.
 */
const renderResultPage = (
  heading: string,
  body: string,
  autoClose = false,
): string => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Web2Wireframe</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:#fff;border-radius:12px;padding:40px 48px;text-align:center;
    box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:380px}
  h1{font-size:18px;margin:0 0 8px}p{color:#666;font-size:14px;margin:0;line-height:1.5}
  .note{color:#888;font-size:13px;margin:20px 0 0}
</style></head>
<body><div class="card"><h1>${heading}</h1><p>${body}</p>${
  autoClose
    ? `<p class="note" id="w2w-hint" hidden>You can close this tab and return to Figma.</p>`
    : ""
}</div>${
  autoClose
    ? `<script>setTimeout(function(){window.close();},1000);` +
      `setTimeout(function(){var h=document.getElementById("w2w-hint");` +
      `if(h)h.hidden=false;},2200);</script>`
    : ""
}</body></html>`;

router.get(
  "/auth/figma/login",
  authRateLimiter,
  async (req: Request, res: Response) => {
    const clientId = config.figma.clientId;
    if (!clientId) {
      res.status(500).json({ error: "Figma client ID not configured" });
      return;
    }

    const state = generateState();
    req.session.oauthState = state;

  // Plugin OAuth bridge: when the request carries a valid plugin nonce, keep
  // it in the session so the callback can hand the minted token to the plugin.
  const pluginNonce = req.query.plugin_nonce;
  req.session.pluginNonce = isValidPluginNonce(pluginNonce)
    ? pluginNonce
    : undefined;

  // Website flow: capture the page the user came from so the callback can
  // 302-redirect back to it (instead of leaving the user on a JSON blob).
  // Only same-origin paths pass isValidReturnTo — anything else falls back
  // to the homepage on the callback side.
  const returnTo = req.query.return_to;
  req.session.returnTo = isValidReturnTo(returnTo) ? returnTo : undefined;

  const redirectUri = getRedirectUri();
  const authorizeUrl = new URL("https://www.figma.com/oauth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  // Identity verification only — /v1/me needs current_user:read. We do NOT
  // request file scopes: the plugin renders via the Figma plugin API, the
  // OAuth token is used solely to confirm who the user is.
  authorizeUrl.searchParams.set("scope", "current_user:read");
  authorizeUrl.searchParams.set("state", state);

    // Persist the session BEFORE handing control to Figma. express-session's
    // store write is async and fire-and-forget on response end — but if the
    // user has ALREADY authorized this Figma app, Figma skips the consent
    // screen and 302s straight back to /auth/figma/callback in milliseconds,
    // fast enough to beat the MongoStore write. The callback then loads a
    // session with no `oauthState` → "Invalid state". Saving explicitly makes
    // the state durable first. (The callback already does this for its own
    // post-auth session; the login side was missing it.)
    try {
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      console.error("[Figma OAuth] session save failed at login:", err);
      res.status(500).json({ error: "Could not start login" });
      return;
    }

    res.redirect(authorizeUrl.toString());
  },
);

router.get(
  "/auth/figma/callback",
  authRateLimiter,
  async (
    req: Request<
      Record<string, never>,
      unknown,
      unknown,
      { code?: string; state?: string }
    >,
    res: Response,
  ) => {
    const code = req.query.code;
    const state = req.query.state;

    if (!code) {
      res.status(400).json({ error: "Missing code" });
      return;
    }

    if (!state || !req.session.oauthState || state !== req.session.oauthState) {
      res.status(400).json({ error: "Invalid state" });
      return;
    }

    req.session.oauthState = undefined;
    const pluginNonce = req.session.pluginNonce;
    req.session.pluginNonce = undefined;
    const returnTo = req.session.returnTo;
    req.session.returnTo = undefined;

    const clientId = config.figma.clientId;
    const clientSecret = config.figma.clientSecret;

    if (!clientId || !clientSecret) {
      res.status(500).json({ error: "Figma OAuth not configured" });
      return;
    }

    const redirectUri = getRedirectUri();
    // Figma's scoped OAuth (api.figma.com/v1/oauth/token): client credentials
    // go in an HTTP Basic auth header, NOT the request body.
    const tokenParams = new URLSearchParams({
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });
    const basicAuth = Buffer.from(
      `${clientId}:${clientSecret}`,
    ).toString("base64");

    try {
      const tokenResponse = await fetch(
        "https://api.figma.com/v1/oauth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basicAuth}`,
          },
          body: tokenParams,
        },
      );

      if (!tokenResponse.ok) {
        console.error(
          `[Figma OAuth] token exchange failed (${tokenResponse.status}):`,
          await tokenResponse.text().catch(() => "<no body>"),
        );
        res.status(500).json({ error: "Failed to exchange OAuth code" });
        return;
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
      };

      if (!tokenData.access_token) {
        res.status(500).json({ error: "Missing access token from Figma" });
        return;
      }

      const meResponse = await fetch("https://api.figma.com/v1/me", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      if (!meResponse.ok) {
        res.status(500).json({ error: "Failed to fetch Figma user profile" });
        return;
      }

      const meData = (await meResponse.json()) as {
        id: string;
        email?: string;
        handle?: string;
      };

      // PII-redacted diagnostic: lets us confirm Figma is returning an
      // email for this account without writing the address itself to ops
      // logs. Survives the production gateConsole because it's
      // `console.warn`.
      console.warn(
        `[Figma OAuth] /v1/me: id=${meData.id} email=${meData.email ? "<set>" : "<MISSING>"} handle=${meData.handle ? "<set>" : "<missing>"}`,
      );

      // Plugin OAuth bridge: mint an HMAC plugin token bound to the *verified*
      // Figma user id and park it for the plugin to collect via the nonce.
      if (pluginNonce) {
        const secret = process.env.AUTH_SECRET;
        if (!secret) {
          console.error("[Figma OAuth] AUTH_SECRET env var is not set");
          res
            .status(500)
            .send(
              renderResultPage(
                "Something went wrong",
                "Authentication is not configured on the server. Please contact support.",
              ),
            );
          return;
        }
        // Persist the Figma-provided email BEFORE parking the token so it
        // shows up in /api/license/me (and therefore in the extension's
        // IdentityModal / Plan modal / backend admin panel). The extension
        // fetches /api/license/me the instant it polls the parked token, so
        // persisting AFTER the park raced the read and could freeze the
        // session's email empty. try/catch keeps a Mongo hiccup non-fatal —
        // sign-in still completes and the email backfills on a later login.
        // Free users get their Figma email; paid users keep the Flitt billing
        // email since `setEmailIfMissing` won't overwrite a non-null value.
        if (meData.email) {
          try {
            await licenseService.getOrCreate(meData.id);
            const result = await licenseService.setEmailIfMissing(
              meData.id,
              meData.email,
            );
            // PII-redacted: matched/modified counts diagnose whether the
            // doc was patched without leaking the email itself.
            console.warn(
              `[Figma OAuth] setEmailIfMissing(${meData.id}) → matched=${result.matched} modified=${result.modified}`,
            );
          } catch (err) {
            console.warn(
              "[Figma OAuth] Could not persist email on license doc:",
              err,
            );
          }
        } else {
          console.warn(
            `[Figma OAuth] meData.email missing for id=${meData.id} — Figma did not return email. Check the Figma account's verified email.`,
          );
        }

        const token = signToken(meData.id, secret, PLUGIN_TOKEN_EXPIRY_SECONDS);
        pendingPluginAuth.set(pluginNonce, {
          token,
          tokenExpiresAt: Date.now() + PLUGIN_TOKEN_EXPIRY_SECONDS * 1000,
          expires: Date.now() + PLUGIN_AUTH_NONCE_TTL_MS,
        });

        res.status(200).send(
          renderResultPage(
            "Connected to Figma",
            "Return to the Web2Wireframe plugin to continue.",
            true,
          ),
        );
        return;
      }

      // M-7: regenerate the session id before persisting the verified Figma
      // identity. Without this, an attacker who pre-seeds the victim's
      // browser with a known session cookie (via XSS on a sibling subdomain
      // or a misconfigured proxy) can hijack the post-OAuth session — the
      // attacker's cookie now points to a session bound to the victim's
      // Figma id. regenerate() rotates the cookie value so the attacker's
      // pre-seeded id is no longer associated with the authenticated user.
      //
      // P2-#6: wrap regenerate/save in their own try/catch. At this point
      // the OAuth code has been CONSUMED by Figma — the user cannot retry
      // without restarting the whole login flow. A generic outer 500 leaves
      // them stuck with no actionable error. Instead, render an HTML page
      // with a "Sign in again" link.
      try {
        await new Promise<void>((resolve, reject) => {
          req.session.regenerate((err) =>
            err ? reject(err) : resolve(),
          );
        });
        req.session.figmaUserId = meData.id;
        req.session.figmaEmail = meData.email;
        req.session.createdAt = new Date().toISOString();
        // Persist the new session immediately so the redirect below doesn't
        // race the session-store write. Without explicit save, express-session
        // writes are asynchronous and the client may load /web/me before the
        // store sees the new id (especially on slower MongoStore backends).
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => (err ? reject(err) : resolve()));
        });
      } catch (sessionErr) {
        console.error(
          "[Figma OAuth/website] session store write failed:",
          sessionErr instanceof Error ? sessionErr.message : sessionErr,
        );
        // P3-#4: static import at the top of this file. The previous dynamic
        // `await import(...)` could itself throw on rare Node loader hiccups,
        // which would defeat the P2-#6 error page (the throw would bubble
        // into the outer catch and surface as generic 500 JSON).
        incrementCounter(
          "session_store_failures_total",
          "express-session store write failures (regenerate or save).",
        );
        res.status(500).send(
          renderResultPage(
            "Sign-in interrupted",
            "We could not start your session. " +
              '<a href="/auth/figma/login">Please sign in again.</a>',
          ),
        );
        return;
      }

      // Persist the email on the user's License doc — same as the plugin
      // branch above — so /web/me can surface it in the "My User" modal even
      // before the first Pro purchase.
      if (meData.email) {
        try {
          await licenseService.getOrCreate(meData.id);
          await licenseService.setEmailIfMissing(meData.id, meData.email);
        } catch (err) {
          console.warn(
            "[Figma OAuth/website] setEmailIfMissing failed (non-fatal):",
            err,
          );
        }
      }

      // Website flow: 302 back to the page the user came from (validated
      // same-origin path; falls back to `/` when missing/invalid). The
      // browser will hit the website on its own origin and the React app
      // will re-read /web/me to render the logged-in UI.
      const baseUrl = config.website.baseUrl;
      const target = returnTo ?? "/";
      res.redirect(`${baseUrl}${target}`);
    } catch (error) {
      console.error("Figma OAuth error:", error);
      res.status(500).json({ error: "Figma OAuth request failed" });
    }
  },
);

/**
 * Website logout — clears the session cookie.
 *
 * Defense-in-depth against CSRF logout:
 *   - POST-only so a CSRF-style GET (link, image, iframe) can't sign a
 *     user out by accident.
 *   - Origin header check against `websiteAllowedOrigins` — SameSite=Lax
 *     cookies are still sent on top-level form POSTs from another origin
 *     under some browser configurations (and a `text/plain` fetch from
 *     evil.com skips CORS preflight). The CORS middleware already rejects
 *     unknown origins, but checking here explicitly makes the protection
 *     obvious at the route level and survives any future CORS reshuffle.
 *
 * Idempotent: returns 200 even when there was no session to destroy. The
 * frontend just optimistically clears its in-memory auth state.
 */
router.post("/auth/figma/logout", (req: Request, res: Response) => {
  if (!isAllowedOrigin(req.headers.origin)) {
    // 403 (not 400) — the request is well-formed, we're refusing to
    // honour it. Mention "origin" so a legitimate caller debugging a CORS
    // misconfig sees the cause without leaking the allowlist contents.
    res.status(403).json({ ok: false, error: "Origin not allowed" });
    return;
  }
  if (!req.session) {
    res.json({ ok: true });
    return;
  }
  req.session.destroy((err) => {
    if (err) {
      console.warn("[Figma OAuth] session.destroy failed:", err);
      res.status(500).json({ ok: false, error: "Logout failed" });
      return;
    }
    // express-session keeps the cookie alive even after destroy unless we
    // explicitly clear it — the name must match the one set in index.ts
    // (`w2w_sid`).
    res.clearCookie("w2w_sid");
    // Legacy cleanup: an earlier build used "w2w_session", briefly with a
    // parent-domain variant. Clear both shapes so a user who signed in under
    // the old name isn't left carrying orphaned cookies.
    res.clearCookie("w2w_session");
    res.clearCookie("w2w_session", { domain: ".web2wireframe.design" });
    res.json({ ok: true });
  });
});

export default router;
