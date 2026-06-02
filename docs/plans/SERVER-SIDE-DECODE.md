# Plan — Server-Side `.w2w` Decode (real key protection + unforgeable quota)

**Status:** 📋 PLANNED — do NOT build yet. Fast-follow AFTER Flitt billing ships.
**Date:** 2026-06-01
**Decider:** Giorgi Lomidze (sole founder)
**Depends on:** Flitt license/quota infra (figmaUserId, Bearer auth, `requireImportAllowance`)
**Supersedes nothing:** client-side codec (`w2w-codec.ts`) stays for old files + offline.

---

## Why (one paragraph)

Today the `.w2w` decode key ships inside the public Figma plugin, so it is extractable — strong obfuscation, not real protection (see `docs/decisions/W2W-FILE-FORMAT.md`). The **only** way to keep a real secret is to move decode to the server: the plugin uploads the `.w2w`, the API decrypts with a key that never leaves the server, and returns render-ready data. In this product it does **double duty** — because the user cannot decode locally, the decode call becomes the **unforgeable enforcement point for the import quota** (Free = 10/month). One mechanism solves two problems: format protection + quota-bypass.

## Honest ceiling (read before building)

Server-side decode protects the **key**, not the **rendered output**. An authenticated client can still request decodes and scrape the returned data. So this is NOT "unclonable" (impossible for any client-rendered format). What it genuinely buys:
1. The format's AES/envelope key becomes truly secret (never ships).
2. Quota becomes unforgeable.
Residual threat = authenticated-endpoint abuse → mitigate with **per-token rate limiting**, not more crypto.

## When (trigger)

Build it when, after launch, EITHER:
- quota bypass is seen in the wild, OR
- a competitor reverse-engineers the format.

Not a launch blocker. Prerequisite infra (auth + quota) is built for Flitt anyway; this reuses it.

---

## Architecture — envelope (hybrid) encryption

Standard hybrid scheme so payload size is unbounded but only the server can unwrap the key.

### Keys
- **Server keypair** generated once: RSA-OAEP-2048 (simplest with WebCrypto) or X25519/ECDH.
  - **Private key** → API env var, e.g. `W2W_DECODE_PRIVATE_KEY` (same handling class as `FLITT_SECRET_KEY` — never logged, never shipped).
  - **Public key** → embedded in the extension (`@w2w/shared`). Public keys are safe to ship.

### New container version `0x03` (server-decode)
```
[0..11]  iv      12 bytes (AES-GCM nonce for the payload)
[12..15] keyedTag computeTag(iv)         — same no-magic detection as 0x02
[16]     ver     0x03                     — signals "server decode required"
[17..18] wrapLen uint16 (length of wrapped key)
[19..]   RSA-OAEP(server_pub, randomAesKey) ‖ AES-GCM(randomAesKey, iv, gzip(msgpack(capture)))
```
- Per-file **random AES-256 key** encrypts the gzipped msgpack payload (AES-GCM).
- That random key is **wrapped with the server public key** (RSA-OAEP). Only the server private key unwraps it.
- The scramble layer can be kept or dropped — irrelevant here, the real secret is the private key.

### Detection
`detectFormat` already keyed-tag based. Add: after recognising `"w2w"`, branch on `ver` byte — `0x02` → local decode, `0x03` → server decode. (Or return a distinct `"w2w-server"`.)

---

## Data flows

### A. Browser-Extension tab (polling) — ALREADY server-routed, near-free
The capture already goes extension → `POST /api/import-w2w` → server holds it (`pendingCDPImports`) → plugin polls `GET /api/pending-import`. To add server-decode here: the extension sends the **envelope-encrypted** payload (or the server encrypts-at-rest), and `/api/pending-import` returns decrypted render data **only after** `requireImportAllowance` passes. Minimal new surface.

### B. Area-tab file upload — the new round-trip
1. Extension exports a `0x03` `.w2w` to disk (envelope-encrypted to server pub key).
2. User uploads it in the plugin Area tab.
3. Plugin detects `0x03` → `POST /api/decode-w2w` with the file bytes (Bearer auth + `figmaUserId`).
4. API: `requireImportAllowance` → unwrap key with private key → AES-GCM decrypt → gunzip → msgpack decode → return render JSON. Increments the import counter (counts as 1 import).
5. Plugin renders the returned data (same path as today, just sourced from the response).

---

## Backend changes (`packages/api`)

1. **Env:** add `W2W_DECODE_PRIVATE_KEY` (PEM/JWK) to `.env`, `.env.example`, and the env loader/validation.
2. **Decrypt util** (`packages/api/src/.../w2wDecode.ts`): `unwrapKey(wrapped)` via `crypto.subtle` RSA-OAEP using the private key; then reuse the shared AES-GCM/gunzip/msgpack tail. Keep symmetric with the shared codec's framing.
3. **Endpoint** `POST /api/decode-w2w`:
   - Middleware: Bearer auth (existing plugin auth) + `requireImportAllowance` (the quota gate — this is the enforcement point).
   - Body: raw `.w2w` bytes (binary; cap size like the existing 100 MB upload limit; gzip-bomb cap reused from codec).
   - Returns: render-ready JSON (the decoded capture).
   - **Rate-limit per token** (new) — e.g. N decodes/min — so it isn't an open decryption oracle.
4. **`/api/pending-import`** (path A): decrypt before returning, gated by the same allowance.
5. Tests (`packages/api/__tests__`): valid token+quota → decodes; over-quota → 403; tampered/garbage → 400; rate-limit trips → 429; wrong-key file → 400.

## Shared codec changes (`packages/shared`)

1. Add `encodeW2WServer(value, serverPublicKey)` → `0x03` container (envelope encrypt). Extension uses this for the public build.
2. `detectFormat` / `decodeW2W`: recognise `0x03`; `decodeW2W` (client) should **refuse** `0x03` with a clear "this file decodes on the server" error (the client has no private key).
3. Keep `encodeW2W`/`decodeW2W` (0x02) for back-compat + the owner CLI.
4. Tests: `0x03` round-trip using a test keypair (encode with pub, decode with priv); client `decodeW2W` rejects `0x03`.

## Extension changes (`packages/browser-extension`)

1. Embed the server **public** key.
2. `exportCapture` → use `encodeW2WServer` for the shipped build (the `.w2w` written to disk is now server-only-decryptable).
3. Path A (`/api/import-w2w`): send envelope payload.

## Plugin changes (`packages/figma-plugin`)

1. Area-tab `handleGenerate`: on `0x03`, POST to `/api/decode-w2w` (with figmaUserId/Bearer) instead of local decode; render the response.
2. Reuse the existing 403 → `QuotaExceededModal` flow.
3. Old `0x02`/legacy/`gzip` files still decode locally (unchanged).

## Owner CLI (`scripts/w2w-decode.mjs`)

- `0x03` files cannot be decoded by the repo tool (no private key client-side). Two options:
  - (a) add a `--server-key <pem>` mode that loads the private key locally for owner debugging, OR
  - (b) keep using `0x02` (local) exports for the owner's own debug captures.
- Recommend (b): simplest. The owner doesn't need to decode prod `0x03` files offline.

---

## Migration / compatibility

- Version byte drives everything: `0x02` (local) and legacy/gzip/json keep importing.
- Roll out by flipping the extension's `exportCapture` to `encodeW2WServer`. No data migration; old files stay valid.
- Rollback = flip extension back to `encodeW2W` (0x02). Plugin already handles both.

## Risks / costs (decide before building)

| Risk | Mitigation |
|------|-----------|
| Latency: multi-MB upload per Area import | Acceptable post-launch; Path A is already server-routed (near-free) |
| Offline import breaks (API required) | Document; Path A already needs API; keep `0x02` for offline-only use cases if needed |
| Decode endpoint = decryption oracle | Per-token rate limit + `requireImportAllowance` + size caps |
| Private key leak | Treat as `FLITT_SECRET_KEY`-class; never log; rotate via a key-id byte if ever needed |

## Definition of done

- New `0x03` files: undecodable by anyone holding the plugin/extension bundle (no private key).
- `/api/decode-w2w` gated by license/quota + rate limit; over-quota → 403 → upgrade modal.
- Old files (`0x02`, legacy `.w2w`, `.json` via CLI) still work.
- `pnpm build && pnpm test` green; new API + shared tests cover decode, quota, rate-limit, tamper.
