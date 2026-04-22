/**
 * Style Versioning — Phase 1 TDD
 *
 * Covers the hybrid matching system:
 *   Category A (named): name lookup → value check → skip if match, else -V2/-V3 suffix
 *   Category B (auto-numbered): value-first lookup across namespace → reuse or counter++
 *
 * Applies to: createPluginColorStyles, createUnifiedWebsiteColorStyles, createTextStyles.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtractedCSSVariable, WireframeFrame } from "../types";

// ============================================================================
// Stateful Figma Mock
// ============================================================================

interface MockPaintStyle {
  id: string;
  name: string;
  paints: readonly Paint[];
}

interface MockTextStyle {
  id: string;
  name: string;
  fontName: { family: string; style: string };
  fontSize: number;
  lineHeight: LineHeight;
  letterSpacing?: LetterSpacing;
}

let mockPaintStyles: MockPaintStyle[] = [];
let mockTextStyles: MockTextStyle[] = [];
let createPaintStyleCallCount = 0;
let createTextStyleCallCount = 0;
let paintStyleIdCounter = 0;
let textStyleIdCounter = 0;

function installFigmaMock(): void {
  (globalThis as Record<string, unknown>).figma = {
    getLocalPaintStyles: vi.fn(() => mockPaintStyles),
    createPaintStyle: vi.fn(() => {
      createPaintStyleCallCount++;
      const style: MockPaintStyle = {
        id: `paint-${++paintStyleIdCounter}`,
        name: "",
        paints: [],
      };
      mockPaintStyles.push(style);
      return style;
    }),
    getLocalTextStyles: vi.fn(() => mockTextStyles),
    createTextStyle: vi.fn(() => {
      createTextStyleCallCount++;
      const style: MockTextStyle = {
        id: `text-${++textStyleIdCounter}`,
        name: "",
        fontName: { family: "Inter", style: "Regular" },
        fontSize: 16,
        lineHeight: { unit: "AUTO" },
      };
      mockTextStyles.push(style);
      return style;
    }),
    loadFontAsync: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  mockPaintStyles = [];
  mockTextStyles = [];
  createPaintStyleCallCount = 0;
  createTextStyleCallCount = 0;
  paintStyleIdCounter = 0;
  textStyleIdCounter = 0;
  installFigmaMock();
});

// Helper: pre-populate a paint style as if from a prior import
function seedPaintStyle(name: string, paints: Paint[]): MockPaintStyle {
  const style: MockPaintStyle = {
    id: `paint-seed-${++paintStyleIdCounter}`,
    name,
    paints,
  };
  mockPaintStyles.push(style);
  return style;
}

/**
 * Seed a TextStyle matching real Figma runtime behavior: Figma ALWAYS populates
 * `letterSpacing` on existing TextStyles (default `{value: 0, unit: "PIXELS"}`),
 * even when the caller never set it. Tests that omitted letterSpacing here
 * used to pass accidentally because my seed also left it undefined — same
 * accident on both sides. In production the existing style has a real
 * `{value:0, unit:PIXELS}` object, so key normalization must treat that as
 * equivalent to "zero" in the combo-side key.
 */
function seedTextStyle(
  name: string,
  fontFamily: string,
  style: string,
  fontSize: number,
  lineHeight: LineHeight = { unit: "AUTO" },
  letterSpacing: LetterSpacing = { value: 0, unit: "PIXELS" }
): MockTextStyle {
  const s: MockTextStyle = {
    id: `text-seed-${++textStyleIdCounter}`,
    name,
    fontName: { family: fontFamily, style },
    fontSize,
    lineHeight,
    letterSpacing,
  };
  mockTextStyles.push(s);
  return s;
}

// Helper: solid paint factory
function solid(r: number, g: number, b: number, opacity: number = 1): SolidPaint {
  return { type: "SOLID", color: { r, g, b }, opacity };
}

// ============================================================================
// Category A: findOrCreateVersionedPaintStyle
// ============================================================================

import {
  findOrCreateVersionedPaintStyle,
  findOrCreateValueMatchedPaintStyle,
  createPluginColorStyles,
  createUnifiedWebsiteColorStyles,
  createTextStyles,
} from "../rendering/styles";

describe("findOrCreateVersionedPaintStyle (Category A — Named)", () => {
  it("creates a new style when no existing style has the name", () => {
    const created = new Map<string, MockPaintStyle>();
    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(0, 0, 1)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--primary");
    expect(mockPaintStyles).toHaveLength(1);
  });

  it("idempotent: same name + same value → skip, return existing, NO API write", () => {
    // Seed an existing style (as if from a previous import)
    const existing = seedPaintStyle("apple.com/--primary", [solid(0, 0, 1)]);
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(0, 0, 1)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(0);
    expect(result.id).toBe(existing.id);
    expect(mockPaintStyles).toHaveLength(1); // no new style
  });

  it("value mismatch: same name + different hex → creates --primary-V2", () => {
    seedPaintStyle("apple.com/--primary", [solid(0, 0, 1)]); // blue
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(1, 0, 0)], // red
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--primary-V2");
  });

  it("third import with yet another value → creates --primary-V3", () => {
    seedPaintStyle("apple.com/--primary", [solid(0, 0, 1)]);
    seedPaintStyle("apple.com/--primary-V2", [solid(1, 0, 0)]);
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(0, 1, 0)], // green
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--primary-V3");
  });

  it("reuses V1 when new value matches V1 (even though V2 exists)", () => {
    const v1 = seedPaintStyle("apple.com/--primary", [solid(0, 0, 1)]);
    seedPaintStyle("apple.com/--primary-V2", [solid(1, 0, 0)]);
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(0, 0, 1)], // matches V1
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(0);
    expect(result.id).toBe(v1.id);
  });

  it("reuses V2 when new value matches V2", () => {
    seedPaintStyle("apple.com/--primary", [solid(0, 0, 1)]);
    const v2 = seedPaintStyle("apple.com/--primary-V2", [solid(1, 0, 0)]);
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(1, 0, 0)], // matches V2
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(0);
    expect(result.id).toBe(v2.id);
  });

  it("semi-transparent: same hex + different opacity → V2", () => {
    seedPaintStyle("apple.com/--shade", [solid(0, 0, 0, 0.5)]);
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--shade",
      [solid(0, 0, 0, 0.3)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--shade-V2");
  });

  it("semi-transparent: same hex + same opacity → skip", () => {
    seedPaintStyle("apple.com/--shade", [solid(0, 0, 0, 0.5)]);
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--shade",
      [solid(0, 0, 0, 0.5)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(0);
    expect(result.name).toBe("apple.com/--shade");
  });

  it("gradient: identical stops → skip", () => {
    const gradient: GradientPaint = {
      type: "GRADIENT_LINEAR",
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      gradientTransform: [[1, 0, 0], [0, 1, 0]],
    };
    seedPaintStyle("apple.com/--hero-bg", [gradient]);
    const created = new Map<string, MockPaintStyle>();

    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--hero-bg",
      [{ ...gradient, gradientStops: [...gradient.gradientStops] }],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(0);
    expect(result.name).toBe("apple.com/--hero-bg");
  });

  it("gradient: changed stop color → V2", () => {
    const original: GradientPaint = {
      type: "GRADIENT_LINEAR",
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      gradientTransform: [[1, 0, 0], [0, 1, 0]],
    };
    seedPaintStyle("apple.com/--hero-bg", [original]);
    const created = new Map<string, MockPaintStyle>();

    const modified: GradientPaint = {
      ...original,
      gradientStops: [
        { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { position: 1, color: { r: 0, g: 1, b: 0, a: 1 } }, // changed to green
      ],
    };
    const result = findOrCreateVersionedPaintStyle(
      "apple.com/--hero-bg",
      [modified],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--hero-bg-V2");
  });

  it("same-run dedupe: second call with same name returns cached style", () => {
    const created = new Map<string, MockPaintStyle>();

    findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(0, 0, 1)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );
    findOrCreateVersionedPaintStyle(
      "apple.com/--primary",
      [solid(0, 0, 1)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>
    );

    expect(createPaintStyleCallCount).toBe(1); // only created once
  });
});

// ============================================================================
// Category B: findOrCreateValueMatchedPaintStyle (--created-variable-XX)
// ============================================================================

describe("findOrCreateValueMatchedPaintStyle (Category B — Auto-numbered)", () => {
  it("creates --created-variable-01 for first call with empty existing", () => {
    const created = new Map<string, MockPaintStyle>();
    const counter = { next: 1 };

    const result = findOrCreateValueMatchedPaintStyle(
      "apple.com",
      "#ff0000",
      [solid(1, 0, 0)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>,
      counter
    );

    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--created-variable-01");
    expect(counter.next).toBe(2);
  });

  it("reuses existing slot when value matches (any slot)", () => {
    const c01 = seedPaintStyle("apple.com/--created-variable-01", [solid(1, 0, 0)]);
    seedPaintStyle("apple.com/--created-variable-02", [solid(0, 0, 1)]);
    const created = new Map<string, MockPaintStyle>();
    const counter = { next: 3 };

    const result = findOrCreateValueMatchedPaintStyle(
      "apple.com",
      "#ff0000",
      [solid(1, 0, 0)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>,
      counter
    );

    expect(createPaintStyleCallCount).toBe(0);
    expect(result.id).toBe(c01.id);
    expect(counter.next).toBe(3); // counter unchanged
  });

  it("reuses slot-02 when value matches slot-02 (not slot-01)", () => {
    seedPaintStyle("apple.com/--created-variable-01", [solid(1, 0, 0)]);
    const c02 = seedPaintStyle("apple.com/--created-variable-02", [solid(0, 0, 1)]);
    const created = new Map<string, MockPaintStyle>();
    const counter = { next: 3 };

    const result = findOrCreateValueMatchedPaintStyle(
      "apple.com",
      "#0000ff",
      [solid(0, 0, 1)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>,
      counter
    );

    expect(createPaintStyleCallCount).toBe(0);
    expect(result.id).toBe(c02.id);
  });

  it("new value: counter continues from highest existing slot", () => {
    seedPaintStyle("apple.com/--created-variable-01", [solid(1, 0, 0)]);
    seedPaintStyle("apple.com/--created-variable-02", [solid(0, 0, 1)]);
    seedPaintStyle("apple.com/--created-variable-03", [solid(0, 1, 0)]);
    const created = new Map<string, MockPaintStyle>();
    // Caller hoists counter init from max existing + 1 = 4
    const counter = { next: 4 };

    const result = findOrCreateValueMatchedPaintStyle(
      "apple.com",
      "#ffff00", // yellow - new
      [solid(1, 1, 0)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>,
      counter
    );

    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--created-variable-04");
    expect(counter.next).toBe(5);
  });

  it("cross-site isolation: apple.com slots ignore tesla.com slots", () => {
    seedPaintStyle("tesla.com/--created-variable-01", [solid(1, 0, 0)]);
    const created = new Map<string, MockPaintStyle>();
    const counter = { next: 1 };

    const result = findOrCreateValueMatchedPaintStyle(
      "apple.com",
      "#ff0000",
      [solid(1, 0, 0)],
      mockPaintStyles as unknown as PaintStyle[],
      created as unknown as Map<string, PaintStyle>,
      counter
    );

    // Must NOT reuse tesla.com's style; create new apple.com slot
    expect(createPaintStyleCallCount).toBe(1);
    expect(result.name).toBe("apple.com/--created-variable-01");
  });
});

// ============================================================================
// Integration: createUnifiedWebsiteColorStyles — auto-numbered behavior
// ============================================================================

/**
 * Build a frame with one child per color (each child has a single fill).
 * This avoids the compound-fill (multi-fill) path in Pass 4, keeping the
 * test focused on Pass 3 auto-numbered behavior.
 */
function makeFrameWithColors(colors: string[]): WireframeFrame {
  const mkChild = (hex: string, i: number) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return {
      id: `c-${i}`,
      name: `c-${i}`,
      type: "frame" as const,
      tag: "div",
      x: 0, y: 0, width: 50, height: 50,
      layoutMode: "NONE" as const,
      itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: null, backgroundGradient: null,
      textColor: "#000000",
      borderColor: null, borderWidth: 0, borderRadius: 0, opacity: 1,
      textContent: "",
      fontSize: 0, fontWeight: 400, fontFamily: "Inter",
      textAlign: "left", lineHeight: 0, letterSpacing: 0, isPlaceholder: false,
      fills: [
        { type: "SOLID" as const, visible: true, opacity: 1, color: { r, g, b, a: 1 } },
      ],
      children: [],
    };
  };
  return {
    viewportWidth: 1440,
    tree: {
      id: "root",
      name: "root",
      type: "frame",
      tag: "div",
      x: 0, y: 0, width: 100, height: 100,
      layoutMode: "NONE",
      itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: null,
      backgroundGradient: null,
      textColor: "#000000",
      borderColor: null,
      borderWidth: 0,
      borderRadius: 0,
      opacity: 1,
      textContent: "",
      fontSize: 0,
      fontWeight: 400,
      fontFamily: "Inter",
      textAlign: "left",
      lineHeight: 0,
      letterSpacing: 0,
      isPlaceholder: false,
      children: colors.map((hex, i) => mkChild(hex, i)),
    },
  } as unknown as WireframeFrame;
}

describe("createUnifiedWebsiteColorStyles — auto-numbered re-import (Category B integration)", () => {
  it("first import creates --created-variable-01, -02, -03 for 3 colors", async () => {
    const frame = makeFrameWithColors(["#ff0000", "#00ff00", "#0000ff"]);

    const result = await createUnifiedWebsiteColorStyles([frame], [], "apple.com");

    const names = mockPaintStyles.map((s) => s.name).sort();
    expect(names).toContain("apple.com/--created-variable-01");
    expect(names).toContain("apple.com/--created-variable-02");
    expect(names).toContain("apple.com/--created-variable-03");
    expect(result.colorStyleMap.size).toBeGreaterThanOrEqual(3);
  });

  it("re-import with identical colors → no V2-cascade for auto-numbered (shifting-counter fix)", async () => {
    // Seed 3 colors + textColor (to match what the frame would produce)
    seedPaintStyle("apple.com/--created-variable-01", [solid(1, 0, 0)]);
    seedPaintStyle("apple.com/--created-variable-02", [solid(0, 1, 0)]);
    seedPaintStyle("apple.com/--created-variable-03", [solid(0, 0, 1)]);
    seedPaintStyle("apple.com/--created-variable-04", [solid(0, 0, 0)]); // textColor black
    createPaintStyleCallCount = 0;

    // Same colors, same import
    const frame = makeFrameWithColors(["#ff0000", "#00ff00", "#0000ff"]);
    await createUnifiedWebsiteColorStyles([frame], [], "apple.com");

    // Zero new styles because all 4 paints (3 fills + 1 textColor) already exist
    expect(createPaintStyleCallCount).toBe(0);
  });

  it("re-import with one removed + one new → counter continues (not shifts)", async () => {
    // Seed 3 fill colors + textColor
    seedPaintStyle("apple.com/--created-variable-01", [solid(1, 0, 0)]); // red
    seedPaintStyle("apple.com/--created-variable-02", [solid(0, 1, 0)]); // green
    seedPaintStyle("apple.com/--created-variable-03", [solid(0, 0, 1)]); // blue
    seedPaintStyle("apple.com/--created-variable-04", [solid(0, 0, 0)]); // textColor
    createPaintStyleCallCount = 0;

    // Red removed, purple added; green + blue + textColor still present
    const frame = makeFrameWithColors(["#00ff00", "#0000ff", "#ff00ff"]);
    await createUnifiedWebsiteColorStyles([frame], [], "apple.com");

    // Only purple is new → 1 new API call, slot 05 (counter continues from max+1)
    expect(createPaintStyleCallCount).toBe(1);
    const newStyle = mockPaintStyles.find((s) => s.name === "apple.com/--created-variable-05");
    expect(newStyle).toBeDefined();
    // No V-suffixed auto-numbered style should ever exist
    const anyVersioned = mockPaintStyles.find((s) => /created-variable-\d+-V\d+/.test(s.name));
    expect(anyVersioned).toBeUndefined();
  });

  it("re-import where website changed ONE color: only 1 new style (not V2-cascade)", async () => {
    // Seed 1 fill color + textColor
    seedPaintStyle("apple.com/--created-variable-01", [solid(1, 0, 0)]); // red
    seedPaintStyle("apple.com/--created-variable-02", [solid(0, 0, 0)]); // textColor black
    createPaintStyleCallCount = 0;

    const frame = makeFrameWithColors(["#00ff00"]); // changed to green; textColor unchanged
    await createUnifiedWebsiteColorStyles([frame], [], "apple.com");

    // Green is new → slot-03. Red slot-01 stays (orphan, not deleted).
    expect(createPaintStyleCallCount).toBe(1);
    const created = mockPaintStyles.find((s) => s.name === "apple.com/--created-variable-03");
    expect(created).toBeDefined();
    // No V-suffixed auto-numbered style should exist
    const anyVersioned = mockPaintStyles.find((s) => /created-variable-\d+-V\d+/.test(s.name));
    expect(anyVersioned).toBeUndefined();
  });
});

// ============================================================================
// Integration: createUnifiedWebsiteColorStyles — CSS variables (Category A)
// ============================================================================

describe("createUnifiedWebsiteColorStyles — CSS variables (Category A integration)", () => {
  function cssVar(name: string, value: string): ExtractedCSSVariable {
    return { name, value, category: "color" } as ExtractedCSSVariable;
  }

  it("idempotent re-import: same CSS variable value → no --primary-V2 created", async () => {
    seedPaintStyle("apple.com/--primary", [solid(0, 0, 1)]);
    seedPaintStyle("apple.com/--created-variable-01", [solid(0, 0, 0)]); // textColor from tree
    createPaintStyleCallCount = 0;

    const frame = makeFrameWithColors([]);
    await createUnifiedWebsiteColorStyles(
      [frame],
      [cssVar("--primary", "rgb(0, 0, 255)")],
      "apple.com"
    );

    // No new paint style created (--primary matches; textColor matches slot-01)
    expect(createPaintStyleCallCount).toBe(0);
    const v2 = mockPaintStyles.find((s) => s.name === "apple.com/--primary-V2");
    expect(v2).toBeUndefined();
  });

  it("website changed --primary from blue to red → creates --primary-V2", async () => {
    seedPaintStyle("apple.com/--primary", [solid(0, 0, 1)]);
    seedPaintStyle("apple.com/--created-variable-01", [solid(0, 0, 0)]); // textColor
    createPaintStyleCallCount = 0;

    const frame = makeFrameWithColors([]);
    await createUnifiedWebsiteColorStyles(
      [frame],
      [cssVar("--primary", "rgb(255, 0, 0)")],
      "apple.com"
    );

    // One new style: --primary-V2 for the changed CSS variable
    expect(createPaintStyleCallCount).toBe(1);
    const v2 = mockPaintStyles.find((s) => s.name === "apple.com/--primary-V2");
    expect(v2).toBeDefined();
  });
});

// ============================================================================
// Integration: createPluginColorStyles (Category A)
// ============================================================================

describe("createPluginColorStyles — Plugin Color Versioning (Category A)", () => {
  const PLUGIN_COLORS = {
    text: "#11151a",
    background: "#f1f2f0",
    secondary: "#bdc1b2",
    surface: "#afc6dc",
    accent: "#c4def4",
  };

  it("first import creates 5 plugin role styles", async () => {
    const result = await createPluginColorStyles(PLUGIN_COLORS, "apple.com/Plugin");

    expect(createPaintStyleCallCount).toBe(5);
    expect(result.size).toBe(5);
    const names = mockPaintStyles.map((s) => s.name).sort();
    expect(names).toEqual([
      "apple.com/Plugin/--accent",
      "apple.com/Plugin/--background",
      "apple.com/Plugin/--secondary",
      "apple.com/Plugin/--surface",
      "apple.com/Plugin/--text",
    ]);
  });

  it("idempotent re-import: same plugin config → skip all 5", async () => {
    // Pre-seed all 5 as if from prior import
    seedPaintStyle("apple.com/Plugin/--text", [solid(17 / 255, 21 / 255, 26 / 255)]);
    seedPaintStyle("apple.com/Plugin/--background", [solid(241 / 255, 242 / 255, 240 / 255)]);
    seedPaintStyle("apple.com/Plugin/--secondary", [solid(189 / 255, 193 / 255, 178 / 255)]);
    seedPaintStyle("apple.com/Plugin/--surface", [solid(175 / 255, 198 / 255, 220 / 255)]);
    seedPaintStyle("apple.com/Plugin/--accent", [solid(196 / 255, 222 / 255, 244 / 255)]);
    createPaintStyleCallCount = 0;

    await createPluginColorStyles(PLUGIN_COLORS, "apple.com/Plugin");

    expect(createPaintStyleCallCount).toBe(0);
  });

  it("user changed plugin --background config → creates --background-V2", async () => {
    // Seed old plugin colors
    seedPaintStyle("apple.com/Plugin/--text", [solid(17 / 255, 21 / 255, 26 / 255)]);
    seedPaintStyle("apple.com/Plugin/--background", [solid(0, 0, 0)]); // was black
    seedPaintStyle("apple.com/Plugin/--secondary", [solid(189 / 255, 193 / 255, 178 / 255)]);
    seedPaintStyle("apple.com/Plugin/--surface", [solid(175 / 255, 198 / 255, 220 / 255)]);
    seedPaintStyle("apple.com/Plugin/--accent", [solid(196 / 255, 222 / 255, 244 / 255)]);
    createPaintStyleCallCount = 0;

    // User changed background to white
    await createPluginColorStyles({ ...PLUGIN_COLORS, background: "#ffffff" }, "apple.com/Plugin");

    expect(createPaintStyleCallCount).toBe(1);
    const v2 = mockPaintStyles.find((s) => s.name === "apple.com/Plugin/--background-V2");
    expect(v2).toBeDefined();
    // The other 4 must be untouched (no V2 for them)
    const otherV2s = mockPaintStyles.filter(
      (s) => s.name.endsWith("-V2") && s.name !== "apple.com/Plugin/--background-V2"
    );
    expect(otherV2s).toHaveLength(0);
  });
});

// ============================================================================
// Integration: createTextStyles (Category A)
// ============================================================================

function makeTextFrame(textNodes: Array<{ fontFamily: string; fontSize: number; fontWeight: number; lineHeight?: number; letterSpacing?: number; text?: string }>): WireframeFrame {
  return {
    viewportWidth: 1440,
    tree: {
      id: "root",
      name: "root",
      type: "frame",
      tag: "div",
      x: 0, y: 0, width: 100, height: 100,
      layoutMode: "NONE",
      itemSpacing: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: null, backgroundGradient: null,
      textColor: "#000000",
      borderColor: null, borderWidth: 0, borderRadius: 0, opacity: 1,
      textContent: "", fontSize: 0, fontWeight: 400, fontFamily: "Inter",
      textAlign: "left", lineHeight: 0, letterSpacing: 0, isPlaceholder: false,
      children: textNodes.map((n, i) => ({
        id: `text-${i}`,
        name: `text-${i}`,
        type: "text" as const,
        tag: "p",
        x: 0, y: 0, width: 100, height: 20,
        layoutMode: "NONE" as const,
        itemSpacing: 0,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        backgroundColor: null, backgroundGradient: null,
        textColor: "#000000",
        borderColor: null, borderWidth: 0, borderRadius: 0, opacity: 1,
        textContent: n.text || "Sample",
        fontSize: n.fontSize,
        fontWeight: n.fontWeight,
        fontFamily: n.fontFamily,
        textAlign: "left",
        lineHeight: n.lineHeight ?? 0,
        letterSpacing: n.letterSpacing ?? 0,
        isPlaceholder: false,
        children: [],
      })),
    },
  } as unknown as WireframeFrame;
}

describe("createTextStyles — Text Style Versioning (Category A)", () => {
  it("first import creates Inter-Bold-24", async () => {
    const frame = makeTextFrame([
      { fontFamily: "Inter", fontSize: 24, fontWeight: 700, lineHeight: 32 },
    ]);

    await createTextStyles([frame], "Inter", "website", undefined, "apple.com");

    expect(createTextStyleCallCount).toBe(1);
    const style = mockTextStyles.find((s) => s.name === "apple.com/--Inter-Bold-24");
    expect(style).toBeDefined();
  });

  it("idempotent re-import: same Inter-Bold-24 with matching fontSize → skip", async () => {
    seedTextStyle(
      "apple.com/--Inter-Bold-24",
      "Inter",
      "Bold",
      24,
      { value: 32, unit: "PIXELS" }
    );
    createTextStyleCallCount = 0;

    const frame = makeTextFrame([
      { fontFamily: "Inter", fontSize: 24, fontWeight: 700, lineHeight: 32 },
    ]);
    await createTextStyles([frame], "Inter", "website", undefined, "apple.com");

    expect(createTextStyleCallCount).toBe(0);
  });

  // Regression: web2wireframe.design pricing page (2026-04-22)
  // Repro: 3× identical imports produced 4 new V2 and 4 new V3 TextStyles.
  // Root cause: Figma-runtime existing style has letterSpacing={value:0,unit:"PIXELS"}
  // but combo side passed undefined for ls=0 → asymmetric key. Fix normalizes
  // "zero letterSpacing" and "zero lineHeight" to same key regardless of source.
  it("regression: ls=0 existing style matches combo with ls=0 → skip (not V2)", async () => {
    seedTextStyle(
      "web2wireframe.design/--Space Grotesk-Regular-16",
      "Space Grotesk",
      "Regular",
      16,
      { value: 25.6, unit: "PIXELS" }
      // letterSpacing defaults to {value:0, unit:"PIXELS"} — matches real Figma
    );
    createTextStyleCallCount = 0;

    const frame = makeTextFrame([
      { fontFamily: "Space Grotesk", fontSize: 16, fontWeight: 400, lineHeight: 25.6 },
    ]);
    await createTextStyles([frame], "Space Grotesk", "website", undefined, "web2wireframe.design");

    expect(createTextStyleCallCount).toBe(0);
    // No V-suffixed style should exist
    const versioned = mockTextStyles.find((s) => /-V\d+$/.test(s.name));
    expect(versioned).toBeUndefined();
  });

  // Regression: decimal fontSize triggered V2 cascade even on identical re-import.
  // Root cause: IEEE-754 float drift. CSS `0.95rem * 16px` → 15.200000000000001
  // in JS. Figma preserves this exact number, but combo recomputation path
  // may produce 15.2 exactly (or vice-versa), causing key mismatch.
  // Fix: round fontSize and lineHeight to 2 decimal places in the key so
  // sub-centi-px drift cannot cause spurious V2 creation.
  it("regression: decimal fontSize with float drift → matches (no V2)", async () => {
    // Seed with a float-drift value mimicking `0.95 * 16`
    const driftFs = 0.95 * 16; // = 15.200000000000001
    seedTextStyle(
      "web2wireframe.design/--Space Grotesk-Regular-15.2",
      "Space Grotesk",
      "Regular",
      driftFs,
      { value: 24.3, unit: "PIXELS" }
    );
    createTextStyleCallCount = 0;

    // Combo side passes "clean" 15.2 — different raw bits, same logical value
    const frame = makeTextFrame([
      { fontFamily: "Space Grotesk", fontSize: 15.2, fontWeight: 400, lineHeight: 24.3 },
    ]);
    await createTextStyles([frame], "Space Grotesk", "website", undefined, "web2wireframe.design");

    expect(createTextStyleCallCount).toBe(0);
    const versioned = mockTextStyles.find((s) => /-V\d+$/.test(s.name));
    expect(versioned).toBeUndefined();
  });

  it("regression: float-drift in lineHeight pixel value → matches", async () => {
    // Simulate drift: seed stored a slightly-off pixel value (e.g. from
    // subpixel CSS computation), combo produces clean 24.3.
    const driftLh = 24.300000000000001;
    seedTextStyle(
      "web2wireframe.design/--Space Grotesk-Regular-15.2",
      "Space Grotesk",
      "Regular",
      15.2,
      { value: driftLh, unit: "PIXELS" }
    );
    createTextStyleCallCount = 0;

    const frame = makeTextFrame([
      { fontFamily: "Space Grotesk", fontSize: 15.2, fontWeight: 400, lineHeight: 24.3 },
    ]);
    await createTextStyles([frame], "Space Grotesk", "website", undefined, "web2wireframe.design");

    expect(createTextStyleCallCount).toBe(0);
    const versioned = mockTextStyles.find((s) => /-V\d+$/.test(s.name));
    expect(versioned).toBeUndefined();
  });

  it("regression: 3× identical re-import produces 0 new TextStyles (no V2/V3 cascade)", async () => {
    // Seed typical pricing-page TextStyles as they'd exist after import #1
    seedTextStyle("web2wireframe.design/--Space Grotesk-Regular-16", "Space Grotesk", "Regular", 16, { value: 25.6, unit: "PIXELS" });
    seedTextStyle("web2wireframe.design/--Space Grotesk-Bold-16", "Space Grotesk", "Bold", 16, { value: 25.6, unit: "PIXELS" });
    seedTextStyle("web2wireframe.design/--Space Grotesk-Regular-15.2", "Space Grotesk", "Regular", 15.2, { value: 24.3, unit: "PIXELS" });
    seedTextStyle("web2wireframe.design/--Space Grotesk-Bold-13.6", "Space Grotesk", "Bold", 13.6, { value: 21.8, unit: "PIXELS" });
    createTextStyleCallCount = 0;

    // Frame contains exactly the same combos as import #1
    const frame = makeTextFrame([
      { fontFamily: "Space Grotesk", fontSize: 16, fontWeight: 400, lineHeight: 25.6 },
      { fontFamily: "Space Grotesk", fontSize: 16, fontWeight: 700, lineHeight: 25.6 },
      { fontFamily: "Space Grotesk", fontSize: 15.2, fontWeight: 400, lineHeight: 24.3 },
      { fontFamily: "Space Grotesk", fontSize: 13.6, fontWeight: 700, lineHeight: 21.8 },
    ]);

    // Import #2
    await createTextStyles([frame], "Space Grotesk", "website", undefined, "web2wireframe.design");
    expect(createTextStyleCallCount).toBe(0);

    // Import #3
    await createTextStyles([frame], "Space Grotesk", "website", undefined, "web2wireframe.design");
    expect(createTextStyleCallCount).toBe(0);

    // Assert no V-suffixed style exists
    const versioned = mockTextStyles.filter((s) => /-V\d+$/.test(s.name));
    expect(versioned).toHaveLength(0);
  });

  it("value mismatch: existing --Inter-Bold-24 has fontSize=28 → creates -V2", async () => {
    // Corrupted / external pre-existing style with wrong size
    seedTextStyle(
      "apple.com/--Inter-Bold-24",
      "Inter",
      "Bold",
      28, // mismatch!
      { value: 32, unit: "PIXELS" }
    );
    createTextStyleCallCount = 0;

    const frame = makeTextFrame([
      { fontFamily: "Inter", fontSize: 24, fontWeight: 700, lineHeight: 32 },
    ]);
    await createTextStyles([frame], "Inter", "website", undefined, "apple.com");

    expect(createTextStyleCallCount).toBe(1);
    const v2 = mockTextStyles.find((s) => s.name === "apple.com/--Inter-Bold-24-V2");
    expect(v2).toBeDefined();
  });
});
