/**
 * Tests for sentinel values coming out of the platform-font measurement pass.
 *
 * `CSS.getPlatformFontsForNode` reports the font Chromium ACTUALLY painted
 * with. When a webfont is still loading (`font-display: swap`) it answers with
 * a placeholder instead of a family name — iwm.org.uk captured
 * `{ familyName: ".\x7f", postScriptName: "_" }` on 434 of 444 text nodes
 * while `Interface` was swapping in.
 *
 * That placeholder used to win over the CSS-declared family, so nearly every
 * text node claimed to be set in "." — which then drove the missing-font
 * modal ("The following fonts are not installed: Interface, .") and the
 * download ZIP. A measured family that cannot possibly be a real font must be
 * discarded in favour of the CSS stack.
 */
import { describe, it, expect } from "vitest";
import { isUsableMeasuredFamily } from "../utils/fontUtils";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

const SENTINEL = ".\u007f"; // "." + DEL — exactly what CDP reported

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 300, height: 40,
    quad: [0, 0, 300, 0, 300, 40, 0, 40],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function textChild(value: string, font: string, platformFamily?: string): Record<string, unknown> {
  return {
    type: "TEXT",
    value,
    font,
    x: 0, y: 0, width: 200, height: 20,
    quad: [0, 0, 200, 0, 200, 20, 0, 20],
    ...(platformFamily
      ? { platformFont: { familyName: platformFamily, postScriptName: "_" } }
      : {}),
  };
}

function findText(node: WireframeNode): WireframeNode | null {
  if (node.type === "text") return node;
  for (const c of node.children || []) {
    const hit = findText(c);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// isUsableMeasuredFamily
// ---------------------------------------------------------------------------

describe("isUsableMeasuredFamily", () => {
  it("rejects the loading-webfont sentinel", () => {
    expect(isUsableMeasuredFamily(SENTINEL)).toBe(false);
    expect(isUsableMeasuredFamily(".")).toBe(false);
  });

  it("rejects names carrying control characters", () => {
    expect(isUsableMeasuredFamily("Inter\u0000face")).toBe(false);
    expect(isUsableMeasuredFamily("Inter\u007f")).toBe(false);
  });

  it("rejects names with no letters at all", () => {
    expect(isUsableMeasuredFamily("_")).toBe(false);
    expect(isUsableMeasuredFamily("123")).toBe(false);
    expect(isUsableMeasuredFamily("---")).toBe(false);
  });

  it("rejects empty and whitespace-only names", () => {
    expect(isUsableMeasuredFamily("")).toBe(false);
    expect(isUsableMeasuredFamily("   ")).toBe(false);
    expect(isUsableMeasuredFamily(undefined)).toBe(false);
  });

  it("rejects hidden OS faces and Linux capture fallbacks", () => {
    expect(isUsableMeasuredFamily(".SF NS")).toBe(false);
    expect(isUsableMeasuredFamily(".AppleSystemUIFont")).toBe(false);
    expect(isUsableMeasuredFamily("Liberation Sans")).toBe(false);
  });

  it("accepts real families", () => {
    expect(isUsableMeasuredFamily("Interface")).toBe(true);
    expect(isUsableMeasuredFamily("Arial")).toBe(true);
    expect(isUsableMeasuredFamily("Noto Sans")).toBe(true);
    expect(isUsableMeasuredFamily("SF Pro Text")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// css-converter falls back to the CSS family
// ---------------------------------------------------------------------------

describe("convertW2WToWireframe — sentinel measured font", () => {
  it("keeps the CSS family when the measured font is a sentinel (coalesced text)", () => {
    const w2w = frame({
      styles: { fontFamily: "Interface, sans-serif", fontSize: "19px" },
      children: [textChild("Our Museums", SENTINEL, SENTINEL)],
    });
    const node = convertW2WToWireframe(w2w as never);
    const text = findText(node);
    expect(text?.fontFamily).toBe("Interface");
  });

  it("keeps the CSS family in the mixed-children path", () => {
    const w2w = frame({
      styles: { fontFamily: "Interface, sans-serif", fontSize: "19px" },
      children: [
        textChild("Our Museums", SENTINEL, SENTINEL),
        frame({ x: 0, y: 20, width: 40, height: 40, tag: "img" }),
      ],
    });
    const node = convertW2WToWireframe(w2w as never);
    const text = findText(node);
    expect(text?.fontFamily).toBe("Interface");
  });

  it("still trusts a real measured font over the CSS stack", () => {
    const w2w = frame({
      styles: { fontFamily: "Interface, sans-serif", fontSize: "19px" },
      children: [textChild("", "Arial", "Arial")],
    });
    const node = convertW2WToWireframe(w2w as never);
    const text = findText(node);
    expect(text?.fontFamily).toBe("Arial");
  });

  it("never leaves a text node without a family", () => {
    const w2w = frame({
      styles: { fontFamily: "Interface, sans-serif", fontSize: "19px" },
      children: [
        textChild("a", SENTINEL, SENTINEL),
        frame({ x: 0, y: 20, width: 40, height: 40, tag: "img" }),
      ],
    });
    const node = convertW2WToWireframe(w2w as never);
    const text = findText(node);
    expect(text?.fontFamily).toBeTruthy();
    expect(text?.fontFamily).toBe("Interface");
  });
});
