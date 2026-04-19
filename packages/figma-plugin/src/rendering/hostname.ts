/**
 * Hostname extractor that does NOT depend on the `URL` global.
 *
 * The Figma plugin sandbox (main.ts) runs in a minimal JS environment that
 * does not reliably expose the browser's `URL` constructor. Relying on
 * `new URL(...)` there silently throws and falls back to defaults, which is
 * why style groups kept landing in "WEB/" instead of a per-site folder and
 * section names showed the full URL instead of just the hostname.
 *
 * This regex-based extractor works in any ES5+ runtime:
 *   "https://www.apple.com/mac/"  → "apple.com"
 *   "apple.com"                   → "apple.com"
 *   "https://sub.domain.co.uk:8080/path?q=1#x" → "sub.domain.co.uk"
 *   "html-import"                 → "website"
 *   "" / undefined                → "website"
 */
export function extractHostname(sourceUrl: string | null | undefined): string {
  const DEFAULT = "website";
  if (!sourceUrl || typeof sourceUrl !== "string") return DEFAULT;

  const trimmed = sourceUrl.trim();
  if (!trimmed || trimmed === "html-import") return DEFAULT;

  // 1. Strip one or more scheme prefixes (http://, https://, ftp://, file://…)
  //    A defensive `while` loop handles a malformed double-prefix like
  //    "https://https://example.com" that a previous pipeline step may emit.
  let s = trimmed;
  while (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) {
    s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  }

  // 2. Strip path, query, hash
  s = s.split("/")[0].split("?")[0].split("#")[0];

  // 3. Strip port
  s = s.split(":")[0];

  // 4. Strip leading "www."
  s = s.replace(/^www\./i, "");

  // 5. Lowercase for consistent style-group folder names
  s = s.toLowerCase();

  return s || DEFAULT;
}
