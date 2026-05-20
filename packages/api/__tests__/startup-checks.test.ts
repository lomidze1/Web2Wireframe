import { describe, it, expect } from "vitest";
import {
  assertProductionSecrets,
  assertProductionUrls,
} from "../src/config/startupChecks.js";

// A valid production-grade secret: 32 chars, not dev-prefixed.
const STRONG = "k7Qp2mX9vRtY4nLb8wZcF1jH6sD3aE0u";

function prodEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    AUTH_SECRET: STRONG,
    SESSION_SECRET: `${STRONG}AA`,
    ADMIN_TOKEN: `${STRONG}BB`,
    CORS_ORIGIN: "web2wireframe.design,figma.com",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("assertProductionSecrets", () => {
  it("does nothing outside production, even with weak secrets", () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: "development",
        AUTH_SECRET: "dev-auth-secret",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("passes with strong production secrets", () => {
    expect(() => assertProductionSecrets(prodEnv())).not.toThrow();
  });

  it("throws when a required variable is missing", () => {
    expect(() =>
      assertProductionSecrets(prodEnv({ AUTH_SECRET: undefined })),
    ).toThrow(/Missing required environment variables/);
  });

  it("rejects the dev-auth-secret placeholder (C2 regression)", () => {
    expect(() =>
      assertProductionSecrets(prodEnv({ AUTH_SECRET: "dev-auth-secret" })),
    ).toThrow(/AUTH_SECRET/);
  });

  it("rejects any dev- prefixed secret regardless of length", () => {
    expect(() =>
      assertProductionSecrets(prodEnv({ SESSION_SECRET: `dev-${STRONG}` })),
    ).toThrow(/SESSION_SECRET/);
  });

  it("rejects secrets shorter than 24 characters", () => {
    expect(() =>
      assertProductionSecrets(prodEnv({ ADMIN_TOKEN: "short-token" })),
    ).toThrow(/ADMIN_TOKEN/);
  });

  it("rejects known placeholder values", () => {
    expect(() =>
      assertProductionSecrets(
        prodEnv({ ADMIN_TOKEN: "change-me-in-production" }),
      ),
    ).toThrow(/ADMIN_TOKEN/);
  });
});

// ============================================================================
// assertProductionUrls
// ============================================================================

function prodUrlEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    API_PUBLIC_URL: "https://api.web2wireframe.design",
    WEBSITE_BASE_URL: "https://www.web2wireframe.design",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe("assertProductionUrls", () => {
  it("does nothing outside production", () => {
    expect(() =>
      assertProductionUrls({
        NODE_ENV: "development",
        API_PUBLIC_URL: "http://localhost:3002",
        WEBSITE_BASE_URL: "",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("accepts well-formed HTTPS URLs in production", () => {
    expect(() => assertProductionUrls(prodUrlEnv())).not.toThrow();
  });

  it("rejects missing API_PUBLIC_URL", () => {
    expect(() =>
      assertProductionUrls(prodUrlEnv({ API_PUBLIC_URL: undefined })),
    ).toThrow(/API_PUBLIC_URL is missing/);
  });

  it("rejects empty WEBSITE_BASE_URL", () => {
    expect(() =>
      assertProductionUrls(prodUrlEnv({ WEBSITE_BASE_URL: "   " })),
    ).toThrow(/WEBSITE_BASE_URL is missing/);
  });

  it("rejects HTTP URL in production", () => {
    expect(() =>
      assertProductionUrls(
        prodUrlEnv({ API_PUBLIC_URL: "http://api.example.com" }),
      ),
    ).toThrow(/must use https:\/\/ in production/);
  });

  it("rejects localhost in production", () => {
    expect(() =>
      assertProductionUrls(
        prodUrlEnv({ API_PUBLIC_URL: "https://localhost:3002" }),
      ),
    ).toThrow(/cannot point at localhost/);
  });

  it("rejects unparseable URL", () => {
    expect(() =>
      assertProductionUrls(prodUrlEnv({ WEBSITE_BASE_URL: "not a url" })),
    ).toThrow(/is not a valid URL/);
  });

  it("reports both problems when both vars are bad", () => {
    expect(() =>
      assertProductionUrls(
        prodUrlEnv({
          API_PUBLIC_URL: "http://api.x",
          WEBSITE_BASE_URL: "ftp://x.com",
        }),
      ),
    ).toThrow(/API_PUBLIC_URL.*WEBSITE_BASE_URL/);
  });
});
