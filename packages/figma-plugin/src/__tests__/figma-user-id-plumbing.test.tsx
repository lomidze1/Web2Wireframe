/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/preact";

import {
  ConfigProvider,
  useConfig,
  DEFAULT_CONFIG,
} from "../ui/shared/ConfigContext";
import { API_BASE_URL, withFigmaUserId } from "../ui/shared/apiConfig";
import {
  fetchMyLicense,
  applyAuthToken,
  __resetAuthForTests,
} from "../ui/shared/licenseClient";

// fetchMyLicense issues a single authed request to /api/license/me. The
// token is seeded directly via applyAuthToken — the old /api/auth/init
// exchange is gone (replaced by the verified Figma OAuth flow).
function mockLicenseFetch(licenseResponse: Response): ReturnType<typeof vi.spyOn> {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => licenseResponse.clone());
}

// ============================================================================
// apiConfig
// ============================================================================

describe("apiConfig.API_BASE_URL", () => {
  it("is a non-empty http(s) URL", () => {
    expect(typeof API_BASE_URL).toBe("string");
    expect(API_BASE_URL).toMatch(/^https?:\/\/[^/]+/);
  });

  it("does not end with a trailing slash", () => {
    expect(API_BASE_URL.endsWith("/")).toBe(false);
  });
});

describe("apiConfig.withFigmaUserId", () => {
  it("appends ?figmaUserId when URL has no existing query", () => {
    expect(withFigmaUserId("http://x/api/me", "user-123")).toBe(
      "http://x/api/me?figmaUserId=user-123",
    );
  });

  it("appends &figmaUserId when URL already has a query", () => {
    expect(withFigmaUserId("http://x/api/me?a=1", "user-123")).toBe(
      "http://x/api/me?a=1&figmaUserId=user-123",
    );
  });

  it("URL-encodes special characters in the id", () => {
    expect(withFigmaUserId("http://x", "user 1+2/3")).toContain(
      "figmaUserId=user%201%2B2%2F3",
    );
  });
});

// ============================================================================
// licenseClient.fetchMyLicense
// ============================================================================

describe("licenseClient.fetchMyLicense", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetAuthForTests();
    applyAuthToken("test.token", Date.now() + 3_600_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetAuthForTests();
  });

  it("rejects when figmaUserId is missing", async () => {
    await expect(fetchMyLicense("")).rejects.toThrow(/figmaUserId/i);
  });

  it("includes figmaUserId in the request URL", async () => {
    const mockFetch = mockLicenseFetch(
      new Response(
        JSON.stringify({
          userId: "user-abc-123",
          plan: "free",
          status: "active",
          limits: { importsPerDay: 10 },
          usage: { importsToday: 0 },
          updatedAt: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await fetchMyLicense("user-abc-123");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const licenseUrl = mockFetch.mock.calls[0][0] as string;
    expect(licenseUrl).toContain("figmaUserId=user-abc-123");
    expect(licenseUrl.startsWith(API_BASE_URL)).toBe(true);
  });

  it("throws a user-facing message on non-2xx response", async () => {
    mockLicenseFetch(new Response("", { status: 500 }));
    await expect(fetchMyLicense("u-1")).rejects.toThrow(
      /Something went wrong on our side/,
    );
  });
});

// ============================================================================
// ConfigContext figmaUserId plumbing
// ============================================================================

describe("ConfigContext figmaUserId plumbing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("DEFAULT_CONFIG includes figmaUserId: null", () => {
    expect(DEFAULT_CONFIG.figmaUserId).toBe(null);
  });

  it("sends get-current-user message on mount", async () => {
    const postSpy = vi.spyOn(window.parent, "postMessage");

    renderHook(() => useConfig(), { wrapper: ConfigProvider });

    await waitFor(() => {
      const calls = postSpy.mock.calls;
      const sentTypes = calls
        .map((c) => {
          const msg = c[0] as { pluginMessage?: { type?: string } };
          return msg?.pluginMessage?.type;
        })
        .filter(Boolean);
      expect(sentTypes).toContain("get-current-user");
    });
  });

  it("updates figmaUserId when current-user message arrives", async () => {
    const { result } = renderHook(() => useConfig(), {
      wrapper: ConfigProvider,
    });

    expect(result.current.config.figmaUserId).toBe(null);

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            pluginMessage: {
              type: "current-user",
              data: { userId: "figma-user-456" },
            },
          },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.config.figmaUserId).toBe("figma-user-456");
    });
  });

  it("stores null figmaUserId when sandbox returns no user", async () => {
    const { result } = renderHook(() => useConfig(), {
      wrapper: ConfigProvider,
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            pluginMessage: {
              type: "current-user",
              data: { userId: null },
            },
          },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.config.figmaUserId).toBe(null);
    });
  });

  it("preserves figmaUserId when config-loaded arrives AFTER current-user (race regression)", async () => {
    // Reproduces the bug where the Plan modal sticks on "Identifying
    // Figma user…": current-user arrived first and set figmaUserId, then
    // config-loaded arrived and clobbered the whole config back to
    // defaults (figmaUserId: null).
    const { result } = renderHook(() => useConfig(), {
      wrapper: ConfigProvider,
    });

    // Step 1 — current-user arrives first.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            pluginMessage: {
              type: "current-user",
              data: { userId: "figma-live-user" },
            },
          },
        }),
      );
    });
    await waitFor(() => {
      expect(result.current.config.figmaUserId).toBe("figma-live-user");
    });

    // Step 2 — config-loaded arrives after, with NO figmaUserId in the
    // saved blob (we exclude it from persistence). Must NOT clobber the
    // live value.
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            pluginMessage: {
              type: "config-loaded",
              data: {
                config: {
                  viewports: ["1920", "1440"],
                  pluginFont: "Inter",
                },
              },
            },
          },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.isConfigLoaded).toBe(true);
    });
    // figmaUserId must survive the merge.
    expect(result.current.config.figmaUserId).toBe("figma-live-user");
    // Saved config still applied to other fields.
    expect(result.current.config.pluginFont).toBe("Inter");
  });
});
