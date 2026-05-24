import express, { type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { config } from "../../config/env.js";
import { signToken, PLUGIN_TOKEN_EXPIRY_SECONDS } from "../../middleware/auth.js";
import { pendingPluginAuth, PLUGIN_AUTH_NONCE_TTL_MS } from "../../state.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";

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

/** A plugin-supplied nonce is a high-entropy token; reject anything else. */
const isValidPluginNonce = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(value);

/** Minimal HTML shown in the OAuth browser tab once the plugin flow finishes. */
const renderResultPage = (heading: string, body: string): string => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Web2Wireframe</title>
<style>
  body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f7;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .card{background:#fff;border-radius:12px;padding:40px 48px;text-align:center;
    box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:380px}
  h1{font-size:18px;margin:0 0 8px}p{color:#666;font-size:14px;margin:0;line-height:1.5}
</style></head>
<body><div class="card"><h1>${heading}</h1><p>${body}</p></div></body></html>`;

router.get("/auth/figma/login", authRateLimiter, (req: Request, res: Response) => {
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

  res.redirect(authorizeUrl.toString());
});

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
        const token = signToken(meData.id, secret, PLUGIN_TOKEN_EXPIRY_SECONDS);
        pendingPluginAuth.set(pluginNonce, {
          token,
          tokenExpiresAt: Date.now() + PLUGIN_TOKEN_EXPIRY_SECONDS * 1000,
          expires: Date.now() + PLUGIN_AUTH_NONCE_TTL_MS,
        });
        res.status(200).send(
          renderResultPage(
            "Connected to Figma",
            "You can close this tab and return to the Web2Wireframe plugin.",
          ),
        );
        return;
      }

      req.session.figmaUserId = meData.id;
      req.session.figmaEmail = meData.email;
      req.session.createdAt = new Date().toISOString();

      res.json({
        figmaUserId: meData.id,
        email: meData.email ?? null,
        name: meData.handle ?? null,
      });
    } catch (error) {
      console.error("Figma OAuth error:", error);
      res.status(500).json({ error: "Figma OAuth request failed" });
    }
  },
);

export default router;
