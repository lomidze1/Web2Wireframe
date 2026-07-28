/**
 * CSS `filter: grayscale(N)` → Figma image saturation adjustment.
 *
 * telex.ge regression: brand logos carry `filter: grayscale(1)` directly on
 * the <img> but rendered in full color. The converter must record the amount
 * on the WireframeNode (for <img>/<video> IMAGE paints in realImages.ts) and
 * stamp background IMAGE fills with the equivalent saturation (−1…0).
 */
import { describe, it, expect } from "vitest";
import { convertW2WToWireframe } from "../rendering/css-converter";
import type { FigmaFill } from "../types";

function makeFrame(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "FRAME",
    x: 0, y: 0, width: 400, height: 100,
    quad: [0, 0, 400, 0, 400, 100, 0, 100],
    tag: "div",
    classList: [],
    attr: {},
    styles: { display: "block" },
    children: [],
    ...overrides,
  };
}

function page(children: Record<string, unknown>[]): Record<string, unknown> {
  const body = makeFrame({ tag: "body", width: 1280, height: 800, styles: { height: "100%" }, children });
  return makeFrame({
    tag: "html", width: 1280, height: 800,
    styles: { height: "100%" },
    children: [body],
    isScrollingElt: true,
  });
}

function findByClass(node: unknown, cls: string): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.className === "string" && obj.className.split(" ").includes(cls)) return obj;
  for (const c of (obj.children as unknown[]) ?? []) {
    const hit = findByClass(c, cls);
    if (hit) return hit;
  }
  return null;
}

describe("filter: grayscale → filterGrayscale + fill saturation", () => {
  it("records grayscale(1) on the node (brand logo <img>)", () => {
    const img = makeFrame({
      tag: "img",
      classList: ["ty-pict", "ty-grayscale"],
      x: 10, y: 10, width: 72, height: 72,
      styles: { display: "inline-block", filter: "grayscale(1)" },
      attr: { $url: "https://cdn.example/logo.png" },
    });
    const root = convertW2WToWireframe(page([img]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "ty-grayscale");
    expect(node).not.toBeNull();
    expect(node!.filterGrayscale).toBe(1);
  });

  it("parses percentage amounts (grayscale(40%))", () => {
    const el = makeFrame({
      classList: ["partial"],
      styles: { display: "block", filter: "grayscale(40%)" },
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "partial");
    expect(node).not.toBeNull();
    expect(node!.filterGrayscale).toBeCloseTo(0.4);
  });

  it("stamps background IMAGE fills with negative saturation", () => {
    const el = makeFrame({
      classList: ["bg-logo"],
      styles: {
        display: "block",
        filter: "grayscale(1)",
        backgroundImage: "url(https://cdn.example/sprite.png)",
      },
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "bg-logo");
    expect(node).not.toBeNull();
    const fills = (node!.fills ?? []) as FigmaFill[];
    const imageFill = fills.find((f) => f.type === "IMAGE_PLACEHOLDER");
    expect(imageFill).toBeDefined();
    expect(imageFill!.imageSaturation).toBe(-1);
  });

  it("leaves nodes without grayscale untouched", () => {
    const el = makeFrame({
      classList: ["plain"],
      styles: { display: "block", backgroundImage: "url(https://cdn.example/x.png)" },
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "plain");
    expect(node).not.toBeNull();
    expect(node!.filterGrayscale).toBeUndefined();
    const fills = (node!.fills ?? []) as FigmaFill[];
    const imageFill = fills.find((f) => f.type === "IMAGE_PLACEHOLDER");
    expect(imageFill?.imageSaturation).toBeUndefined();
  });

  it("blur-only filters do not set grayscale", () => {
    const el = makeFrame({
      classList: ["blurred"],
      styles: { display: "block", filter: "blur(4px)" },
    });
    const root = convertW2WToWireframe(page([el]) as never, { layoutMode: "autoLayout" });
    const node = findByClass(root, "blurred");
    expect(node).not.toBeNull();
    expect(node!.filterGrayscale).toBeUndefined();
  });
});
