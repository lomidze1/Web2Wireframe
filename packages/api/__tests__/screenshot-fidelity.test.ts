import { describe, it, expect } from "vitest";
import {
  isHexColor,
  resolveTextColor,
  resolveFillColor,
  resolveFontSize,
  resolveFontWeight,
  createIdGenerator,
  convertElement,
  convertSectionBackground,
} from "../src/lib/wireframeConverter.js";
import {
  postProcessAbsoluteResult,
  scaleAbsoluteResult,
  SCREENSHOT_ABSOLUTE_PROMPT,
} from "../src/lib/aiGenerator.js";

// ---------------------------------------------------------------------------
// Phase 1 — per-element color + typography fidelity
//
// The AI absolute pipeline may now return optional per-element `color`,
// `fillColor`, `fontSize`, `fontWeight`. When present + valid they win; when
// absent/invalid the existing token/role behavior is the fallback. The plugin
// gates whether per-element COLOR is actually shown (colorMode="website"), so
// the converter just needs to pass explicit values through faithfully.
// ---------------------------------------------------------------------------

const TEST_COLORS = {
  text: "#11151A",
  background: "#F1F2F0",
  secondary: "#BDC1B2",
  surface: "#AAB5C3",
  accent: "#AFC6DC",
};
const TEST_FONT = "Montserrat";

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    viewportWidth: 1440,
    breakpoint: "desktop",
    colors: TEST_COLORS,
    font: TEST_FONT,
    nextId: createIdGenerator(),
    ...overrides,
  } as any;
}

describe("resolve* helpers", () => {
  it("isHexColor accepts #RRGGBB only", () => {
    expect(isHexColor("#0A1B2C")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("0A1B2C")).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
    expect(isHexColor(123 as unknown)).toBe(false);
  });

  it("resolveTextColor prefers a valid element.color, else fallback", () => {
    expect(resolveTextColor({ type: "heading", color: "#FF0000" } as any, "#111")).toBe("#FF0000");
    expect(resolveTextColor({ type: "heading", color: "notacolor" } as any, "#111")).toBe("#111");
    expect(resolveTextColor({ type: "heading" } as any, "#111")).toBe("#111");
  });

  it("resolveFillColor prefers a valid element.fillColor, else the role fallback", () => {
    expect(resolveFillColor({ type: "card", fillColor: "#123456" } as any, "#AAA")).toBe("#123456");
    expect(resolveFillColor({ type: "card", fillColor: "bad" } as any, "#AAA")).toBe("#AAA");
    expect(resolveFillColor({ type: "card" } as any, null)).toBeNull();
  });

  it("resolveFontSize accepts 8..200, else fallback", () => {
    expect(resolveFontSize({ fontSize: 40 } as any, 16)).toBe(40);
    expect(resolveFontSize({ fontSize: 8 } as any, 16)).toBe(8);
    expect(resolveFontSize({ fontSize: 200 } as any, 16)).toBe(200);
    expect(resolveFontSize({ fontSize: 7 } as any, 16)).toBe(16);
    expect(resolveFontSize({ fontSize: 9999 } as any, 16)).toBe(16);
    expect(resolveFontSize({} as any, 16)).toBe(16);
  });

  it("resolveFontWeight accepts 100..900, else fallback", () => {
    expect(resolveFontWeight({ fontWeight: 300 } as any, 700)).toBe(300);
    expect(resolveFontWeight({ fontWeight: 50 } as any, 700)).toBe(700);
    expect(resolveFontWeight({ fontWeight: 1000 } as any, 700)).toBe(700);
    expect(resolveFontWeight({} as any, 700)).toBe(700);
  });
});

describe("heading — per-element color + typography", () => {
  it("explicit color wins over global text color", () => {
    const node = convertElement({ type: "heading", text: "H", level: 1, color: "#FF0000" }, makeCtx());
    expect(node!.textColor).toBe("#FF0000");
  });
  it("no color falls back to global text color", () => {
    const node = convertElement({ type: "heading", text: "H", level: 1 }, makeCtx());
    expect(node!.textColor).toBe(TEST_COLORS.text);
  });
  it("invalid color is ignored (fallback)", () => {
    const node = convertElement({ type: "heading", text: "H", level: 1, color: "red" } as any, makeCtx());
    expect(node!.textColor).toBe(TEST_COLORS.text);
  });
  it("explicit fontSize/fontWeight win over the level token", () => {
    const node = convertElement({ type: "heading", text: "H", level: 1, fontSize: 40, fontWeight: 300 } as any, makeCtx());
    expect(node!.fontSize).toBe(40);
    expect(node!.fontWeight).toBe(300);
  });
  it("out-of-range fontSize falls back to the level token", () => {
    const dflt = convertElement({ type: "heading", text: "H", level: 1 }, makeCtx());
    const node = convertElement({ type: "heading", text: "H", level: 1, fontSize: 9999 } as any, makeCtx());
    expect(node!.fontSize).toBe(dflt!.fontSize);
  });
});

describe("text elements honor explicit color", () => {
  it("subheading: explicit color, else secondary", () => {
    expect(convertElement({ type: "subheading", text: "S", color: "#0000FF" } as any, makeCtx())!.textColor).toBe("#0000FF");
    expect(convertElement({ type: "subheading", text: "S" }, makeCtx())!.textColor).toBe(TEST_COLORS.secondary);
  });
  it("paragraph: explicit color", () => {
    expect(convertElement({ type: "paragraph", text: "P", color: "#010203" } as any, makeCtx())!.textColor).toBe("#010203");
  });
  it("nav-links: explicit color applied to each link", () => {
    const node = convertElement({ type: "nav-links", links: ["A", "B"], color: "#0A0B0C" } as any, makeCtx());
    expect(node!.children.every((c) => c.textColor === "#0A0B0C")).toBe(true);
  });
  it("list: explicit color applied to items", () => {
    const node = convertElement({ type: "list", items: ["one", "two"], color: "#123123" } as any, makeCtx());
    expect(node!.children[0].textColor).toBe("#123123");
  });
  it("stat: explicit color applied to the value", () => {
    const node = convertElement({ type: "stat", value: "99%", label: "Uptime", color: "#654321" } as any, makeCtx());
    expect(node!.children[0].textColor).toBe("#654321");
  });
});

describe("containers honor explicit fillColor", () => {
  it("card: explicit fillColor wins over role", () => {
    const node = convertElement({ type: "card", fillColor: "#222222", elements: [] } as any, makeCtx());
    expect(node!.backgroundColor).toBe("#222222");
    expect(node!.fills[0].color).toEqual(expect.objectContaining({ r: expect.any(Number) }));
  });
  it("card: no fillColor keeps the role color (surface)", () => {
    const node = convertElement({ type: "card", background: "surface", elements: [] } as any, makeCtx());
    expect(node!.backgroundColor).toBe(TEST_COLORS.surface);
  });
  it("section-bg: explicit fillColor wins over role", () => {
    const node = convertSectionBackground({ type: "section-bg", x: 0, y: 0, width: 1440, height: 300, fillColor: "#0F0F0F" } as any, makeCtx());
    expect(node.backgroundColor).toBe("#0F0F0F");
  });
  it("section-bg: no fillColor keeps the role color", () => {
    const node = convertSectionBackground({ type: "section-bg", x: 0, y: 0, width: 1440, height: 300, background: "accent" } as any, makeCtx());
    expect(node.backgroundColor).toBe(TEST_COLORS.accent);
  });
});

describe("button — per-element color + fill + typography", () => {
  it("explicit color applies to the button label (node + text child)", () => {
    const node = convertElement({ type: "button", text: "Go", variant: "primary", size: "md", color: "#ABCDEF" } as any, makeCtx());
    expect(node!.textColor).toBe("#ABCDEF");
    expect(node!.children[0].textColor).toBe("#ABCDEF");
  });
  it("explicit fillColor overrides the variant background", () => {
    const node = convertElement({ type: "button", text: "Go", variant: "primary", size: "md", fillColor: "#334455" } as any, makeCtx());
    expect(node!.backgroundColor).toBe("#334455");
  });
  it("explicit fontSize/fontWeight win over the size token", () => {
    const node = convertElement({ type: "button", text: "Go", size: "md", fontSize: 22, fontWeight: 800 } as any, makeCtx());
    expect(node!.fontSize).toBe(22);
    expect(node!.children[0].fontSize).toBe(22);
    expect(node!.fontWeight).toBe(800);
  });
});

describe("postProcessAbsoluteResult — sanitizes per-element fidelity fields", () => {
  const base = { x: 0, y: 0, width: 100, height: 20 };

  it("keeps valid fields, strips invalid ones", () => {
    const r = postProcessAbsoluteResult({
      pageWidth: 1000,
      elements: [
        { type: "heading", ...base, color: "#AABBCC", fontSize: 32, fontWeight: 600 } as any,
        { type: "heading", ...base, color: "red", fontSize: 9999, fontWeight: 5 } as any,
        { type: "card", ...base, fillColor: "#101010" } as any,
        { type: "card", ...base, fillColor: "nope" } as any,
      ],
    } as any);
    const [a, b, c, d] = r.elements as any[];
    expect(a.color).toBe("#AABBCC");
    expect(a.fontSize).toBe(32);
    expect(a.fontWeight).toBe(600);
    expect(b.color).toBeUndefined();
    expect(b.fontSize).toBeUndefined();
    expect(b.fontWeight).toBeUndefined();
    expect(c.fillColor).toBe("#101010");
    expect(d.fillColor).toBeUndefined();
  });
});

describe("SCREENSHOT_ABSOLUTE_PROMPT — advertises the new fields", () => {
  it("mentions color, fillColor, fontSize, fontWeight", () => {
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain("color");
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain("fillColor");
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain("fontSize");
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain("fontWeight");
  });
  it("tells the model child bboxes are welcome and content appears exactly once", () => {
    expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain("EXACTLY ONCE");
    expect(SCREENSHOT_ABSOLUTE_PROMPT.toLowerCase()).toContain("children may include");
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — dedup: the model sometimes emits the same content both as container
// children and as positioned top-level elements. Keep the copy with geometry.
// ---------------------------------------------------------------------------
describe("postProcessAbsoluteResult — container/top-level dedup", () => {
  const card = () => ({
    type: "card", x: 50, y: 400, width: 1300, height: 250,
    elements: [
      { type: "heading", text: "Web2Wireframe", level: 3 },
      { type: "icon", size: "lg" },
    ],
  });

  it("drops the geometry-less container child when a positioned top-level twin exists inside the card", () => {
    const r = postProcessAbsoluteResult({
      pageWidth: 1440,
      elements: [
        card(),
        { type: "heading", text: "Web2Wireframe", level: 3, x: 214, y: 444, width: 225, height: 29 },
      ],
    } as any);
    const c = r.elements.find((e: any) => e.type === "card") as any;
    expect(c.elements.some((ch: any) => ch.text === "Web2Wireframe")).toBe(false);
    // top-level twin survives
    expect(r.elements.some((e: any) => e.type === "heading" && e.text === "Web2Wireframe")).toBe(true);
  });

  it("drops a geometry-less icon child when a positioned top-level icon sits inside the card", () => {
    const r = postProcessAbsoluteResult({
      pageWidth: 1440,
      elements: [
        card(),
        { type: "icon", size: "lg", x: 95, y: 480, width: 83, height: 83 },
      ],
    } as any);
    const c = r.elements.find((e: any) => e.type === "card") as any;
    expect(c.elements.some((ch: any) => ch.type === "icon")).toBe(false);
  });

  it("keeps the container child (drops the top-level twin) when the child has its own bbox", () => {
    const positioned = card() as any;
    positioned.elements[0] = { ...positioned.elements[0], x: 214, y: 444, width: 225, height: 29 };
    const r = postProcessAbsoluteResult({
      pageWidth: 1440,
      elements: [
        positioned,
        { type: "heading", text: "Web2Wireframe", level: 3, x: 214, y: 444, width: 225, height: 29 },
      ],
    } as any);
    const c = r.elements.find((e: any) => e.type === "card") as any;
    expect(c.elements.some((ch: any) => ch.text === "Web2Wireframe")).toBe(true);
    expect(r.elements.filter((e: any) => e.type === "heading" && e.text === "Web2Wireframe")).toHaveLength(0);
  });

  it("does NOT dedup a top-level element outside the container box", () => {
    const r = postProcessAbsoluteResult({
      pageWidth: 1440,
      elements: [
        card(),
        { type: "heading", text: "Web2Wireframe", level: 3, x: 100, y: 50, width: 225, height: 29 },
      ],
    } as any);
    const c = r.elements.find((e: any) => e.type === "card") as any;
    expect(c.elements.some((ch: any) => ch.text === "Web2Wireframe")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fix 4 — scaling must reach nested children and fontSize.
// ---------------------------------------------------------------------------
describe("scaleAbsoluteResult — nested + fontSize", () => {
  it("scales fontSize with the viewport factor (clamped to [8,200])", () => {
    const r = scaleAbsoluteResult({
      pageWidth: 2000,
      elements: [
        { type: "heading", x: 100, y: 100, width: 800, height: 100, fontSize: 90 } as any,
        { type: "paragraph", x: 0, y: 0, width: 100, height: 20, fontSize: 10 } as any,
      ],
    } as any, 1000);
    expect((r.elements[0] as any).fontSize).toBe(45);
    expect((r.elements[1] as any).fontSize).toBe(8); // 5 → clamped up to 8
  });

  it("scales child bboxes inside card elements", () => {
    const r = scaleAbsoluteResult({
      pageWidth: 2000,
      elements: [{
        type: "card", x: 100, y: 400, width: 1000, height: 200,
        elements: [
          { type: "icon", x: 200, y: 480, width: 80, height: 80 },
          { type: "badge", text: "no box" },
        ],
      } as any],
    } as any, 1000);
    const card = r.elements[0] as any;
    expect(card.elements[0].x).toBe(100);
    expect(card.elements[0].width).toBe(40);
    // geometry-less child untouched
    expect(card.elements[1].x).toBeUndefined();
  });
});
