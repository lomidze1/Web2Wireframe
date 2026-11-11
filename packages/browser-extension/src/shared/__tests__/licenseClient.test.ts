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

// ---------------------------------------------------------------------------
// decodeTokenUserId — pure base64url JSON parse
// ---------------------------------------------------------------------------

/** Build a base64url-encoded payload for a token. The signature half is
 *  bogus — decode never verifies it. */
function makeToken(payload: object): string {
  // toBase64Url: handle the "+" "/" "=" → "-" "_" "" swap manually.
  const std = btoa(JSON.stringify(payload));
  const b64url = std.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url}.fake-signature`;
}

describe("decodeTokenUserId", () => {
  it("returns the userId field from a valid base64url payload", () => {
    const token = makeToken({ userId: "u-42", iat: 1, exp: 2 });
    expect(lc.decodeTokenUserId(token)).toBe("u-42");
  });

  it("throws when the token has no dot separator", () => {
    expect(() => lc.decodeTokenUserId("not-a-token")).toThrow(
      /malformed token/i,
    );
  });

  it("throws when the payload is not valid base64-JSON", () => {
    expect(() => lc.decodeTokenUserId("###.sig")).toThrow(
      /base64-JSON/i,
    );
  });

  it("throws when the payload has no userId field", () => {
    const token = makeToken({ iat: 1, exp: 2 });
    expect(() => lc.decodeTokenUserId(token)).toThrow(/missing userId/i);
  });
});

// ---------------------------------------------------------------------------
// connectFigma — OAuth tab + poll the exchange endpoint
// ---------------------------------------------------------------------------

describe("connectFigma", () => {
  let tabs: { create: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Stub chrome.tabs so the test doesn't open a real tab. `create` resolves
    // to a tab with an id, which connectFigma keeps so it can close the tab
    // itself — the OAuth page's own window.close() is blocked on tabs the
    // page didn't open.
    tabs = {
      create: vi.fn(async () => ({ id: 42 })),
      remove: vi.fn(async () => undefined),
    };
    vi.stubGlobal("chrome", {
      ...((globalThis as { chrome?: unknown }).chrome as object | undefined),
      storage: { local: storage },
      tabs,
    });
  });

  it("persists the session after the exchange returns a token", async () => {
    const token = makeToken({ userId: "u-7", iat: 1, exp: 9999999999 });
    const license = fakeLicense({ figmaUserId: "u-7", email: "u7@example.com" });

    // First poll → pending; second poll → token parked.
    vi.spyOn(globalThis, "fetch")
      // delay(2000) is awaited before the first fetch; fake timers handle that.
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ pending: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pending: false,
            token,
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          { status: 200 },
        ),
      )
      // fetchMyLicense() inside connectFigma — third fetch. Stamped: this is
      // the moment connectFigma has everything it needs and *could* close the
      // tab, so the reading pause is measured from here.
      .mockImplementationOnce(async () => {
        readyAt = Date.now();
        return new Response(JSON.stringify(license), { status: 200 });
      });

    let readyAt = 0;
    let removedAt = 0;
    tabs.remove.mockImplementation(async () => {
      removedAt = Date.now();
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const result = await lc.connectFigma();
      expect(result.figmaUserId).toBe("u-7");
      const persisted = await session.getSession();
      expect(persisted?.sessionToken).toBe(token);
      expect(persisted?.figmaUserId).toBe("u-7");
      expect(persisted?.email).toBe("u7@example.com");
      expect(persisted?.cachedLicense?.figmaUserId).toBe("u-7");
      // The OAuth tab is ours to clean up — the page can't close itself.
      expect(tabs.remove).toHaveBeenCalledWith(42);
      // …but not instantly. The user gets a beat to read "Connected to Figma"
      // before the tab disappears, otherwise it reads as a glitch. Slack on the
      // bound so a slow CI timer tick can't flake this.
      expect(removedAt - readyAt).toBeGreaterThanOrEqual(2_000);
    } finally {
      vi.useRealTimers();
    }
    // Two 2s poll intervals plus the 2.5s reading pause run in real time under
    // `shouldAdvanceTime`, so the 5s default is not enough.
  }, 15_000);

  it("still resolves when the user already closed the OAuth tab", async () => {
    tabs.remove.mockRejectedValue(new Error("No tab with id: 42."));
    const token = makeToken({ userId: "u-8", iat: 1, exp: 9999999999 });
    const license = fakeLicense({ figmaUserId: "u-8" });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            pending: false,
            token,
            expiresAt: "2099-01-01T00:00:00.000Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(license), { status: 200 }),
      );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await expect(lc.connectFigma()).resolves.toMatchObject({
        figmaUserId: "u-8",
      });
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  it("throws and persists no session when cancelled via AbortSignal", async () => {
    // Backend stays "pending" indefinitely; the AbortController short-
    // circuits the poll loop so the test doesn't wait the full 3-minute
    // timeout. Same code path: connectFigma never reaches the setSession
    // call, so storage stays empty.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ pending: true }), { status: 200 }),
    );

    const controller = new AbortController();
    const promise = lc.connectFigma(controller.signal);
    // Abort after the first poll interval has had a chance to fire.
    setTimeout(() => controller.abort(), 50);
    await expect(promise).rejects.toThrow();
    expect(await session.getSession()).toBeNull();
    // Left open on purpose — the tab may be showing the OAuth error page, and
    // closing it would destroy the only explanation the user gets.
    expect(tabs.remove).not.toHaveBeenCalled();
  });
});
