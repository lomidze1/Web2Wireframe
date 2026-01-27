import express, { type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { config } from "../config/env.js";

const router = express.Router();

const LOCAL_REDIRECT_URI = "http://localhost:3001/auth/figma/callback";
const PROD_REDIRECT_URI =
  "https://web2wireframe-website-backend.onrender.com/auth/figma/callback";

const getRedirectUri = (): string => {
  if (config.figma.redirectUri) {
    return config.figma.redirectUri;
  }
  return config.server.nodeEnv === "production"
    ? PROD_REDIRECT_URI
    : LOCAL_REDIRECT_URI;
};

const generateState = (): string => randomBytes(16).toString("hex");

router.get("/auth/figma/login", (req: Request, res: Response) => {
  const clientId = config.figma.clientId;
  if (!clientId) {
    res.status(500).json({ error: "Figma client ID not configured" });
    return;
  }

  const state = generateState();
  req.session.oauthState = state;

  const redirectUri = getRedirectUri();
  const authorizeUrl = new URL("https://www.figma.com/oauth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "file_content");
  authorizeUrl.searchParams.set("state", state);

  res.redirect(authorizeUrl.toString());
});

router.get(
  "/auth/figma/callback",
  async (
    req: Request<{}, {}, {}, { code?: string; state?: string }>,
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

    const clientId = config.figma.clientId;
    const clientSecret = config.figma.clientSecret;

    if (!clientId || !clientSecret) {
      res.status(500).json({ error: "Figma OAuth not configured" });
      return;
    }

    const redirectUri = getRedirectUri();
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });

    try {
      const tokenResponse = await fetch(
        "https://www.figma.com/api/oauth/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: tokenParams,
        },
      );

      if (!tokenResponse.ok) {
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
