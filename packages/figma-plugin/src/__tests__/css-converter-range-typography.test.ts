/**
 * Converter half of per-range typography: an inline element's own
 * letter-spacing / text-transform / line-height reaches its text SEGMENT.
 *
 * All three inherit in CSS, so a plain `<span>` reports its host's values and
 * the renderer skips the range. They differ only where the author overrode
 * them — which is exactly the case that used to flatten.
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { W2WFrameNode } from "@w2w/shared";

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 600, height: 40,
    quad: [0, 0, 600, 0, 600, 40, 0, 40],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function text(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "TEXT",
    x: 0, y: 0, width: 100, height: 20,
    quad: [0, 0, 100, 0, 100, 20, 0, 20],
    value,
    font: "400 16px Arial",
    ...overrides,
  };
}

interface Seg {
  text: string;
  letterSpacing?: number;
  textCase?: string;
  lineHeight?: string;
}

/**
 * `<p>` with a plain run followed by an inline run carrying `spanStyles`.
 * Returns the host's styled segments.
 */
function segmentsFor(
  spanStyles: Record<string, string>,
  hostStyles: Record<string, string> = {},
): Seg[] {
  const tree = convertW2WToWireframe(frame({
    tag: "body",
    attr: { baseURI: "https://w2w.design/" },
    children: [
      frame({
        tag: "p",
        styles: { display: "block", fontSize: "16px", lineHeight: "24px", ...hostStyles },
        children: [
          text("plain ", { x: 0, width: 50 }),
          frame({
            tag: "span",
            x: 50, width: 60, height: 20,
            styles: { display: "inline", ...spanStyles },
            children: [text("styled", { x: 50, width: 60 })],
          }),
        ],
      }),
    ],
  }) as unknown as W2WFrameNode);

  const out: Seg[] = [];
  const visit = (n: unknown): void => {
    if (!n || typeof n !== "object") return;
    const obj = n as Record<string, unknown>;
    if (Array.isArray(obj.styledSegments)) out.push(...(obj.styledSegments as Seg[]));
    (obj.children as unknown[] | undefined)?.forEach(visit);
  };
  visit(tree);
  return out;
}

const styledRun = (segs: Seg[]): Seg | undefined =>
  segs.find((s) => s.text.trim() === "styled");

describe("inline letter-spacing reaches the segment", () => {
  it("records a tracked span in px", () => {
    const run = styledRun(segmentsFor({ letterSpacing: "1.6px" }));
    expect(run?.letterSpacing).toBe(1.6);
  });

  it("leaves `normal` unset", () => {
    const run = styledRun(segmentsFor({ letterSpacing: "normal" }));
    expect(run?.letterSpacing).toBeUndefined();
  });
});

describe("inline text-transform reaches the segment", () => {
  it("maps uppercase → UPPER", () => {
    expect(styledRun(segmentsFor({ textTransform: "uppercase" }))?.textCase).toBe("UPPER");
  });

  it("maps lowercase → LOWER", () => {
    expect(styledRun(segmentsFor({ textTransform: "lowercase" }))?.textCase).toBe("LOWER");
  });

  it("records an explicit opt-out inside an uppercase host", () => {
    const segs = segmentsFor({ textTransform: "none" }, { textTransform: "uppercase" });
    expect(styledRun(segs)?.textCase).toBe("ORIGINAL");
  });

  it("does NOT map capitalize — it stays baked into the string", () => {
    // Figma's TITLE case lowercases inner capitals ("iPhone" → "Iphone").
    expect(styledRun(segmentsFor({ textTransform: "capitalize" }))?.textCase).toBeUndefined();
  });
});

describe("inline line-height reaches the segment", () => {
  it("records a tighter run", () => {
    expect(styledRun(segmentsFor({ lineHeight: "16px" }))?.lineHeight).toBe("16px");
  });

  it("leaves `normal` unset", () => {
    expect(styledRun(segmentsFor({ lineHeight: "normal" }))?.lineHeight).toBeUndefined();
  });
});
