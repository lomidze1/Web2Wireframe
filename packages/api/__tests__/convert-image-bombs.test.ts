import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertToFigmaFormat } from "../src/lib/cdp/convertImage.js";

// Silence the per-asset console.warn from convertImage during these tests.
const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {
  /* noop */
});

beforeEach(() => {
  consoleSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// M-6 — sharp decompression-bomb defense
// ============================================================================

describe("convertToFigmaFormat — M-6 size cap", () => {
  it("returns null for compressed input larger than 5MB cap", async () => {
    // 6MB of zeros → base64-encoded → fed to converter.
    // Even though sharp would reject this as not-an-image, the size check
    // runs FIRST so we never hit the sharp call at all.
    const buf = Buffer.alloc(6 * 1024 * 1024, 0);
    const result = await convertToFigmaFormat(
      buf.toString("base64"),
      "image/webp",
    );
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringMatching(/exceeds .* byte cap/),
    );
  });

  it("returns null gracefully on invalid image data (sharp throws)", async () => {
    // A small but non-image buffer — sharp throws, the catch returns null.
    const buf = Buffer.from("not-an-image");
    const result = await convertToFigmaFormat(
      buf.toString("base64"),
      "image/webp",
    );
    expect(result).toBeNull();
  });

  it("accepts a 1-pixel WebP (under both size and pixel caps)", async () => {
    // Construct a tiny valid WebP via sharp itself (round-trip).
    const sharp = (await import("sharp")).default;
    const tinyPng = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .webp()
      .toBuffer();

    const result = await convertToFigmaFormat(
      tinyPng.toString("base64"),
      "image/webp",
    );
    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe("image/jpeg");
    expect(typeof result?.base64).toBe("string");
    expect(result?.base64.length).toBeGreaterThan(0);
  });
});
