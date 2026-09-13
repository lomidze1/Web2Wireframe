/**
 * Wiring guards for the >4096px image path — the parts that live inside the
 * 3000-line sandbox handler and the UI effect, where a unit test cannot reach.
 */
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(["../main.ts", "../ui/App.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const main = sources["../main.ts"];
const app = sources["../ui/App.tsx"];

describe("sandbox (main.ts)", () => {
  it("plans oversized images off the converted trees before the conversion round-trip", () => {
    const plan = main.indexOf("planOversizedImages(");
    const send = main.indexOf('type: "convert-assets"');
    const map = main.indexOf("const assetsMap = new Map<string, string>()");
    expect(plan).toBeGreaterThan(-1);
    expect(plan).toBeLessThan(send);
    expect(send).toBeLessThan(map);
  });

  it("keeps the results that arrived when the conversion times out", () => {
    const start = main.indexOf('type: "convert-assets"');
    const block = main.slice(start - 2500, start + 1500);
    expect(block).toContain('"asset-converted"');
    expect(block).not.toMatch(/setTimeout\(\(\) => resolve\(\[\]\)/);
  });

  it("records the original size of every image the conversion shrank", () => {
    expect(main).toMatch(/imageNaturalSizes/);
  });
});

describe("UI (App.tsx)", () => {
  it("sizes the conversion canvas to fit Figma's limit and reports each asset as it finishes", () => {
    const start = app.indexOf('"convert-assets"');
    const handler = app.slice(start, start + 4000);
    expect(handler).toContain("fitWithinFigmaLimit(");
    expect(handler).toContain('"asset-converted"');
    expect(handler).toContain("mayHaveAlpha(");
  });
});
