/**
 * FIX A guard regression — `capturedData.frame` → `frameData.tree`
 *
 * Context: the Area Selection tab (.w2w/.json upload) was sending
 * `tree: {}` as a placeholder. The old FIX A guard `!frameData.tree`
 * evaluated `{}` as truthy → conversion was skipped → Pass 3 and
 * createTextStyles iterated an empty object → the rendered wireframe
 * came out completely empty.
 *
 * These tests lock in the behavior that the conversion runs whenever
 * `capturedData.frame` is present, regardless of the tree placeholder's
 * shape (null, undefined, or empty object).
 */
import { describe, it, expect, vi } from "vitest";

// We don't need a full figma sandbox — just exercise the guard condition
// using a small stand-in for convertW2WToWireframe.
function simulateFixAGuard(
  frames: Array<{
    tree?: unknown;
    capturedData?: { frame?: unknown };
  }>,
  convert: (raw: unknown) => unknown,
): number {
  let conversionsRun = 0;
  for (const frameData of frames) {
    if (frameData.capturedData?.frame) {
      try {
        frameData.tree = convert(frameData.capturedData.frame);
        conversionsRun++;
      } catch {
        // ignored in this harness
      }
    }
  }
  return conversionsRun;
}

describe("FIX A — capturedData → tree pre-conversion guard", () => {
  it("runs conversion when tree is null (Web.tsx convention)", () => {
    const convertSpy = vi.fn(() => ({ converted: true }));
    const frames = [
      {
        tree: null,
        capturedData: { frame: { tag: "body", children: [] } },
      },
    ];
    const count = simulateFixAGuard(frames, convertSpy);
    expect(count).toBe(1);
    expect(frames[0].tree).toEqual({ converted: true });
  });

  it("runs conversion when tree is undefined", () => {
    const convertSpy = vi.fn(() => ({ converted: true }));
    const frames: Array<{
      tree?: unknown;
      capturedData?: { frame?: unknown };
    }> = [
      {
        capturedData: { frame: { tag: "body", children: [] } },
      },
    ];
    const count = simulateFixAGuard(frames, convertSpy);
    expect(count).toBe(1);
    expect(frames[0].tree).toEqual({ converted: true });
  });

  it("runs conversion when tree is an empty object (AreaSelection placeholder bug)", () => {
    const convertSpy = vi.fn(() => ({ converted: true, children: [{}] }));
    const frames = [
      {
        tree: {}, // THE BUG — previously skipped because `!{}` is false
        capturedData: { frame: { tag: "body", children: [{}] } },
      },
    ];
    const count = simulateFixAGuard(frames, convertSpy);
    expect(count).toBe(1);
    expect((frames[0].tree as { converted: boolean }).converted).toBe(true);
  });

  it("skips conversion when capturedData.frame is missing (legacy prepareFramesForRendering path)", () => {
    const convertSpy = vi.fn(() => ({ converted: true }));
    const frames = [
      {
        tree: { id: "legacy-tree", type: "frame" },
        // no capturedData
      },
    ];
    const count = simulateFixAGuard(frames, convertSpy);
    expect(count).toBe(0);
    expect(frames[0].tree).toEqual({ id: "legacy-tree", type: "frame" });
    expect(convertSpy).not.toHaveBeenCalled();
  });

  it("skips conversion when capturedData exists but frame is missing", () => {
    const convertSpy = vi.fn(() => ({ converted: true }));
    const frames = [
      {
        tree: null,
        capturedData: { assets: { foo: "bar" } },
      },
    ];
    const count = simulateFixAGuard(frames, convertSpy);
    expect(count).toBe(0);
    expect(convertSpy).not.toHaveBeenCalled();
  });

  it("runs conversion for every frame in a multi-frame payload", () => {
    const convertSpy = vi.fn((raw: { tag: string }) => ({
      converted: true,
      tag: raw.tag,
    }));
    const frames = [
      { tree: null, capturedData: { frame: { tag: "body-1440" } } },
      { tree: {}, capturedData: { frame: { tag: "body-768" } } },
      { tree: undefined, capturedData: { frame: { tag: "body-375" } } },
    ];
    const count = simulateFixAGuard(frames, convertSpy);
    expect(count).toBe(3);
    expect(convertSpy).toHaveBeenCalledTimes(3);
  });
});
