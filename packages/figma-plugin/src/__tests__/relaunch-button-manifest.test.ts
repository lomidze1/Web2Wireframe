/**
 * `setRelaunchData({ open: … })` on the imported Section only produces a
 * visible button if the manifest declares the matching relaunch button.
 * Without this declaration the call succeeds and shows nothing — a silent
 * dead end that no other test would catch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(__dirname, relPath), "utf8"));
}

describe("relaunch button declaration", () => {
  it("package.json declares the `open` relaunch button", () => {
    const pkg = readJson("../../package.json");
    const figmaPlugin = pkg["figma-plugin"] as Record<string, unknown>;
    const buttons = figmaPlugin.relaunchButtons as Record<string, { name: string }>;
    expect(buttons?.open?.name).toBeTruthy();
  });

  // manifest.json is gitignored — build-figma-plugin regenerates it from the
  // `figma-plugin` block above, so package.json is the only source of truth
  // worth asserting on.
});
