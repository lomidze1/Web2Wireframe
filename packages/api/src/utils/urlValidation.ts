// URL validation utility for website import
// Frontend equivalent: Plugin_Frontend/src/utils/urlValidation.ts

export const PRIVATE_IP_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^\[::ffff:127\./,
];

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

  // Block private/internal addresses
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(parsed.hostname)) {
      return {
        valid: false,
        url: urlString,
        error: "Internal or private addresses are not allowed",
      };
    }
  }

  // Require at least one dot in hostname (TLD check), skip for IP addresses
  const isIpAddress = /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname);
  if (!isIpAddress && !parsed.hostname.includes(".")) {
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
  const lower = hostname.toLowerCase();

  // Block well-known internal hostnames
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) {
    return true;
  }

  // Block private IP ranges via existing patterns
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(lower)) {
      return true;
    }
  }

  return false;
}
