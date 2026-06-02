# Web2Wireframe — `.w2w` File Format (Hardened Export Container)

**Status:** ✅ FINAL — hardened container shipped (keyed-tag format; legacy "W2W2" still decodable)
**Date:** 2026-05-30 (updated 2026-06-01 — keyed-tag P0 hardening)
**Decider:** Giorgi Lomidze (sole founder)
**Scope:** Browser extension export + Figma plugin import

---

## TL;DR

The browser extension previously auto-downloaded captures as **plain, pretty-printed JSON** — trivially readable and clonable. We replaced the public export with an opaque, hardened binary **`.w2w` container**. There is **no JSON export in any build**; the owner reads a `.w2w` by decoding it locally with `scripts/w2w-decode.mjs`.

```
encode (extension):  msgpack → gzip → AES-GCM → keystream-scramble → container
decode (plugin):     container → unscramble → AES-GCM → gunzip → msgpack
```

Single source of truth: `packages/shared/src/w2w-codec.ts` (consumed by both the extension and the plugin so encode/decode never drift).

---

## Context / Problem

`packages/browser-extension/src/background/utils/download.ts` and the W2W capture handler in `background/index.ts` wrote `JSON.stringify(result, null, 2)` to disk. Anyone could open the file, read the full extraction schema, and build a competing importer. We want the public artifact to be opaque and look proprietary, while keeping a readable format for the owner's own debugging.

## Decision

### Container layout (current — keyed tag, no magic banner)

```
[0..11]  iv   12 bytes (random AES-GCM nonce; also seeds scramble + tag)
[12..15] tag  4 bytes  — keyed marker = computeTag(iv) from an independent secret
[16]     ver  0x02
[17..]   scramble(AES-GCM(ciphertext + 16-byte tag))
```

The 4-byte tag is **keyed and IV-derived**, so it is *not constant* across files — the container carries **no fixed magic banner** to fingerprint (P0 hardening "H1"). A file is recognised as ours by recomputing `computeTag(iv)` and comparing, which an outsider cannot forge without the secret.

**Legacy layout (`w2w-v2`, still decodable)** — earlier hardened files that began with a constant `"W2W2"` magic: `[0..3] magic · [4] ver · [5] flags · [6..17] iv · [18..] scramble(ct)`. The AES key + scramble secret are unchanged, so old files (and any already on disk) keep importing.

### Layers (and why each exists)

1. **MessagePack** — compact binary; already non-human-readable.
2. **gzip** — shrinks the (often multi-MB) payload.
3. **AES-256-GCM** — confidentiality **plus** an authentication tag, so any byte flip makes `decrypt` throw. Static embedded 256-bit key + random 12-byte IV per file.
4. **Keystream scramble** — an independent embedded secret + the IV seed a deterministic xorshift32 keystream XOR'd over the ciphertext. Reversible (XOR self-inverse). Forces an attacker to recover **two** secrets and understand the container framing, not just the AES key.

### Format detection (`detectFormat`)

Importer sniffs bytes, not the file extension:
- keyed tag recomputes → current hardened `.w2w` → `decodeW2W`
- `W2W2` magic → legacy hardened `.w2w` (`w2w-v2`) → `decodeW2W`
- gzip magic `0x1f 0x8b` → legacy gzip+msgpack `.w2w` → existing path
- otherwise → plain `.json` (rejected by the plugin importer; handled by the CLI)

Old hardened `.w2w` files therefore keep importing (no broken artifacts).

### Reading a `.w2w` as JSON (owner only)

The extension **only ever writes `.w2w`** — there is no JSON export in any build. To read/search a capture, decode it locally with the repo tool:

```
pnpm --filter @w2w/shared build         # once, so the codec is available
node scripts/w2w-decode.mjs capture.w2w            # pretty JSON → stdout
node scripts/w2w-decode.mjs capture.w2w out.json   # write to a file
node scripts/w2w-decode.mjs capture.w2w | jq '.frames[0]'
```

`scripts/w2w-decode.mjs` uses `decodeW2W` from `@w2w/shared`, lives only in the repo (never shipped), and decodes **any** `.w2w` — including files captured by the public production build. This replaces the earlier dev-build dual-export idea (simpler, one tool, works on prod files).

### Plugin import is `.w2w`-only

The Area-Selection import (`AreaSelection.tsx`) accepts `accept=".w2w"` and rejects anything that isn't a hardened or legacy `.w2w` via magic-byte detection (so a renamed/dragged `.json` is refused too). The Browser-Extension tab is polling-only (no file upload); the Screenshot tab's image upload is a separate feature and unaffected.

## Consequences

- **Honest limitation — obfuscation, not encryption.** The AES key and scramble/tag secrets live in `w2w-codec.ts`, which ships inside the public Figma-plugin bundle, AND the decoded plaintext necessarily exists on the client at render time. A determined reverse-engineer who downloads the plugin can extract them. This is the same class as html.to.design (`XOR 57`) and Figma's own `.fig` (unencrypted Kiwi+zlib/zstd). It stops ~99% of people and makes cloning expensive; it cannot defeat a motivated attacker who has the plugin.

## Hardening roadmap (researched 2026-06-01)

Two independent agents (security audit + web research) converged: **no client-side scheme changes the security class** — WASM, white-box crypto, and extra cipher layers only add cost, never secrecy (every published white-box AES has been broken; Widevine L3's fell in a weekend). The current scheme already exceeds both direct comparables. So:

- **P0 — done (client-side friction, no downside):** keyed-tag header replacing the constant `W2W2` magic (this change). Removes the free fingerprint.
- **Skipped — `decodeW2W` "oracle" hiding (H2):** redundant. The shipped extension/plugin bundles are minified (no clean `decodeW2W` symbol survives) and `@w2w/shared` is `private` (never published).
- **Deferred — JS/WASM obfuscation of the decode path:** real build-pipeline + debugging cost for a temporary, days-to-weeks bump. Only if a real competitor appears.
- **Not doing — white-box crypto / anti-debugging:** high cost, fragile, broken anyway.
- **LAUNCH — server-side decode (the only *real* upgrade):** plugin uploads `.w2w` → API decrypts with a key that never ships → returns render data. Gated behind the existing Flitt license check, it **doubles as unforgeable import-quota enforcement** (a user who can't decode locally can't bypass the 10/month counter) — the strongest protection-per-effort move, to build alongside the Flitt billing system. Residual risk shifts to authenticated-endpoint scraping (mitigate with per-token rate limiting). The version byte exists to allow this migration without breaking old files.

- **Build hygiene:** `noExternal: ["@msgpack/msgpack"]` in `packages/shared/tsup.config.ts` bundles msgpack into `shared/dist` so the plugin's esbuild (which consumes `shared/dist` directly) doesn't have to resolve it across the monorepo.

## Implementation reference

- Codec: `packages/shared/src/w2w-codec.ts` (+ tests `src/__tests__/w2w-codec.test.ts`)
- Export: `packages/browser-extension/src/background/utils/download.ts` (`exportCapture`)
- Import: `packages/figma-plugin/src/ui/pages/import/areaSelection/AreaSelection.tsx`
- Owner decode tool: `scripts/w2w-decode.mjs`
