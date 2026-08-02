/**
 * macOS hidden system fonts must never drive the font modal or a Re-apply.
 *
 * The browser extension captures on the USER's machine, so CDP's platform-font
 * lookup returns names like ".New York" / ".SF NS" — the dot-prefixed internal
 * families macOS hides. Figma never lists them, no @font-face can ship them,
 * and no ZIP can contain them, so a marker naming one strands the Re-apply
 * modal forever (telex.ge via .w2w: 28 layers waiting on ".New York").
 *
 * They belong to the same class as the Linux server fallbacks the render
 * pipeline already refuses to mark.
 */
import { describe, it, expect } from "vitest";
import { isServerFallbackFamily } from "../utils/fontUtils";
import { countRebindableNodes } from "../rendering/rebindFonts";

describe("dot-prefixed platform fonts", () => {
  it("counts as an unshippable family", () => {
    expect(isServerFallbackFamily(".New York")).toBe(true);
    expect(isServerFallbackFamily(".SF NS")).toBe(true);
    expect(isServerFallbackFamily(".AppleSystemUIFont")).toBe(true);
  });

  it("does not mistake a real family for one", () => {
    expect(isServerFallbackFamily("New York")).toBe(false);
    expect(isServerFallbackFamily("icomoon")).toBe(false);
  });

  it("keeps such markers out of the Re-apply modal", () => {
    const nodes = [
      { id: "1", name: "h1", getPluginData: (k: string) => (k === "w2w_original_font" ? ".New York" : "") },
      { id: "2", name: "icon", getPluginData: (k: string) => (k === "w2w_original_font" ? "icomoon" : "") },
    ] as unknown as Array<Pick<TextNode, "getPluginData" | "id" | "name">>;

    const result = countRebindableNodes(nodes);

    expect(result.families).toEqual(["icomoon"]);
    expect(result.count).toBe(1);
  });
});
