/**
 * EOT-only faces must still reach the fonts ZIP.
 *
 * telex.ge regression: the capture side reads the IE-only FIRST
 * `src: url(*.eot)` of "bulletproof" @font-face blocks, so "glyphs",
 * "uni2-icons" and "BPG Nino Mtavruli" all arrived holding nothing but a
 * dead EOT URL. The old pipeline dropped EOT outright → those families
 * silently vanished from fonts.zip (the user got 1 of 3 fonts).
 *
 * Fix under test: sibling-format candidates derived from the EOT basename
 * (same path, extension swapped), fetched in installability order with
 * per-candidate fallback.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  deriveSiblingUrlsFromEot,
  buildFontDownloads,
  buildFontDownloadEntries,
  createFontsZipBlob,
} from "../utils/fontDownload";

const EOT_URL =
  "https://telex.ge/design/themes/abt__unitheme2/media/custom_fonts/bpg-nino-mtavruli-webfont.eot?1765288504";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deriveSiblingUrlsFromEot", () => {
  it("derives ttf/otf/woff/woff2 siblings preserving the query string", () => {
    expect(deriveSiblingUrlsFromEot(EOT_URL)).toEqual([
      "https://telex.ge/design/themes/abt__unitheme2/media/custom_fonts/bpg-nino-mtavruli-webfont.ttf?1765288504",
      "https://telex.ge/design/themes/abt__unitheme2/media/custom_fonts/bpg-nino-mtavruli-webfont.otf?1765288504",
      "https://telex.ge/design/themes/abt__unitheme2/media/custom_fonts/bpg-nino-mtavruli-webfont.woff?1765288504",
      "https://telex.ge/design/themes/abt__unitheme2/media/custom_fonts/bpg-nino-mtavruli-webfont.woff2?1765288504",
    ]);
  });

  it("handles bare and fragment URLs; rejects non-eot inputs", () => {
    expect(deriveSiblingUrlsFromEot("https://x.ge/f/glyphs.eot")[0]).toBe(
      "https://x.ge/f/glyphs.ttf",
    );
    expect(deriveSiblingUrlsFromEot("https://x.ge/f/glyphs.eot#iefix")[0]).toBe(
      "https://x.ge/f/glyphs.ttf#iefix",
    );
    expect(deriveSiblingUrlsFromEot("https://x.ge/f/glyphs.woff")).toEqual([]);
    expect(deriveSiblingUrlsFromEot("https://x.ge/f/loader?format=eot")).toEqual([]);
  });
});

describe("EOT-only face → ZIP entry with derived candidates", () => {
  const extractedFonts = [
    {
      family: "BPG Nino Mtavruli",
      style: "normal",
      weight: "400",
      src: `url(${EOT_URL})`,
    },
  ];

  function entriesForTelexFace() {
    const downloads = buildFontDownloads(["BPG Nino Mtavruli"], extractedFonts);
    expect(downloads).toBeDefined();
    return buildFontDownloadEntries(downloads!, extractedFonts as never);
  }

  it("builds an entry (previously the family was silently dropped)", () => {
    const entries = entriesForTelexFace();
    expect(entries).toHaveLength(1);
    expect(entries[0].family).toBe("BPG Nino Mtavruli");
    // Primary candidate is the most installable derived sibling — TTF.
    expect(entries[0].url).toMatch(/\.ttf\?1765288504$/);
    expect(entries[0].fallbackUrls).toEqual([
      expect.stringMatching(/\.otf\?1765288504$/),
      expect.stringMatching(/\.woff\?1765288504$/),
      expect.stringMatching(/\.woff2\?1765288504$/),
    ]);
    expect(entries[0].fileName.endsWith(".ttf")).toBe(true);
  });

  it("never ships the EOT itself", () => {
    const entries = entriesForTelexFace();
    for (const e of entries) {
      expect(e.url).not.toMatch(/\.eot/i);
      for (const f of e.fallbackUrls ?? []) expect(f).not.toMatch(/\.eot/i);
    }
  });

  it("zips the first candidate that exists (ttf 404 → woff 200, renamed truthfully)", async () => {
    // Non-WOFF junk bytes so repackageForInstall leaves them alone.
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes(".woff") && !url.includes(".woff2")) {
        return {
          ok: true,
          arrayBuffer: async () => bytes.buffer,
        } as unknown as Response;
      }
      return { ok: false } as Response;
    });
    vi.stubGlobal("fetch", mockFetch);

    const entries = entriesForTelexFace();
    const { blob, skippedEntries } = await createFontsZipBlob(entries);
    expect(skippedEntries).toEqual([]);
    expect(blob.size).toBeGreaterThan(0);
    // ttf and otf tried first, then the working woff.
    expect(mockFetch.mock.calls.map((c) => String(c[0]))).toEqual([
      expect.stringMatching(/\.ttf/),
      expect.stringMatching(/\.otf/),
      expect.stringMatching(/\.woff\?/),
    ]);

    // The ZIP entry name must match the bytes we actually shipped (.woff).
    const JSZip = (await import("jszip")).default;
    const opened = await JSZip.loadAsync(blob);
    const names = Object.keys(opened.files);
    expect(names).toHaveLength(1);
    expect(names[0].endsWith(".woff")).toBe(true);
  });

  it("reports the face as skipped when no candidate exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    const entries = entriesForTelexFace();
    const { skippedEntries } = await createFontsZipBlob(entries);
    expect(skippedEntries).toHaveLength(1);
  });
});

describe("faces with real (non-EOT) URLs keep existing behavior", () => {
  it("prefers the declared TTF and records the rest as fallbacks", () => {
    const extracted = [
      {
        family: "glyphs",
        style: "normal",
        weight: "400",
        src:
          "url(https://x.ge/f/glyphs.eot?q#iefix) format('embedded-opentype'), " +
          "url(https://x.ge/f/glyphs.woff?q) format('woff'), " +
          "url(https://x.ge/f/glyphs.ttf?q) format('truetype')",
      },
    ];
    const downloads = buildFontDownloads(["glyphs"], extracted);
    const entries = buildFontDownloadEntries(downloads!, extracted as never);
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe("https://x.ge/f/glyphs.ttf?q");
    expect(entries[0].fallbackUrls).toEqual(["https://x.ge/f/glyphs.woff?q"]);
  });
});
