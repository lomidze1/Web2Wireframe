/**
 * Font check after pre-pass tree conversion (regression test).
 *
 * Root cause this test locks in:
 *   main.ts ran `collectAllFonts(frames)` before W2W content-script
 *   format → WireframeNode tree conversion (FIX A). Web/HTML/AreaSelection
 *   all sent `tree: null` + `capturedData.frame`, so font check walked null
 *   trees → empty Set → "fonts-not-available" message never sent → modal
 *   never opened.
 *
 * The fix introduces {@link prePassConvertFrames} that runs BEFORE font
 * check. This test exercises the real exported function (not a simulator)
 * and verifies that `collectAllFonts` then sees real fontFamily values.
 */
import { describe, it, expect } from "vitest";
import {
  prePassConvertFrames,
  isPlaceholderTree,
} from "../utils/preprocessFrames";
import { collectAllFonts } from "../utils/fontUtils";

// Minimal but realistic W2W content-script output: a body frame with one h1
// child, whose styles set fontFamily to "Roboto" — this mirrors what the
// browser extension content script produces.
function makeRealisticW2WFrame() {
  return {
    type: "FRAME" as const,
    tag: "body",
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    quad: [0, 0, 1440, 0, 1440, 900, 0, 900],
    classList: [],
    attr: {},
    styles: { fontFamily: "Roboto, sans-serif", display: "block" },
    children: [
      {
        type: "FRAME" as const,
        tag: "h1",
        x: 0,
        y: 0,
        width: 200,
        height: 40,
        quad: [0, 0, 200, 0, 200, 40, 0, 40],
        classList: [],
        attr: {},
        styles: { fontFamily: "Inter, sans-serif", display: "block" },
        children: [
          {
            type: "TEXT" as const,
            x: 0,
            y: 0,
            width: 100,
            height: 24,
            quad: [0, 0, 100, 0, 100, 24, 0, 24],
            value: "Hello",
            font: "24px Inter",
          },
        ],
      },
    ],
  };
}

const PRE_PASS_OPTS = {
  layoutMode: "autoLayout" as const,
  interactionMode: "none" as const,
};

describe("isPlaceholderTree", () => {
  it("recognizes null as placeholder", () => {
    expect(isPlaceholderTree(null)).toBe(true);
  });
  it("recognizes undefined as placeholder", () => {
    expect(isPlaceholderTree(undefined)).toBe(true);
  });
  it("recognizes empty object as placeholder", () => {
    expect(isPlaceholderTree({})).toBe(true);
  });
  it("does not flag a populated tree as placeholder", () => {
    expect(isPlaceholderTree({ id: "real", type: "FRAME" })).toBe(false);
  });
});

describe("prePassConvertFrames + collectAllFonts integration", () => {
  it("REGRESSION: collectAllFonts returns empty Set when tree is null (the bug)", () => {
    // Documents the bug. Without pre-pass, frames carry null trees and
    // collectAllFonts can't see fontFamily values → modal never opens.
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tree: null as any,
        capturedData: { frame: makeRealisticW2WFrame() },
      },
    ];

    // Skip pre-pass — simulating the original (broken) flow
    const allFonts = collectAllFonts(frames);

    expect(allFonts.size).toBe(0);
  });

  it("FIX: collectAllFonts sees real fontFamily values after pre-pass", () => {
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tree: null as any,
        capturedData: { frame: makeRealisticW2WFrame() },
      },
    ];

    prePassConvertFrames(frames, PRE_PASS_OPTS);

    expect(frames[0].tree).not.toBeNull();

    const allFonts = collectAllFonts(frames);
    // After pre-pass, font check should see at least one real font.
    // We assert the minimal stable invariant (non-empty) rather than the
    // exact set, because css-converter's cleanFontFamily/coalescing can
    // shift between minor versions and we don't want this regression test
    // to break on unrelated converter tweaks.
    expect(allFonts.size).toBeGreaterThan(0);
  });

  it("FIX: pre-pass on tree={} placeholder (AreaSelection .w2w/.json) also works", () => {
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tree: {} as any, // AreaSelection's empty-object placeholder
        capturedData: { frame: makeRealisticW2WFrame() },
      },
    ];

    prePassConvertFrames(frames, PRE_PASS_OPTS);

    const allFonts = collectAllFonts(frames);
    expect(allFonts.size).toBeGreaterThan(0);
  });

  it("FIX: pre-pass is idempotent — running twice gives the same result", () => {
    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tree: null as any,
        capturedData: { frame: makeRealisticW2WFrame() },
      },
    ];

    prePassConvertFrames(frames, PRE_PASS_OPTS);
    const treeAfterFirst = frames[0].tree;
    const firstFonts = Array.from(collectAllFonts(frames)).sort();

    // Second run: tree is now populated, isPlaceholderTree → false → no-op.
    // tree reference must not change (the safety net for executeRender's
    // duplicate FIX A loop).
    prePassConvertFrames(frames, PRE_PASS_OPTS);
    expect(frames[0].tree).toBe(treeAfterFirst);
    const secondFonts = Array.from(collectAllFonts(frames)).sort();
    expect(secondFonts).toEqual(firstFonts);
  });

  it("FIX: pre-pass leaves legacy frames (no capturedData) untouched", () => {
    const legacyTree = {
      id: "legacy",
      type: "FRAME",
      fontFamily: "Inter",
      children: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const frames = [
      {
        viewport: { width: 1440, height: 900 },
        tree: legacyTree,
        // no capturedData — legacy DOMSnapshot path
      },
    ];

    prePassConvertFrames(frames, PRE_PASS_OPTS);

    // Tree must NOT be replaced
    expect(frames[0].tree).toBe(legacyTree);

    const allFonts = collectAllFonts(frames);
    expect(allFonts.has("Inter")).toBe(true);
  });
});
