/**
 * w2w-codec — hardened binary container for Web2Wireframe captures (`.w2w`).
 *
 * Single source of truth shared by the browser extension (encode) and the
 * Figma plugin (decode), so the two stay in lockstep. Pipeline:
 *
 *   encode:  msgpack → gzip → AES-GCM → keystream-scramble → container
 *   decode:  container → unscramble → AES-GCM → gunzip → msgpack
 *
 * Container layout (current, "w2w"):
 *   [0..11]  iv   12 bytes (random AES-GCM nonce; also seeds scramble + tag)
 *   [12..15] tag  4 bytes  — keyed marker = computeTag(iv); NOT a constant, so
 *                            files carry no fixed magic banner to fingerprint
 *   [16]     ver  0x02
 *   [17..]   scramble(AES-GCM(ciphertext + 16-byte tag))
 *
 * Legacy layout ("w2w-v2", still decodable) — older hardened files that began
 * with a constant "W2W2" magic:
 *   [0..3] magic "W2W2" · [4] ver · [5] flags · [6..17] iv · [18..] scramble(ct)
 *
 * SECURITY NOTE — this is strong *obfuscation*, not unbreakable encryption.
 * The AES key and scramble/tag secrets are embedded below and therefore ship
 * inside the public Figma-plugin bundle; a determined reverse-engineer can
 * extract them, and the decoded plaintext necessarily exists on the client at
 * render time. The goal is to make the format opaque to ~everyone and expensive
 * to clone, not to defeat a motivated attacker who has the plugin. The only
 * model that keeps a real secret is server-side decode — see
 * docs/decisions/W2W-FILE-FORMAT.md.
 */

import { encode as msgpackEncode, decode as msgpackDecode } from "@msgpack/msgpack";
import type { webcrypto } from "node:crypto";

const W2W_VERSION = 0x02;
const IV_LENGTH = 12;
const TAG_LENGTH = 4;
const HEADER_LENGTH = IV_LENGTH + TAG_LENGTH + 1; // iv + tag + version = 17

// Legacy ("w2w-v2") constant magic + header geometry, kept for back-compat decode.
const V2_MAGIC = [0x57, 0x32, 0x57, 0x32]; // "W2W2"
const V2_HEADER_LENGTH = 4 + 1 + 1 + IV_LENGTH; // magic + version + flags + iv = 18

const GCM_TAG_LENGTH = 16;

export type W2WFormat = "w2w" | "w2w-v2" | "gzip-legacy" | "json";

// ---------------------------------------------------------------------------
// Embedded secrets — assembled from pieces rather than a single literal so the
// raw bytes are not greppable verbatim in the bundle (modest extra friction).
// ---------------------------------------------------------------------------

// Web APIs (Response/SubtleCrypto) require ArrayBuffer-backed views, not the
// wider `Uint8Array<ArrayBufferLike>`. Our buffers never use SharedArrayBuffer.
type Bytes = Uint8Array<ArrayBuffer>;

/** Fold a list of byte-arrays into one 32-byte secret via positional XOR. */
function assemble(...parts: number[][]): Bytes {
  const out = new Uint8Array(32);
  for (const part of parts) {
    for (let i = 0; i < 32; i++) out[i] ^= part[i % part.length] ?? 0;
  }
  return out;
}

// AES-256 key material (32 bytes).
const KEY_BYTES = assemble(
  [0x9e, 0x37, 0x79, 0xb9, 0x7f, 0x4a, 0x7c, 0x15, 0xf3, 0x9c, 0xc0, 0x60, 0x5c, 0xed, 0xc8, 0x34],
  [0x1c, 0xa6, 0x78, 0xd0, 0x46, 0x2a, 0x9f, 0x3d, 0x88, 0xb1, 0x05, 0xea, 0x73, 0x6f, 0x2b, 0x47],
);

// Independent secret for the keystream-scramble layer (32 bytes).
const SCRAMBLE_BYTES = assemble(
  [0xa5, 0x5a, 0x33, 0xcc, 0x0f, 0xf0, 0x96, 0x69, 0x12, 0x7e, 0xbd, 0x41, 0x6a, 0xd8, 0x24, 0x93],
  [0x3b, 0x11, 0xee, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab],
);

// Independent secret for the keyed format tag (32 bytes).
const TAG_BYTES = assemble(
  [0x6c, 0x1d, 0x84, 0xf2, 0x37, 0xb0, 0x59, 0xe6, 0x2a, 0x9d, 0x4f, 0x71, 0xc8, 0x03, 0xae, 0x55],
  [0xd4, 0x8b, 0x16, 0x7a, 0xe2, 0x3f, 0x90, 0x6d, 0xb1, 0x0c, 0x57, 0xfa, 0x29, 0x84, 0x6e, 0x13],
);

// ---------------------------------------------------------------------------
// Web Crypto + stream helpers (isomorphic: browser SW, Figma iframe, Node ≥18)
// ---------------------------------------------------------------------------

let keyPromise: Promise<webcrypto.CryptoKey> | null = null;
function getKey(): Promise<webcrypto.CryptoKey> {
  if (!keyPromise) {
    keyPromise = globalThis.crypto.subtle.importKey(
      "raw",
      KEY_BYTES,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  }
  return keyPromise;
}

async function gzip(data: Bytes): Promise<Bytes> {
  const stream = new Response(data).body!.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decompressed-size ceiling guarding against gzip "bombs": a tiny crafted file
 * that expands to gigabytes. Generous enough never to clip a real capture
 * (multi-MB), small enough to abort a malicious one before it exhausts memory.
 */
const MAX_DECOMPRESSED_BYTES = 300 * 1024 * 1024; // 300 MB

async function gunzip(data: Bytes, maxBytes = MAX_DECOMPRESSED_BYTES): Promise<Bytes> {
  const reader = new Response(data).body!
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Decompressed .w2w payload exceeds the size limit.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** xorshift32 step (returns the next 32-bit state). */
function xorshift32(state: number): number {
  state ^= state << 13; state >>>= 0;
  state ^= state >>> 17;
  state ^= state << 5; state >>>= 0;
  return state;
}

/** FNV-1a fold of a secret + iv into a 32-bit seed. */
function seedFrom(secret: Uint8Array, iv: Uint8Array): number {
  let state = 0x811c9dc5;
  for (let i = 0; i < secret.length; i++) {
    state = (state ^ secret[i]) >>> 0;
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  for (let i = 0; i < iv.length; i++) {
    state = (state ^ iv[i]) >>> 0;
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  return state === 0 ? 0x9e3779b9 : state;
}

/**
 * Reversible keystream scramble. Derives a deterministic keystream from
 * SCRAMBLE_BYTES folded with the per-file IV, then XORs it over the data. XOR is
 * its own inverse, so the same call decodes. Independent of the AES key: an
 * attacker must recover *both* secrets and understand the container to read.
 */
function scramble(data: Uint8Array, iv: Uint8Array): Bytes {
  // NOTE: keep this exact seed derivation stable — changing it silently breaks
  // decode of every previously-exported file (the keystream would differ).
  let state = 0x811c9dc5;
  for (let i = 0; i < SCRAMBLE_BYTES.length; i++) state = (state ^ SCRAMBLE_BYTES[i]) >>> 0;
  for (let i = 0; i < iv.length; i++) state = (state ^ (iv[i] << (i % 4))) >>> 0;
  if (state === 0) state = 0x9e3779b9;

  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    state = xorshift32(state);
    out[i] = data[i] ^ (state & 0xff);
  }
  return out;
}

/**
 * Keyed 4-byte format tag derived from the IV and an independent secret. Lets a
 * file be recognised as ours WITHOUT carrying a constant magic banner: two files
 * with different IVs produce different tags, so there is no fixed prefix to
 * fingerprint. An outsider cannot forge the tag without TAG_BYTES.
 */
function computeTag(iv: Uint8Array): Bytes {
  let state = seedFrom(TAG_BYTES, iv);
  const out = new Uint8Array(TAG_LENGTH);
  for (let i = 0; i < TAG_LENGTH; i++) {
    state = xorshift32(state);
    out[i] = state & 0xff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Encode any capture object into a hardened `.w2w` container. */
export async function encodeW2W(value: unknown): Promise<Bytes> {
  const payload = new Uint8Array(msgpackEncode(value)); // ArrayBuffer-backed copy
  const compressed = await gzip(payload);

  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cipher = new Uint8Array(
    await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(), compressed),
  );
  const scrambled = scramble(cipher, iv);

  const out = new Uint8Array(HEADER_LENGTH + scrambled.length);
  out.set(iv, 0);
  out.set(computeTag(iv), IV_LENGTH);
  out[IV_LENGTH + TAG_LENGTH] = W2W_VERSION;
  out.set(scrambled, HEADER_LENGTH);
  return out;
}

/** Shared decode tail: unscramble → AES-GCM decrypt → gunzip → msgpack. */
async function decodeBody(iv: Bytes, body: Uint8Array): Promise<unknown> {
  const cipher = scramble(body, iv); // XOR is self-inverse
  // Throws on auth-tag mismatch (tampered or wrong key).
  const compressed = new Uint8Array(
    await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, await getKey(), cipher),
  );
  const payload = await gunzip(compressed);
  return msgpackDecode(payload);
}

/** Decode a hardened `.w2w` container (current or legacy v2) into the object. */
export async function decodeW2W(bytes: Uint8Array): Promise<unknown> {
  const format = detectFormat(bytes);

  if (format === "w2w") {
    if (bytes[IV_LENGTH + TAG_LENGTH] !== W2W_VERSION) {
      throw new Error(`Unsupported .w2w version: ${bytes[IV_LENGTH + TAG_LENGTH]}`);
    }
    if (bytes.length < HEADER_LENGTH + GCM_TAG_LENGTH) {
      throw new Error("Truncated .w2w container.");
    }
    const iv = new Uint8Array(bytes.subarray(0, IV_LENGTH));
    return decodeBody(iv, bytes.subarray(HEADER_LENGTH));
  }

  if (format === "w2w-v2") {
    if (bytes[4] !== W2W_VERSION) {
      throw new Error(`Unsupported .w2w version: ${bytes[4]}`);
    }
    if (bytes.length < V2_HEADER_LENGTH + GCM_TAG_LENGTH) {
      throw new Error("Truncated .w2w container.");
    }
    const iv = new Uint8Array(bytes.subarray(6, 6 + IV_LENGTH));
    return decodeBody(iv, bytes.subarray(V2_HEADER_LENGTH));
  }

  throw new Error("Not a hardened .w2w container.");
}

/**
 * Sniff a file's bytes to pick a decode path. Recognises the current keyed-tag
 * format, the legacy "W2W2" hardened format, legacy gzip+msgpack `.w2w`, and
 * plain `.json` — regardless of file extension.
 */
export function detectFormat(bytes: Uint8Array): W2WFormat {
  // Current format: recompute the keyed tag from the IV and compare. No constant
  // bytes are matched, so the format leaves no fixed fingerprint.
  if (bytes.length >= HEADER_LENGTH) {
    const tag = computeTag(bytes.subarray(0, IV_LENGTH));
    if (
      tag[0] === bytes[IV_LENGTH] &&
      tag[1] === bytes[IV_LENGTH + 1] &&
      tag[2] === bytes[IV_LENGTH + 2] &&
      tag[3] === bytes[IV_LENGTH + 3]
    ) {
      return "w2w";
    }
  }
  // Legacy hardened format with the old constant "W2W2" magic.
  if (bytes.length >= 4 && V2_MAGIC.every((b, i) => bytes[i] === b)) {
    return "w2w-v2";
  }
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return "gzip-legacy";
  }
  return "json";
}
