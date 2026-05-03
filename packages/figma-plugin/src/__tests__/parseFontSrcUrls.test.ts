/**
 * parseFontSrcUrls — supports both `url(...)`-wrapped and bare URL forms.
 *
 * Two source shapes coexist:
 *   - Browser-extension capture & raw @font-face: `url('https://…') format('woff2')`
 *   - API W2W content-script flow: `https://…` (the backend's `cleanSrc` strips
 *     the `url(...)` wrapper before sending to the plugin)
 *
 * `parseFontSrcUrls` must extract URLs from both forms or the
 * "Download fonts (.zip)" pipeline silently produces 0 entries on the W2W
 * import path.
 */
import { describe, it, expect } from "vitest";
import { parseFontSrcUrls } from "../utils/fontUtils";

describe("parseFontSrcUrls", () => {
  it("extracts URL from url('...') wrapper", () => {
    const src = `url('https://fonts.gstatic.com/inter.woff2') format('woff2')`;
    expect(parseFontSrcUrls(src)).toEqual([
      "https://fonts.gstatic.com/inter.woff2",
    ]);
  });

  it("extracts multiple URLs from comma-separated url() wrappers", () => {
    const src =
      `url('https://example.com/a.woff2') format('woff2'), ` +
      `url('https://example.com/a.woff') format('woff')`;
    expect(parseFontSrcUrls(src)).toEqual([
      "https://example.com/a.woff2",
      "https://example.com/a.woff",
    ]);
  });

  it("extracts bare URL (W2W backend cleanSrc format)", () => {
    // The W2W API strips url() wrappers in cleanSrc before sending —
    // parseFontSrcUrls must still extract the URL.
    const src = `https://fonts.gstatic.com/inter.woff2`;
    expect(parseFontSrcUrls(src)).toEqual([
      "https://fonts.gstatic.com/inter.woff2",
    ]);
  });

  it("extracts multiple bare URLs from cleanSrc-style comma list", () => {
    const src =
      `https://example.com/a.woff2 format('woff2'), ` +
      `https://example.com/a.woff format('woff')`;
    expect(parseFontSrcUrls(src)).toEqual([
      "https://example.com/a.woff2",
      "https://example.com/a.woff",
    ]);
  });

  it("ignores data: URIs", () => {
    const src = `url('data:font/woff2;base64,AAAA') format('woff2')`;
    expect(parseFontSrcUrls(src)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(parseFontSrcUrls("")).toEqual([]);
  });

  it("does not match relative URLs (only http/https)", () => {
    const src = `url('/fonts/inter.woff2') format('woff2')`;
    expect(parseFontSrcUrls(src)).toEqual([]);
  });
});
