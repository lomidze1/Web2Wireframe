import "express-session";

declare module "express-session" {
  interface SessionData {
    figmaUserId?: string;
    figmaEmail?: string;
    createdAt?: string;
    oauthState?: string;
    /** Plugin OAuth bridge — nonce the plugin polls /api/auth/figma-exchange with. */
    pluginNonce?: string;
  }
}
