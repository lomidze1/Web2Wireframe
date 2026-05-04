import { describe, it, expect } from "vitest";
import {
  hexToFigmaColor,
  solidFill,
  resolveBackgroundColor,
  createDefaultNode,
  createIdGenerator,
  convertElement,
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
