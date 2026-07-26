import { describe, it, expect } from "vitest";
import {
  createIdGenerator,
  convertElement,
} from "../src/lib/wireframeConverter.js";
import {
  VALID_ELEMENT_TYPES,
  validateAbsoluteFormat,
  SCREENSHOT_ABSOLUTE_PROMPT,
} from "../src/lib/aiGenerator.js";

// ---------------------------------------------------------------------------
// Phase 2 — new element types. Each converter composes only primitive node
// types (frame / text / placeholder), so no plugin change is required.
// ---------------------------------------------------------------------------

const TEST_COLORS = {
  text: "#11151A",
  background: "#F1F2F0",
  secondary: "#BDC1B2",
  surface: "#AAB5C3",
  accent: "#AFC6DC",
};

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    viewportWidth: 1440,
    breakpoint: "desktop",
    colors: TEST_COLORS,
    font: "Montserrat",
    nextId: createIdGenerator(),
    ...overrides,
  } as any;
}

const NEW_TYPES = [
  "search", "tabs", "checkbox", "toggle", "breadcrumb",
  "select", "table", "pagination", "rating", "carousel",
];

/** Every node in the tree is a valid primitive type. */
function assertPrimitivesOnly(node: any) {
  expect(["frame", "text", "placeholder"]).toContain(node.type);
  (node.children || []).forEach(assertPrimitivesOnly);
}

describe("registration", () => {
  it("all new types are in VALID_ELEMENT_TYPES", () => {
    for (const t of NEW_TYPES) expect(VALID_ELEMENT_TYPES).toContain(t);
  });
  it("validateAbsoluteFormat accepts the new types", () => {
    const el = (type: string) => ({ type, x: 0, y: 0, width: 100, height: 40 });
    const res = validateAbsoluteFormat({ elements: NEW_TYPES.map(el) });
    expect(res.success).toBe(true);
  });
  it("prompt advertises the new types", () => {
    for (const t of NEW_TYPES) expect(SCREENSHOT_ABSOLUTE_PROMPT).toContain(t);
  });
  it("every new converter emits only primitive node types", () => {
    for (const t of NEW_TYPES) {
      const node = convertElement({ type: t } as any, makeCtx());
      expect(node).not.toBeNull();
      assertPrimitivesOnly(node);
    }
  });
});

describe("search", () => {
  it("renders an icon + placeholder text", () => {
    const node = convertElement({ type: "search", placeholder: "Find products" } as any, makeCtx());
    expect(node!.type).toBe("frame");
    const hasPlaceholderIcon = node!.children.some((c) => c.type === "placeholder");
    const textNode = node!.children.find((c) => c.type === "text");
    expect(hasPlaceholderIcon).toBe(true);
    expect(textNode?.textContent).toBe("Find products");
  });
});

describe("tabs", () => {
  it("renders a row of tab labels + a divider, active tab bold", () => {
    const node = convertElement({ type: "tabs", tabs: ["One", "Two", "Three"], activeIndex: 1 } as any, makeCtx());
    const row = node!.children[0];
    const divider = node!.children[1];
    expect(row.children).toHaveLength(3);
    expect(row.children[1].fontWeight).toBeGreaterThanOrEqual(600);
    expect(row.children[0].fontWeight).toBeLessThan(600);
    expect(divider.tag).toBe("hr");
  });
});

describe("checkbox", () => {
  it("renders a box + label", () => {
    const node = convertElement({ type: "checkbox", label: "Accept", checked: true } as any, makeCtx());
    expect(node!.layoutMode).toBe("HORIZONTAL");
    const box = node!.children[0];
    expect(box.width).toBe(18);
    expect(box.fills.length).toBeGreaterThan(0); // checked → filled
    const label = node!.children.find((c) => c.type === "text");
    expect(label?.textContent).toBe("Accept");
  });
  it("unchecked box has no fill", () => {
    const node = convertElement({ type: "checkbox", label: "X", checked: false } as any, makeCtx());
    expect(node!.children[0].fills).toHaveLength(0);
  });
});

describe("toggle", () => {
  it("renders a pill; on-state uses accent fill", () => {
    const node = convertElement({ type: "toggle", label: "Dark", on: true } as any, makeCtx());
    const pill = node!.children[0];
    expect(pill.borderRadius).toBeGreaterThanOrEqual(11);
    expect(pill.backgroundColor).toBe(TEST_COLORS.accent);
  });
});

describe("breadcrumb", () => {
  it("renders items interleaved with separators", () => {
    const node = convertElement({ type: "breadcrumb", items: ["Home", "Docs", "API"] } as any, makeCtx());
    const texts = node!.children.filter((c) => c.type === "text");
    // 3 items + 2 separators
    expect(texts.length).toBe(5);
    expect(texts[0].textContent).toBe("Home");
  });
});

describe("select", () => {
  it("renders a box with placeholder + chevron", () => {
    const node = convertElement({ type: "select", placeholder: "Choose" } as any, makeCtx());
    assertPrimitivesOnly(node);
    const text = JSON.stringify(node).includes("Choose");
    expect(text).toBe(true);
  });
});

describe("table", () => {
  it("renders a header row + one row per data row", () => {
    const node = convertElement({
      type: "table",
      headers: ["Name", "Price"],
      rows: [["A", "$1"], ["B", "$2"]],
    } as any, makeCtx());
    // header + 2 rows = at least 3 row frames (dividers optional)
    const rowFrames = node!.children.filter((c) => c.layoutMode === "HORIZONTAL");
    expect(rowFrames.length).toBe(3);
    expect(rowFrames[0].children).toHaveLength(2); // 2 columns
  });
});

describe("pagination", () => {
  it("renders one control per page", () => {
    const node = convertElement({ type: "pagination", pages: 5 } as any, makeCtx());
    expect(node!.children).toHaveLength(5);
  });
});

describe("rating", () => {
  it("renders max icons, `rating` of them filled", () => {
    const node = convertElement({ type: "rating", rating: 3, max: 5 } as any, makeCtx());
    expect(node!.children).toHaveLength(5);
    const filled = node!.children.filter((c) => c.backgroundColor === TEST_COLORS.accent);
    expect(filled).toHaveLength(3);
  });
});

describe("carousel", () => {
  it("renders an image placeholder + a dot row", () => {
    const node = convertElement({ type: "carousel", height: 300 } as any, makeCtx());
    const img = node!.children.find((c) => c.type === "placeholder");
    const dotRow = node!.children.find((c) => c.layoutMode === "HORIZONTAL");
    expect(img).toBeTruthy();
    expect(dotRow?.children.length).toBeGreaterThanOrEqual(2);
  });
});
