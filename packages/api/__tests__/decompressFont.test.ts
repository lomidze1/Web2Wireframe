/**
 * normalizeFontPayload Tests — WOFF2 → TTF/OTF decompression
 *
 * TDD: tests written before implementation.
 *
 * `normalizeFontPayload` inspects the SFNT magic of an incoming font
 * buffer and returns:
 *   - the byte payload Font Book / Windows actually accept (TTF/OTF when we
 *     can decompress, original buffer otherwise)
 *   - the matching MIME type
 *   - a `format` discriminator the plugin maps to the ZIP entry's file
 *     extension
 *
 * Real font fixtures are not needed: the function only reads the first 4
 * bytes for the magic and otherwise treats the body as opaque. We mock
 * `wawoff2.decompress` so tests stay deterministic and fast.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock wawoff2 BEFORE the helper imports it — vi.mock is hoisted.
const mockDecompress = vi.fn();
vi.mock("wawoff2", () => ({
  default: { decompress: (...args: unknown[]) => mockDecompress(...args) },
  decompress: (...args: unknown[]) => mockDecompress(...args),
}));

import { normalizeFontPayload } from "../src/lib/fonts/decompressFont.js";

// ---------------------------------------------------------------------------
// Magic header helpers
// ---------------------------------------------------------------------------

const MAGIC_TTF = Buffer.from([0x00, 0x01, 0x00, 0x00]);   // SFNT v1 (TrueType)
const MAGIC_TTF_TRUE = Buffer.from("true");                 // mac TrueType variant
const MAGIC_OTF = Buffer.from("OTTO");                      // OpenType / CFF
const MAGIC_WOFF2 = Buffer.from("wOF2");                    // WOFF2 wrapper
const MAGIC_WOFF1 = Buffer.from("wOFF");                    // WOFF1 wrapper

/** Build a font-like buffer with a chosen 4-byte magic followed by padding. */
function withMagic(magic: Buffer, tailBytes: number = 64): Buffer {
  return Buffer.concat([magic, Buffer.alloc(tailBytes, 0xab)]);
}

beforeEach(() => {
  mockDecompress.mockReset();
});

describe("normalizeFontPayload", () => {
  it("passes TTF (0x00010000) through unchanged with truetype format", async () => {
    const input = withMagic(MAGIC_TTF);

    const result = await normalizeFontPayload(input);

    expect(result.format).toBe("truetype");
    expect(result.mimeType).toBe("font/ttf");
    expect(result.buffer.equals(input)).toBe(true);
    expect(mockDecompress).not.toHaveBeenCalled();
  });

  it("recognises mac TTF magic 'true' as truetype", async () => {
    const input = withMagic(MAGIC_TTF_TRUE);

    const result = await normalizeFontPayload(input);

    expect(result.format).toBe("truetype");
    expect(result.mimeType).toBe("font/ttf");
    expect(mockDecompress).not.toHaveBeenCalled();
  });

  it("passes OTF ('OTTO') through unchanged with opentype format", async () => {
    const input = withMagic(MAGIC_OTF);

    const result = await normalizeFontPayload(input);

    expect(result.format).toBe("opentype");
    expect(result.mimeType).toBe("font/otf");
    expect(result.buffer.equals(input)).toBe(true);
    expect(mockDecompress).not.toHaveBeenCalled();
  });

  it("decompresses WOFF2 and reports TTF flavor when payload starts with TTF magic", async () => {
    const woff2Input = withMagic(MAGIC_WOFF2);
    const decompressedTTF = withMagic(MAGIC_TTF, 256);
    mockDecompress.mockResolvedValueOnce(new Uint8Array(decompressedTTF));

    const result = await normalizeFontPayload(woff2Input);

    expect(mockDecompress).toHaveBeenCalledTimes(1);
    expect(result.format).toBe("truetype");
    expect(result.mimeType).toBe("font/ttf");
    expect(result.buffer.equals(decompressedTTF)).toBe(true);
  });

  it("decompresses WOFF2 and reports OTF flavor when payload starts with 'OTTO'", async () => {
    const woff2Input = withMagic(MAGIC_WOFF2);
    const decompressedOTF = withMagic(MAGIC_OTF, 256);
    mockDecompress.mockResolvedValueOnce(new Uint8Array(decompressedOTF));

    const result = await normalizeFontPayload(woff2Input);

    expect(result.format).toBe("opentype");
    expect(result.mimeType).toBe("font/otf");
    expect(result.buffer.equals(decompressedOTF)).toBe(true);
  });

  it("falls back to original WOFF2 buffer + format when decompression throws", async () => {
    const woff2Input = withMagic(MAGIC_WOFF2);
    mockDecompress.mockRejectedValueOnce(new Error("invalid stream"));

    const result = await normalizeFontPayload(woff2Input);

    expect(result.format).toBe("woff2");
    expect(result.mimeType).toBe("font/woff2");
    expect(result.buffer.equals(woff2Input)).toBe(true);
  });

  it("passes WOFF1 through unchanged (no decompression attempted)", async () => {
    const input = withMagic(MAGIC_WOFF1);

    const result = await normalizeFontPayload(input);

    expect(result.format).toBe("woff");
    expect(result.mimeType).toBe("font/woff");
    expect(result.buffer.equals(input)).toBe(true);
    expect(mockDecompress).not.toHaveBeenCalled();
  });

  it("returns format 'unknown' for unrecognised magic and uses URL hint for mime if provided", async () => {
    const input = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);

    const result = await normalizeFontPayload(input, "https://example.com/x.ttf");

    expect(result.format).toBe("unknown");
    // URL hint says .ttf so mime falls back accordingly — best guess wins.
    expect(result.mimeType).toBe("font/ttf");
    expect(result.buffer.equals(input)).toBe(true);
  });

  it("returns format 'unknown' with octet-stream mime when no URL hint and unrecognised magic", async () => {
    const input = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    const result = await normalizeFontPayload(input);

    expect(result.format).toBe("unknown");
    expect(result.mimeType).toBe("application/octet-stream");
  });

  it("handles buffers shorter than 4 bytes gracefully (treats as unknown)", async () => {
    const input = Buffer.from([0x00, 0x01]);

    const result = await normalizeFontPayload(input);

    expect(result.format).toBe("unknown");
    expect(result.buffer.equals(input)).toBe(true);
  });

  it("handles WOFF2 → unknown-flavor decompression result by reporting unknown", async () => {
    // Edge case: wawoff2 returns bytes that don't match a known SFNT magic.
    // Better to report this honestly than to lie about being a TTF.
    const woff2Input = withMagic(MAGIC_WOFF2);
    const garbage = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x00]);
    mockDecompress.mockResolvedValueOnce(new Uint8Array(garbage));

    const result = await normalizeFontPayload(woff2Input);

    expect(result.format).toBe("unknown");
    expect(result.buffer.equals(garbage)).toBe(true);
  });
});
