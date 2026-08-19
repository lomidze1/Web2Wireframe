/**
 * Tests for `url(...)` extraction out of a `background-image` layer.
 *
 * The old regex was `/url\(["']?([^"')]+)["']?\)/` — it stops at the first
 * quote or paren INSIDE the URL. An inline SVG data URI is full of single
 * quotes (`width='277'`), so the match failed outright and the layer became a
 * placeholder with no URL at all.
 *
 * Real-world case: iwm.org.uk's hero wordmark. The whole
 * "IMPERIAL WAR MUSEUMS" logo is a 5.3 KB `data:image/svg+xml` background on
 * `span.hero-full-width__iwm-logo-ico`; it imported as a plain grey box.
 *
 * The same capture also shows why the SVG decoder needs a non-base64 path:
 * the URI is `charset=utf-8,%3Csvg…` — percent-encoded, not base64.
 */
import { describe, it, expect } from "vitest";
import { extractCssUrl } from "../rendering/css-converter";
import { decodeSvgDataUri } from "../rendering/realImages";

const Q = String.fromCharCode(39); // '
const IWM_LOGO_URI =
  `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=${Q}http://www.w3.org/2000/svg${Q}` +
  ` width=${Q}277${Q} height=${Q}18${Q} fill=${Q}%23333${Q} viewBox=${Q}0 0 277 18${Q}` +
  `%3E%3Ctitle%3EImperial War Museums%3C/title%3E%3Cpath fill=${Q}%23fff${Q}` +
  ` d=${Q}M.694 16.85V.293H4v16.46H.694z${Q}/%3E%3C/svg%3E`;

// ---------------------------------------------------------------------------
// extractCssUrl
// ---------------------------------------------------------------------------

describe("extractCssUrl", () => {
  it("keeps a double-quoted SVG data URI whole, quotes and all", () => {
    const layer = `url("${IWM_LOGO_URI}")`;
    expect(extractCssUrl(layer)).toBe(IWM_LOGO_URI);
  });

  it("keeps a single-quoted URL whole", () => {
    expect(extractCssUrl(`url('https://example.com/a.png')`)).toBe(
      "https://example.com/a.png"
    );
  });

  it("reads an unquoted URL", () => {
    expect(extractCssUrl("url(https://example.com/a.png)")).toBe(
      "https://example.com/a.png"
    );
  });

  it("keeps parentheses that live inside a quoted URL", () => {
    expect(extractCssUrl(`url("https://example.com/a(1).png")`)).toBe(
      "https://example.com/a(1).png"
    );
  });

  it("trims surrounding whitespace inside url()", () => {
    expect(extractCssUrl("url(  https://example.com/a.png  )")).toBe(
      "https://example.com/a.png"
    );
  });

  it("returns null when the layer has no url()", () => {
    expect(extractCssUrl("linear-gradient(red, blue)")).toBeNull();
    expect(extractCssUrl("none")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeSvgDataUri
// ---------------------------------------------------------------------------

describe("decodeSvgDataUri", () => {
  it("decodes a percent-encoded SVG data URI", () => {
    const svg = decodeSvgDataUri(IWM_LOGO_URI);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("viewBox='0 0 277 18'");
    expect(svg).toContain("Imperial War Museums");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("decodes a base64 SVG data URI", () => {
    const raw = "<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>";
    const b64 =
      typeof btoa === "function"
        ? btoa(raw)
        : Buffer.from(raw, "utf-8").toString("base64");
    expect(decodeSvgDataUri(`data:image/svg+xml;base64,${b64}`)).toBe(raw);
  });

  it("passes raw SVG markup through untouched", () => {
    const raw = "<svg><circle r='2'/></svg>";
    expect(decodeSvgDataUri(raw)).toBe(raw);
  });

  it("handles an unencoded SVG data URI", () => {
    const raw = "<svg><g/></svg>";
    expect(decodeSvgDataUri(`data:image/svg+xml,${raw}`)).toBe(raw);
  });
});
