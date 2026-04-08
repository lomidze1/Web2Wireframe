import { describe, it, expect } from "vitest";
import { validateUrl } from "../utils/urlValidation";

describe("validateUrl", () => {
  // ---- Valid URLs ----
  describe("valid URLs", () => {
    it("accepts https URLs", () => {
      const result = validateUrl("https://example.com");
      expect(result.valid).toBe(true);
      expect(result.url).toBe("https://example.com");
    });

    it("accepts http URLs", () => {
      const result = validateUrl("http://example.com");
      expect(result.valid).toBe(true);
      expect(result.url).toBe("http://example.com");
    });

    it("accepts URLs with paths", () => {
      const result = validateUrl("https://example.com/page/about");
      expect(result.valid).toBe(true);
    });

    it("accepts URLs with query params", () => {
      const result = validateUrl("https://example.com?q=test&lang=en");
      expect(result.valid).toBe(true);
    });

    it("accepts subdomains", () => {
      const result = validateUrl("https://www.sub.example.com");
      expect(result.valid).toBe(true);
    });

    it("accepts public IP addresses", () => {
      const result = validateUrl("https://8.8.8.8");
      expect(result.valid).toBe(true);
    });

    it("accepts URLs with port numbers", () => {
      const result = validateUrl("https://example.com:8080");
      expect(result.valid).toBe(true);
    });
  });

  // ---- Auto-prefix ----
  describe("auto-prefix https://", () => {
    it("auto-prefixes domain without protocol", () => {
      const result = validateUrl("google.com");
      expect(result.valid).toBe(true);
      expect(result.url).toBe("https://google.com");
    });

    it("auto-prefixes www domain", () => {
      const result = validateUrl("www.example.com");
      expect(result.valid).toBe(true);
      expect(result.url).toBe("https://www.example.com");
    });

    it("auto-prefixes domain with path", () => {
      const result = validateUrl("example.com/about");
      expect(result.valid).toBe(true);
      expect(result.url).toBe("https://example.com/about");
    });

    it("does not double-prefix https URLs", () => {
      const result = validateUrl("https://example.com");
      expect(result.url).toBe("https://example.com");
    });

    it("does not double-prefix http URLs", () => {
      const result = validateUrl("http://example.com");
      expect(result.url).toBe("http://example.com");
    });
  });

  // ---- Normalization ----
  describe("normalization", () => {
    it("trims leading whitespace", () => {
      const result = validateUrl("  https://example.com");
      expect(result.valid).toBe(true);
    });

    it("trims trailing whitespace", () => {
      const result = validateUrl("https://example.com  ");
      expect(result.valid).toBe(true);
    });

    it("trims both sides", () => {
      const result = validateUrl("  https://example.com  ");
      expect(result.valid).toBe(true);
    });
  });

  // ---- Blocked protocols ----
  describe("blocked protocols", () => {
    it("rejects ftp://", () => {
      const result = validateUrl("ftp://files.example.com");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("HTTP");
    });

    it("rejects javascript:", () => {
      const result = validateUrl("javascript:alert(1)");
      expect(result.valid).toBe(false);
    });

    it("rejects file:///", () => {
      const result = validateUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("rejects data:", () => {
      const result = validateUrl("data:text/html,<h1>Hi</h1>");
      expect(result.valid).toBe(false);
    });
  });

  // ---- Allowed localhost (dev servers) ----
  describe("allowed localhost addresses", () => {
    it("allows localhost", () => {
      const result = validateUrl("http://localhost:3000");
      expect(result.valid).toBe(true);
    });

    it("allows LOCALHOST case-insensitive", () => {
      const result = validateUrl("http://LOCALHOST:8080");
      expect(result.valid).toBe(true);
    });

    it("allows 127.0.0.1", () => {
      const result = validateUrl("http://127.0.0.1:3000");
      expect(result.valid).toBe(true);
    });

    it("allows localhost without port", () => {
      const result = validateUrl("http://localhost");
      expect(result.valid).toBe(true);
    });
  });

  // ---- Blocked private IPs ----
  describe("blocked private/internal addresses", () => {
    it("rejects 192.168.x.x", () => {
      const result = validateUrl("https://192.168.1.1");
      expect(result.valid).toBe(false);
    });

    it("rejects 10.x.x.x", () => {
      const result = validateUrl("https://10.0.0.1");
      expect(result.valid).toBe(false);
    });

    it("rejects 172.16.x.x", () => {
      const result = validateUrl("https://172.16.0.1");
      expect(result.valid).toBe(false);
    });

    it("rejects 172.31.x.x", () => {
      const result = validateUrl("https://172.31.255.255");
      expect(result.valid).toBe(false);
    });

    it("allows 172.15.x.x (not private)", () => {
      const result = validateUrl("https://172.15.0.1");
      expect(result.valid).toBe(true);
    });

    it("allows 172.32.x.x (not private)", () => {
      const result = validateUrl("https://172.32.0.1");
      expect(result.valid).toBe(true);
    });

    it("rejects 0.0.0.0", () => {
      const result = validateUrl("https://0.0.0.0");
      expect(result.valid).toBe(false);
    });
  });

  // ---- Domain validation ----
  describe("domain validation", () => {
    it("rejects URL without TLD", () => {
      const result = validateUrl("https://asdfghjkl");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("complete domain");
    });

    it("rejects empty input", () => {
      const result = validateUrl("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("enter a URL");
    });

    it("rejects whitespace-only input", () => {
      const result = validateUrl("   ");
      expect(result.valid).toBe(false);
    });
  });
});
