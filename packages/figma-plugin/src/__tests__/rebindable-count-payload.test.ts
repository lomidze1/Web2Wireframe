/**
 * The "Re-apply fonts" modal must describe the scope Re-apply will act on.
 *
 * `rebindOriginalFonts` runs over the SELECTION when there is one, and over
 * the page otherwise. The counts the modal shows have to follow that same
 * rule: with a section selected, the header count and the per-font list are
 * about that section — not the whole page. Reporting page-wide totals next to
 * a "Re-apply to selection" button tells the user 1069 layers will change
 * when 6 will.
 */
import { describe, it, expect } from "vitest";
import {
  buildRebindableCountPayload,
  composeRebindablePayload,
  countRebindableNodes,
  ORIGINAL_FONT_PLUGIN_KEY,
} from "../rendering/rebindFonts";

const node = (family: string, id: string, name = "Text") => ({
  id,
  name,
  getPluginData: (key: string) =>
    key === ORIGINAL_FONT_PLUGIN_KEY ? family : "",
});

const PAGE = [
  node("Söhne VF", "a"),
  node("Söhne VF", "b"),
  node("SourceCodePro", "c"),
];

describe("buildRebindableCountPayload", () => {
  it("reports page-wide numbers when nothing is selected", () => {
    const out = buildRebindableCountPayload(PAGE, []);

    expect(out.count).toBe(3);
    expect(out.pageCount).toBe(3);
    expect(out.selectionCount).toBe(0);
    expect(out.families).toEqual(["SourceCodePro", "Söhne VF"]);
    expect(out.layers).toHaveLength(3);
  });

  it("scopes count, families and layers to the selection", () => {
    const out = buildRebindableCountPayload(PAGE, [PAGE[2]]);

    expect(out.count).toBe(1);
    expect(out.selectionCount).toBe(1);
    // The page total stays available so the modal can say "1 of 3".
    expect(out.pageCount).toBe(3);
    expect(out.families).toEqual(["SourceCodePro"]);
    expect(out.layers.map((l) => l.id)).toEqual(["c"]);
  });

  it("falls back to page scope when the selection holds nothing rebindable", () => {
    // Selecting a decorative frame must not blank the modal — Re-apply itself
    // walks the page in that case, so the numbers have to match.
    const out = buildRebindableCountPayload(PAGE, [node("", "empty")]);

    expect(out.count).toBe(3);
    expect(out.selectionCount).toBe(0);
    expect(out.families).toEqual(["SourceCodePro", "Söhne VF"]);
  });
});

/**
 * Clicking a frame on canvas re-posts the count, and rescanning the whole page
 * for it is what made every selection freeze Figma. The sandbox now keeps the
 * page's already-counted result and only re-walks the selection, so the
 * composer has to produce exactly what the full-scan path produced.
 */
describe("composeRebindablePayload", () => {
  const pageCount = countRebindableNodes(PAGE);

  it("matches the full-scan payload when the page result is reused", () => {
    const selection = [PAGE[2]];

    expect(
      composeRebindablePayload(
        pageCount,
        countRebindableNodes(selection),
        true,
      ),
    ).toEqual(buildRebindableCountPayload(PAGE, selection, true));
  });

  it("matches the full-scan payload with no selection", () => {
    expect(
      composeRebindablePayload(
        pageCount,
        { count: 0, families: [], layers: [] },
        false,
      ),
    ).toEqual(buildRebindableCountPayload(PAGE, [], false));
  });
});
