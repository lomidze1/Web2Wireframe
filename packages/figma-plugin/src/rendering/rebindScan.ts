/**
 * Non-blocking page walk for the pending-font scan.
 *
 * `figma.currentPage.findAll()` is a single synchronous task. On a page
 * holding a dozen imported sites that is hundreds of thousands of nodes, and
 * while it runs Figma's main thread — the plugin iframe included — accepts no
 * input: the plugin opens with its URL field visibly frozen for a second or
 * two. This walks the same tree in batches and hands control back between
 * them, so the UI stays live and the count simply lands a moment later.
 */

export interface ChunkedScanOptions {
  /** Nodes visited between yields. */
  batchSize?: number;
  /** How control is handed back to the host between batches. */
  yieldFn?: () => Promise<void>;
  /** Abort the walk — a newer scan has superseded this one. */
  isCancelled?: () => boolean;
}

const DEFAULT_BATCH_SIZE = 2000;

const defaultYield = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Collect every TEXT descendant of `roots` (the roots themselves included)
 * without blocking the main thread. Returns `null` when the walk was
 * cancelled — callers must not post a partial result.
 */
export async function collectTextNodesChunked(
  roots: readonly SceneNode[],
  opts: ChunkedScanOptions = {},
): Promise<TextNode[] | null> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const yieldFn = opts.yieldFn ?? defaultYield;
  const isCancelled = opts.isCancelled;

  const found: TextNode[] = [];
  // Reversed, so popping visits siblings in document order — the modal's
  // per-layer list keeps the same order it had under findAll().
  const stack: SceneNode[] = [...roots].reverse();
  let visited = 0;

  while (stack.length > 0) {
    if (isCancelled?.()) return null;

    const node = stack.pop() as SceneNode;
    visited++;

    if (node.type === "TEXT") {
      found.push(node as TextNode);
    } else if ("children" in node) {
      const children = (node as SceneNode & { children: readonly SceneNode[] })
        .children;
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }

    if (visited % batchSize === 0) {
      await yieldFn();
      if (isCancelled?.()) return null;
    }
  }

  return found;
}
