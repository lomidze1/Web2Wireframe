import { describe, it, expect } from "vitest";
import { categorizeCSSVariable, createEmptyElement } from "./misc";

describe("categorizeCSSVariable", () => {
  // ---- name-pattern wins over value ----
  it("buckets `--foo-color` as color regardless of value", () => {
    expect(categorizeCSSVariable("--brand-color", "16px")).toBe("color");
  });

  it("buckets `--bg-*` as color", () => {
    expect(categorizeCSSVariable("--bg-primary", "anything")).toBe("color");
  });

  it("buckets `--text-*` as color", () => {
    expect(categorizeCSSVariable("--text-muted", "")).toBe("color");
  });

  it("buckets `--font-*` as typography", () => {
    expect(categorizeCSSVariable("--font-body", "16px")).toBe("typography");
  });

  it("buckets `--spacing-*` as spacing", () => {
    expect(categorizeCSSVariable("--spacing-lg", "24px")).toBe("spacing");
  });

  it("buckets `--gap-*` and `--padding-*` and `--margin-*` as spacing", () => {
    expect(categorizeCSSVariable("--gap-md", "16px")).toBe("spacing");
    expect(categorizeCSSVariable("--padding-x", "8px")).toBe("spacing");
    expect(categorizeCSSVariable("--margin-top", "12px")).toBe("spacing");
  });

  it("buckets `--*-radius` as radius", () => {
    expect(categorizeCSSVariable("--border-radius-lg", "8px")).toBe("radius");
    expect(categorizeCSSVariable("--rounded-full", "9999px")).toBe("radius");
  });

  it("buckets `--*-shadow` as shadow", () => {
    expect(categorizeCSSVariable("--box-shadow-md", "0 1px 2px black")).toBe(
      "shadow",
    );
  });

  it("buckets `--border-*` as border (when name has no color/shadow hint)", () => {
    expect(categorizeCSSVariable("--border-width", "1px")).toBe("border");
  });

  // ---- value-pattern fallback ----
  it("falls back to color for #/rgb/hsl values", () => {
    expect(categorizeCSSVariable("--my-thing", "#FF6B35")).toBe("color");
    expect(categorizeCSSVariable("--accent", "rgb(255, 0, 0)")).toBe("color");
    expect(categorizeCSSVariable("--surface", "hsl(120, 50%, 50%)")).toBe(
      "color",
    );
  });

  it("falls back to spacing for length values", () => {
    expect(categorizeCSSVariable("--gap", "16px")).toBe("spacing");
    expect(categorizeCSSVariable("--my-thing", "1.5rem")).toBe("spacing");
    expect(categorizeCSSVariable("--my-thing", "2em")).toBe("spacing");
  });

  it("classifies size-named length values as typography, not spacing", () => {
    expect(categorizeCSSVariable("--header-size", "24px")).toBe("typography");
  });

  it("returns `other` for unmatched names/values", () => {
    expect(categorizeCSSVariable("--zindex-modal", "999")).toBe("other");
    expect(categorizeCSSVariable("--my-ratio", "1.618")).toBe("other");
  });
});

describe("createEmptyElement", () => {
  it("returns a frame with the requested geometry", () => {
    const el = createEmptyElement(400, 250);
    expect(el.type).toBe("frame");
    expect(el.width).toBe(400);
    expect(el.height).toBe(250);
    expect(el.x).toBe(0);
    expect(el.y).toBe(0);
  });

  it("uses sensible visual defaults (no fills, no children)", () => {
    const el = createEmptyElement(100, 100);
    expect(el.fills).toEqual([]);
    expect(el.children).toEqual([]);
    expect(el.opacity).toBe(1);
    expect(el.isPlaceholder).toBe(false);
  });

  it("emits a stable shape with all required ExtractedElement fields", () => {
    const el = createEmptyElement(50, 50);
    // generateId() output isn't asserted, but must be non-empty
    expect(typeof el.id).toBe("string");
    expect(el.id.length).toBeGreaterThan(0);
    expect(el.name).toBe("Selected Area");
    expect(el.borderRadius).toEqual({
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0,
    });
  });
});
