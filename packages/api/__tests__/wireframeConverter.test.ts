import { describe, it, expect } from "vitest";
import {
  hexToFigmaColor,
  solidFill,
  resolveBackgroundColor,
  createDefaultNode,
  createIdGenerator,
  convertElement,
  convertAbsoluteElement,
  convertAbsoluteToWireframeTree,
} from "../src/lib/wireframeConverter.js";

// ============================================================================
// Test helpers
// ============================================================================

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
  };
}

/** Check that a node has all required WireframeNode fields */
function assertWireframeNode(node: any) {
  expect(node).toHaveProperty("id");
  expect(node).toHaveProperty("name");
  expect(node).toHaveProperty("type");
  expect(["frame", "text", "placeholder"]).toContain(node.type);
  expect(node).toHaveProperty("tag");
  expect(typeof node.x).toBe("number");
  expect(typeof node.y).toBe("number");
  expect(typeof node.width).toBe("number");
  expect(typeof node.height).toBe("number");
  expect(node).toHaveProperty("layoutMode");
  expect(typeof node.itemSpacing).toBe("number");
  expect(node).toHaveProperty("padding");
  expect(node.padding).toHaveProperty("top");
  expect(node.padding).toHaveProperty("right");
  expect(node.padding).toHaveProperty("bottom");
  expect(node.padding).toHaveProperty("left");
  expect(typeof node.borderWidth).toBe("number");
  expect(typeof node.opacity).toBe("number");
  expect(node).toHaveProperty("textContent");
  expect(typeof node.fontSize).toBe("number");
  expect(typeof node.fontWeight).toBe("number");
  expect(node).toHaveProperty("fontFamily");
  expect(node).toHaveProperty("textAlign");
  expect(typeof node.letterSpacing).toBe("number");
  expect(node).toHaveProperty("textColor");
  expect(typeof node.isPlaceholder).toBe("boolean");
  expect(Array.isArray(node.children)).toBe(true);
  expect(Array.isArray(node.fills)).toBe(true);
  // backgroundGradient should exist (can be null)
  expect(node).toHaveProperty("backgroundGradient");
}

// ============================================================================
// Utility function tests
// ============================================================================

describe("hexToFigmaColor", () => {
  it("converts valid hex to r,g,b,a", () => {
    const result = hexToFigmaColor("#FF0000");
    expect(result).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it("converts #000000", () => {
    const result = hexToFigmaColor("#000000");
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("converts #FFFFFF", () => {
    const result = hexToFigmaColor("#FFFFFF");
    expect(result).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("returns a=0 for transparent", () => {
    const result = hexToFigmaColor("transparent");
    expect(result.a).toBe(0);
  });

  it("returns a=0 for null/undefined", () => {
    expect(hexToFigmaColor(null as any).a).toBe(0);
    expect(hexToFigmaColor(undefined as any).a).toBe(0);
  });
});

describe("solidFill", () => {
  it("creates a SOLID fill with correct structure", () => {
    const fill = solidFill("#3b82f6");
    expect(fill.type).toBe("SOLID");
    expect(fill.visible).toBe(true);
    expect(fill.opacity).toBe(1);
    expect(fill.color).toHaveProperty("r");
    expect(fill.color).toHaveProperty("g");
    expect(fill.color).toHaveProperty("b");
    expect(fill.color).toHaveProperty("a");
    expect(fill.color.a).toBe(1);
  });
});

describe("resolveBackgroundColor", () => {
  it("resolves 'background' to colors.background", () => {
    expect(resolveBackgroundColor("background", TEST_COLORS)).toBe("#F1F2F0");
  });
  it("resolves 'surface' to colors.surface", () => {
    expect(resolveBackgroundColor("surface", TEST_COLORS)).toBe("#AAB5C3");
  });
  it("resolves 'accent' to colors.accent", () => {
    expect(resolveBackgroundColor("accent", TEST_COLORS)).toBe("#AFC6DC");
  });
  it("resolves 'transparent' to null", () => {
    expect(resolveBackgroundColor("transparent", TEST_COLORS)).toBeNull();
  });
  it("resolves unknown to null", () => {
    expect(resolveBackgroundColor("unknown", TEST_COLORS)).toBeNull();
  });
});

describe("createDefaultNode", () => {
  it("returns a node with all required fields", () => {
    const nextId = createIdGenerator();
    const node = createDefaultNode(nextId);
    assertWireframeNode(node);
  });

  it("applies overrides", () => {
    const nextId = createIdGenerator();
    const node = createDefaultNode(nextId, { name: "Test", type: "text", tag: "h1" });
    expect(node.name).toBe("Test");
    expect(node.type).toBe("text");
    expect(node.tag).toBe("h1");
  });

  it("generates sequential IDs", () => {
    const nextId = createIdGenerator();
    const n1 = createDefaultNode(nextId);
    const n2 = createDefaultNode(nextId);
    expect(n1.id).toBe("ai-node-1");
    expect(n2.id).toBe("ai-node-2");
  });
});

// ============================================================================
// Element converters
// ============================================================================

describe("Element: heading", () => {
  it("creates text node with correct font size for h1", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "heading", text: "Title", level: 1, align: "center" }, ctx);
    expect(node.type).toBe("text");
    expect(node.tag).toBe("h1");
    expect(node.fontSize).toBe(48); // desktop h1
    expect(node.fontWeight).toBe(700);
    expect(node.textAlign).toBe("center");
    expect(node.textContent).toBe("Title");
    assertWireframeNode(node);
  });

  it("uses tablet font size for tablet breakpoint", () => {
    const ctx = makeCtx({ breakpoint: "tablet" });
    const node = convertElement({ type: "heading", text: "T", level: 2 }, ctx);
    expect(node.fontSize).toBe(32); // tablet h2
  });
});

describe("Element: subheading", () => {
  it("creates text node with subheading styling", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "subheading", text: "Sub" }, ctx);
    expect(node.type).toBe("text");
    expect(node.fontSize).toBe(18); // desktop subheading
    expect(node.fontWeight).toBe(500);
    assertWireframeNode(node);
  });
});

describe("Element: paragraph", () => {
  it("creates text node", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "paragraph", text: "Body text", align: "left" }, ctx);
    expect(node.type).toBe("text");
    expect(node.fontSize).toBe(16); // desktop paragraph
    expect(node.fontWeight).toBe(400);
    assertWireframeNode(node);
  });

  it("applies maxWidth when specified", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "paragraph", text: "T", maxWidth: 520 }, ctx);
    expect(node.width).toBe(520);
    expect(node.layoutSizingHorizontal).toBe("FIXED");
  });
});

describe("Element: button", () => {
  it("creates frame with text child (primary)", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "button", text: "Click", variant: "primary", size: "md" }, ctx);
    expect(node.type).toBe("frame");
    expect(node.tag).toBe("button");
    expect(node.layoutMode).toBe("HORIZONTAL");
    expect(node.height).toBe(40); // md height
    expect(node.fills.length).toBe(1);
    expect(node.children.length).toBe(1);
    expect(node.children[0].type).toBe("text");
    expect(node.children[0].textContent).toBe("Click");
    assertWireframeNode(node);
    assertWireframeNode(node.children[0]);
  });

  it("outline variant has strokes and no fills", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "button", text: "Outline", variant: "outline", size: "sm" }, ctx);
    expect(node.fills.length).toBe(0);
    expect(node.strokes.length).toBe(1);
    expect(node.borderColor).toBe(TEST_COLORS.secondary);
    expect(node.height).toBe(32); // sm height
  });

  it("ghost variant has no fills and no strokes", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "button", text: "Ghost", variant: "ghost", size: "lg" }, ctx);
    expect(node.fills.length).toBe(0);
    expect(node.strokes.length).toBe(0);
    expect(node.height).toBe(48); // lg height
  });
});

describe("Element: button-group", () => {
  it("creates frame with button children", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "button-group",
      direction: "horizontal",
      buttons: [
        { text: "A", variant: "primary", size: "md" },
        { text: "B", variant: "outline", size: "md" },
      ],
    }, ctx);
    expect(node.type).toBe("frame");
    expect(node.layoutMode).toBe("HORIZONTAL");
    expect(node.children.length).toBe(2);
    assertWireframeNode(node);
  });

  it("supports vertical direction", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "button-group",
      direction: "vertical",
      buttons: [{ text: "A", variant: "primary", size: "md" }],
    }, ctx);
    expect(node.layoutMode).toBe("VERTICAL");
  });
});

describe("Element: image", () => {
  it("creates placeholder with correct dimensions", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "image", width: "half", aspectRatio: "16:9", rounded: true }, ctx);
    expect(node.type).toBe("placeholder");
    expect(node.isPlaceholder).toBe(true);
    expect(node.width).toBe(Math.round(1440 * 0.48));
    expect(node.height).toBe(Math.round(Math.round(1440 * 0.48) * 0.5625));
    expect(node.borderRadius).toBe(12);
    assertWireframeNode(node);
  });

  it("full width uses FILL sizing", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "image", width: "full", aspectRatio: "16:9" }, ctx);
    expect(node.layoutSizingHorizontal).toBe("FILL");
  });

  it("numeric width is used as-is", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "image", width: 300, aspectRatio: "1:1" }, ctx);
    expect(node.width).toBe(300);
    expect(node.height).toBe(300);
  });
});

describe("Element: icon", () => {
  it("creates placeholder with correct size", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "icon", size: "lg" }, ctx);
    expect(node.type).toBe("placeholder");
    expect(node.width).toBe(48);
    expect(node.height).toBe(48);
    expect(node.isPlaceholder).toBe(true);
    expect(node.borderRadius).toBe(24); // half of 48
    assertWireframeNode(node);
  });
});

describe("Element: card", () => {
  it("creates frame with nested elements", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "card",
      padding: 24,
      rounded: true,
      shadow: true,
      background: "background",
      elements: [
        { type: "heading", text: "Card Title", level: 3 },
        { type: "paragraph", text: "Card body" },
      ],
    }, ctx);
    expect(node.type).toBe("frame");
    expect(node.borderRadius).toBe(12);
    expect(node.children.length).toBe(2);
    expect(node.effects.length).toBe(1);
    expect(node.effects[0].type).toBe("DROP_SHADOW");
    assertWireframeNode(node);
  });

  it("no shadow by default", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "card", elements: [] }, ctx);
    expect(node.effects.length).toBe(0);
  });

  it("transparent background card has no fills", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "card", background: "transparent", elements: [] }, ctx);
    expect(node.fills.length).toBe(0);
  });
});

describe("Element: input", () => {
  it("creates wrapper with label and input field", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "input",
      label: "Email",
      placeholder: "Enter your email",
      inputType: "email",
    }, ctx);
    expect(node.type).toBe("frame");
    expect(node.children.length).toBe(2); // label + input field
    expect(node.children[0].type).toBe("text");
    expect(node.children[0].textContent).toBe("Email");
    expect(node.children[1].type).toBe("frame"); // input field
    expect(node.children[1].children[0].textContent).toBe("Enter your email");
    assertWireframeNode(node);
  });

  it("textarea has taller height", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "input", label: "Bio", inputType: "textarea" }, ctx);
    const inputField = node.children[1];
    expect(inputField.height).toBe(44 * 3); // 3x normal height
  });

  it("input without label has only input field", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "input", placeholder: "Search" }, ctx);
    expect(node.children.length).toBe(1);
  });
});

describe("Element: nav-links", () => {
  it("creates horizontal nav with link children", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "nav-links",
      links: ["Home", "About", "Contact"],
      direction: "horizontal",
    }, ctx);
    expect(node.tag).toBe("nav");
    expect(node.layoutMode).toBe("HORIZONTAL");
    expect(node.children.length).toBe(3);
    expect(node.children[0].textContent).toBe("Home");
    expect(node.children[0].tag).toBe("a");
    assertWireframeNode(node);
  });

  it("supports vertical direction", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "nav-links",
      links: ["A", "B"],
      direction: "vertical",
    }, ctx);
    expect(node.layoutMode).toBe("VERTICAL");
    expect(node.itemSpacing).toBe(8);
  });
});

describe("Element: logo", () => {
  it("creates placeholder with correct dimensions", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "logo", size: "md" }, ctx);
    expect(node.type).toBe("placeholder");
    expect(node.width).toBe(120);
    expect(node.height).toBe(32);
    expect(node.isPlaceholder).toBe(true);
    assertWireframeNode(node);
  });
});

describe("Element: divider", () => {
  it("creates 1px frame", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "divider" }, ctx);
    expect(node.height).toBe(1);
    expect(node.layoutSizingHorizontal).toBe("FILL");
    expect(node.fills.length).toBe(1);
    assertWireframeNode(node);
  });
});

describe("Element: badge", () => {
  it("creates frame with text child", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "badge", text: "New", variant: "accent" }, ctx);
    expect(node.type).toBe("frame");
    expect(node.borderRadius).toBe(100); // pill shape
    expect(node.children.length).toBe(1);
    expect(node.children[0].textContent).toBe("New");
    assertWireframeNode(node);
  });
});

describe("Element: list", () => {
  it("creates list with bullet items", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "list",
      items: ["Item A", "Item B"],
      style: "bullet",
    }, ctx);
    expect(node.type).toBe("frame");
    expect(node.tag).toBe("ul");
    expect(node.children.length).toBe(2);
    expect(node.children[0].textContent).toContain("Item A");
    expect(node.children[0].textContent).toContain("\u2022");
    assertWireframeNode(node);
  });

  it("numbered list uses index prefix", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "list",
      items: ["First", "Second"],
      style: "numbered",
    }, ctx);
    expect(node.tag).toBe("ol");
    expect(node.children[0].textContent).toBe("1. First");
    expect(node.children[1].textContent).toBe("2. Second");
  });

  it("check list uses checkmark prefix", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "list",
      items: ["Done"],
      style: "check",
    }, ctx);
    expect(node.children[0].textContent).toContain("\u2713");
  });
});

describe("Element: avatar", () => {
  it("creates circular placeholder", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "avatar", size: "lg" }, ctx);
    expect(node.type).toBe("placeholder");
    expect(node.width).toBe(64);
    expect(node.height).toBe(64);
    expect(node.borderRadius).toBe(32); // half of 64
    expect(node.isPlaceholder).toBe(true);
    assertWireframeNode(node);
  });
});

describe("Element: stat", () => {
  it("creates frame with value and label children", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "stat", value: "$99", label: "per month" }, ctx);
    expect(node.type).toBe("frame");
    expect(node.children.length).toBe(2);
    expect(node.children[0].textContent).toBe("$99");
    expect(node.children[0].fontSize).toBe(48); // desktop stat_value
    expect(node.children[1].textContent).toBe("per month");
    assertWireframeNode(node);
  });
});

describe("Element: grid", () => {
  it("creates grid frame with items", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "grid",
      columns: 3,
      gap: 32,
      items: [
        { type: "card", elements: [{ type: "heading", text: "A", level: 3 }], background: "background" },
        { type: "card", elements: [{ type: "heading", text: "B", level: 3 }], background: "background" },
      ],
    }, ctx);
    expect(node.layoutMode).toBe("HORIZONTAL");
    expect(node.children.length).toBe(2);
    assertWireframeNode(node);
  });

  it("grid stacks vertically on mobile", () => {
    const ctx = makeCtx({ breakpoint: "mobile", viewportWidth: 375 });
    const node = convertElement({
      type: "grid",
      columns: 3,
      items: [{ type: "heading", text: "A", level: 3 }],
    }, ctx);
    expect(node.layoutMode).toBe("VERTICAL");
  });

  // The AI prompt schema documents grid children under "elements"
  // (see SCREENSHOT_ABSOLUTE_PROMPT) — the converter must accept that key.
  it("creates grid children from 'elements' key (prompt schema)", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "grid",
      columns: 3,
      elements: [
        { type: "card", elements: [{ type: "heading", text: "A", level: 3 }], background: "background" },
        { type: "card", elements: [{ type: "heading", text: "B", level: 3 }], background: "background" },
        { type: "card", elements: [{ type: "heading", text: "C", level: 3 }], background: "background" },
      ],
    }, ctx);
    expect(node.children.length).toBe(3);
    expect(node.children[0].children[0].textContent).toBe("A");
    assertWireframeNode(node);
  });

  it("'elements' key wins over 'items' when both present", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "grid",
      elements: [{ type: "heading", text: "from-elements", level: 3 }],
      items: [{ type: "heading", text: "from-items", level: 3 }],
    }, ctx);
    expect(node.children.length).toBe(1);
    expect(node.children[0].textContent).toBe("from-elements");
  });
});

describe("Element: accordion", () => {
  it("creates accordion with question/answer items", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "accordion",
      items: [
        { question: "Q1?", answer: "A1" },
        { question: "Q2?", answer: "A2" },
      ],
    }, ctx);
    expect(node.type).toBe("frame");
    expect(node.children.length).toBe(2);
    expect(node.children[0].children.length).toBe(2); // question + answer
    expect(node.children[0].children[0].textContent).toBe("Q1?");
    expect(node.children[0].children[1].textContent).toBe("A1");
    assertWireframeNode(node);
  });

  // The AI prompt schema documents accordion items as {title, content}
  // (see SCREENSHOT_ABSOLUTE_PROMPT) — the converter must accept those keys.
  it("creates accordion from {title, content} items (prompt schema)", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "accordion",
      items: [
        { title: "How does it work?", content: "Very well." },
        { title: "Is it free?", content: "There is a free tier." },
      ],
    }, ctx);
    expect(node.children.length).toBe(2);
    expect(node.children[0].children[0].textContent).toBe("How does it work?");
    expect(node.children[0].children[1].textContent).toBe("Very well.");
    expect(node.children[1].children[0].textContent).toBe("Is it free?");
    assertWireframeNode(node);
  });

  it("accordion item name falls back to title when question absent", () => {
    const ctx = makeCtx();
    const node = convertElement({
      type: "accordion",
      items: [{ title: "Titled item", content: "Body" }],
    }, ctx);
    expect(node.children[0].name).toBe("Titled item");
  });
});

describe("Element: table", () => {
  const TABLE = {
    type: "table",
    headers: ["Feature", "Free", "Pro"],
    rows: [
      ["Imports per month", "10", "Unlimited"],
      ["Colors", "Full access", "Full access"],
      ["Support", "Community", "Priority"],
    ],
  };

  it("header row uses headerFill / headerTextColor when provided", () => {
    const ctx = makeCtx();
    const node = convertElement({ ...TABLE, headerFill: "#2F80F5", headerTextColor: "#FFFFFF" }, ctx);
    const header = node.children[0];
    expect(header.name).toBe("Header Row");
    expect(header.backgroundColor).toBe("#2F80F5");
    expect(header.fills).toEqual([solidFill("#2F80F5")]);
    expect(header.children.every((c: any) => c.textColor === "#FFFFFF")).toBe(true);
    assertWireframeNode(node);
  });

  it("falls back to surface / text colors when header colors are absent", () => {
    const ctx = makeCtx();
    const header = convertElement(TABLE, ctx).children[0];
    expect(header.backgroundColor).toBe(TEST_COLORS.surface);
    expect(header.children.every((c: any) => c.textColor === TEST_COLORS.text)).toBe(true);
  });

  it("ignores a malformed headerFill and keeps the surface fallback", () => {
    const ctx = makeCtx();
    const header = convertElement({ ...TABLE, headerFill: "blue" }, ctx).children[0];
    expect(header.backgroundColor).toBe(TEST_COLORS.surface);
  });

  it("gives every row but the last a bottom-only separator stroke", () => {
    const ctx = makeCtx();
    const rows = convertElement(TABLE, ctx).children;
    expect(rows.length).toBe(4); // header + 3 body rows
    for (const row of rows.slice(0, -1)) {
      expect(row.strokes).toEqual([{
        color: hexToFigmaColor(TEST_COLORS.secondary),
        weight: 1,
        position: "INSIDE",
        style: "SOLID",
        sides: { top: false, right: false, bottom: true, left: false },
      }]);
    }
    expect(rows[rows.length - 1].strokes).toEqual([]);
  });

  it("marks header cells th/700 and body cells td/normal", () => {
    const ctx = makeCtx();
    const [header, firstRow] = convertElement(TABLE, ctx).children;
    expect(header.children.map((c: any) => c.tag)).toEqual(["th", "th", "th"]);
    expect(header.children.every((c: any) => c.fontWeight === 700)).toBe(true);
    expect(firstRow.children.map((c: any) => c.tag)).toEqual(["td", "td", "td"]);
    expect(firstRow.children.every((c: any) => c.fontWeight !== 700)).toBe(true);
  });

  // The AI reports the table's real on-screen box. Without distribution the rows
  // stack at their natural ~42px and leave the rest of the bordered box empty.
  it("distributes a declared height across the rows", () => {
    const ctx = makeCtx();
    const node = convertAbsoluteElement({ ...TABLE, x: 40, y: 30, width: 1360, height: 400 }, ctx);
    const heights = node.children.map((c: any) => c.height);
    expect(heights).toEqual([100, 100, 100, 100]);
    expect(heights.reduce((a: number, b: number) => a + b, 0)).toBe(400);
    // Rows tile the box with no gap and no trailing slack.
    expect(node.children.map((c: any) => c.y)).toEqual([0, 100, 200, 300]);
  });

  it("gives the rounding remainder to the last row", () => {
    const ctx = makeCtx();
    const node = convertAbsoluteElement({ ...TABLE, x: 0, y: 0, width: 600, height: 402 }, ctx);
    const heights = node.children.map((c: any) => c.height);
    expect(heights).toEqual([100, 100, 100, 102]);
    expect(heights.reduce((a: number, b: number) => a + b, 0)).toBe(402);
  });

  it("centers cells vertically inside a stretched row", () => {
    const ctx = makeCtx();
    const node = convertAbsoluteElement({ ...TABLE, x: 0, y: 0, width: 600, height: 400 }, ctx);
    const cell = node.children[0].children[0];
    expect(cell.y).toBeGreaterThan(node.children[0].padding.top);
    expect(cell.y + cell.height / 2).toBeCloseTo(50, 0); // row centre
  });

  it("keeps natural row heights when the declared height would squash them", () => {
    const ctx = makeCtx();
    const node = convertAbsoluteElement({ ...TABLE, x: 0, y: 0, width: 600, height: 60 }, ctx);
    for (const row of node.children) expect(row.height).toBeGreaterThanOrEqual(32);
  });

  it("keeps natural row heights when no height is declared", () => {
    const ctx = makeCtx();
    const withHeight = convertAbsoluteElement({ ...TABLE, x: 0, y: 0, width: 600, height: 400 }, ctx);
    const without = convertAbsoluteElement({ ...TABLE, x: 0, y: 0, width: 600 }, makeCtx());
    expect(without.children[0].height).toBeLessThan(withHeight.children[0].height);
    expect(new Set(without.children.map((c: any) => c.height)).size).toBe(1);
  });

  it("clips the outer frame so a filled header respects the corner radius", () => {
    const ctx = makeCtx();
    expect(convertElement(TABLE, ctx).overflow).toBe("hidden");
  });

  // Without an opaque body the page background shows through every row, so a
  // white table on a tinted page loses its outline entirely.
  it("fills the outer frame with surface so the body is opaque", () => {
    const ctx = makeCtx();
    const node = convertElement(TABLE, ctx);
    expect(node.backgroundColor).toBe(TEST_COLORS.surface);
    expect(node.fills).toEqual([solidFill(TEST_COLORS.surface)]);
  });

  it("uses an AI-reported fillColor for the table body", () => {
    const ctx = makeCtx();
    const node = convertElement({ ...TABLE, fillColor: "#FFFFFF" }, ctx);
    expect(node.backgroundColor).toBe("#FFFFFF");
    expect(node.fills).toEqual([solidFill("#FFFFFF")]);
  });

  it("ignores a malformed fillColor and keeps the surface fallback", () => {
    const ctx = makeCtx();
    const node = convertElement({ ...TABLE, fillColor: "white" }, ctx);
    expect(node.backgroundColor).toBe(TEST_COLORS.surface);
  });

  it("rounds the table corners enough to read at page scale", () => {
    const ctx = makeCtx();
    expect(convertElement(TABLE, ctx).borderRadius).toBe(10);
  });

  it("renders a header-less table without a separator on the only row", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "table", rows: [["only", "row"]] }, ctx);
    expect(node.children.length).toBe(1);
    expect(node.children[0].strokes).toEqual([]);
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("Edge cases", () => {
  it("convertElement returns null for unknown type", () => {
    const ctx = makeCtx();
    expect(convertElement({ type: "unknown" }, ctx)).toBeNull();
  });

  it("convertElement returns null for null element", () => {
    const ctx = makeCtx();
    expect(convertElement(null, ctx)).toBeNull();
  });

  it("convertElement returns null for element without type", () => {
    const ctx = makeCtx();
    expect(convertElement({}, ctx)).toBeNull();
  });

  it("heading defaults to level 2 when not specified", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "heading", text: "Test" }, ctx);
    expect(node.tag).toBe("h2");
    expect(node.fontSize).toBe(36); // desktop h2
  });

  it("button defaults to md size and primary variant", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "button", text: "Click" }, ctx);
    expect(node.height).toBe(40); // md
    expect(node.fills.length).toBe(1); // primary has fill
  });

  it("image with unknown width string defaults to viewport width", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "image", width: "unknown", aspectRatio: "16:9" }, ctx);
    expect(node.width).toBe(1440);
  });

  it("image with unknown aspect ratio defaults to 16:9", () => {
    const ctx = makeCtx();
    const node = convertElement({ type: "image", width: 400, aspectRatio: "unknown" }, ctx);
    expect(node.height).toBe(Math.round(400 * 0.5625));
  });
});

// ============================================================================
// Section nesting
// ============================================================================

describe("Section nesting", () => {
  // Factories, not constants: nestBySections appends children to the section
  // object it is given, so a shared literal would accumulate across tests.
  const FOOTER = () => ({
    type: "section-bg",
    name: "Footer",
    x: 0,
    y: 3600,
    width: 1440,
    height: 400,
    background: "surface",
  });
  const HERO = () => ({
    type: "section-bg",
    name: "Hero",
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
    background: "background",
  });

  function tree(elements: unknown[], pageHeight = 4000) {
    return convertAbsoluteToWireframeTree(
      { pageWidth: 1440, pageHeight, elements } as never,
      1440,
      TEST_COLORS,
      TEST_FONT,
    );
  }

  it("renders section children inside the section frame", () => {
    const root = tree([
      FOOTER(),
      { type: "logo", x: 100, y: 3650, width: 160, height: 48 },
      { type: "nav-links", links: ["Docs"], x: 400, y: 3660, width: 200, height: 24 },
    ]);

    expect(root.children).toHaveLength(1);
    const footer = root.children[0];
    expect(footer.name).toBe("Footer");
    expect(footer.children).toHaveLength(2);
  });

  it("rebases child coordinates onto the section origin", () => {
    const root = tree([
      FOOTER(),
      { type: "logo", x: 100, y: 3650, width: 160, height: 48 },
    ]);

    const logo = root.children[0].children[0];
    expect(logo.x).toBe(100);
    expect(logo.y).toBe(50); // 3650 - 3600
    expect(logo.absolutePositioned).toBe(true);
  });

  it("keeps each section's own content separate", () => {
    const root = tree([
      HERO(),
      FOOTER(),
      { type: "heading", text: "Hi", level: 1, x: 100, y: 200, width: 600, height: 60 },
      { type: "paragraph", text: "legal", x: 100, y: 3700, width: 600, height: 40 },
    ]);

    expect(root.children).toHaveLength(2);
    const [hero, footer] = root.children;
    expect(hero.children).toHaveLength(1);
    expect(footer.children).toHaveLength(1);
    expect(hero.children[0].type).toBe("text");
  });

  it("leaves content outside every section at the top level", () => {
    const root = tree([
      FOOTER(),
      { type: "badge", text: "New", x: 100, y: 2000, width: 80, height: 24 },
    ]);

    expect(root.children).toHaveLength(2);
    expect(root.children.find((c: any) => c.name === "Footer").children).toHaveLength(0);
  });

  it("does not clip section content", () => {
    const root = tree([
      FOOTER(),
      { type: "logo", x: 100, y: 3650, width: 160, height: 48 },
    ]);

    // No overflow set → the plugin leaves clipsContent false.
    expect(root.children[0].overflow).toBeUndefined();
  });
});
