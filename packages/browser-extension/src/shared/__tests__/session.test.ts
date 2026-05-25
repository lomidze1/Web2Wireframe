/**
 * Unit tests for `shared/session.ts` — the chrome.storage.local wrapper for
 * extension session state. happy-dom doesn't ship a chrome object, so we
 * stub one with an in-memory backing Map per test.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { License, SessionState } from "../types";
import { STORAGE_KEYS } from "../constants";

// ---------------------------------------------------------------------------
// chrome.storage.local stub
// ---------------------------------------------------------------------------
//
// We mount this on `globalThis.chrome` before each test. The wrapper only
// uses `.get / .set / .remove`; the stub implements those three with a
// fresh Map per test so cases stay isolated.

interface StorageStub {
  store: Map<string, unknown>;
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
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

let storage: StorageStub;

// Import the SUT lazily so it picks up the stubbed chrome global.
let session: typeof import("../session");

beforeEach(async () => {
  vi.resetModules();
  storage = installChromeStorage();
  session = await import("../session");
});

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

function fakeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionToken: "header.signature",
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days out
    figmaUserId: "u-1",
    email: "u1@example.com",
    cachedLicense: fakeLicense(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getSession / setSession / clearSession
// ---------------------------------------------------------------------------

describe("getSession", () => {
  it("returns null when nothing is stored", async () => {
    const got = await session.getSession();
    expect(got).toBeNull();
  });

  it("round-trips a session through set + get", async () => {
    const written = fakeSession();
    await session.setSession(written);
    const read = await session.getSession();
    expect(read).toEqual(written);
  });
});

describe("clearSession", () => {
  it("removes the stored session", async () => {
    await session.setSession(fakeSession());
    expect(await session.getSession()).not.toBeNull();
    await session.clearSession();
    expect(await session.getSession()).toBeNull();
    // Confirm the storage entry is actually gone (defensive — not just a
    // reset to a falsy value).
    expect(storage.store.has(STORAGE_KEYS.SESSION)).toBe(false);
  });
});

describe("updateCachedLicense", () => {
  it("updates only the cachedLicense field, preserving token/email", async () => {
    const original = fakeSession();
    await session.setSession(original);
    const newLicense = fakeLicense({ plan: "pro", limits: { imports: null } });
    await session.updateCachedLicense(newLicense);
    const updated = await session.getSession();
    expect(updated?.sessionToken).toBe(original.sessionToken);
    expect(updated?.email).toBe(original.email);
    expect(updated?.cachedLicense?.plan).toBe("pro");
  });

  it("is a no-op when no session is stored", async () => {
    await session.updateCachedLicense(fakeLicense());
    expect(await session.getSession()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getValidToken — safety-margin behavior
// ---------------------------------------------------------------------------

describe("getValidToken", () => {
  it("returns the token when expiry is comfortably in the future", async () => {
    await session.setSession(fakeSession({ expiresAt: Date.now() + 60 * 60 * 1000 }));
    const t = await session.getValidToken();
    expect(t).toBe("header.signature");
  });

  it("returns null when expiry is within the 60s safety margin", async () => {
    await session.setSession(fakeSession({ expiresAt: Date.now() + 30_000 }));
    expect(await session.getValidToken()).toBeNull();
  });

  it("returns null when there is no session", async () => {
    expect(await session.getValidToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shouldRefresh — 24h refresh window
// ---------------------------------------------------------------------------

describe("shouldRefresh", () => {
  it("returns true when the token expires within 24 hours", async () => {
    await session.setSession(fakeSession({ expiresAt: Date.now() + 6 * 60 * 60 * 1000 }));
    expect(await session.shouldRefresh()).toBe(true);
  });

  it("returns false when the token still has many days left", async () => {
    await session.setSession(fakeSession({ expiresAt: Date.now() + 10 * 24 * 60 * 60 * 1000 }));
    expect(await session.shouldRefresh()).toBe(false);
  });

  it("returns false when there is no session", async () => {
    expect(await session.shouldRefresh()).toBe(false);
  });
});
