import { describe, it, expect } from "vitest";
import { getMainFrameId, w2wCountNodes, w2wCollectImageUrls } from "./w2w";
import type { W2WNode } from "@w2w/shared";

// Tiny builder so tests stay focused on the helper's logic, not on the
// shape of W2WFrameNode (which has many optional style fields).
function frame(partial: Partial<W2WNode> & { children?: W2WNode[] }): W2WNode {
  return {
    type: "FRAME",
    tag: "div",
    children: [],
    ...partial,
  } as unknown as W2WNode;
}

function text(): W2WNode {
  return { type: "TEXT", tag: "span" } as unknown as W2WNode;
}

describe("getMainFrameId", () => {
  it("returns the frameId from the first entry in the resource map", () => {
    const map = new Map<string, { frameId: string }>([
      ["https://a/", { frameId: "FRAME-A" }],
      ["https://a/style.css", { frameId: "FRAME-A" }],
    ]);
    expect(getMainFrameId(map)).toBe("FRAME-A");
  });

  it("returns null for an empty resource map", () => {
    expect(getMainFrameId(new Map())).toBeNull();
  });
});

describe("w2wCountNodes", () => {
  it("counts a single leaf as 1", () => {
    expect(w2wCountNodes(text())).toBe(1);
    expect(w2wCountNodes(frame({}))).toBe(1);
  });

  it("counts a frame with children inclusive of self", () => {
    const tree = frame({ children: [text(), text(), text()] });
    expect(w2wCountNodes(tree)).toBe(4);
  });

  it("recurses through nested frames", () => {
    const tree = frame({
      children: [
        frame({ children: [text(), text()] }),
        frame({ children: [text()] }),
        text(),
      ],
    });
    expect(w2wCountNodes(tree)).toBe(7);
  });
});

describe("w2wCollectImageUrls", () => {
  it("collects $url image references from a single frame", () => {
    const tree = frame({ $url: "https://cdn/x.png" } as Partial<W2WNode>);
    expect(w2wCollectImageUrls(tree)).toEqual(["https://cdn/x.png"]);
  });

  it("walks the whole subtree", () => {
    const tree = frame({
      $url: "a",
      children: [
        frame({ $url: "b", children: [text()] } as Partial<W2WNode>),
        frame({ children: [frame({ $url: "c" } as Partial<W2WNode>)] }),
      ],
    } as Partial<W2WNode>);
    expect(w2wCollectImageUrls(tree)).toEqual(["a", "b", "c"]);
  });

  it("ignores TEXT nodes", () => {
    const tree = frame({ children: [text(), text()] });
    expect(w2wCollectImageUrls(tree)).toEqual([]);
  });

  it("returns [] when there are no images anywhere", () => {
    const tree = frame({
      children: [frame({ children: [text()] }), text()],
    });
    expect(w2wCollectImageUrls(tree)).toEqual([]);
  });
});
