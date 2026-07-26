/**
 * `countRebindableNodes` is the shared core behind the "Re-apply fonts" count.
 * The sandbox runs it twice — once over the whole page (drives the footer
 * button's visibility) and once over the current selection (drives its
 * scoped "Re-apply to selection" label) — so it must be pure over a node list.
 */
import { describe, it, expect } from "vitest";
import {
  countRebindableNodes,
  ORIGINAL_FONT_PLUGIN_KEY,
  SEGMENT_FONT_PLUGIN_KEY,
} from "../rendering/rebindFonts";

/** Minimal stand-in for a TextNode: getPluginData + id/name (for the layer list). */
const node = (data: Record<string, string>, id = "n1", name = "Text") => ({
  id,
  name,
  getPluginData: (key: string) => data[key] ?? "",
});

describe("countRebindableNodes", () => {
  it("counts nodes carrying an original-font marker and collects families", () => {
    const nodes = [
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "SF Pro Text" }),
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne" }),
      node({}), // no marker — ignored
    ];
    const out = countRebindableNodes(nodes);
    expect(out.count).toBe(2);
    expect(out.families).toEqual(["SF Pro Text", "Söhne"]);
  });

  it("counts segment-marker nodes and pulls families from the JSON runs", () => {
    const seg = JSON.stringify([
      { start: 0, end: 3, family: "Newsreader" },
      { start: 3, end: 6, family: "SF Pro Text" },
    ]);
    const out = countRebindableNodes([node({ [SEGMENT_FONT_PLUGIN_KEY]: seg })]);
    expect(out.count).toBe(1);
    expect(out.families).toEqual(["Newsreader", "SF Pro Text"]);
  });

  it("returns an empty result when nothing is marked", () => {
    expect(countRebindableNodes([node({}), node({})])).toEqual({
      count: 0,
      families: [],
      layers: [],
    });
  });

  it("collects per-layer info (id, name, waited-for families) for the modal list", () => {
    const seg = JSON.stringify([{ start: 0, end: 3, family: "Newsreader" }]);
    const nodes = [
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "SF Pro Text" }, "1:1", "h1.u-text"),
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "SF Pro Text", [SEGMENT_FONT_PLUGIN_KEY]: seg }, "1:2", "p.description"),
      node({}, "1:3", "unmarked"),
    ];
    const out = countRebindableNodes(nodes);
    expect(out.layers).toEqual([
      { id: "1:1", name: "h1.u-text", families: ["SF Pro Text"] },
      { id: "1:2", name: "p.description", families: ["Newsreader", "SF Pro Text"] },
    ]);
  });

  it("omits server-fallback families from layer info", () => {
    const nodes = [
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Liberation Sans" }, "1:1", "dead"),
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Söhne" }, "1:2", "real"),
    ];
    const out = countRebindableNodes(nodes);
    expect(out.layers).toEqual([{ id: "1:2", name: "real", families: ["Söhne"] }]);
  });

  it("dedupes and sorts the family list", () => {
    const nodes = [
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Inter" }),
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Arial" }),
      node({ [ORIGINAL_FONT_PLUGIN_KEY]: "Inter" }),
    ];
    expect(countRebindableNodes(nodes).families).toEqual(["Arial", "Inter"]);
  });
});
