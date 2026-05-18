import { describe, it, expect } from "vitest";
import { assertProductionSecrets } from "../src/config/startupChecks.js";

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
