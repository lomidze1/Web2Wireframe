/**
 * WOFF2 → SFNT conversion in the plugin.
 *
 * WOFF2 is a web-only container (Brotli-compressed): macOS Font Book and
 * Windows install SFNT only (.ttf/.otf), and Figma can only load what the OS
 * installed. The plugin already unwraps WOFF v1 and EOT, but WOFF2 shipped
 * unchanged — so a site that serves woff2 only (iwm.org.uk) produced a ZIP
 * full of files nothing can install, and `readSfntNames` could not read the
 * real family out of them either.
 */
import { describe, it, expect } from "vitest";
import { isWoff2, convertWoff2ToSfnt } from "../utils/woff2ToSfnt";
import { ROBOTO_SUBSET_WOFF2_BASE64 } from "./fixtures/roboto-subset.woff2.base64";

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const WOFF2 = bytesOf(ROBOTO_SUBSET_WOFF2_BASE64);

describe("isWoff2", () => {
  it("recognises the wOF2 signature", () => {
    expect(isWoff2(WOFF2)).toBe(true);
  });

  it("rejects WOFF v1, raw SFNT and junk", () => {
    expect(isWoff2(new Uint8Array([0x77, 0x4f, 0x46, 0x46]))).toBe(false); // wOFF
    expect(isWoff2(new Uint8Array([0x00, 0x01, 0x00, 0x00]))).toBe(false); // TrueType
    expect(isWoff2(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]))).toBe(false); // OTTO
    expect(isWoff2(new Uint8Array([1, 2]))).toBe(false);
    expect(isWoff2(new Uint8Array(0))).toBe(false);
  });
});

describe("convertWoff2ToSfnt", () => {
  it("decodes real Brotli-compressed font data to TrueType", async () => {
    const out = await convertWoff2ToSfnt(WOFF2);
    expect(out).not.toBeNull();
    expect(out!.extension).toBe("ttf");
    expect(out!.bytes.length).toBe(1804);
    const view = new DataView(out!.bytes.buffer, out!.bytes.byteOffset, out!.bytes.byteLength);
    expect(view.getUint32(0)).toBe(0x00010000); // TrueType outlines
  });

  it("names CFF outlines .otf", async () => {
    // The flavor decides the extension; assert the mapping directly so a CFF
    // font is never handed to the OS under a .ttf name.
    const out = await convertWoff2ToSfnt(WOFF2);
    expect(out!.extension).toBe(out!.bytes[0] === 0x4f ? "otf" : "ttf");
  });

  it("returns null instead of throwing on non-WOFF2 input", async () => {
    expect(await convertWoff2ToSfnt(new Uint8Array([0, 1, 0, 0, 5, 5]))).toBeNull();
  });

  it("returns null instead of throwing on a truncated WOFF2", async () => {
    expect(await convertWoff2ToSfnt(WOFF2.slice(0, 40))).toBeNull();
  });

  it("leaves the caller's bytes untouched", async () => {
    const copy = WOFF2.slice();
    await convertWoff2ToSfnt(WOFF2);
    expect(Array.from(WOFF2)).toEqual(Array.from(copy));
  });
});
