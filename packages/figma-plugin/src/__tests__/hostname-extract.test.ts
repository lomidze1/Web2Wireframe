/**
 * extractHostname — regex-based hostname parser for the Figma plugin sandbox.
 *
 * `new URL(...)` is unreliable inside Figma's plugin sandbox and silently
 * throws for even well-formed URLs, which is why style folders kept landing
 * in "WEB/" and section names showed the full URL. These tests cover every
 * shape of sourceUrl the import pipelines produce.
 */
import { describe, it, expect } from "vitest";
import { extractHostname } from "../rendering/hostname";

describe("extractHostname", () => {
  describe("valid URLs", () => {
    it("strips https:// and www.", () => {
      expect(extractHostname("https://www.apple.com")).toBe("apple.com");
    });

    it("strips http:// and www.", () => {
      expect(extractHostname("http://www.tesla.com")).toBe("tesla.com");
    });

    it("strips path + query + hash", () => {
      expect(
        extractHostname("https://www.web2wireframe.design/pricing?foo=bar#hash"),
      ).toBe("web2wireframe.design");
    });

    it("strips port number", () => {
      expect(extractHostname("https://localhost:3000/foo")).toBe("localhost");
    });

    it("preserves sub-domains and multi-part TLDs", () => {
      expect(extractHostname("https://api.sub.domain.co.uk/path")).toBe(
        "api.sub.domain.co.uk",
      );
    });

    it("lowercases for consistency", () => {
      expect(extractHostname("HTTPS://Example.COM/FOO")).toBe("example.com");
    });
  });

  describe("bare hostnames (no scheme)", () => {
    it("keeps bare domain", () => {
      expect(extractHostname("apple.com")).toBe("apple.com");
    });

    it("strips path from bare domain", () => {
      expect(extractHostname("apple.com/mac")).toBe("apple.com");
    });

    it("strips www. from bare domain", () => {
      expect(extractHostname("www.apple.com")).toBe("apple.com");
    });
  });

  describe("fallback cases", () => {
    it("returns 'website' for undefined", () => {
      expect(extractHostname(undefined)).toBe("website");
    });

    it("returns 'website' for null", () => {
      expect(extractHostname(null)).toBe("website");
    });

    it("returns 'website' for empty string", () => {
      expect(extractHostname("")).toBe("website");
    });

    it("returns 'website' for whitespace", () => {
      expect(extractHostname("   ")).toBe("website");
    });

    it("returns 'website' for 'html-import' sentinel", () => {
      expect(extractHostname("html-import")).toBe("website");
    });
  });

  describe("malformed inputs", () => {
    it("strips double protocol (https://https://...)", () => {
      expect(extractHostname("https://https://apple.com")).toBe("apple.com");
    });

    it("handles a plain host with port and no scheme", () => {
      expect(extractHostname("localhost:3000")).toBe("localhost");
    });

    it("does not throw on unusual characters", () => {
      expect(() => extractHostname("not a url at all")).not.toThrow();
      expect(extractHostname("not a url at all")).toBe("not a url at all");
    });
  });

  describe("the exact user-reported URL", () => {
    it("correctly extracts web2wireframe.design from live URL", () => {
      expect(
        extractHostname("https://www.web2wireframe.design/pricing"),
      ).toBe("web2wireframe.design");
    });
  });
});
