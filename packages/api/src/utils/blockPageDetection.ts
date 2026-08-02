/**
 * Heuristic detection of bot-protection block pages (Akamai, Cloudflare,
 * PerimeterX, …) served to our headless browser during URL import.
 *
 * Why the server cares: sites like tesla.com answer our datacenter IP with an
 * "Access Denied" page. We extract it faithfully and return 200, so the quota
 * gate counts a delivered import — but the user got a dead frame and a "use
 * the Browser Extension instead" panel. Flagging it here lets the gate refund
 * the slot, so a blocked site never costs a Free user an import.
 *
 * The response itself stays untouched: the published plugin runs the same
 * heuristic client-side to decide whether to show the handoff panel.
 *
 * ⚠️ Deliberate duplicate of
 * `packages/figma-plugin/src/ui/shared/blockPageDetection.ts` — the phrase list
 * and the size guard must stay in sync. It is not in @w2w/shared because that
 * package is the frozen extension↔API contract.
 *
 * Conservative by design: a page is flagged only when a known block phrase
 * appears AND the page is tiny. Real block pages are a handful of text nodes;
 * an article that merely mentions "access denied" has hundreds.
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
 * Returns true when the extracted frames look like a bot-protection block
 * page. Only the first (widest) frame is inspected — the block page is
 * identical across viewports.
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
