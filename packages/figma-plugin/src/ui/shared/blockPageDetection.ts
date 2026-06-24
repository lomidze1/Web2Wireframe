/**
 * Heuristic detection of bot-protection block pages (Akamai, Cloudflare,
 * PerimeterX, …) returned by URL/Web import.
 *
 * Why: sites like tesla.com sit behind enterprise bot managers that serve an
 * "Access Denied" page to our server-side headless browser (datacenter IP +
 * automation fingerprint). We faithfully render that page, so the user gets a
 * useless frame instead of the real site. Detecting it lets us show a helpful
 * "use the Browser Extension instead" message rather than a dead wireframe.
 *
 * Conservative by design: we only flag a page when a known block phrase appears
 * AND the page is tiny. Real block pages are a handful of text nodes; a real
 * article that happens to mention "access denied" has hundreds — so the size
 * guard keeps false positives out.
 */

const BLOCK_PHRASES = [
  "access denied",
  "you don't have permission to access",
  "you do not have permission to access",
  "pardon our interruption",
  "attention required",
  "just a moment",
  "verify you are human",
  "verify you are a human",
  "checking your browser before",
  "are you a robot",
  "enable javascript and cookies to continue",
  "ddos protection by",
];

/** Block pages are tiny; real pages are not. Above this many text nodes we
 *  never flag, regardless of phrase matches. */
const MAX_TEXT_NODES = 30;

interface MinimalNode {
  type?: unknown;
  value?: unknown;
  children?: unknown;
}

function collectText(node: unknown, out: string[], count: { n: number }): void {
  if (!node || typeof node !== "object") return;
  const n = node as MinimalNode;
  if (n.type === "TEXT" && typeof n.value === "string" && n.value.trim()) {
    out.push(n.value);
    count.n += 1;
  }
  if (Array.isArray(n.children)) {
    for (const child of n.children) collectText(child, out, count);
  }
}

/**
 * Returns true when the imported frames look like a bot-protection block page.
 * `frames` is the raw `wireframeData.frames` array from /api/import-url; only
 * the first (widest) frame is inspected — the block page is identical across
 * viewports.
 */
export function looksLikeBlockPage(frames: unknown): boolean {
  if (!Array.isArray(frames) || frames.length === 0) return false;
  const first = frames[0] as { tree?: unknown } | null | undefined;
  const root = first?.tree;
  if (!root) return false;

  const texts: string[] = [];
  const count = { n: 0 };
  collectText(root, texts, count);

  if (count.n === 0 || count.n > MAX_TEXT_NODES) return false;

  const haystack = texts.join(" ").toLowerCase().replace(/\s+/g, " ");
  return BLOCK_PHRASES.some((phrase) => haystack.includes(phrase));
}
