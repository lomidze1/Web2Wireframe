/**
 * FIX C — applyCssDiffToNode transform handling
 *
 * Sites use `transform: translateY(-Npx)` (or matrix form) to signal hover
 * state on CTAs (see web2wireframe.design `.btn:hover`). Previously only
 * `rotate()` was handled; translate/matrix silently dropped → hover variant
 * looked identical to default. This test pins the new behavior.
 */
import { describe, it, expect, vi } from "vitest";

interface MockEffect {
  type: string;
  color?: { r: number; g: number; b: number; a: number };
  offset?: { x: number; y: number };
  radius?: number;
  visible?: boolean;
  blendMode?: string;
}

interface MockFrame {
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills: unknown[];
  strokes: unknown[];
  children: MockFrame[];
  effects: MockEffect[];
  opacity: number;
  rotation?: number;
  strokeWeight?: number;
  strokeAlign?: string;
  findAll(pred: (n: MockFrame) => boolean): MockFrame[];
  findOne(pred: (n: MockFrame) => boolean): MockFrame | null;
}

function makeMockFrame(): MockFrame {
  const self: MockFrame = {
    type: "FRAME",
    name: "btn",
    x: 100,
    y: 50,
    width: 120,
    height: 44,
    fills: [],
    strokes: [],
    children: [],
    effects: [],
    opacity: 1,
    findAll() {
      return [];
    },
    findOne() {
      return null;
    },
  };
  return self;
}

vi.stubGlobal("figma", {
  createFrame: vi.fn(() => makeMockFrame()),
  createText: vi.fn(() => makeMockFrame()),
  loadFontAsync: vi.fn(async () => undefined),
});

import { applyCssDiffToNode } from "../rendering/pseudoStates";

describe("FIX C — transform handling in applyCssDiffToNode", () => {
  it("shifts frame.y upward for translateY(-2px)", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "translateY(-2px)",
    });
    expect(frame.y).toBe(48); // 50 + (-2)
  });

  it("shifts frame.y downward for translateY(4px)", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "translateY(4px)",
    });
    expect(frame.y).toBe(54);
  });

  it("parses matrix(a,b,c,d,tx,ty) and shifts both x and y", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "matrix(1, 0, 0, 1, 5, -3)",
    });
    expect(frame.x).toBe(105);
    expect(frame.y).toBe(47);
  });

  it("ignores identity matrix (no shift)", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "matrix(1, 0, 0, 1, 0, 0)",
    });
    expect(frame.x).toBe(100);
    expect(frame.y).toBe(50);
  });

  it("ignores sub-threshold matrix shift (<0.25px)", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "matrix(1, 0, 0, 1, 0, -0.1)",
    });
    expect(frame.y).toBe(50);
  });

  it("adds drop-shadow effect for upward translate ≥1px", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "translateY(-2px)",
    });
    expect(frame.effects.length).toBe(1);
    expect(frame.effects[0].type).toBe("DROP_SHADOW");
    expect(frame.effects[0].offset?.y).toBe(6);
  });

  it("does NOT add shadow for tiny upward shift (<1px)", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "translateY(-0.5px)",
    });
    expect(frame.effects.length).toBe(0);
  });

  it("does NOT add shadow for downward translate", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "translateY(2px)",
    });
    expect(frame.effects.length).toBe(0);
  });

  it("still handles rotate (legacy path)", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "rotate(15deg)",
    });
    expect(frame.rotation).toBe(-15); // Figma counter-clockwise
  });

  it("parses translate(X, Y) shorthand", () => {
    const frame = makeMockFrame();
    applyCssDiffToNode(frame as unknown as FrameNode, {
      transform: "translate(10px, -4px)",
    });
    expect(frame.x).toBe(110);
    expect(frame.y).toBe(46);
  });
});
