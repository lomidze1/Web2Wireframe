/**
 * Unit tests for `shared/licenseClient.ts` — the API client that talks to
 * /api/extension-session/* and /api/license/me. Both `chrome.storage.local`
 * and `globalThis.fetch` are stubbed; no network and no real Chrome runtime.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { License, RedeemResponse, SessionState } from "../types";
import { STORAGE_KEYS } from "../constants";

// ---------------------------------------------------------------------------
// Storage stub (same shape as session.test.ts — kept inline so each suite
// is independently runnable without cross-file fixtures)
// ---------------------------------------------------------------------------

interface StorageStub {
  store: Map<string, unknown>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function installChromeStorage(): StorageStub {
  const store = new Map<string, unknown>();
  const stub: StorageStub = {
    store,
    get: vi.fn(async (key: string) => {
      const value = store.get(key);
      return value === undefined ? {} : { [key]: value };
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
  vi.stubGlobal("chrome", { storage: { local: stub } });
  return stub;
}

// ---------------------------------------------------------------------------
// fetch stub helper
// ---------------------------------------------------------------------------

function mockFetchOnce(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

function fakeLicense(overrides: Partial<License> = {}): License {
  return {
    figmaUserId: "u-1",
    email: "u1@example.com",
    plan: "free",
    status: "active",
    cycleStartedAt: "2026-05-01T00:00:00.000Z",
    cycleEndsAt: "2026-06-01T00:00:00.000Z",
    usage: { imports: 0, periodStartedAt: "2026-05-01T00:00:00.000Z" },
    limits: { imports: 10 },
    subscription: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeSessionInStorage(
  storage: StorageStub,
  overrides: Partial<SessionState> = {},
): SessionState {
  const state: SessionState = {
    sessionToken: "header.signature",
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    figmaUserId: "u-1",
    email: "u1@example.com",
    cachedLicense: fakeLicense(),
    ...overrides,
  };
  storage.store.set(STORAGE_KEYS.SESSION, state);
  return state;
}

let storage: StorageStub;
let lc: typeof import("../licenseClient");
let session: typeof import("../session");

beforeEach(async () => {
  vi.resetModules();
  vi.restoreAllMocks();
  storage = installChromeStorage();
  lc = await import("../licenseClient");
  session = await import("../session");
});

// ---------------------------------------------------------------------------
// redeemPairingCode
// ---------------------------------------------------------------------------

describe("redeemPairingCode", () => {
  it("persists the session on a successful 200 response", async () => {
    const future = "2027-05-01T00:00:00.000Z";
    const redeemBody: RedeemResponse = {
      sessionToken: "new.token",
      expiresAt: future,
      figmaUserId: "u-1",
      email: "u1@example.com",
      license: fakeLicense(),
    };
    mockFetchOnce(200, redeemBody);

    const result = await lc.redeemPairingCode("ABC23XYZ");

    expect(result).toEqual(redeemBody);
    const stored = await session.getSession();
    expect(stored?.sessionToken).toBe("new.token");
    expect(stored?.figmaUserId).toBe("u-1");
    expect(stored?.cachedLicense?.plan).toBe("free");
    expect(stored?.expiresAt).toBe(Date.parse(future));
  });

  it("throws AuthExpiredError on 401 and does NOT persist a session", async () => {
    mockFetchOnce(401, { error: "Invalid or expired pairing code" });
    await expect(lc.redeemPairingCode("BAD")).rejects.toBeInstanceOf(
      lc.AuthExpiredError,
    );
    expect(await session.getSession()).toBeNull();
  });

  it("rejects an empty code without hitting the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(lc.redeemPairingCode("   ")).rejects.toThrow(/required/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetchMyLicense
// ---------------------------------------------------------------------------

describe("fetchMyLicense", () => {
  it("updates the cached license on 200", async () => {
    fakeSessionInStorage(storage);
    const proLicense = fakeLicense({ plan: "pro", limits: { imports: null } });
    mockFetchOnce(200, proLicense);

    const got = await lc.fetchMyLicense();

    expect(got.plan).toBe("pro");
    const stored = await session.getSession();
    expect(stored?.cachedLicense?.plan).toBe("pro");
  });

  it("throws AuthExpiredError on 401 and clears the local session", async () => {
    fakeSessionInStorage(storage);
    mockFetchOnce(401, { error: "Session revoked" });

    await expect(lc.fetchMyLicense()).rejects.toBeInstanceOf(
      lc.AuthExpiredError,
    );
    expect(await session.getSession()).toBeNull();
  });

  it("throws AuthExpiredError immediately when no session is held", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(lc.fetchMyLicense()).rejects.toBeInstanceOf(
      lc.AuthExpiredError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// revokeSession
// ---------------------------------------------------------------------------

describe("revokeSession", () => {
  it("clears the local session even when the network call fails", async () => {
    fakeSessionInStorage(storage);
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network down"));

    await lc.revokeSession();

    expect(await session.getSession()).toBeNull();
  });

  it("clears the local session on a 500 response", async () => {
    fakeSessionInStorage(storage);
    mockFetchOnce(500, { error: "boom" });

    await lc.revokeSession();
    expect(await session.getSession()).toBeNull();
  });

  it("is a no-op (no fetch) when no session is held, and still clears", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await lc.revokeSession();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createCheckout
// ---------------------------------------------------------------------------

describe("createCheckout", () => {
  it("returns the checkout URL and sends figmaUserId + plan in body", async () => {
    fakeSessionInStorage(storage);
    const spy = mockFetchOnce(200, {
      checkoutUrl: "https://pay.flitt.com/x",
      orderId: "ord_1",
    });

    const result = await lc.createCheckout("yearly");
    expect(result.checkoutUrl).toContain("flitt.com");

    // Confirm body shape sent to backend.
    const call = spy.mock.calls[0];
    expect(call[1]?.method).toBe("POST");
    const body = JSON.parse(String(call[1]?.body));
    expect(body.figmaUserId).toBe("u-1");
    expect(body.plan).toBe("yearly");
  });

  it("throws AuthExpiredError without a session", async () => {
    await expect(lc.createCheckout("monthly")).rejects.toBeInstanceOf(
      lc.AuthExpiredError,
    );
  });
});

// ---------------------------------------------------------------------------
// authHeader
// ---------------------------------------------------------------------------

describe("authHeader", () => {
  it("returns the Bearer header when a valid session is held", async () => {
    fakeSessionInStorage(storage);
    const h = await lc.authHeader();
    expect(h).toBe("Bearer header.signature");
  });

  it("throws AuthExpiredError when no session is held", async () => {
    await expect(lc.authHeader()).rejects.toBeInstanceOf(lc.AuthExpiredError);
  });
});
