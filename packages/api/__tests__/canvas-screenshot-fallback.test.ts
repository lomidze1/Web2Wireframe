/**
 * Where the canvas screenshot pass sits in the Puppeteer capture.
 *
 * The pass itself lives in `@w2w/shared` (both capture paths run it) and is
 * tested there — `packages/shared/src/__tests__/w2w-canvas-shots.test.ts`. What
 * only this path can get wrong is the ordering, so that is what this guards.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("w2w-extraction step order", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../src/lib/cdp/w2w-extraction.ts", import.meta.url)),
    "utf8",
  );

  it("runs the canvas pass after extraction, never before", () => {
    const extract = src.indexOf("__w2w_extractPage");
    const shot = src.indexOf("await captureTaintedCanvases(");

    expect(extract).toBeGreaterThan(-1);
    expect(shot).toBeGreaterThan(-1);
    // `captureBeyondViewport` resizes the viewport for the duration of the
    // shot. Running it before extraction would hand the tree a layout that
    // never existed.
    expect(shot).toBeGreaterThan(extract);
  });

  it("runs the canvas pass after hover capture, the last layout-sensitive read", () => {
    const hover = src.indexOf("__w2w_cleanupMarkers");
    const shot = src.indexOf("await captureTaintedCanvases(");

    expect(hover).toBeGreaterThan(-1);
    expect(shot).toBeGreaterThan(hover);
  });

  it("takes the pass from @w2w/shared rather than keeping its own copy", () => {
    // The extension runs the identical logic. `w2wWaitForHydration` already
    // drifted once when the two paths held separate copies and only the API's
    // was fixed; this one starts shared.
    expect(src).toMatch(/import\s*{[^}]*captureTaintedCanvases[^}]*}\s*from\s*["']@w2w\/shared["']/s);
  });
});
