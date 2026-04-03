import "express-session";

declare module "express-session" {
  interface SessionData {
    figmaUserId?: string;
    figmaEmail?: string;
    createdAt?: string;
    oauthState?: string;
  }
}
