// Shared mutable state for Plugin_Backend
// Extracted to avoid circular dependencies between index.ts and route modules.

export let mongoConnected = false;

export function setMongoConnected(value: boolean): void {
  mongoConnected = value;
}

export interface PendingImportEntry {
  data: Record<string, unknown>;
  timestamp: number;
  expires: number;
  /** figmaUserId the capture belongs to — set once the queue is user-scoped. */
  figmaUserId?: string;
}

export const pendingCDPImports = new Map<string, PendingImportEntry>();

// ---------------------------------------------------------------------------
// pendingCDPImports memory bounds (L-5)
// ---------------------------------------------------------------------------
// The Map is unbounded between 5-min cleanup ticks; a valid pairing-code
// holder could fire captures in a tight loop to fill RAM before the next
// purge. Two caps:
//   - per-user: 20 simultaneous queued captures (real users have ≤1-3)
//   - global:   1000 entries total (50× safety margin over expected peak)
// Eviction = oldest-first by `timestamp` (true LRU on insert-time).
//
// Wrapped callers MUST go through `setPendingImport()` — direct `.set()`
// bypasses the caps. The cleanup interval in index.ts still prunes
// expired entries; this layer is purely about live entries.

export const MAX_PENDING_IMPORTS = 1000;
export const MAX_PENDING_IMPORTS_PER_USER = 20;

export function setPendingImport(
  key: string,
  entry: PendingImportEntry,
): void {
  if (entry.figmaUserId) {
    const owned: Array<[string, PendingImportEntry]> = [];
    for (const [k, v] of pendingCDPImports.entries()) {
      if (v.figmaUserId === entry.figmaUserId) owned.push([k, v]);
    }
    if (owned.length >= MAX_PENDING_IMPORTS_PER_USER) {
      // Evict oldest for this user. Sort is O(n log n) but n is bounded by
      // the per-user cap (20), so this is at most ~20-element sort.
      owned.sort((a, b) => a[1].timestamp - b[1].timestamp);
      pendingCDPImports.delete(owned[0][0]);
    }
  }
  if (pendingCDPImports.size >= MAX_PENDING_IMPORTS) {
    // Global eviction — scan once for the oldest entry. Map iteration is
    // insertion-ordered but per-user evictions break that, so we look at
    // timestamps explicitly. Bounded by MAX_PENDING_IMPORTS (1000).
    let oldestKey: string | undefined;
    let oldestTs = Number.POSITIVE_INFINITY;
    for (const [k, v] of pendingCDPImports.entries()) {
      if (v.timestamp < oldestTs) {
        oldestTs = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) pendingCDPImports.delete(oldestKey);
  }
  pendingCDPImports.set(key, entry);
}

// ---------------------------------------------------------------------------
// Plugin OAuth bridge
// ---------------------------------------------------------------------------
// The plugin generates a high-entropy nonce, opens the Figma OAuth flow in a
// browser tab, and the OAuth callback parks the freshly-minted plugin token
// here keyed by that nonce. The plugin then polls /api/auth/figma-exchange
// with the nonce to collect its token. Entries are consumed on first read
// and expire after PLUGIN_AUTH_NONCE_TTL_MS.

export const PLUGIN_AUTH_NONCE_TTL_MS = 5 * 60 * 1000;

export interface PendingPluginAuthEntry {
  token: string;
  /** Token expiry (epoch ms) — distinct from the nonce TTL below. */
  tokenExpiresAt: number;
  /** Nonce entry expiry (epoch ms). */
  expires: number;
}

export const pendingPluginAuth = new Map<string, PendingPluginAuthEntry>();

// ---------------------------------------------------------------------------
// Browser-extension capture pairing
// ---------------------------------------------------------------------------
// The browser extension has no figmaUserId. To stop one user's plugin from
// picking another user's capture off the global queue, the plugin issues a
// short pairing code (bound to its verified figmaUserId); the extension sends
// that code with every capture so the queue entry can be user-scoped.

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;

export interface PendingPairingEntry {
  figmaUserId: string;
  expires: number;
}

export const pendingPairings = new Map<string, PendingPairingEntry>();

// ---------------------------------------------------------------------------
// Pairing-code brute-force lockout (M-2)
// ---------------------------------------------------------------------------
// 10-char × 31-alphabet pairing codes = ~49 bits, but ~5K concurrent
// post-launch codes brings the per-burst collision probability into a
// range where IP-level rate limiting alone is uncomfortably loose. Per-code
// failure tracking caps any single code at PAIRING_MAX_FAILURES wrong
// guesses regardless of attacker IP distribution — after that the code is
// dropped from `pendingPairings` and the lockout entry blocks redeem for
// the full TTL window even if the code happens to match a freshly issued
// one (collision is astronomically unlikely; the cost is one wasted code).
//
// Successful redeem clears the counter. Counter entries are lazily pruned
// alongside expired pairings.

export const PAIRING_LOCKOUT_TTL_MS = PAIRING_CODE_TTL_MS;
export const PAIRING_MAX_FAILURES = 3;

// P2-#8: bound the failure Map. A bot can otherwise POST 100K distinct
// random codes to /redeem and inflate the Map until process OOM. Three
// defenses, in order of cheapness:
//   1. PAIRING_CODE_MAX_INPUT_LENGTH — reject oversized strings before
//      they ever enter the Map. Real pairing codes are 10 chars; +4 fudge
//      for any future encoding variant (base64url paddings, etc.).
//   2. MAX_PAIRING_FAILURES_ENTRIES — global cap with oldest-expires-first
//      eviction. Pattern mirrors `setPendingImport` LRU.
//   3. Periodic prune in the 5-min cleanup interval (see index.ts).
export const PAIRING_CODE_MAX_INPUT_LENGTH = 14;
export const MAX_PAIRING_FAILURES_ENTRIES = 10_000;

export interface PairingFailureEntry {
  count: number;
  expires: number;
}

export const pairingCodeFailures = new Map<string, PairingFailureEntry>();

/** True if the code has hit the failure threshold and is currently locked. */
export function isPairingCodeLocked(code: string): boolean {
  const entry = pairingCodeFailures.get(code);
  if (!entry) return false;
  if (entry.expires <= Date.now()) {
    pairingCodeFailures.delete(code);
    return false;
  }
  return entry.count >= PAIRING_MAX_FAILURES;
}

/**
 * Record a failed redeem attempt. Returns `true` if the code is now locked.
 *
 * Returns `false` (without recording) when `code` is longer than
 * `PAIRING_CODE_MAX_INPUT_LENGTH` — these are bot-generated and we must
 * not let them inflate the Map.
 */
export function recordPairingFailure(code: string): boolean {
  if (code.length > PAIRING_CODE_MAX_INPUT_LENGTH) return false;
  const now = Date.now();
  const existing = pairingCodeFailures.get(code);
  const count = existing && existing.expires > now ? existing.count + 1 : 1;

  // Global cap — evict oldest-expiring entry before inserting a new one.
  // Single O(n) scan of a 10K-entry Map ≈ <1ms; only fires when Map is at
  // capacity (bot-attack scenario), so the cost is paid by the attacker.
  if (!existing && pairingCodeFailures.size >= MAX_PAIRING_FAILURES_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestExpires = Number.POSITIVE_INFINITY;
    for (const [k, v] of pairingCodeFailures.entries()) {
      if (v.expires < oldestExpires) {
        oldestExpires = v.expires;
        oldestKey = k;
      }
    }
    if (oldestKey) pairingCodeFailures.delete(oldestKey);
  }

  pairingCodeFailures.set(code, {
    count,
    expires: now + PAIRING_LOCKOUT_TTL_MS,
  });
  return count >= PAIRING_MAX_FAILURES;
}

/** Reset failure counter on successful redeem. */
export function clearPairingFailures(code: string): void {
  pairingCodeFailures.delete(code);
}

/**
 * Periodic-prune hook called from the 5-min cleanup interval in index.ts.
 * Exposed so the interval doesn't need to import the Map directly.
 */
export function pruneExpiredPairingFailures(now: number = Date.now()): number {
  let pruned = 0;
  for (const [code, entry] of pairingCodeFailures.entries()) {
    if (entry.expires <= now) {
      pairingCodeFailures.delete(code);
      pruned += 1;
    }
  }
  return pruned;
}

// ---------------------------------------------------------------------------
// Revoked HMAC bearer tokens
// ---------------------------------------------------------------------------
// In-memory blacklist of tokens that have been explicitly revoked (via
// /api/extension-session/revoke today; potentially future plugin logout).
// Keys are the raw token strings — same string the client sends in the
// Authorization header — values are the token's original `exp` epoch in ms
// so we can prune entries opportunistically once they would have expired
// on their own. authenticatePlugin checks this Map before honoring a token.
//
// Cleared on API restart (acceptable: the client cleared its local copy on
// logout, and the token still expires at its original timestamp regardless).
// Migrate to MongoDB if launch traffic shows persistent revocation is needed.

export const revokedTokens = new Map<string, number>();
