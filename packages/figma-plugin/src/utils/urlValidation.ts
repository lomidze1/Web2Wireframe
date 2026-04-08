// URL validation utility for website import
// Backend equivalent: Plugin_Backend/utils/urlValidation.js

interface UrlValidationResult {
  valid: boolean;
  url: string;
  error?: string;
}

const PRIVATE_IP_PATTERNS = [
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
];

export function validateUrl(input: string): UrlValidationResult {
  let urlString = input.trim();

  if (!urlString) {
    return { valid: false, url: urlString, error: "Please enter a URL" };
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
      error: "Please enter a valid URL (e.g., https://example.com)",
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

  // Require at least one dot in hostname (TLD check), skip for IP addresses and localhost
  const isIpAddress = /^\d+\.\d+\.\d+\.\d+$/.test(parsed.hostname);
  const isLocalhost = /^localhost$/i.test(parsed.hostname);
  if (!isIpAddress && !isLocalhost && !parsed.hostname.includes(".")) {
    return {
      valid: false,
      url: urlString,
      error: "Please enter a complete domain (e.g., example.com)",
    };
  }

  return { valid: true, url: urlString };
}
