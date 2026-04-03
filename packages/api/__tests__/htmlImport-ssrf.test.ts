import { describe, it, expect } from "vitest";

// Dynamic import so tests fail cleanly if module not yet updated
const { isPrivateHost, PRIVATE_IP_PATTERNS } = await import("../src/utils/urlValidation.js");

describe("isPrivateHost", () => {
  // Should block private/internal hosts
  it.each([
    ["localhost", "loopback hostname"],
    ["LOCALHOST", "case-insensitive loopback"],
    ["127.0.0.1", "IPv4 loopback"],
    ["10.0.0.1", "Class A private"],
    ["10.255.255.255", "Class A private upper"],
    ["192.168.1.1", "Class C private"],
    ["192.168.0.100", "Class C private"],
    ["172.16.0.1", "Class B private lower"],
    ["172.31.255.255", "Class B private upper"],
    ["0.0.0.0", "unspecified address"],
    ["[::1]", "IPv6 loopback"],
    ["example.local", ".local domain"],
    ["server.internal", ".internal domain"],
  ])("blocks %s (%s)", (hostname) => {
    expect(isPrivateHost(hostname)).toBe(true);
  });

  // Should allow public hosts
  it.each([
    ["cdn.googleapis.com", "Google CDN"],
    ["fonts.gstatic.com", "Google Fonts static"],
    ["fonts.googleapis.com", "Google Fonts API"],
    ["cdn.jsdelivr.net", "jsDelivr CDN"],
    ["example.com", "generic public"],
    ["172.32.0.1", "just outside Class B private range"],
    ["11.0.0.1", "just outside Class A private range"],
    ["192.169.1.1", "just outside Class C private range"],
  ])("allows %s (%s)", (hostname) => {
    expect(isPrivateHost(hostname)).toBe(false);
  });
});

describe("PRIVATE_IP_PATTERNS export", () => {
  it("is an array of RegExp patterns", () => {
    expect(Array.isArray(PRIVATE_IP_PATTERNS)).toBe(true);
    expect(PRIVATE_IP_PATTERNS.length).toBeGreaterThan(0);
    expect(PRIVATE_IP_PATTERNS[0]).toBeInstanceOf(RegExp);
  });
});

/**
 * Request filter logic tests.
 * These test the filtering decision function that will be used
 * in htmlExtractor.js request interception.
 */
describe("HTML import request filter logic", () => {
  // Helper: simulate request filter decision
  // This mirrors the logic that will be in htmlExtractor.js
  function shouldAllowRequest(url: string, resourceType: string, isNavigationRequest = false, isMainFrame = true) {
    // Always allow data: and about:blank
    if (url.startsWith("data:") || url === "about:blank") {
      return true;
    }

    // Block main-frame navigation (prevent redirects)
    if (isNavigationRequest && isMainFrame) {
      return false;
    }

    // Parse URL
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }

    // Only HTTPS
    if (parsed.protocol !== "https:") {
      return false;
    }

    // Block private hosts
    if (isPrivateHost(parsed.hostname)) {
      return false;
    }

    // Only safe resource types
    const ALLOWED_TYPES = new Set(["stylesheet", "font", "image", "media"]);
    if (!ALLOWED_TYPES.has(resourceType)) {
      return false;
    }

    return true;
  }

  // Allowed requests
  it("allows data: URIs", () => {
    expect(shouldAllowRequest("data:image/png;base64,abc", "image")).toBe(true);
  });

  it("allows about:blank", () => {
    expect(shouldAllowRequest("about:blank", "document")).toBe(true);
  });

  it("allows HTTPS stylesheet requests", () => {
    expect(shouldAllowRequest("https://fonts.googleapis.com/css2?family=Roboto", "stylesheet")).toBe(true);
  });

  it("allows HTTPS font requests", () => {
    expect(shouldAllowRequest("https://fonts.gstatic.com/s/roboto/v30/font.woff2", "font")).toBe(true);
  });

  it("allows HTTPS image requests", () => {
    expect(shouldAllowRequest("https://cdn.example.com/image.png", "image")).toBe(true);
  });

  it("allows HTTPS media requests", () => {
    expect(shouldAllowRequest("https://cdn.example.com/video.mp4", "media")).toBe(true);
  });

  // Blocked requests
  it("blocks HTTP requests (non-TLS)", () => {
    expect(shouldAllowRequest("http://example.com/style.css", "stylesheet")).toBe(false);
  });

  it("blocks script resource type", () => {
    expect(shouldAllowRequest("https://evil.com/steal.js", "script")).toBe(false);
  });

  it("blocks XHR resource type", () => {
    expect(shouldAllowRequest("https://api.example.com/data", "xhr")).toBe(false);
  });

  it("blocks fetch resource type", () => {
    expect(shouldAllowRequest("https://api.example.com/data", "fetch")).toBe(false);
  });

  it("blocks websocket resource type", () => {
    expect(shouldAllowRequest("https://ws.example.com", "websocket")).toBe(false);
  });

  it("blocks requests to localhost", () => {
    expect(shouldAllowRequest("https://localhost:3000/api", "stylesheet")).toBe(false);
  });

  it("blocks requests to private IPs", () => {
    expect(shouldAllowRequest("https://192.168.1.1/secret", "image")).toBe(false);
  });

  it("blocks requests to 10.x range", () => {
    expect(shouldAllowRequest("https://10.0.0.1/internal", "stylesheet")).toBe(false);
  });

  it("blocks main-frame navigation requests", () => {
    expect(shouldAllowRequest("https://evil.com/redirect", "document", true, true)).toBe(false);
  });

  it("blocks file: protocol", () => {
    expect(shouldAllowRequest("file:///etc/passwd", "document")).toBe(false);
  });

  it("blocks invalid URLs", () => {
    expect(shouldAllowRequest("not-a-valid-url", "stylesheet")).toBe(false);
  });
});
