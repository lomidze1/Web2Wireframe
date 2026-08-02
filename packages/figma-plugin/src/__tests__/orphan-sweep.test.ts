/**
 * Post-render orphan sweep (rendering/orphanSweep.ts).
 *
 * telex.ge regression: hover-master intermediates whose `remove()` silently
 * failed left empty element-named frames ("div#product_labels_update_1059",
 * "div.ut2-blog__recent-posts") at (0,0) on the page root. The sweep removes
 * exactly those: NEW page-root FRAMEs with element-derived names that aren't
 * the Sections we deliberately keep — and never touches user content.
 */
import { describe, it, expect } from "vitest";
import { collectRenderOrphans, isElementDerivedName } from "../rendering/orphanSweep";

function child(id: string, name: string, type = "FRAME") {
  return { id, name, type };
}

describe("isElementDerivedName", () => {
  it("matches converter-generated element names", () => {
    expect(isElementDerivedName("div")).toBe(true);
    expect(isElementDerivedName("div#product_labels_update_10590001")).toBe(true);
    expect(isElementDerivedName("div.ut2-blog__recent-posts")).toBe(true);
    expect(isElementDerivedName("body.screen--md-large")).toBe(true);
    expect(isElementDerivedName("span.ty-price")).toBe(true);
    expect(isElementDerivedName("h2.title")).toBe(true);
    expect(isElementDerivedName("__w2w-orphan")).toBe(true);
  });

  it("does not match user-created layer names", () => {
    expect(isElementDerivedName("Frame 12")).toBe(false);
    expect(isElementDerivedName("My design")).toBe(false);
    expect(isElementDerivedName("Container")).toBe(false);
    expect(isElementDerivedName("divider artwork")).toBe(false); // "divider" ≠ "div"
    expect(isElementDerivedName("iphone mockup")).toBe(false);
  });
});

describe("collectRenderOrphans", () => {
  const preexisting = new Set(["old-1", "old-2"]);

  it("returns only NEW element-named frames that are not kept", () => {
    const pageChildren = [
      child("old-1", "div.some-old-import"), // preexisting → keep
      child("keep-1", "telex.ge (1440) — section", "SECTION"), // kept section
      child("orph-1", "div#product_labels_update_10590001"),
      child("orph-2", "div.ut2-blog__recent-posts"),
      child("orph-3", "__w2w-orphan"),
      child("user-1", "Frame 12"), // user-created mid-render → keep
    ];
    const result = collectRenderOrphans(pageChildren, preexisting, new Set(["keep-1"]));
    expect(result.map((c) => c.id)).toEqual(["orph-1", "orph-2", "orph-3"]);
  });

  it("never removes non-FRAME nodes even with element names", () => {
    const pageChildren = [
      child("sec", "div.section-lookalike", "SECTION"),
      child("comp", "div.card", "COMPONENT_SET"),
    ];
    expect(collectRenderOrphans(pageChildren, preexisting, new Set())).toEqual([]);
  });

  it("returns empty when nothing leaked", () => {
    const pageChildren = [child("old-1", "div.some-old-import")];
    expect(collectRenderOrphans(pageChildren, preexisting, new Set())).toEqual([]);
  });
});
