/**
 * End-to-end: a `.w2w` capture's asset map must become an INSTALLABLE fonts.zip.
 *
 * Every hop of this chain is unit-tested on its own, but nothing exercised them
 * together — which is exactly how iwm.org.uk shipped a 22-byte (zero-entry)
 * fonts.zip while the font bytes sat in the capture the whole time. The four
 * calls below are the production sequence, in order:
 *
 *   AreaSelection.tsx      enrichFontsFromAssets(capture.fonts, capturedData.assets)
 *   AreaSelection.tsx      buildFontDownloads(missingFonts, extractedFonts, missingCuts)
 *   FontFallbackModal.tsx  buildFontDownloadEntries(fontDownloads, extractedFonts)
 *   FontFallbackModal.tsx  createFontsZipBlob(entries)
 *
 * The input mirrors the real capture: iwm.org.uk declares three faces, serves
 * each one as WOFF2 only, and its `src` arrives with the `url()` wrapper
 * already stripped by the extension — the shape that used to yield zero URLs.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import JSZip from "jszip";
import {
  enrichFontsFromAssets,
  buildFontDownloads,
  buildFontDownloadEntries,
  createFontsZipBlob,
} from "../utils/fontDownload";
import { ROBOTO_SUBSET_WOFF2_BASE64 } from "./fixtures/roboto-subset.woff2.base64";

const BASE = "https://www.iwm.org.uk/themes/custom/iwm_theme/fonts";
const REGULAR_URL = `${BASE}/interface_standard_regular/if_std_rg-webfont.woff2`;
const BOLD_URL = `${BASE}/interface_standard_bold/if_std_bd-webfont.woff2`;
const ITALIC_URL = `${BASE}/interface_hinted_italic/hinted-InterFace-Italic.woff2`;

/** The three @font-face entries exactly as they appear in the decoded `.w2w`:
 *  no `url()` wrapper, `format("woff2")` still trailing the bare URL. */
const CAPTURED_FONTS = [
  {
    fontFamily: "Interface",
    fontWeight: "400",
    fontStyle: "normal",
    platformFontFamily: "Interface",
    src: `${REGULAR_URL} format("woff2")`,
  },
  {
    fontFamily: "Interface",
    fontWeight: "700",
    fontStyle: "normal",
    platformFontFamily: "Interface",
    src: `${BOLD_URL} format("woff2")`,
  },
  {
    fontFamily: "Interface",
    fontWeight: "400",
    fontStyle: "italic",
    platformFontFamily: "Interface",
    src: `${ITALIC_URL} format("woff2")`,
  },
];

/** A real Brotli-compressed WOFF2 (940 bytes) standing in for each face — the
 *  point is the plumbing, and synthetic headers would not prove the decode. */
const woff2Asset = () => ({
  base64Encoded: true,
  content: ROBOTO_SUBSET_WOFF2_BASE64,
  mimeType: "font/woff2",
});

const CAPTURED_ASSETS: Record<
  string,
  { base64Encoded: boolean; content: string; mimeType: string }
> = {
  [REGULAR_URL]: woff2Asset(),
  [BOLD_URL]: woff2Asset(),
  [ITALIC_URL]: woff2Asset(),
};

/** Run the production chain and hand back the ZIP's real contents. */
async function buildZipFromCapture(
  fonts: unknown[],
  assets: Record<string, { base64Encoded: boolean; content: string; mimeType: string }>,
) {
  const extractedFonts = await enrichFontsFromAssets(fonts, assets);
  const downloads = buildFontDownloads(["Interface"], extractedFonts);
  const entries = buildFontDownloadEntries(downloads ?? [], extractedFonts as never[]);
  const { blob, skippedEntries } = await createFontsZipBlob(entries);

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const files = await Promise.all(
    Object.keys(zip.files).map(async (name) => ({
      name,
      bytes: await zip.files[name].async("uint8array"),
    })),
  );
  return { extractedFonts, downloads, entries, blob, skippedEntries, files };
}

/** SFNT flavor tag: 0x00010000 (TrueType) or "OTTO" (CFF). Anything else — a
 *  `wOF2`/`wOFF` wrapper above all — is a file no OS will install. */
function sfntFlavor(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
}

/** An empty ZIP is 22 bytes (end-of-central-directory record only). */
const EMPTY_ZIP_SIZE = 22;

describe("capture assets -> fonts.zip (full chain)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("packages every declared face as an installable SFNT", async () => {
    const { skippedEntries, blob, files } = await buildZipFromCapture(
      CAPTURED_FONTS,
      CAPTURED_ASSETS,
    );

    expect(skippedEntries).toEqual([]);
    expect(blob.size).toBeGreaterThan(EMPTY_ZIP_SIZE);
    // One file per face. These three share a name table (see the fixture note),
    // which is the Google Fonts shape — one file per unicode-range subset under
    // an identical family, weight and style. A ZIP keyed on name alone drops
    // all but one of them and still reports nothing skipped.
    expect(files).toHaveLength(CAPTURED_FONTS.length);
    expect(new Set(files.map((f) => f.name)).size).toBe(CAPTURED_FONTS.length);

    for (const file of files) {
      expect(file.name).toMatch(/\.(ttf|otf)$/);
      expect([0x00010000, 0x4f54544f]).toContain(sfntFlavor(file.bytes));
      expect(file.bytes.length).toBeGreaterThan(0);
    }
  });

  it("resolves the real family from the bytes, not the CSS name", async () => {
    const { extractedFonts } = await buildZipFromCapture(CAPTURED_FONTS, CAPTURED_ASSETS);

    const faces = extractedFonts as Array<{
      fontBase64?: string;
      realFamily?: string;
      fontMimeType?: string;
    }>;

    for (const face of faces) {
      expect(face.fontBase64).toBeTruthy();
      // WOFF2 is unwrapped during enrichment, so everything downstream — the
      // ZIP entry and the name lookup alike — works on SFNT bytes.
      expect(face.fontMimeType).toMatch(/font\/(ttf|otf)/);
      expect(face.realFamily).toBeTruthy();
      // Read out of the `name` table, so it is the installed identity rather
      // than the family the CSS asked for.
      expect(face.realFamily).not.toBe("Interface");
    }
    // One font file, one identity: all three faces agree.
    expect(new Set(faces.map((f) => f.realFamily)).size).toBe(1);
  });

  it("reports the faces it holds no bytes for instead of shipping a silent gap", async () => {
    // The Figma iframe cannot reach a font server: `networkAccess` allows only
    // our own API, and font CDNs send no `access-control-allow-origin`. Stand
    // that wall up so the fallback path is exercised, not the real network.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("blocked by CORS")));

    // Only the regular face was cached; the browser fetches one format per
    // face, and a face nothing served must be named, not quietly dropped.
    const { files, entries, skippedEntries } = await buildZipFromCapture(CAPTURED_FONTS, {
      [REGULAR_URL]: woff2Asset(),
    });

    // The two uncached faces have nowhere left to go — they must surface as
    // skipped, never as an empty ZIP and never as a silent absence.
    expect(entries.length).toBe(CAPTURED_FONTS.length);
    expect(files.length + skippedEntries.length).toBe(CAPTURED_FONTS.length);
    expect(files.length).toBeGreaterThan(0);
    expect(sfntFlavor(files[0].bytes)).toBe(0x00010000);
  });
});
