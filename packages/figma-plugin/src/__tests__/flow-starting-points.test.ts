/**
 * Prototype starting points (h2d parity).
 *
 * Without an entry in `figma.currentPage.flowStartingPoints` there is nothing to
 * press Play on — the import renders but Presentation mode has no way in. h2d
 * pushes one flow per imported frame; so do we.
 *
 * The flows the DESIGNER created on the page are theirs. We append, never assign
 * over the top.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerFlowStartingPoints } from "../rendering/anchorLinks";

interface FlowEntry {
  nodeId: string;
  name: string;
}

function fakeFrame(id: string, name: string): { id: string; name: string } {
  return { id, name };
}

function setPageFlows(flows: FlowEntry[]): void {
  (globalThis as unknown as { figma: unknown }).figma = {
    currentPage: { flowStartingPoints: flows },
  };
}

function pageFlows(): FlowEntry[] {
  return (globalThis as unknown as {
    figma: { currentPage: { flowStartingPoints: FlowEntry[] } };
  }).figma.currentPage.flowStartingPoints;
}

beforeEach(() => {
  setPageFlows([]);
});

describe("registerFlowStartingPoints", () => {
  it("adds one entry per imported frame, named after the frame", () => {
    registerFlowStartingPoints([
      fakeFrame("f1", "example.com - wireframe (1440px)"),
      fakeFrame("f2", "example.com - wireframe (390px)"),
    ] as never);

    expect(pageFlows()).toEqual([
      { nodeId: "f1", name: "example.com - wireframe (1440px)" },
      { nodeId: "f2", name: "example.com - wireframe (390px)" },
    ]);
  });

  it("keeps flows the designer already created", () => {
    setPageFlows([{ nodeId: "mine", name: "My handmade flow" }]);
    registerFlowStartingPoints([fakeFrame("f1", "example.com - wireframe (1440px)")] as never);

    expect(pageFlows()).toHaveLength(2);
    expect(pageFlows()[0]).toEqual({ nodeId: "mine", name: "My handmade flow" });
  });

  it("does not duplicate on re-import of the same frame", () => {
    const frames = [fakeFrame("f1", "example.com - wireframe (1440px)")] as never;
    registerFlowStartingPoints(frames);
    registerFlowStartingPoints(frames);

    expect(pageFlows()).toHaveLength(1);
  });

  it("refreshes the name when a re-import renames the frame", () => {
    registerFlowStartingPoints([fakeFrame("f1", "old.com - wireframe (1440px)")] as never);
    registerFlowStartingPoints([fakeFrame("f1", "new.com - wireframe (1440px)")] as never);

    expect(pageFlows()).toEqual([{ nodeId: "f1", name: "new.com - wireframe (1440px)" }]);
  });

  it("never throws when the host rejects the assignment", () => {
    (globalThis as unknown as { figma: unknown }).figma = {
      currentPage: {
        get flowStartingPoints(): FlowEntry[] {
          return [];
        },
        set flowStartingPoints(_v: FlowEntry[]) {
          throw new Error("read-only in this host");
        },
      },
    };

    expect(() =>
      registerFlowStartingPoints([fakeFrame("f1", "example.com")] as never),
    ).not.toThrow();
  });

  it("is a no-op for an empty frame list", () => {
    setPageFlows([{ nodeId: "mine", name: "My handmade flow" }]);
    registerFlowStartingPoints([]);
    expect(pageFlows()).toHaveLength(1);
  });
});
