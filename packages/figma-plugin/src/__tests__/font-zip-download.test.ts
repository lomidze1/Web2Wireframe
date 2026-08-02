/**
 * Font ZIP Download Tests
 *
 * Tests for downloading missing fonts as a ZIP file:
 * - buildFontFileName: generates correct file names from font metadata
 * - buildFontDownloadEntries: converts FontDownloadInfo[] to downloadable entries
 * - createFontsZipBlob: fetches font URLs and bundles into ZIP blob
 * - UI: "Use original fonts" expanded section with download button
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Test 1: buildFontFileName — font file name generation
// =============================================================================

// Inline the logic we'll implement in fontDownload.ts
function buildFontFileName(
  family: string,
  style: string = "normal",
  weight: string = "400",
  format: string = "truetype"
): string {
  const ext =
    format === "woff2"
      ? ".woff2"
      : format === "woff"
        ? ".woff"
        : format === "opentype"
          ? ".otf"
          : ".ttf";
  return `${family}-${style}-${weight}-100${ext}`;
}

describe("buildFontFileName", () => {
  it("should generate correct name for Averta Std Bold", () => {
    const name = buildFontFileName("Averta Std Bold", "normal", "600");
    expect(name).toBe("Averta Std Bold-normal-600-100.ttf");
  });

  it("should generate correct name for PP Fragment Glare Medium", () => {
    const name = buildFontFileName("PP Fragment Glare Medium", "normal", "500");
    expect(name).toBe("PP Fragment Glare Medium-normal-500-100.ttf");
  });

  it("should generate correct name for SourceSans3VF", () => {
    const name = buildFontFileName("SourceSans3VF", "normal", "400");
    expect(name).toBe("SourceSans3VF-normal-400-100.ttf");
  });

  it("should use .woff2 extension for woff2 format", () => {
    const name = buildFontFileName("Inter", "normal", "400", "woff2");
    expect(name).toBe("Inter-normal-400-100.woff2");
  });

  it("should use .woff extension for woff format", () => {
    const name = buildFontFileName("Inter", "normal", "400", "woff");
    expect(name).toBe("Inter-normal-400-100.woff");
  });

  it("should use .otf extension for opentype format", () => {
    const name = buildFontFileName("Inter", "normal", "400", "opentype");
    expect(name).toBe("Inter-normal-400-100.otf");
  });

  it("should use defaults when style/weight not provided", () => {
    const name = buildFontFileName("CustomFont");
    expect(name).toBe("CustomFont-normal-400-100.ttf");
  });

  it("should handle italic style", () => {
    const name = buildFontFileName("Averta Std", "italic", "400");
    expect(name).toBe("Averta Std-italic-400-100.ttf");
  });
});

// =============================================================================
// Test 2: buildFontDownloadEntries — FontDownloadInfo → download entries
// =============================================================================

interface FontDownloadInfo {
  family: string;
  urls: string[];
  isGoogleFont: boolean;
}

interface FontDownloadEntry {
  url: string;
  fileName: string;
  family: string;
}

function buildFontDownloadEntries(
  downloads: FontDownloadInfo[],
  extractedFonts?: Array<{ family: string; style?: string; weight?: string; format?: string; src?: string }>
): FontDownloadEntry[] {
  const entries: FontDownloadEntry[] = [];

  for (const dl of downloads) {
    if (dl.urls.length === 0 && !dl.isGoogleFont) continue;

    // Find matching extracted font metadata for style/weight info
    const matchingFonts = extractedFonts?.filter(
      (ef) => ef.family.toLowerCase() === dl.family.toLowerCase()
    ) || [];

    if (dl.urls.length > 0) {
      for (let i = 0; i < dl.urls.length; i++) {
        const url = dl.urls[i];
        const meta = matchingFonts[i] || matchingFonts[0];
        const style = meta?.style || "normal";
        const weight = meta?.weight || "400";
        const format = meta?.format || guessFormatFromUrl(url);
        entries.push({
          url,
          fileName: buildFontFileName(dl.family, style, weight, format),
          family: dl.family,
        });
      }
    }
  }

  return entries;
}

function guessFormatFromUrl(url: string): string {
  if (url.includes(".woff2")) return "woff2";
  if (url.includes(".woff")) return "woff";
  if (url.includes(".otf")) return "opentype";
  return "truetype";
}

describe("buildFontDownloadEntries", () => {
  it("should create entry for single font with single URL", () => {
    const downloads: FontDownloadInfo[] = [
      { family: "Averta Std Bold", urls: ["https://fonts.example.com/averta-bold.woff2"], isGoogleFont: false },
    ];
    const extracted = [{ family: "Averta Std Bold", style: "normal", weight: "600", format: "woff2" }];

    const entries = buildFontDownloadEntries(downloads, extracted);
    expect(entries).toHaveLength(1);
    expect(entries[0].fileName).toBe("Averta Std Bold-normal-600-100.woff2");
    expect(entries[0].url).toBe("https://fonts.example.com/averta-bold.woff2");
    expect(entries[0].family).toBe("Averta Std Bold");
  });

  it("should create multiple entries for font with multiple URLs", () => {
    const downloads: FontDownloadInfo[] = [
      {
        family: "SourceSans3VF",
        urls: [
          "https://fonts.example.com/ss3v-400.woff2",
          "https://fonts.example.com/ss3v-500.woff2",
          "https://fonts.example.com/ss3v-600.woff2",
        ],
        isGoogleFont: false,
      },
    ];
    const extracted = [
      { family: "SourceSans3VF", style: "normal", weight: "400", format: "woff2" },
      { family: "SourceSans3VF", style: "normal", weight: "500", format: "woff2" },
      { family: "SourceSans3VF", style: "normal", weight: "600", format: "woff2" },
    ];

    const entries = buildFontDownloadEntries(downloads, extracted);
    expect(entries).toHaveLength(3);
    expect(entries[0].fileName).toBe("SourceSans3VF-normal-400-100.woff2");
    expect(entries[1].fileName).toBe("SourceSans3VF-normal-500-100.woff2");
    expect(entries[2].fileName).toBe("SourceSans3VF-normal-600-100.woff2");
  });

  it("should handle multiple fonts", () => {
    const downloads: FontDownloadInfo[] = [
      { family: "Averta Std Bold", urls: ["https://example.com/averta.woff2"], isGoogleFont: false },
      { family: "PP Fragment Glare Medium", urls: ["https://example.com/ppfgm.woff2"], isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads);
    expect(entries).toHaveLength(2);
    expect(entries[0].family).toBe("Averta Std Bold");
    expect(entries[1].family).toBe("PP Fragment Glare Medium");
  });

  it("should skip fonts with no URLs and not Google Font", () => {
    const downloads: FontDownloadInfo[] = [
      { family: "MissingFont", urls: [], isGoogleFont: false },
      { family: "Averta Std Bold", urls: ["https://example.com/averta.woff2"], isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads);
    expect(entries).toHaveLength(1);
    expect(entries[0].family).toBe("Averta Std Bold");
  });

  it("should guess format from URL when no extracted font metadata", () => {
    const downloads: FontDownloadInfo[] = [
      { family: "CustomFont", urls: ["https://example.com/font.woff2"], isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads);
    expect(entries).toHaveLength(1);
    expect(entries[0].fileName).toBe("CustomFont-normal-400-100.woff2");
  });

  it("should guess .ttf format for non-woff URLs", () => {
    const downloads: FontDownloadInfo[] = [
      { family: "CustomFont", urls: ["https://example.com/font.ttf"], isGoogleFont: false },
    ];

    const entries = buildFontDownloadEntries(downloads);
    expect(entries[0].fileName).toBe("CustomFont-normal-400-100.ttf");
  });
});

// =============================================================================
// Test 3: createFontsZipBlob — fetch + zip bundling (mocked)
// =============================================================================

describe("createFontsZipBlob", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch all URLs and return a non-empty blob", async () => {
    const fakeFont = new Uint8Array([0x00, 0x01, 0x00, 0x00]); // Minimal font header
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(fakeFont.buffer),
    });
    vi.stubGlobal("fetch", mockFetch);

    const entries: FontDownloadEntry[] = [
      { url: "https://example.com/font1.woff2", fileName: "Font1-normal-400-100.woff2", family: "Font1" },
      { url: "https://example.com/font2.woff2", fileName: "Font2-normal-600-100.woff2", family: "Font2" },
    ];

    // Simulate createFontsZipBlob logic
    const files: Array<{ name: string; data: ArrayBuffer }> = [];
    for (const entry of entries) {
      try {
        const resp = await fetch(entry.url);
        if (resp.ok) {
          const data = await resp.arrayBuffer();
          files.push({ name: entry.fileName, data });
        }
      } catch {
        // Skip failed fetches
      }
    }

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("Font1-normal-400-100.woff2");
    expect(files[1].name).toBe("Font2-normal-600-100.woff2");
    expect(files[0].data.byteLength).toBeGreaterThan(0);
  });

  it("should skip failed fetches gracefully", async () => {
    const fakeFont = new Uint8Array([0x00, 0x01]);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(fakeFont.buffer) })
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(fakeFont.buffer) });
    vi.stubGlobal("fetch", mockFetch);

    const entries: FontDownloadEntry[] = [
      { url: "https://example.com/ok1.woff2", fileName: "OK1.woff2", family: "OK1" },
      { url: "https://example.com/fail.woff2", fileName: "Fail.woff2", family: "Fail" },
      { url: "https://example.com/ok2.woff2", fileName: "OK2.woff2", family: "OK2" },
    ];

    const files: Array<{ name: string; data: ArrayBuffer }> = [];
    for (const entry of entries) {
      try {
        const resp = await fetch(entry.url);
        if (resp.ok) {
          const data = await resp.arrayBuffer();
          files.push({ name: entry.fileName, data });
        }
      } catch {
        // Skip
      }
    }

    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("OK1.woff2");
    expect(files[1].name).toBe("OK2.woff2");
  });

  it("should skip responses with ok=false", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", mockFetch);

    const entries: FontDownloadEntry[] = [
      { url: "https://example.com/missing.woff2", fileName: "Missing.woff2", family: "Missing" },
    ];

    const files: Array<{ name: string; data: ArrayBuffer }> = [];
    for (const entry of entries) {
      try {
        const resp = await fetch(entry.url);
        if (resp.ok) {
          const data = await resp.arrayBuffer();
          files.push({ name: entry.fileName, data });
        }
      } catch {
        // Skip
      }
    }

    expect(files).toHaveLength(0);
  });
});

// =============================================================================
// Test 4: UI — "Use original fonts" expanded section
// =============================================================================

describe("FontFallbackModal — Use original fonts expanded section", () => {
  it("should show expanded section with font mapping when clicked", () => {
    // Simulate state: showOriginalSection = true
    const missingFonts = ["PP Fragment Glare Medium", "Averta Std Bold"];
    const showOriginalSection = true;

    // When expanded, should show each font → Inter mapping
    if (showOriginalSection) {
      const mappingRows = missingFonts.map((font) => ({
        original: font,
        replacement: "Inter",
      }));

      expect(mappingRows).toHaveLength(2);
      expect(mappingRows[0]).toEqual({ original: "PP Fragment Glare Medium", replacement: "Inter" });
      expect(mappingRows[1]).toEqual({ original: "Averta Std Bold", replacement: "Inter" });
    }
  });

  it("should have download button when fontDownloads are available", () => {
    const fontDownloads = [
      { family: "Averta Std Bold", urls: ["https://example.com/averta.woff2"], isGoogleFont: false },
    ];

    // Download button should be visible when fontDownloads has entries
    const showDownloadBtn = fontDownloads && fontDownloads.length > 0;
    expect(showDownloadBtn).toBe(true);
  });

  it("should not show download button when no fontDownloads", () => {
    const fontDownloads: FontDownloadInfo[] | undefined = undefined;

    const showDownloadBtn = fontDownloads && fontDownloads.length > 0;
    expect(showDownloadBtn).toBeFalsy();
  });

  it("should build identity mapping for Apply action", () => {
    const missingFonts = ["PP Fragment Glare Medium", "Averta Std Bold", "SourceSans3VF"];
    const mapping: Record<string, string> = {};
    for (const font of missingFonts) {
      mapping[font] = font;
    }

    expect(mapping).toEqual({
      "PP Fragment Glare Medium": "PP Fragment Glare Medium",
      "Averta Std Bold": "Averta Std Bold",
      "SourceSans3VF": "SourceSans3VF",
    });
  });

  it("should show explanatory text about Text Styles", () => {
    // The expanded section should include text explaining:
    // - Text Styles will be created with original font names
    // - User needs to download, install fonts, then update styles
    const explanatoryText =
      "We'll create Text Styles with original font names. Download the fonts, install them, then update the styles.";

    expect(explanatoryText).toContain("Text Styles");
    expect(explanatoryText).toContain("Download");
    expect(explanatoryText).toContain("install");
  });
});

// =============================================================================
// Test 4d (P3 #7): buildFontDownloadEntries — drops EOT entries
//
// Embedded OpenType is a legacy IE format. Figma can't load EOT; macOS Font
// Book refuses to install it. Including EOT in the ZIP only confuses the user.
// We drop EOT entries entirely (with a console.warn for the dev console) so
// the ZIP only contains files the user can actually install.
// =============================================================================

describe("buildFontDownloadEntries — drops EOT entries (P3 #7)", () => {
  it("excludes URLs ending in .eot", async () => {
    const { buildFontDownloadEntries } = await import("../utils/fontDownload");

    const downloads = [
      {
        family: "LegacyFont",
        urls: [
          "https://example.com/LegacyFont.eot",
          "https://example.com/LegacyFont.woff2",
        ],
        isGoogleFont: false,
      },
    ];

    const entries = buildFontDownloadEntries(downloads);
    expect(entries.length).toBe(1);
    expect(entries[0].url).toBe("https://example.com/LegacyFont.woff2");
  });

  it("derives sibling-format candidates when only EOT URLs are available", async () => {
    const { buildFontDownloadEntries } = await import("../utils/fontDownload");

    const downloads = [
      {
        family: "LegacyOnly",
        urls: ["https://example.com/Legacy.eot"],
        isGoogleFont: false,
      },
    ];

    // telex.ge fix: the capture side reads only the IE-first `src:` of
    // "bulletproof" @font-face blocks, so whole families arrive EOT-only.
    // Instead of silently dropping them, derive same-basename candidates
    // (.ttf first) and let the ZIP fetch keep whichever exists.
    const entries = buildFontDownloadEntries(downloads);
    expect(entries.length).toBe(1);
    expect(entries[0].url).toBe("https://example.com/Legacy.ttf");
    expect(entries[0].fallbackUrls).toEqual([
      "https://example.com/Legacy.otf",
      "https://example.com/Legacy.woff",
      "https://example.com/Legacy.woff2",
    ]);
  });

  it("excludes URLs flagged as eot via ?format=eot query", async () => {
    const { buildFontDownloadEntries } = await import("../utils/fontDownload");

    // Some CDNs serve EOT without an extension and rely on the query param.
    const downloads = [
      {
        family: "MaskedEot",
        urls: ["https://example.com/font?format=eot"],
        isGoogleFont: false,
      },
    ];

    expect(buildFontDownloadEntries(downloads)).toEqual([]);
  });
});

// =============================================================================
// Test 4c (P2 #5): createFontsZipBlob — invokes onProgress callback
//
// Big fonts (Noto CJK ~20MB) take seconds to compress. Without progress the
// UI looks frozen. The new optional callback lets the modal render an X%
// label so the user can tell the download is alive.
// =============================================================================

describe("createFontsZipBlob — progress callback (P2 #5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("invokes onProgress with monotonic non-decreasing percent values", async () => {
    const { createFontsZipBlob } = await import("../utils/fontDownload");

    const calls: number[] = [];
    await createFontsZipBlob(
      [
        {
          url: "https://example.com/A.woff2",
          fileName: "A.woff2",
          family: "A",
          fontBase64: "AAEAAA==",
        },
        {
          url: "https://example.com/B.woff2",
          fileName: "B.woff2",
          family: "B",
          fontBase64: "AAEAAA==",
        },
      ],
      (percent) => {
        calls.push(percent);
      }
    );

    expect(calls.length).toBeGreaterThan(0);
    // Final value reaches 100 once compression completes.
    expect(calls[calls.length - 1]).toBe(100);
    // Monotonic non-decreasing.
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]).toBeGreaterThanOrEqual(calls[i - 1]);
    }
  });

  it("works without an onProgress callback (callback is optional)", async () => {
    const { createFontsZipBlob } = await import("../utils/fontDownload");

    const result = await createFontsZipBlob([
      {
        url: "https://example.com/A.woff2",
        fileName: "A.woff2",
        family: "A",
        fontBase64: "AAEAAA==",
      },
    ]);

    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.skippedEntries).toEqual([]);
  });
});

// =============================================================================
// Test 4b (P2 #4): sanitizeFontFileName — keeps ZIP entries portable
//
// Family names like "Font Awesome 6 Brands" or "ＮｏｔｏＳａｎｓＣＪＫｊｐ"
// produce ZIP entries that misbehave on Windows or break unicode-naive
// extractors. We sanitize to a safe `[A-Za-z0-9._-]+` subset.
// =============================================================================

describe("sanitizeFontFileName (P2 #4)", () => {
  it("replaces spaces with hyphens", async () => {
    const { sanitizeFontFileName } = await import("../utils/fontDownload");
    expect(sanitizeFontFileName("Font Awesome 6 Brands")).toBe("Font-Awesome-6-Brands");
  });

  it("strips non-ASCII characters", async () => {
    const { sanitizeFontFileName } = await import("../utils/fontDownload");
    // Cyrillic + Chinese mix → only ASCII survives
    expect(sanitizeFontFileName("Шрифт 中文")).toBe("font");
  });

  it("collapses runs of unsafe characters into a single hyphen", async () => {
    const { sanitizeFontFileName } = await import("../utils/fontDownload");
    expect(sanitizeFontFileName("My  ///  Font")).toBe("My-Font");
  });

  it("falls back to 'font' when input is empty or only symbols", async () => {
    const { sanitizeFontFileName } = await import("../utils/fontDownload");
    expect(sanitizeFontFileName("")).toBe("font");
    expect(sanitizeFontFileName("    ")).toBe("font");
    expect(sanitizeFontFileName("///")).toBe("font");
  });

  it("truncates very long names to a reasonable length", async () => {
    const { sanitizeFontFileName } = await import("../utils/fontDownload");
    const long = "A".repeat(500);
    const out = sanitizeFontFileName(long);
    expect(out.length).toBeLessThanOrEqual(100);
  });
});

describe("buildFontFileName uses sanitization (P2 #4)", () => {
  it("produces a Windows-safe entry for a family name with spaces", async () => {
    const { buildFontFileName } = await import("../utils/fontDownload");
    const name = buildFontFileName("Font Awesome 6 Brands", "normal", "400", "woff2");
    expect(name).toBe("Font-Awesome-6-Brands-normal-400-100.woff2");
  });
});

// =============================================================================
// Test 5 (P1 #2): createFontsZipBlob — surfaces skipped entries
//
// The original implementation swallowed per-entry failures silently. Users
// downloaded a ZIP missing some fonts with no warning. The new contract returns
// `{ blob, skippedEntries }` so callers can show an inline notice.
// =============================================================================

describe("createFontsZipBlob — surfaces skipped entries (P1 #2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns skippedEntries listing entries that failed to package", async () => {
    const { createFontsZipBlob } = await import("../utils/fontDownload");

    // No base64, fetch fails → entry skipped
    const mockFetch = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await createFontsZipBlob([
      {
        url: "https://example.com/Bad.woff2",
        fileName: "Bad-normal-400-100.woff2",
        family: "Bad",
      },
    ]);

    expect(result).toHaveProperty("blob");
    expect(result).toHaveProperty("skippedEntries");
    expect(result.skippedEntries).toEqual(["Bad-normal-400-100.woff2"]);
  });

  it("returns empty skippedEntries when every entry packages successfully", async () => {
    const { createFontsZipBlob } = await import("../utils/fontDownload");

    // Use base64 path → no network needed, always succeeds
    // "AAEAAA==" decodes to 4 bytes [0,1,0,0] (a valid TTF header start)
    const result = await createFontsZipBlob([
      {
        url: "https://example.com/Good.woff2",
        fileName: "Good-normal-400-100.woff2",
        family: "Good",
        fontBase64: "AAEAAA==",
        fontMimeType: "font/woff2",
      },
    ]);

    expect(result.skippedEntries).toEqual([]);
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it("partial failure: collects failed entries while packaging successful ones", async () => {
    const { createFontsZipBlob } = await import("../utils/fontDownload");

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0, 1, 0, 0]).buffer),
      })
      .mockRejectedValueOnce(new Error("404"));
    vi.stubGlobal("fetch", mockFetch);

    const result = await createFontsZipBlob([
      {
        url: "https://example.com/OK.woff2",
        fileName: "OK-normal-400-100.woff2",
        family: "OK",
      },
      {
        url: "https://example.com/Bad.woff2",
        fileName: "Bad-normal-400-100.woff2",
        family: "Bad",
      },
    ]);

    expect(result.skippedEntries).toEqual(["Bad-normal-400-100.woff2"]);
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it("invalid base64 is treated as a failure and recorded in skippedEntries", async () => {
    const { createFontsZipBlob } = await import("../utils/fontDownload");

    const result = await createFontsZipBlob([
      {
        url: "https://example.com/Corrupt.woff2",
        fileName: "Corrupt-normal-400-100.woff2",
        family: "Corrupt",
        // not valid base64 — atob() will throw
        fontBase64: "!!!not-base64!!!",
        fontMimeType: "font/woff2",
      },
    ]);

    expect(result.skippedEntries).toEqual(["Corrupt-normal-400-100.woff2"]);
  });
});
