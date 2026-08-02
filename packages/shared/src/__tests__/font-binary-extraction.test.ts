/**
 * extractFontBinaries — URL candidate ordering.
 *
 * The "bulletproof" @font-face pattern declares the IE-only .eot URL FIRST,
 * so trying URLs in declaration order and breaking on first success made the
 * pipeline embed EOT bytes (uninstallable on macOS AND Windows) even when the
 * same face declared a real .ttf (telex.ge shipped exactly this). URLs must
 * be tried in installability order: ttf/otf first, eot dead last.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractFontBinaries } from "../font-binary-extraction";
import type { CDPClientInterface, ExtractedFont } from "../types";
import type { ResourceGraph } from "../resource-graph";

// ============================================================================
// Helpers
// ============================================================================

/** CDP client whose every command fails → forces Strategy 3 (HTTP fetch). */
const failingClient: CDPClientInterface = {
  send: vi.fn().mockRejectedValue(new Error("no CDP in test")),
  enableDomains: vi.fn().mockResolvedValue(undefined),
};

const emptyGraph: ResourceGraph = {
  entries: new Map(),
  stylesheets: [],
  images: [],
  fonts: [],
  svgs: [],
  frameId: "frame-1",
};

function makeFont(src: string): ExtractedFont {
  return {
    family: "Test Family",
    style: "normal",
    weight: "400",
    src,
    format: "unknown",
    isGoogleFont: false,
  };
}

/** Mock fetch that 200s every URL, returning bytes that encode the URL so the
 *  test can tell WHICH candidate's bytes were kept. Records call order. */
function mockFetchAllOk(fetchedUrls: string[]) {
  return vi.fn(async (url: string) => {
    fetchedUrls.push(url);
    const bytes = new TextEncoder().encode(`bytes-of:${url}`);
    return {
      ok: true,
      arrayBuffer: async () => bytes.buffer,
    } as unknown as Response;
  });
}

function decodeBase64(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf8");
}

const BULLETPROOF_SRC = [
  "url('https://site.ge/fonts/glyphs.eot?v=1#iefix') format('embedded-opentype')",
  "url('https://site.ge/fonts/glyphs.woff2?v=1') format('woff2')",
  "url('https://site.ge/fonts/glyphs.woff?v=1') format('woff')",
  "url('https://site.ge/fonts/glyphs.ttf?v=1') format('truetype')",
  "url('https://site.ge/fonts/glyphs.svg?v=1#glyphs') format('svg')",
].join(", ");

// ============================================================================
// Tests
// ============================================================================

describe("extractFontBinaries — installability-ordered URL candidates", () => {
  let fetchedUrls: string[];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchedUrls = [];
    globalThis.fetch = mockFetchAllOk(fetchedUrls) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("prefers the .ttf URL over the first-declared .eot (bulletproof pattern)", async () => {
    const [font] = await extractFontBinaries(
      failingClient,
      [makeFont(BULLETPROOF_SRC)],
      emptyGraph
    );

    expect(font.fontBase64).toBeDefined();
    expect(decodeBase64(font.fontBase64!)).toBe(
      "bytes-of:https://site.ge/fonts/glyphs.ttf?v=1"
    );
    expect(font.fontMimeType).toBe("font/ttf");
    // The ttf must be the FIRST candidate tried, not a later fallback.
    expect(fetchedUrls[0]).toBe("https://site.ge/fonts/glyphs.ttf?v=1");
  });

  it("falls back through woff2 → woff when the ttf 404s", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      fetchedUrls.push(url);
      const ok = !url.includes(".ttf");
      const bytes = new TextEncoder().encode(`bytes-of:${url}`);
      return { ok, arrayBuffer: async () => bytes.buffer } as unknown as Response;
    }) as unknown as typeof fetch;

    const [font] = await extractFontBinaries(
      failingClient,
      [makeFont(BULLETPROOF_SRC)],
      emptyGraph
    );

    expect(decodeBase64(font.fontBase64!)).toBe(
      "bytes-of:https://site.ge/fonts/glyphs.woff2?v=1"
    );
    expect(fetchedUrls).toEqual([
      "https://site.ge/fonts/glyphs.ttf?v=1",
      "https://site.ge/fonts/glyphs.woff2?v=1",
    ]);
  });

  it("still uses an EOT URL when it is the only candidate (last resort)", async () => {
    const [font] = await extractFontBinaries(
      failingClient,
      [makeFont("url('https://site.ge/fonts/only.eot?v=1') format('embedded-opentype')")],
      emptyGraph
    );

    expect(decodeBase64(font.fontBase64!)).toBe(
      "bytes-of:https://site.ge/fonts/only.eot?v=1"
    );
    expect(font.fontMimeType).toBe("application/vnd.ms-fontobject");
  });

  it("keeps declaration order among same-rank URLs (stable sort)", async () => {
    const src = [
      "url('https://site.ge/a.woff2') format('woff2')",
      "url('https://site.ge/b.woff2') format('woff2')",
    ].join(", ");

    await extractFontBinaries(failingClient, [makeFont(src)], emptyGraph);

    expect(fetchedUrls[0]).toBe("https://site.ge/a.woff2");
  });
});
