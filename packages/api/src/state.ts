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
