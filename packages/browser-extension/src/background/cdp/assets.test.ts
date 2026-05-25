import { describe, it, expect } from "vitest";
import {
  needsFigmaConversion,
  FIGMA_NATIVE_SUPPORTED_MIMES,
  mergeAssetStats,
  type AssetExtractionStats,
} from "./assets";

const emptyStats = (): AssetExtractionStats => ({
  oversizedCount: 0,
  truncatedByTotalSize: false,
  unsupportedFormats: {},
  resourceMapMisses: 0,
});

// ============================================================================
// needsFigmaConversion — pure MIME classifier
//
// Figma's `figma.createImage()` accepts PNG, JPEG, and GIF directly. Any
// other image MIME must go through a converter (browser's createImageBitmap
// → OffscreenCanvas → PNG) before Figma will render it. WebP and AVIF DO
// decode in modern Chrome via that pipeline; HEIC and TIFF do NOT (the
// browser refuses createImageBitmap), so they're hard-skip in practice
// even though needsFigmaConversion still returns `true` for them — the
// downstream converter rejects them.
// ============================================================================

describe("needsFigmaConversion", () => {
  it("returns false for image/png (Figma-native)", () => {
    expect(needsFigmaConversion("image/png")).toBe(false);
  });

  it("returns false for image/jpeg (Figma-native)", () => {
    expect(needsFigmaConversion("image/jpeg")).toBe(false);
  });

  it("returns false for image/gif (Figma-native)", () => {
    expect(needsFigmaConversion("image/gif")).toBe(false);
  });

  it("returns false for image/svg+xml (handled separately, not via createImage)", () => {
    expect(needsFigmaConversion("image/svg+xml")).toBe(false);
  });

  it("returns true for image/webp (Chrome can convert via createImageBitmap)", () => {
    expect(needsFigmaConversion("image/webp")).toBe(true);
  });

  it("returns true for image/avif (Chrome can convert via createImageBitmap)", () => {
    expect(needsFigmaConversion("image/avif")).toBe(true);
  });

  it("returns true for image/heic (will fail in converter — Chrome refuses)", () => {
    expect(needsFigmaConversion("image/heic")).toBe(true);
  });

  it("returns true for image/tiff (will fail in converter — Chrome refuses)", () => {
    expect(needsFigmaConversion("image/tiff")).toBe(true);
  });

  it("returns false for non-image MIME types (text/html, application/json, etc.)", () => {
    expect(needsFigmaConversion("text/html")).toBe(false);
    expect(needsFigmaConversion("application/json")).toBe(false);
    expect(needsFigmaConversion("")).toBe(false);
  });

  it("FIGMA_NATIVE_SUPPORTED_MIMES exposes the exact accept-list", () => {
    expect(FIGMA_NATIVE_SUPPORTED_MIMES.has("image/png")).toBe(true);
    expect(FIGMA_NATIVE_SUPPORTED_MIMES.has("image/jpeg")).toBe(true);
    expect(FIGMA_NATIVE_SUPPORTED_MIMES.has("image/gif")).toBe(true);
    expect(FIGMA_NATIVE_SUPPORTED_MIMES.has("image/webp")).toBe(false);
    expect(FIGMA_NATIVE_SUPPORTED_MIMES.has("image/tiff")).toBe(false);
  });
});

// ============================================================================
// mergeAssetStats — aggregates per-frame stats into popup-facing shape
// ============================================================================

describe("mergeAssetStats", () => {
  it("returns zeros for an empty input list", () => {
    const result = mergeAssetStats([]);
    expect(result).toEqual({
      skippedImageCount: 0,
      unsupportedFormats: {},
      oversizedImageCount: 0,
      payloadTruncated: false,
      resourceMapMisses: 0,
    });
  });

  it("returns zeros when every frame is empty", () => {
    expect(mergeAssetStats([emptyStats(), emptyStats()])).toEqual({
      skippedImageCount: 0,
      unsupportedFormats: {},
      oversizedImageCount: 0,
      payloadTruncated: false,
      resourceMapMisses: 0,
    });
  });

  it("sums oversizedCount across frames", () => {
    const frames: AssetExtractionStats[] = [
      { ...emptyStats(), oversizedCount: 2 },
      { ...emptyStats(), oversizedCount: 3 },
    ];
    const result = mergeAssetStats(frames);
    expect(result.oversizedImageCount).toBe(5);
    expect(result.skippedImageCount).toBe(5);
  });

  it("sums resourceMapMisses across frames", () => {
    const frames: AssetExtractionStats[] = [
      { ...emptyStats(), resourceMapMisses: 1 },
      { ...emptyStats(), resourceMapMisses: 4 },
    ];
    const result = mergeAssetStats(frames);
    expect(result.resourceMapMisses).toBe(5);
    expect(result.skippedImageCount).toBe(5);
  });

  it("merges unsupportedFormats per-MIME across frames", () => {
    const frames: AssetExtractionStats[] = [
      {
        ...emptyStats(),
        unsupportedFormats: { "image/heic": 2, "image/tiff": 1 },
      },
      {
        ...emptyStats(),
        unsupportedFormats: { "image/heic": 1 },
      },
    ];
    const result = mergeAssetStats(frames);
    expect(result.unsupportedFormats).toEqual({
      "image/heic": 3,
      "image/tiff": 1,
    });
    expect(result.skippedImageCount).toBe(4);
  });

  it("ORs payloadTruncated across frames (sticky-true)", () => {
    expect(
      mergeAssetStats([
        { ...emptyStats(), truncatedByTotalSize: true },
        emptyStats(),
      ]).payloadTruncated,
    ).toBe(true);

    expect(
      mergeAssetStats([emptyStats(), emptyStats()]).payloadTruncated,
    ).toBe(false);
  });

  it("skippedImageCount sums oversized + misses + all unsupportedFormats", () => {
    const frames: AssetExtractionStats[] = [
      {
        oversizedCount: 1,
        truncatedByTotalSize: false,
        unsupportedFormats: { "image/heic": 2 },
        resourceMapMisses: 3,
      },
      {
        oversizedCount: 1,
        truncatedByTotalSize: true,
        unsupportedFormats: { "image/tiff": 1 },
        resourceMapMisses: 0,
      },
    ];
    const result = mergeAssetStats(frames);
    expect(result.skippedImageCount).toBe(1 + 2 + 3 + 1 + 1);
    expect(result.payloadTruncated).toBe(true);
  });
});
