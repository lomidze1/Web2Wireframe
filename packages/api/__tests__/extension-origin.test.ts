import { describe, it, expect } from "vitest";
import { isAllowedExtensionOrigin } from "../src/config/extensionOrigin.js";

const ID = "jjcbhodmhibaehdbgoomdflpgjddcgoa";

describe("isAllowedExtensionOrigin", () => {
  it("allows our own extension origin when the id matches", () => {
    expect(isAllowedExtensionOrigin(`chrome-extension://${ID}`, ID)).toBe(true);
  });

  it("rejects a different extension id", () => {
    expect(
      isAllowedExtensionOrigin("chrome-extension://someotherextensionidaaaaaa", ID),
    ).toBe(false);
  });

  it("rejects non-extension origins", () => {
    expect(isAllowedExtensionOrigin("https://evil.example.com", ID)).toBe(false);
    expect(isAllowedExtensionOrigin("https://www.web2wireframe.design", ID)).toBe(
      false,
    );
  });

  it("rejects everything when no extension id is configured", () => {
    expect(isAllowedExtensionOrigin(`chrome-extension://${ID}`, "")).toBe(false);
  });

  it("does not allow a prefix/substring match of the id", () => {
    // Guards against a partial-match regression (slice + strict === only).
    expect(isAllowedExtensionOrigin(`chrome-extension://${ID}extra`, ID)).toBe(
      false,
    );
  });
});
