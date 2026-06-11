import { describe, it, expect, vi, afterEach } from "vitest";
import { encode as msgpackEncode } from "@msgpack/msgpack";
import { encodeW2W, decodeW2W, detectFormat } from "../w2w-codec";

/**
 * Simulate the Figma desktop plugin iframe: an opaque-origin, non-secure
 * context where `crypto.subtle` and CompressionStream/DecompressionStream are
 * undefined, while `crypto.getRandomValues` still works. Forces the codec onto
 * its pure-JS AES-GCM + fflate fallback.
 */
function disableWebApis(): void {
  const realCrypto = globalThis.crypto;
  vi.stubGlobal("crypto", {
    getRandomValues: (a: Uint8Array) => realCrypto.getRandomValues(a),
    subtle: undefined,
  });
  vi.stubGlobal("CompressionStream", undefined);
  vi.stubGlobal("DecompressionStream", undefined);
}

/** A representative capture-shaped object exercising nesting, arrays, unicode. */
function sampleCapture(): Record<string, unknown> {
  return {
    url: "https://example.com",
    title: "Example — ünïcode ✓",
    frames: [
      {
        width: 1440,
        viewport: { width: 1440, height: 900 },
        frame: {
          tag: "div",
          rect: { x: 0, y: 0, w: 1440, h: 2400 },
          children: [
            { tag: "h1", text: "Hello", styles: { color: "#111", fontSize: 32 } },
            { tag: "p", text: "Body text", styles: { lineHeight: 1.5 } },
          ],
        },
      },
    ],
    fonts: [{ family: "Inter", weight: 400 }],
    cssVariables: [{ name: "--brand", value: "#0af" }],
  };
}

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const ab = new Uint8Array(data); // ArrayBuffer-backed
  const stream = new Response(ab).body!.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("w2w-codec", () => {
  it("round-trips an object through encode → decode", async () => {
    const input = sampleCapture();
    const bytes = await encodeW2W(input);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const out = await decodeW2W(bytes);
    expect(out).toEqual(input);
  });

  it("is detected as 'w2w' via the keyed tag (no constant magic banner)", async () => {
    const bytes = await encodeW2W(sampleCapture());
    expect(detectFormat(bytes)).toBe("w2w");
  });

  it("carries NO fixed prefix — two captures share no constant header bytes", async () => {
    const a = await encodeW2W(sampleCapture());
    const b = await encodeW2W(sampleCapture());
    // The whole keyed header (iv + tag, first 16 bytes) varies between files.
    const sharedPrefix = Array.from(a.slice(0, 16)).every((byte, i) => byte === b[i]);
    expect(sharedPrefix).toBe(false);
    // Specifically, no readable "W2W2" ASCII banner.
    expect(new TextDecoder().decode(a.slice(0, 8))).not.toContain("W2W2");
  });

  it("produces opaque output — not the readable JSON/msgpack payload", async () => {
    const input = sampleCapture();
    const bytes = await encodeW2W(input);
    const asText = new TextDecoder().decode(bytes);
    // None of the plaintext field values survive in the container body.
    expect(asText).not.toContain("example.com");
    expect(asText).not.toContain("Inter");
  });

  it("uses a random IV — two encodes of the same input differ", async () => {
    const input = sampleCapture();
    const a = await encodeW2W(input);
    const b = await encodeW2W(input);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    // …yet both decode back to the same object.
    expect(await decodeW2W(a)).toEqual(await decodeW2W(b));
  });

  it("rejects a tampered container (AES-GCM auth)", async () => {
    const bytes = await encodeW2W(sampleCapture());
    const tampered = new Uint8Array(bytes);
    // Flip a byte inside the encrypted body (past the 17-byte iv+tag+ver header).
    tampered[30] ^= 0xff;
    await expect(decodeW2W(tampered)).rejects.toThrow();
  });

  it("rejects an unknown / non-W2W container", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(decodeW2W(garbage)).rejects.toThrow();
  });

  it("rejects a truncated legacy-v2 container that passes magic+version", async () => {
    // Valid "W2W2" magic + version 0x02, but no room for IV + ciphertext + tag.
    const truncated = new Uint8Array([0x57, 0x32, 0x57, 0x32, 0x02, 0x00, 0x00]);
    expect(detectFormat(truncated)).toBe("w2w-v2");
    await expect(decodeW2W(truncated)).rejects.toThrow(/truncated/i);
  });

  describe("detectFormat", () => {
    it("classifies legacy gzip+msgpack blobs as 'gzip-legacy'", async () => {
      const legacy = await gzip(msgpackEncode(sampleCapture()));
      expect(legacy[0]).toBe(0x1f);
      expect(legacy[1]).toBe(0x8b);
      expect(detectFormat(legacy)).toBe("gzip-legacy");
    });

    it("classifies plain JSON text as 'json'", () => {
      const json = new TextEncoder().encode('{"url":"https://example.com"}');
      expect(detectFormat(json)).toBe("json");
    });

    it("classifies JSON with leading whitespace as 'json'", () => {
      const json = new TextEncoder().encode('\n  {"a":1}');
      expect(detectFormat(json)).toBe("json");
    });
  });

  // The container must round-trip across native (browser/Node) and pure-JS
  // (Figma desktop iframe) implementations — same format bytes, same security.
  describe("pure-JS fallback (no Web Crypto / CompressionStream)", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("decodes a natively-encoded container (native encode → fallback decode)", async () => {
      const input = sampleCapture();
      const bytes = await encodeW2W(input); // native
      disableWebApis();
      expect(await decodeW2W(bytes)).toEqual(input); // fallback
    });

    it("produces a container the native path reads (fallback encode → native decode)", async () => {
      const input = sampleCapture();
      disableWebApis();
      const bytes = await encodeW2W(input); // fallback
      vi.unstubAllGlobals();
      expect(await decodeW2W(bytes)).toEqual(input); // native
    });

    it("round-trips entirely in the fallback path", async () => {
      const input = sampleCapture();
      disableWebApis();
      const bytes = await encodeW2W(input);
      expect(await decodeW2W(bytes)).toEqual(input);
    });

    it("still rejects a tampered container under fallback (AES-GCM auth)", async () => {
      disableWebApis();
      const bytes = await encodeW2W(sampleCapture());
      bytes[30] ^= 0xff; // flip a byte inside the encrypted body
      await expect(decodeW2W(bytes)).rejects.toThrow();
    });

    it("still detects the keyed 'w2w' format under fallback", async () => {
      disableWebApis();
      const bytes = await encodeW2W(sampleCapture());
      expect(detectFormat(bytes)).toBe("w2w");
    });
  });
});
