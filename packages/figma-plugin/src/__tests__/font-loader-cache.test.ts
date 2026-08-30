/**
 * Unit tests for the global loadFontAsync memoization (src/rendering/fontLoader.ts).
 *
 * Why this module exists: Pass 2 profiling on stripe.com measured 18,627
 * figma.loadFontAsync calls across 697 text nodes (158.6s = 73% of the whole
 * import). The per-node candidate loops re-probe the same family/style cuts —
 * including the same *failures* — on every node. Figma keeps a loaded font
 * loaded for the plugin session, so one shared cache answers all repeats.
 *
 * Cache contract:
 *  - success  → cached for the whole plugin session
 *  - failure  → cached until resetFontFailures() (called when fonts may have
 *               just been installed: new import, font-fallback-choice)
 *  - concurrent callers share ONE underlying loadFontAsync promise
 *  - loadFontCached never throws — a rejection becomes `false`
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// The module under test reads the `figma` global at call time, so install the
// mock before importing it (same pattern as text-run-merge-render.test.ts).
let loadFontMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  loadFontMock = vi.fn(async () => undefined);
  (globalThis as Record<string, unknown>).figma = {
    loadFontAsync: loadFontMock,
  };
  const { resetFontCacheForTests } = await import("../rendering/fontLoader");
  resetFontCacheForTests();
});

import {
  loadFontCached,
  resetFontFailures,
  resetFontCacheForTests,
} from "../rendering/fontLoader";

describe("loadFontCached — success caching", () => {
  it("loads a cut once and reuses the result", async () => {
    await expect(loadFontCached("Inter", "Regular")).resolves.toBe(true);
    await expect(loadFontCached("Inter", "Regular")).resolves.toBe(true);

    expect(loadFontMock).toHaveBeenCalledTimes(1);
  });

  it("treats different cuts as different cache entries", async () => {
    await loadFontCached("Inter", "Regular");
    await loadFontCached("Inter", "Bold");
    await loadFontCached("Roboto", "Regular");

    expect(loadFontMock).toHaveBeenCalledTimes(3);
  });

  it("shares one underlying call between concurrent requests", async () => {
    let release!: () => void;
    loadFontMock.mockImplementation(
      () => new Promise<void>((r) => (release = r))
    );

    const a = loadFontCached("Slow Font", "Regular");
    const b = loadFontCached("Slow Font", "Regular");
    release();

    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(true);
    expect(loadFontMock).toHaveBeenCalledTimes(1);
  });
});

describe("loadFontCached — failure caching", () => {
  it("returns false instead of throwing", async () => {
    loadFontMock.mockRejectedValueOnce(new Error("font not found"));

    await expect(loadFontCached("Missing", "Regular")).resolves.toBe(false);
  });

  it("does not re-probe a cut that already failed", async () => {
    loadFontMock.mockRejectedValue(new Error("font not found"));

    await loadFontCached("Missing", "Regular");
    await loadFontCached("Missing", "Regular");
    await loadFontCached("Missing", "Regular");

    expect(loadFontMock).toHaveBeenCalledTimes(1);
  });
});

describe("resetFontFailures", () => {
  it("re-probes failed cuts but keeps successes cached", async () => {
    loadFontMock.mockImplementation(async ({ family }: { family: string }) => {
      if (family === "Missing") throw new Error("font not found");
    });

    await loadFontCached("Inter", "Regular"); // success
    await loadFontCached("Missing", "Regular"); // failure
    expect(loadFontMock).toHaveBeenCalledTimes(2);

    resetFontFailures();

    // Success stays answered from cache; the failure is retried — and the
    // user may have installed the font in the meantime.
    loadFontMock.mockImplementation(async () => undefined);
    await expect(loadFontCached("Inter", "Regular")).resolves.toBe(true);
    await expect(loadFontCached("Missing", "Regular")).resolves.toBe(true);
    expect(loadFontMock).toHaveBeenCalledTimes(3);
  });

  it("is safe to call while nothing has failed", () => {
    expect(() => resetFontFailures()).not.toThrow();
  });
});

describe("resetFontCacheForTests", () => {
  it("clears everything, successes included", async () => {
    await loadFontCached("Inter", "Regular");
    resetFontCacheForTests();
    await loadFontCached("Inter", "Regular");

    expect(loadFontMock).toHaveBeenCalledTimes(2);
  });
});
