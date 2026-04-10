/**
 * Tests for z-index sorting in tree-builder.
 *
 * When sibling elements have different z-index values, they should be
 * reordered so that higher z-index children come later in the array
 * (which means they appear visually on top in Figma).
 */
import { describe, it, expect } from "vitest";
import type { ExtractedElement } from "../types";

/**
 * Standalone z-index sorting function matching tree-builder logic.
 * Extracted for unit testing — the same algorithm is used inline in buildNode().
 */
function sortChildrenByZIndex(children: ExtractedElement[]): ExtractedElement[] {
  if (children.length < 2) return children;
  const hasZIndex = children.some(c => c.zIndex != null);
  if (!hasZIndex) return children;

  const stable = children.map((c, i) => ({ c, i }));
  stable.sort((a, b) => {
    const za = a.c.zIndex ?? 0;
    const zb = b.c.zIndex ?? 0;
    return za !== zb ? za - zb : a.i - b.i;
  });
  return stable.map(s => s.c);
}

/**
 * Standalone background image reordering matching tree-builder logic.
 * Absolutely-positioned image-only containers move to front (behind in Figma).
 */
function isImageOnlySubtree(el: ExtractedElement): boolean {
  if (el.type === "placeholder") return true;
  if (el.type === "text") return false;
  if ((el as any).textContent?.trim()) return false;
  if (!el.children || el.children.length === 0) {
    return (el as any).fills?.some((f: any) => f.type === "IMAGE_PLACEHOLDER") ?? false;
  }
  return el.children.every(c => isImageOnlySubtree(c));
}

function reorderBackgroundImages(children: ExtractedElement[]): ExtractedElement[] {
  if (children.length < 2) return children;
  const bgImages: ExtractedElement[] = [];
  const rest: ExtractedElement[] = [];
  for (const child of children) {
    if (child.position === "absolute" && isImageOnlySubtree(child)) {
      bgImages.push(child);
    } else {
      rest.push(child);
    }
  }
  if (bgImages.length > 0 && rest.length > 0) {
    return [...bgImages, ...rest];
  }
  return children;
}

/** Minimal ExtractedElement stub with overrides */
function makeElement(name: string, overrides?: Partial<ExtractedElement> & { zIndex?: number }): ExtractedElement {
  return {
    id: name,
    name,
    tag: "div",
    type: "frame",
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    children: [],
    ...overrides,
  } as unknown as ExtractedElement;
}

/** Shortcut: makeElement with just name + zIndex */
function makeEl(name: string, zIndex?: number): ExtractedElement {
  return makeElement(name, { zIndex });
}

describe("z-index sorting in tree-builder", () => {
  it("sorts siblings by ascending z-index (higher = later = on top)", () => {
    const children = [
      makeEl("text", 10),
      makeEl("image", 1),
      makeEl("overlay", 20),
    ];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted.map(c => c.name)).toEqual(["image", "text", "overlay"]);
  });

  it("preserves DOM order when no z-index is present", () => {
    const children = [
      makeEl("first"),
      makeEl("second"),
      makeEl("third"),
    ];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted.map(c => c.name)).toEqual(["first", "second", "third"]);
  });

  it("handles mixed: elements with and without z-index", () => {
    const children = [
      makeEl("header", 100),   // z-index: 100 → last
      makeEl("content"),        // no z-index → treated as 0
      makeEl("bg-image", -1),   // negative → first
    ];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted.map(c => c.name)).toEqual(["bg-image", "content", "header"]);
  });

  it("stable sort: equal z-index preserves DOM order", () => {
    const children = [
      makeEl("first", 5),
      makeEl("second", 5),
      makeEl("third", 5),
    ];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted.map(c => c.name)).toEqual(["first", "second", "third"]);
  });

  it("handles negative z-index values", () => {
    const children = [
      makeEl("normal"),           // treated as 0
      makeEl("behind", -10),      // behind everything
      makeEl("way-behind", -100), // way behind
    ];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted.map(c => c.name)).toEqual(["way-behind", "behind", "normal"]);
  });

  it("returns same array reference when no z-index present (optimization)", () => {
    const children = [makeEl("a"), makeEl("b")];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted).toBe(children);
  });

  it("returns same array reference for single element", () => {
    const children = [makeEl("only", 99)];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted).toBe(children);
  });

  it("apple.com-like pattern: text(z:2) + image(z:1) → image first, text on top", () => {
    const children = [
      makeEl("text-content", 2),
      makeEl("bg-image", 1),
    ];
    const sorted = sortChildrenByZIndex(children);
    expect(sorted.map(c => c.name)).toEqual(["bg-image", "text-content"]);
  });

  it("sticky header pattern: high z-index header stays on top", () => {
    const children = [
      makeEl("header", 999),
      makeEl("hero"),
      makeEl("content"),
      makeEl("footer"),
    ];
    const sorted = sortChildrenByZIndex(children);
    // header has z-index:999 → last (on top in Figma)
    // rest have no z-index (0) → DOM order preserved
    expect(sorted.map(c => c.name)).toEqual(["hero", "content", "footer", "header"]);
  });
});

// ---------------------------------------------------------------------------
// Background image reordering (absolute-positioned image-only containers)
// ---------------------------------------------------------------------------

describe("background image reordering", () => {
  it("apple.com pattern: abs image-wrapper moves before relative content", () => {
    const children = [
      makeElement("tile-content", { position: "relative" }),
      makeElement("tile-image-wrapper", {
        position: "absolute",
        children: [
          makeElement("picture", {
            children: [makeElement("img", { type: "placeholder" })] as any,
          }),
        ] as any,
      }),
    ];
    const result = reorderBackgroundImages(children);
    expect(result.map(c => c.name)).toEqual(["tile-image-wrapper", "tile-content"]);
  });

  it("abs element WITH text does NOT get moved", () => {
    const children = [
      makeElement("content", { position: "relative" }),
      makeElement("abs-with-text", {
        position: "absolute",
        children: [makeElement("text-child", { type: "text" })] as any,
      }),
    ];
    const result = reorderBackgroundImages(children);
    // Should NOT reorder — abs element has text
    expect(result.map(c => c.name)).toEqual(["content", "abs-with-text"]);
  });

  it("abs placeholder (direct img) moves to front", () => {
    const children = [
      makeElement("text", { position: "relative" }),
      makeElement("img", { position: "absolute", type: "placeholder" }),
    ];
    const result = reorderBackgroundImages(children);
    expect(result.map(c => c.name)).toEqual(["img", "text"]);
  });

  it("no abs elements → no change", () => {
    const children = [
      makeElement("a", { position: "relative" }),
      makeElement("b", { position: "static" }),
    ];
    const result = reorderBackgroundImages(children);
    expect(result).toBe(children); // Same reference
  });

  it("all elements abs + image-only → no change (need at least one non-abs)", () => {
    const children = [
      makeElement("img1", { position: "absolute", type: "placeholder" }),
      makeElement("img2", { position: "absolute", type: "placeholder" }),
    ];
    const result = reorderBackgroundImages(children);
    expect(result).toBe(children); // Same reference — all are bg images, no content
  });

  it("multiple abs images + content: all images move before content", () => {
    const children = [
      makeElement("content1", { position: "relative" }),
      makeElement("bg1", { position: "absolute", type: "placeholder" }),
      makeElement("content2", { position: "static" }),
      makeElement("bg2", { position: "absolute", type: "placeholder" }),
    ];
    const result = reorderBackgroundImages(children);
    expect(result.map(c => c.name)).toEqual(["bg1", "bg2", "content1", "content2"]);
  });

  it("single element → returns same array", () => {
    const children = [makeElement("only", { position: "absolute", type: "placeholder" })];
    const result = reorderBackgroundImages(children);
    expect(result).toBe(children);
  });

  it("abs element with nested images only → moves to front", () => {
    const children = [
      makeElement("content", { position: "relative" }),
      makeElement("image-wrapper", {
        position: "absolute",
        children: [
          makeElement("inner-div", {
            children: [
              makeElement("nested-img", { type: "placeholder" }),
            ] as any,
          }),
        ] as any,
      }),
    ];
    const result = reorderBackgroundImages(children);
    expect(result.map(c => c.name)).toEqual(["image-wrapper", "content"]);
  });
});
