import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DNS resolution so the rebinding-defense path is testable without a
// real network lookup.
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";
import { isPrivateHost, assertPublicUrl } from "../src/utils/urlValidation.js";

const mockedLookup = vi.mocked(lookup);

describe("isPrivateHost — production gating", () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("allows localhost / 127.x outside production (dev servers)", () => {
    process.env.NODE_ENV = "development";
    expect(isPrivateHost("localhost")).toBe(false);
    expect(isPrivateHost("127.0.0.1")).toBe(false);
    expect(isPrivateHost("127.0.0.2")).toBe(false);
  });

  it("treats localhost / 127.x as private in production", () => {
    process.env.NODE_ENV = "production";
    expect(isPrivateHost("localhost")).toBe(true);
    expect(isPrivateHost("LOCALHOST")).toBe(true);
    expect(isPrivateHost("127.0.0.1")).toBe(true);
    expect(isPrivateHost("127.0.0.2")).toBe(true);
  });

  it("blocks metadata / private ranges regardless of env", () => {
    process.env.NODE_ENV = "development";
    expect(isPrivateHost("169.254.169.254")).toBe(true);
    expect(isPrivateHost("10.0.0.5")).toBe(true);
    expect(isPrivateHost("192.168.1.1")).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  const originalEnv = process.env.NODE_ENV;
  beforeEach(() => {
    mockedLookup.mockReset();
  });
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://[::1]/",
    "http://0.0.0.0/",
  ])("rejects private literal IP %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow();
  });

  it("rejects localhost / 127.0.0.1 in production", async () => {
    process.env.NODE_ENV = "production";
    await expect(assertPublicUrl("http://127.0.0.1/")).rejects.toThrow();
    await expect(assertPublicUrl("http://localhost:3000/")).rejects.toThrow();
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(assertPublicUrl("ftp://example.com/")).rejects.toThrow();
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("rejects invalid URLs", async () => {
    await expect(assertPublicUrl("not a url")).rejects.toThrow();
  });

  it("rejects a hostname that resolves to a private IP (DNS rebinding)", async () => {
    mockedLookup.mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
    ] as never);
    await expect(assertPublicUrl("http://rebind.evil.test/")).rejects.toThrow();
    expect(mockedLookup).toHaveBeenCalledWith("rebind.evil.test", { all: true });
  });

  it("rejects when any resolved address is private", async () => {
    mockedLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ] as never);
    await expect(assertPublicUrl("http://mixed.evil.test/")).rejects.toThrow();
  });

  it("accepts a public hostname that resolves to public IPs", async () => {
    mockedLookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as never);
    await expect(assertPublicUrl("https://example.com/")).resolves.toBeUndefined();
  });

  it("accepts a public literal IP without a DNS lookup", async () => {
    await expect(assertPublicUrl("http://93.184.216.34/")).resolves.toBeUndefined();
    expect(mockedLookup).not.toHaveBeenCalled();
  });
});
