// URL validation utility for website import
// Frontend equivalent: Plugin_Frontend/src/utils/urlValidation.ts

import { lookup } from "node:dns/promises";

export const PRIVATE_IP_PATTERNS: readonly RegExp[] = [
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^169\.254\.\d+\.\d+$/,              // link-local / AWS metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/, // CGNAT 100.64.0.0/10
];

/**
 * Normalize a hostname into a canonical dotted-quad IPv4 string if it parses
 * as one. Handles hex (0x7f000001), octal (0177.0.0.1), and pure-decimal
 * (2130706433) forms which can otherwise bypass regex-based blocklists.
 * Returns null if the input doesn't look like a parseable IPv4.
 */
export function normalizeIPv4(hostname: string): string | null {
  const parts = hostname.split(".");
  if (parts.length < 1 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (p === "") return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p, 16);
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8);
    else if (/^\d+$/.test(p)) n = parseInt(p, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }
  // Collapse shorthand forms (e.g. "127.1" → 127.0.0.1, "2130706433" → 127.0.0.1)
  let value: number;
  if (nums.length === 1) {
    value = nums[0];
  } else if (nums.length === 2) {
    if (nums[0] > 255 || nums[1] > 0xffffff) return null;
    value = (nums[0] << 24) | nums[1];
  } else if (nums.length === 3) {
    if (nums[0] > 255 || nums[1] > 255 || nums[2] > 0xffff) return null;
    value = (nums[0] << 24) | (nums[1] << 16) | nums[2];
  } else {
    if (nums.some((n) => n > 255)) return null;
    value = (nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3];
  }
  if (value < 0 || value > 0xffffffff) return null;
  const a = (value >>> 24) & 0xff;
  const b = (value >>> 16) & 0xff;
  const c = (value >>> 8) & 0xff;
  const d = value & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

/** Check whether an IPv6 address (literal, no brackets) is private/loopback. */
function isPrivateIPv6(host: string): boolean {
  if (!host.includes(":")) return false;
  const lower = host.toLowerCase();
  // Loopback ::1, unspecified ::
  if (lower === "::1" || lower === "::") return true;
  // Link-local fe80::/10
  if (/^fe[89ab][0-9a-f]?:/.test(lower)) return true;
  // Unique local fc00::/7
  if (/^f[cd][0-9a-f]{0,2}:/.test(lower)) return true;
  // IPv4-mapped ::ffff:127.0.0.1 → recurse on embedded v4
  const v4Mapped = /^::ffff:([0-9.]+)$/.exec(lower);
  if (v4Mapped) {
    const normalized = normalizeIPv4(v4Mapped[1]);
    if (normalized) return isPrivateHost(normalized);
  }
  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  url: string;
  error?: string;
}

/**
 * Validate and normalize a URL for website import.
 * @param input - Raw URL string
 * @returns Validation result with normalized URL
 */
export function validateUrl(input: string | null | undefined): UrlValidationResult {
  let urlString = (input || "").trim();

  if (!urlString) {
    return { valid: false, url: urlString, error: "Missing sourceUrl" };
  }

  // Auto-prefix https:// only if no protocol scheme is present
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(urlString)) {
    urlString = `https://${urlString}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return {
      valid: false,
      url: urlString,
      error: "Invalid URL format",
    };
  }

  // Only allow http and https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      valid: false,
      url: urlString,
      error: "Only HTTP and HTTPS URLs are supported",
    };
  }

  // Block empty hostname
  if (!parsed.hostname) {
    return {
      valid: false,
      url: urlString,
      error: "URL must include a domain name",
    };
  }

  // Block private/internal addresses (includes hex/octal/decimal IPv4, IPv6)
  if (isPrivateHost(parsed.hostname)) {
    return {
      valid: false,
      url: urlString,
      error: "Internal or private addresses are not allowed",
    };
  }

  // Require at least one dot in hostname (TLD check), skip for IP addresses and localhost
  const isIpAddress = /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname);
  const isLocalhost = /^localhost$/i.test(parsed.hostname);
  if (!isIpAddress && !isLocalhost && !parsed.hostname.includes(".")) {
    return {
      valid: false,
      url: urlString,
      error: "Invalid domain - must include a valid TLD",
    };
  }

  return { valid: true, url: urlString };
}

/**
 * Check if a hostname points to a private/internal address.
 * Used by HTML import request interception to prevent SSRF.
 * @param hostname - The hostname to check
 * @returns true if the hostname is private/internal
 */
export function isPrivateHost(hostname: string): boolean {
  // Strip IPv6 brackets if present ([::1] → ::1)
  const stripped = hostname.replace(/^\[|\]$/g, "");
  const lower = stripped.toLowerCase();

  // localhost / 127.x.x.x are the user's own dev servers — allowed ONLY
  // outside production. In production they are treated as private so the
  // server cannot be coerced into reaching loopback admin services (SSRF).
  // Canonicalize first so hex/octal/decimal forms are also covered.
  const canonical = normalizeIPv4(lower) ?? lower;
  if (lower === "localhost" || /^127\.\d+\.\d+\.\d+$/.test(canonical)) {
    return process.env.NODE_ENV === "production";
  }

  // Block well-known internal hostname suffixes
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;

  // IPv6 checks (loopback, link-local, unique-local, v4-mapped)
  if (isPrivateIPv6(lower)) return true;

  // Canonicalized IPv4 against private ranges (defeats hex/octal/decimal bypass)
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(canonical)) return true;
  }

  return false;
}

/**
 * Assert that a URL is safe to fetch server-side. Throws if the URL is not
 * http(s), points at a private/internal host, or — for hostnames — resolves
 * to a private IP. The DNS resolution step defeats DNS-rebinding attacks
 * that string-based host checks alone cannot catch.
 *
 * Call this immediately before navigating Puppeteer to a user-supplied URL.
 */
export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Internal or private addresses are not allowed");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  // Literal IPs are already fully vetted by isPrivateHost — no DNS needed.
  if (hostname.includes(":") || normalizeIPv4(hostname) !== null) return;

  // localhost only reaches here outside production (isPrivateHost above
  // would have thrown otherwise); it resolves to loopback by definition.
  if (/^localhost$/i.test(hostname)) return;

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error("Could not resolve host");
  }

  for (const { address } of addresses) {
    if (isPrivateHost(address)) {
      throw new Error("Host resolves to an internal or private address");
    }
  }
}
