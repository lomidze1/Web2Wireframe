/**
 * Where the canvas screenshot pass sits in the extension's capture.
 *
 * The pass itself lives in `@w2w/shared` and is tested there
 * (`packages/shared/src/__tests__/w2w-canvas-shots.test.ts`). What only this
 * path can get wrong is the ordering inside the per-viewport loop, so that is
 * what this guards.
 *
 * The API path gained this first; this file exists because the two capture
 * paths have drifted before — `w2wWaitForHydration` was fixed on the API side
 * only, and every extension capture kept losing scroll-reveal content until the
 * expression moved into `@w2w/shared`.
 */
import { describe, it, expect } from "vitest";

describe("w2w.ts canvas screenshot pass", () => {
  // Read through Vite rather than node:fs — this package's tsconfig carries no
  // node types (same idiom as w2w-hydration.test.ts).
  const sources = import.meta.glob("./w2w.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const source = sources["./w2w.ts"];

  const shot = source.indexOf("await captureTaintedCanvases(");

  it("runs the pass at all", () => {
    expect(shot).toBeGreaterThan(-1);
  });

  it("takes it from @w2w/shared rather than keeping its own copy", () => {
    expect(source).toMatch(/captureTaintedCanvases/);
    const importBlock = source.slice(0, source.indexOf('} from "@w2w/shared"'));
    expect(importBlock).toContain("captureTaintedCanvases");
  });

  it("runs after the DOM extraction that produced the frame", () => {
    const extract = source.indexOf('type: "EXTRACT_DOM"');
    expect(extract).toBeGreaterThan(-1);
    expect(shot).toBeGreaterThan(extract);
  });

  it("runs after hover capture — the last read that depends on layout", () => {
    // `captureBeyondViewport` resizes the viewport for the duration of each
    // shot, so every geometry read has to be done by the time it runs.
    const hover = source.indexOf('type: "CLEANUP_MARKERS"');
    expect(hover).toBeGreaterThan(-1);
    expect(shot).toBeGreaterThan(hover);
  });

  it("runs before this viewport's frame is banked", () => {
    // The pass mutates `frame` in place; pushing first would bank a frame whose
    // canvases are still empty.
    const push = source.indexOf("captures.push(");
    expect(shot).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(shot).toBeLessThan(push);
  });

  it("is inside the per-viewport loop, not once after it", () => {
    // Every viewport re-lays-out the page, so each one needs its own shots.
    const loopEnd = source.indexOf("SHARED EXTRACTION");
    expect(shot).toBeGreaterThan(-1);
    expect(loopEnd).toBeGreaterThan(-1);
    expect(shot).toBeLessThan(loopEnd);
  });
});
