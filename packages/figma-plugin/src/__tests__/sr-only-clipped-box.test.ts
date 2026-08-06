/**
 * Screen-reader-only boxes must never reach Figma.
 *
 * The classic a11y clip pattern — `position: absolute; width: 1px;
 * height: 1px; overflow: hidden` (Drupal `.visually-hidden`, Bootstrap
 * `.sr-only`, "Skip to main content" links) — paints nothing in a browser:
 * the text is clipped away by the 1px box.
 *
 * Figma has no equivalent. The frame survived at 1px wide, and the converter's
 * inline baseline-overhang correction then snapped its HEIGHT to the text ink
 * (94.95 → 216.95), so iwm.org.uk imported three `1 × 122` columns of
 * one-letter lines spelling "Main navigation" / "Secondary navigation" /
 * "Footer menu" straight down the page.
 *
 * The guards below matter as much as the rule: a 0/1px wrapper with
 * `overflow: visible` legitimately shows absolutely-positioned children, and
 * `position: fixed` descendants escape an ancestor's `overflow: hidden`
 * entirely (apple.com's 0×0 `#globalheader` wrapping the fixed nav).
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { WireframeNode } from "../types";

function frame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 300,
    quad: [0, 0, 400, 0, 400, 300, 0, 300],
    tag: "div",
    classList: [],
    attr: {},
    styles: {},
    children: [],
    ...overrides,
  };
}

function text(value: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "TEXT",
    x: 0, y: 0, width: 260, height: 66,
    quad: [0, 0, 260, 0, 260, 66, 0, 66],
    value,
    ...overrides,
  };
}

const SR_ONLY = {
  display: "block",
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  overflowX: "hidden",
  overflowY: "hidden",
};

/** Every class name / tag in the converted tree. */
function names(node: WireframeNode, acc: string[] = []): string[] {
  acc.push(node.name || node.tag);
  for (const c of node.children || []) names(c, acc);
  return acc;
}

/** Every piece of text content in the converted tree. */
function texts(node: WireframeNode, acc: string[] = []): string[] {
  if (node.textContent) acc.push(node.textContent);
  for (const c of node.children || []) texts(c, acc);
  return acc;
}

describe("convertW2WToWireframe — screen-reader-only clipped boxes", () => {
  it("drops a visually-hidden <h2> together with its clipped text", () => {
    const nav = frame({
      tag: "nav",
      children: [
        frame({
          tag: "h2",
          classList: ["visually-hidden"],
          attr: { id: "block-secondarynavigation-menu" },
          width: 1, height: 1,
          styles: SR_ONLY,
          children: [text("Secondary"), text("navigation", { y: 56 })],
        }),
        frame({ tag: "ul", width: 151, height: 42 }),
      ],
    });
    const node = convertW2WToWireframe(nav as never);
    expect(names(node).join(" ")).not.toContain("visually-hidden");
    expect(texts(node).join(" ")).not.toContain("navigation");
    expect(names(node).join(" ")).toContain("ul");
  });

  it("drops a skip link", () => {
    const body = frame({
      tag: "body",
      children: [
        frame({
          tag: "a",
          classList: ["skip-main"],
          width: 1, height: 1,
          styles: SR_ONLY,
          children: [text("Skip to main content")],
        }),
      ],
    });
    expect(texts(convertW2WToWireframe(body as never))).toHaveLength(0);
  });

  it("treats overflow: clip the same as hidden", () => {
    const body = frame({
      tag: "body",
      children: [
        frame({
          tag: "span",
          classList: ["sr-only"],
          width: 1, height: 1,
          styles: { ...SR_ONLY, overflow: "clip", overflowX: "clip", overflowY: "clip" },
          children: [text("Menu")],
        }),
      ],
    });
    expect(texts(convertW2WToWireframe(body as never))).toHaveLength(0);
  });

  it("keeps a 1px wrapper whose overflow is visible", () => {
    // A zero-size anchor for an absolutely-positioned tooltip/badge: the
    // children are painted, they just overflow their parent.
    const body = frame({
      tag: "body",
      children: [
        frame({
          tag: "div",
          classList: ["tooltip-anchor"],
          width: 1, height: 1,
          styles: { position: "absolute", width: "1px", height: "1px", overflow: "visible" },
          children: [frame({ tag: "span", classList: ["tooltip"], width: 200, height: 40 })],
        }),
      ],
    });
    expect(names(convertW2WToWireframe(body as never)).join(" ")).toContain("tooltip-anchor");
  });

  it("keeps a static 1px box — its absolute children escape the clip", () => {
    const body = frame({
      tag: "body",
      children: [
        frame({
          tag: "div",
          classList: ["static-sliver"],
          width: 1, height: 1,
          styles: { position: "static", width: "1px", height: "1px", overflow: "hidden" },
        }),
      ],
    });
    expect(names(convertW2WToWireframe(body as never)).join(" ")).toContain("static-sliver");
  });

  it("keeps a clipped box that holds a position:fixed descendant", () => {
    // apple.com #globalheader: fixed elements ignore an ancestor's
    // overflow: hidden, so the subtree is genuinely visible.
    const body = frame({
      tag: "body",
      children: [
        frame({
          tag: "div",
          classList: ["globalheader"],
          width: 1, height: 1,
          styles: SR_ONLY,
          children: [
            frame({
              tag: "div",
              classList: ["globalnav"],
              width: 1440, height: 48,
              styles: { position: "fixed" },
            }),
          ],
        }),
      ],
    });
    expect(names(convertW2WToWireframe(body as never)).join(" ")).toContain("globalnav");
  });

  it("keeps a 2px clipped box — only ≤1px is the sr-only signature", () => {
    const body = frame({
      tag: "body",
      children: [
        frame({
          tag: "div",
          classList: ["thin-rule"],
          width: 2, height: 2,
          styles: { position: "absolute", width: "2px", height: "2px", overflow: "hidden" },
        }),
      ],
    });
    expect(names(convertW2WToWireframe(body as never)).join(" ")).toContain("thin-rule");
  });

  it("keeps an ordinary 1×19 inline sliver (no clip, no positioning)", () => {
    const row = frame({
      tag: "div",
      children: [frame({ tag: "span", classList: ["sliver"], width: 1, height: 19 })],
    });
    expect(names(convertW2WToWireframe(row as never)).join(" ")).toContain("sliver");
  });
});
