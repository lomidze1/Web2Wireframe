/**
 * The pending-font scan must not block Figma's main thread.
 *
 * `figma.currentPage.findAll()` is one synchronous call: on a page holding a
 * dozen imported sites it walks hundreds of thousands of nodes in a single
 * task, and while it runs the plugin's iframe cannot even accept keystrokes —
 * the plugin looks open but the URL field is frozen for a second or two.
 * `collectTextNodesChunked` walks the same tree in batches, yielding between
 * them, and can be cancelled when a newer scan supersedes it.
 */
import { describe, it, expect } from "vitest";
import { collectTextNodesChunked } from "../rendering/rebindScan";

type FakeNode = { id: string; type: string; children?: FakeNode[] };

const text = (id: string): FakeNode => ({ id, type: "TEXT" });
const frame = (id: string, ...children: FakeNode[]): FakeNode => ({
  id,
  type: "FRAME",
  children,
});

/** Cast helper — the walker only reads `type` and `children`. */
const roots = (...nodes: FakeNode[]) => nodes as unknown as SceneNode[];

describe("collectTextNodesChunked", () => {
  it("finds every TEXT descendant in document order", async () => {
    const tree = roots(
      frame("f1", text("t1"), frame("f2", text("t2"), text("t3"))),
      text("t4"),
    );

    const found = await collectTextNodesChunked(tree);

    expect(found?.map((n) => n.id)).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("yields between batches instead of walking in one blocking task", async () => {
    // 10 nodes, batches of 3 → the walk must hand control back at least 3x.
    const tree = roots(...Array.from({ length: 10 }, (_, i) => text(`t${i}`)));
    let yields = 0;

    const found = await collectTextNodesChunked(tree, {
      batchSize: 3,
      yieldFn: async () => {
        yields++;
      },
    });

    expect(found).toHaveLength(10);
    expect(yields).toBeGreaterThanOrEqual(3);
  });

  it("aborts mid-walk once a newer scan supersedes it", async () => {
    const tree = roots(...Array.from({ length: 10 }, (_, i) => text(`t${i}`)));
    let cancelled = false;

    const found = await collectTextNodesChunked(tree, {
      batchSize: 2,
      // Cancel at the first yield — as `postRebindableCount` does when the
      // user switches pages while a scan is still running.
      yieldFn: async () => {
        cancelled = true;
      },
      isCancelled: () => cancelled,
    });

    expect(found).toBeNull();
  });

  it("walks past leaf nodes that have no children array", async () => {
    const tree = roots(
      { id: "r1", type: "RECTANGLE" } as FakeNode,
      frame("f1", { id: "v1", type: "VECTOR" } as FakeNode, text("t1")),
    );

    const found = await collectTextNodesChunked(tree);

    expect(found?.map((n) => n.id)).toEqual(["t1"]);
  });

  it("returns an empty list for an empty page", async () => {
    expect(await collectTextNodesChunked(roots())).toEqual([]);
  });
});
